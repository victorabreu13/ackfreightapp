"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canViewFinance } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { shipmentsFromCsv } from "@/lib/guias/acct-import";

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
