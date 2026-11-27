"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canViewFinance } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { shipmentsFromCsv } from "@/lib/guias/acct-import";
import { recalcShipment } from "@/lib/guias/acct-service";
import { planShipmentEdit, type EditInput } from "@/lib/guias/commission-edit";
import { createInvoiceForGuia } from "@/lib/guias/invoice-service";

function text(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim();
}

async function requireFinance() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canViewFinance(user)) redirect("/guias?error=The%20accounting%20is%20only%20for%20the%20accounting");
  return user;
}

const day = (value: string | null) => (value ? new Date(`${value}T00:00:00.000Z`) : null);

/**
 * Loads the Shipments tab of the Google Sheet, saved as CSV. A shipment already loaded (same id in the Sheet) is
 * updated, so loading the file again does not repeat anything.
 */
export async function importShipments(formData: FormData) {
  await requireFinance();
  const back = (message: string, kind: "notice" | "error" = "notice"): never => redirect(`/guias/accounting?${kind}=${encodeURIComponent(message)}`);
  const file = formData.get("csv");
  if (!(file instanceof File) || file.size === 0) back("Choose the CSV file of the Shipments tab.", "error");
  if ((file as File).size > 8_000_000) back("That file is too big for a shipments CSV.", "error");
  const content = await (file as File).text();
  const { shipments, skipped } = shipmentsFromCsv(content);
  if (shipments.length === 0) back("No shipment was found in that file. It should be the Shipments tab saved as CSV.", "error");
  for (let from = 0; from < shipments.length; from += 25) {
    await prisma.$transaction(
      shipments.slice(from, from + 25).flatMap((shipment) => {
        const { splits, updatedAt: _updatedAt, date, ...rest } = shipment;
        void _updatedAt;
        const data = { ...rest, date: day(date) as Date, source: "import" };
        return [
          prisma.acctShipment.upsert({ where: { legacyId: shipment.legacyId }, update: data, create: data }),
          prisma.acctSplit.deleteMany({ where: { shipment: { legacyId: shipment.legacyId } } }),
        ];
      }),
    );
    // The splits go in after their shipment exists, so a failed batch never leaves a shipment half loaded.
    for (const shipment of shipments.slice(from, from + 25)) {
      const found = await prisma.acctShipment.findUnique({ where: { legacyId: shipment.legacyId }, select: { id: true } });
      if (!found) continue;
      if (shipment.splits.length) {
        await prisma.acctSplit.createMany({ data: shipment.splits.map((split) => ({ shipmentId: found.id, payee: split.payee, pct: split.pct, paid: split.paid, paidDate: day(split.paidDate) })) });
      }
    }
  }
  revalidatePath("/guias/accounting");
  revalidatePath("/guias/commissions");
  const left = skipped.length ? ` Left out: ${skipped.map((item) => `${item.awb || "a row"} (${item.reason})`).join("; ")}.` : "";
  back(`${shipments.length} shipments loaded.${left}`);
}

/**
 * Marks whether the client has paid the invoice of a shipment. A commission is owed once the client pays. Without a value
 * it flips what is there, so one click on Open marks it paid and one click on Paid opens it again.
 */
export async function setClientPaid(formData: FormData) {
  await requireFinance();
  const id = text(formData.get("id"));
  const wanted = text(formData.get("paid"));
  const current = await prisma.acctShipment.findUnique({ where: { id }, select: { clientPaid: true } });
  if (!current) redirect("/guias/accounting?error=That%20shipment%20was%20not%20found");
  const paid = wanted ? wanted === "1" : !current.clientPaid;
  const returnTo = text(formData.get("returnTo")) || "/guias/accounting";
  await prisma.acctShipment.update({ where: { id }, data: { clientPaid: paid, clientPaidDate: paid ? new Date() : null } });
  revalidatePath("/guias/accounting");
  revalidatePath("/guias/commissions");
  redirect(returnTo.startsWith("/guias/") ? returnTo : "/guias/accounting");
}

/**
 * Corrects the amounts of one shipment by hand: what each rubro cost and what it was sold for, the invoice total and number,
 * the note and the percentage of each person. The totals, the profit and so the commissions follow. The columns changed are
 * remembered as typed by hand, so a trip price shared out again never overwrites them.
 */
export async function saveShipmentAmounts(shipmentId: string, input: EditInput): Promise<{ ok: true; profit: number } | { ok: false; error: string }> {
  await requireFinance();
  const shipment = await prisma.acctShipment.findUnique({ where: { id: shipmentId }, include: { splits: true } });
  if (!shipment) return { ok: false, error: "That shipment was not found." };
  const plan = planShipmentEdit(shipment, shipment.splits.map((split) => ({ id: split.id, pct: split.pct })), input);
  if ("error" in plan) return { ok: false, error: plan.error };
  await prisma.$transaction([
    prisma.acctShipment.update({ where: { id: shipmentId }, data: plan.data }),
    ...plan.splitUpdates.map((split) => prisma.acctSplit.update({ where: { id: split.id }, data: { pct: split.pct } })),
  ]);
  revalidatePath("/guias/commissions");
  revalidatePath("/guias/accounting");
  return { ok: true, profit: plan.totals.profit };
}

/** Works one shipment out again with the rules its client has now (for an AWB issued before the client was configured). */
export async function recalcShipmentAction(shipmentId: string): Promise<{ ok: true; notes: string[] } | { ok: false; error: string }> {
  await requireFinance();
  const result = await recalcShipment(shipmentId);
  revalidatePath("/guias/commissions");
  revalidatePath("/guias/accounting");
  return result;
}

/** Makes the draft invoice of a shipment that has none, from its numbers as they are now. */
export async function createInvoiceForShipment(shipmentId: string): Promise<{ ok: true; number: number } | { ok: false; error: string }> {
  await requireFinance();
  const shipment = await prisma.acctShipment.findUnique({ where: { id: shipmentId }, select: { guiaId: true } });
  if (!shipment?.guiaId) return { ok: false, error: "This shipment did not come from an AWB of the system, so it has no invoice to make." };
  const result = await createInvoiceForGuia(shipment.guiaId);
  revalidatePath("/guias/invoices");
  revalidatePath("/guias/commissions");
  revalidatePath("/guias/accounting");
  if (result.number != null) return { ok: true, number: result.number };
  return { ok: false, error: result.note ?? "The invoice was not made." };
}

/**
 * Catches up the AWBs that were issued without an invoice: for each shipment chosen, its client is worked out again with
 * the rules it has now (unless that is turned off) and its draft invoice is made. A client that is still to configure is
 * skipped, since its rules are not set yet.
 */
export async function createPendingInvoices(formData: FormData) {
  await requireFinance();
  const ids = formData.getAll("shipmentId").map(String);
  const recalc = text(formData.get("recalc")) === "1";
  const back = (message: string, kind: "notice" | "error" = "notice"): never => redirect(`/guias/accounting?${kind}=${encodeURIComponent(message)}`);
  if (ids.length === 0) back("Choose at least one shipment.", "error");
  const shipments = await prisma.acctShipment.findMany({ where: { id: { in: ids }, guiaId: { not: null } }, orderBy: { date: "asc" } });
  const pending = await prisma.acctClient.findMany({ where: { needsSetup: true }, select: { name: true } });
  const toConfigure = new Set(pending.map((client) => client.name));
  let made = 0;
  const skipped: string[] = [];
  for (const shipment of shipments) {
    if (toConfigure.has(shipment.client)) {
      skipped.push(`${shipment.awb} (configure ${shipment.client} first)`);
      continue;
    }
    try {
      if (recalc) {
        const worked = await recalcShipment(shipment.id);
        if (!worked.ok) {
          skipped.push(`${shipment.awb} (${worked.error})`);
          continue;
        }
      }
      const result = await createInvoiceForGuia(shipment.guiaId as string);
      if (result.created) made += 1;
      else skipped.push(`${shipment.awb} (${result.number != null ? `it already has invoice #${result.number}` : (result.note ?? "no invoice")})`);
    } catch (error) {
      console.error("pending invoice", shipment.awb, error);
      skipped.push(`${shipment.awb} (error)`);
    }
  }
  revalidatePath("/guias/invoices");
  revalidatePath("/guias/commissions");
  revalidatePath("/guias/accounting");
  back(`${made} draft invoices made.${skipped.length ? ` Left out: ${skipped.join("; ")}.` : ""} Review them in Invoices before sending.`);
}

/** Marks the chosen commissions as paid to the person, as of today, or back as unpaid. */
export async function markCommissions(formData: FormData) {
  await requireFinance();
  const ids = formData.getAll("splitId").map((value) => String(value));
  const paid = text(formData.get("mode")) !== "unpaid";
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  const person = text(formData.get("person"));
  const back = (message: string, kind: "notice" | "error" = "notice"): never => redirect(`/guias/commissions?${person ? `person=${encodeURIComponent(person)}&` : ""}${kind}=${encodeURIComponent(message)}`);
  if (ids.length === 0) back("Choose at least one commission.", "error");
  const result = await prisma.acctSplit.updateMany({ where: { id: { in: ids } }, data: { paid, paidDate: paid ? day(date) : null } });
  revalidatePath("/guias/commissions");
  revalidatePath("/guias/accounting");
  back(paid ? `${result.count} commissions marked as paid${person ? ` to ${person}` : ""}.` : `${result.count} commissions marked as unpaid.`);
}
