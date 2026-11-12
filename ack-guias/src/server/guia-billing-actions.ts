"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { canEditAgreedRate, canInvoiceGuia, guiaVisible, isAdmin } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { accessForCompany } from "@/lib/guias/qbo-connection";
import {
  QBO_DUPLICATE,
  QBO_IN_PROGRESS,
  companyKeyOrNull,
  createQuickBooksDraft,
  planDraftInvoice,
  type CompanyKey,
} from "@/lib/guias/qbo";

function text(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim();
}

function back(id: string, error?: string, ok?: string): never {
  const search = new URLSearchParams();
  if (error) search.set("error", error);
  if (ok) search.set(ok, "1");
  const query = search.toString();
  redirect(query ? `/guias/${id}?${query}` : `/guias/${id}`);
}

async function guiaForBilling(id: string) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const guia = await prisma.airWaybillDocument.findFirst({
    where: { id, product: "guia" },
    include: {
      guiaClient: { select: { id: true, name: true, agentKey: true } },
      lines: { select: { pieces: true, chargeableWeight: true, rate: true } },
    },
  });
  if (!guia || !guiaVisible(user, guia)) redirect("/guias");
  return { user, guia };
}

export async function saveAgreedRate(formData: FormData) {
  const id = text(formData.get("id"));
  const { user, guia } = await guiaForBilling(id);
  if (!canEditAgreedRate(user)) back(id, "You cannot change the agreed rate.");
  const guiaClientId = text(formData.get("guiaClientId"));
  if (!guiaClientId) back(id, "Choose a client.");
  const chosen = await prisma.guiaClient.findUnique({ where: { id: guiaClientId } });
  if (!chosen || chosen.agentKey !== guia.agentKey) back(id, "That client belongs to the other company.");
  const rate = Number(text(formData.get("ratePerKg")).replace(/,/g, ""));
  if (!Number.isFinite(rate) || rate <= 0) back(id, "Type a rate per kilo greater than zero.");
  await prisma.airWaybillDocument.updateMany({
    where: { id: guia.id, agentKey: guia.agentKey, product: "guia" },
    data: { guiaClientId: chosen.id, clientLabel: chosen.name },
  });
  await prisma.clientAgreedRate.upsert({
    where: { agentKey_guiaClientId: { agentKey: guia.agentKey, guiaClientId: chosen.id } },
    create: { agentKey: guia.agentKey, guiaClientId: chosen.id, ratePerKg: rate, updatedBy: user.email },
    update: { ratePerKg: rate, updatedBy: user.email },
  });
  back(id, undefined, "rate");
}

export async function markGuiaInvoiced(formData: FormData) {
  const id = text(formData.get("id"));
  const { user, guia } = await guiaForBilling(id);
  if (!canInvoiceGuia(user, guia.agentKey)) back(id, "You cannot invoice this guía.");
  if (guia.status !== "issued") back(id, "Issue the guía before invoicing.");
  const invoiceNumber = text(formData.get("invoiceNumber"));
  const invoiceDate = text(formData.get("invoiceDate"));
  const amount = Number(text(formData.get("invoiceAmount")).replace(/,/g, ""));
  if (!invoiceNumber) back(id, "Type the invoice number.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate)) back(id, "Choose the invoice date.");
  if (!Number.isFinite(amount) || amount <= 0) back(id, "Type the invoice amount.");
  await prisma.airWaybillDocument.updateMany({
    where: { id: guia.id, agentKey: guia.agentKey, product: "guia" },
    data: {
      invoiceNumber,
      invoiceDate: new Date(`${invoiceDate}T12:00:00.000Z`),
      invoiceAmount: amount,
      invoicedAt: new Date(),
      invoicedBy: user.email,
    },
  });
  back(id, undefined, "invoiced");
}

export async function createQboInvoice(formData: FormData) {
  const id = text(formData.get("id"));
  const { user, guia } = await guiaForBilling(id);
  if (!canInvoiceGuia(user, guia.agentKey)) back(id, "You cannot invoice this guía.");
  const agentKey = companyKeyOrNull(guia.agentKey);
  if (!agentKey) back(id, "You cannot invoice this guía.");
  const pieces = guia.lines.reduce((sum, line) => sum + (line.pieces ?? 0), 0);
  const chargeableKg = guia.lines.reduce((sum, line) => sum + (line.chargeableWeight ?? 0), 0);
  const lineRate = guia.lines.find((line) => line.rate != null)?.rate ?? null;
  const linked = guia.guiaClient?.agentKey === guia.agentKey ? guia.guiaClient : null;
  const agreed = linked
    ? await prisma.clientAgreedRate.findUnique({
        where: { agentKey_guiaClientId: { agentKey: guia.agentKey, guiaClientId: linked.id } },
      })
    : null;
  const connected = await prisma.quickBooksConnection.findUnique({
    where: { agentKey },
    select: { agentKey: true, realmId: true },
  });
  const plan = planDraftInvoice({
    agentKey,
    connectionAgentKey: connected?.agentKey ?? null,
    status: guia.status,
    awb: guia.awb,
    origin: guia.departure ?? "",
    destination: guia.destination ?? "",
    pieces,
    chargeableKg,
    agreedRatePerKg: agreed?.ratePerKg ?? null,
    lineRate,
    clientName: linked?.name ?? null,
    qboInvoiceId: guia.qboInvoiceId,
  });
  if (!plan.ok) back(id, plan.error);

  const claim = `pending:${randomUUID()}`;
  const stale = new Date(Date.now() - 2 * 60 * 1000);
  const locked = await prisma.airWaybillDocument.updateMany({
    where: {
      id: guia.id,
      agentKey: guia.agentKey,
      product: "guia",
      OR: [
        { qboInvoiceId: null },
        { AND: [{ qboInvoiceId: { startsWith: "pending:" } }, { OR: [{ qboClaimedAt: null }, { qboClaimedAt: { lt: stale } }] }] },
      ],
    },
    data: { qboInvoiceId: claim, qboClaimedAt: new Date() },
  });
  if (locked.count !== 1) {
    const current = await prisma.airWaybillDocument.findFirst({
      where: { id: guia.id, agentKey: guia.agentKey },
      select: { qboInvoiceId: true },
    });
    back(id, current?.qboInvoiceId && !current.qboInvoiceId.startsWith("pending:") ? QBO_DUPLICATE : QBO_IN_PROGRESS);
  }

  try {
    const access = await accessForCompany(agentKey);
    if (!access || access.realmId !== connected?.realmId) {
      throw new Error("realm");
    }
    const created = await createQuickBooksDraft({
      guia: {
        agentKey,
        connectionAgentKey: agentKey,
        status: guia.status,
        awb: guia.awb,
        origin: guia.departure ?? "",
        destination: guia.destination ?? "",
        pieces,
        chargeableKg,
        agreedRatePerKg: agreed?.ratePerKg ?? null,
        lineRate,
        clientName: linked?.name ?? null,
        qboInvoiceId: null,
      },
      realmId: access.realmId,
      accessToken: access.accessToken,
    });
    if (!created.ok) throw new Error(created.error);
    await prisma.airWaybillDocument.updateMany({
      where: { id: guia.id, agentKey: guia.agentKey, qboInvoiceId: claim },
      data: {
        qboInvoiceId: created.id,
        qboDocNumber: created.docNumber,
        qboRealmId: access.realmId,
        qboClaimedAt: null,
        invoiceNumber: guia.invoiceNumber ?? created.docNumber,
        invoiceAmount: guia.invoiceAmount ?? plan.amount,
        invoiceDate: guia.invoiceDate ?? new Date(),
        invoicedAt: guia.invoicedAt ?? new Date(),
        invoicedBy: guia.invoicedBy ?? user.email,
      },
    });
  } catch (error) {
    await prisma.airWaybillDocument.updateMany({
      where: { id: guia.id, agentKey: guia.agentKey, qboInvoiceId: claim },
      data: { qboInvoiceId: null, qboClaimedAt: null },
    });
    const message = error instanceof Error ? error.message : "";
    back(id, message.startsWith("This ") || message.startsWith("Issue ") || message.startsWith("QuickBooks") || message.startsWith("The QuickBooks connection") ? message : "QuickBooks did not respond. The invoice was not created.");
  }
  back(id, undefined, "qbo");
}

export async function disconnectQuickBooks(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!isAdmin(user)) redirect("/guias/settings?error=Only%20an%20administrator%20can%20disconnect%20QuickBooks.");
  const agentKey = companyKeyOrNull(text(formData.get("agentKey")));
  if (agentKey !== "ack") redirect("/guias/settings?error=ACK%20TEAM%20LLC%20es%20la%20%C3%BAnica%20empresa.");
  await prisma.quickBooksConnection.deleteMany({ where: { agentKey } });
  redirect(`/guias/settings?saved=qbo&company=${agentKey}`);
}

export type BillingCompany = CompanyKey;
