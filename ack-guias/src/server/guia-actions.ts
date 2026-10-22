"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { carrierBlock } from "@/lib/awb/airports";
import { miamiDate, signatureFor } from "@/lib/awb/document";
import { destinationCountry, routingTo } from "@/lib/guias/awb-face";
import { issueErrorInSpanish, issueWaybillAtomic } from "@/lib/awb/issue";
import { canManageGuias, isAdmin } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { loadCompany } from "@/lib/guias/company";
import { guiaAwbFolder, publishRenderedPdf, saveDocumentLog } from "@/lib/guias/document-log";
import { ensureGuiaClient, guiaBillToName } from "@/lib/guias/guia-client";
import { type GuiaValues, type ReviewField } from "@/lib/guias/extract";
import { rememberGuiaParties } from "@/lib/guias/parties";
import { reviewFieldsToSave } from "@/lib/guias/review";
import { GUIA_FILE_KINDS, guiaFileName, renderGuiaPdf, type GuiaFileKind } from "@/lib/guias/files";

function text(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim();
}

function blank(value: string): string | null {
  return value || null;
}

async function requireGuiaTeam() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canManageGuias(user)) redirect("/guias?error=Only%20the%20ACK%20team%20can%20change%20a%20gu%C3%ADa");
  return user;
}

function valuesFromForm(formData: FormData): GuiaValues {
  const company = text(formData.get("issuingCompany"));
  return {
    client: text(formData.get("client")),
    shipper: text(formData.get("shipper")),
    shipperAddress: text(formData.get("shipperAddress")),
    consignee: text(formData.get("consignee")),
    consigneeAddress: text(formData.get("consigneeAddress")),
    notify: text(formData.get("notify")),
    notifyAddress: text(formData.get("notifyAddress")),
    origin: text(formData.get("origin")).toUpperCase(),
    destination: text(formData.get("destination")).toUpperCase(),
    flightNumber: text(formData.get("flightNumber")).toUpperCase(),
    flightDate: text(formData.get("flightDate")),
    pieces: text(formData.get("pieces")),
    chargeableKg: text(formData.get("chargeableKg")),
    rate: text(formData.get("rate")),
    grossKg: text(formData.get("grossKg")),
    goods: text(formData.get("goods")),
    handling: text(formData.get("handling")),
    aesItn: text(formData.get("aesItn")).replace(/^AES\s*ITN\s*:\s*/i, "").trim(),
    hawb: text(formData.get("hawb")),
    issuingCompany: company === "ack" || company === "" ? "ack" : "",
  };
}

function reviewFromForm(formData: FormData): ReviewField[] {
  return reviewFieldsToSave(text(formData.get("review")));
}

function snippetsFromForm(formData: FormData): Record<string, string> {
  const raw = text(formData.get("snippetJson"));
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function numberOrNull(value: string): number | null {
  if (!value) return null;
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function lineData(values: GuiaValues) {
  const pieces = numberOrNull(values.pieces);
  return {
    pieces: pieces == null ? null : Math.round(pieces),
    chargeableWeight: numberOrNull(values.chargeableKg),
    rate: numberOrNull(values.rate),
    grossWeight: numberOrNull(values.grossKg),
    nature: blank(values.goods),
    kgLb: "K",
    sortOrder: 0,
  };
}

function documentData(values: GuiaValues, review: ReviewField[], snippets: Record<string, string>, guiaClientId: string | null) {
  return {
    agentKey: "ack",
    guiaClientId,
    clientLabel: blank(values.client),
    shipperName: blank(values.shipper),
    shipperAddress: blank(values.shipperAddress),
    consigneeName: blank(values.consignee),
    consigneeAddress: blank(values.consigneeAddress),
    notifyName: blank(values.notify),
    notifyAddress: blank(values.notifyAddress),
    departure: blank(values.origin),
    destination: blank(values.destination),
    flightNumber: blank(values.flightNumber),
    flightDate: blank(values.flightDate),
    handling: blank(values.handling),
    aesItn: blank(values.aesItn),
    hawb: blank(values.hawb),
    reviewJson: JSON.stringify(review),
    snippetJson: JSON.stringify(snippets),
  };
}

/** The directory is a convenience. A failure there never blocks saving the guía. */
async function rememberParties(guiaClientId: string | null, values: GuiaValues) {
  try {
    await rememberGuiaParties("ack", guiaClientId, values);
  } catch (error) {
    console.error("guía directory", error);
  }
}

export async function saveNewGuia(formData: FormData) {
  const user = await requireGuiaTeam();
  const values = valuesFromForm(formData);
  if (values.issuingCompany !== "ack") {
    redirect("/guias/new?error=ACK%20TEAM%20LLC%20is%20the%20only%20issuer");
  }
  const agent = await prisma.issuingAgent.findUnique({ where: { key: "ack" } });
  if (!agent) redirect("/guias/new?error=ACK%20TEAM%20LLC%20is%20the%20only%20issuer");
  const billTo = await ensureGuiaClient(agent.key, values.client);
  const uniqueReview = reviewFromForm(formData);
  const created = await prisma.airWaybillDocument.create({
    data: {
      ...documentData(values, uniqueReview, snippetsFromForm(formData), billTo?.id ?? null),
      product: "guia",
      status: "draft",
      awb: "",
      prefix: "",
      serial: "",
      agentKey: agent.key,
      createdBy: user.email,
      truckerName: blank(text(formData.get("truckerName"))),
      truckerPhone: blank(text(formData.get("truckerPhone"))),
      driverName: blank(text(formData.get("driverName"))),
      seal: blank(text(formData.get("seal"))),
      lines: { create: [lineData(values)] },
    },
  });
  await rememberParties(billTo?.id ?? null, values);
  revalidatePath("/guias");
  redirect(`/guias/${created.id}`);
}

export async function saveGuia(formData: FormData) {
  await requireGuiaTeam();
  const id = text(formData.get("id"));
  const existing = await prisma.airWaybillDocument.findUnique({ where: { id } });
  if (!existing || existing.product !== "guia") redirect("/guias?error=Gu%C3%ADa%20not%20found");
  const values = valuesFromForm(formData);
  if (values.issuingCompany !== "ack") {
    redirect(`/guias/${id}?error=ACK%20TEAM%20LLC%20is%20the%20only%20issuer`);
  }
  const billTo = await ensureGuiaClient("ack", values.client);
  const uniqueReview = reviewFromForm(formData);
  await prisma.awbGoodsLine.deleteMany({ where: { documentId: id } });
  await prisma.airWaybillDocument.update({
    where: { id },
    data: {
      ...documentData(values, uniqueReview, snippetsFromForm(formData), billTo?.id ?? null),
      truckerName: blank(text(formData.get("truckerName"))),
      truckerPhone: blank(text(formData.get("truckerPhone"))),
      driverName: blank(text(formData.get("driverName"))),
      seal: blank(text(formData.get("seal"))),
      lines: { create: [lineData(values)] },
    },
  });
  await rememberParties(billTo?.id ?? null, values);
  revalidatePath(`/guias/${id}`);
  redirect(`/guias/${id}?saved=1`);
}

export async function pushGuiaToDrive(id: string): Promise<string | null> {
  const document = await prisma.airWaybillDocument.findUnique({
    where: { id },
    include: { lines: { orderBy: { sortOrder: "asc" } }, agent: true, guiaClient: true },
  });
  if (!document || document.agentKey !== "ack") return "Guía not found";
  let company;
  try {
    company = await loadCompany("ack");
  } catch (error) {
    return error instanceof Error ? error.message : "Company profile missing";
  }
  const clientName = guiaBillToName(document) || "No client";
  const awbFolder = guiaAwbFolder(document.awb, document.id);
  const user = await requireGuiaTeam();
  const master = "";
  let firstError: string | null = null;
  for (const kind of GUIA_FILE_KINDS) {
    const fileName = guiaFileName(kind, document.awb, master);
    try {
      const bytes = await renderGuiaPdf(kind, document, company, {
        email: user.email,
        name: user.name,
        trucker: document.truckerName,
        truckerPhone: document.truckerPhone,
        seal: document.seal,
        driver: document.driverName,
      });
      const saved = await publishRenderedPdf({
        guiaId: id,
        client: clientName,
        awb: awbFolder,
        company: document.agentKey,
        kind,
        fileName,
        bytes,
        generatedBy: user.email,
      });
      if (saved.status === "FAILED" && !firstError) firstError = saved.error ?? "Drive upload failed";
    } catch (error) {
      const message = error instanceof Error ? error.message : "Drive upload failed";
      if (!firstError) firstError = message;
      try {
        await saveDocumentLog({
          source: "generated",
          guiaId: id,
          client: clientName,
          awb: awbFolder,
          company: document.agentKey,
          kind,
          fileName,
          generatedBy: user.email,
          status: "FAILED",
          error: message,
        });
      } catch (logError) {
        console.error("guia document log", logError);
      }
    }
  }
  return firstError;
}

export async function issueGuia(formData: FormData) {
  const user = await requireGuiaTeam();
  const id = text(formData.get("id"));
  const existing = await prisma.airWaybillDocument.findUnique({ where: { id } });
  if (!existing || existing.product !== "guia") redirect("/guias?error=Gu%C3%ADa%20not%20found");
  if (existing.agentKey !== "ack") redirect(`/guias/${id}?error=ACK%20TEAM%20LLC%20is%20the%20only%20issuer`);
  const agent = await prisma.issuingAgent.findUnique({ where: { key: "ack" } });
  if (!agent) redirect(`/guias/${id}?error=ACK%20TEAM%20LLC%20is%20the%20only%20issuer`);
  const manual = text(formData.get("manualAwb"));
  const prefix = text(formData.get("prefix"));
  const airlinePrefix = manual.replace(/\D/g, "").slice(0, 3) || prefix;
  const airline = /^\d{3}$/.test(airlinePrefix)
    ? await prisma.airlinePrefix.findUnique({ where: { prefix: airlinePrefix } })
    : null;
  const carrier = carrierBlock(/^\d{3}$/.test(airlinePrefix) ? airlinePrefix : "000", airline?.airline ?? null);
  const signed = signatureFor(agent, user.name || user.email);
  const billTo = await ensureGuiaClient(agent.key, existing.clientLabel);
  try {
    await issueWaybillAtomic({
      documentId: id,
      agentKey: agent.key,
      manualAwb: manual || null,
      prefix,
      requireInStock: true,
      data: {
        carrierName: carrier.name,
        carrierAddress: carrier.address,
        to1: routingTo(existing.destination) || null,
        by1: carrier.name,
        destCountry: destinationCountry(existing.destination) || null,
        accountNo: agent.accountNo,
        carrierSignature: signed,
        shipperSignature: signed,
        executedOn: miamiDate(),
        executedAt: "MIA",
        aesItn: blank(text(formData.get("aesItn")).replace(/^AES\s*ITN\s*:\s*/i, "").trim()),
      },
    });
  } catch (error) {
    redirect(`/guias/${id}?error=${encodeURIComponent(issueErrorInSpanish(error))}`);
  }
  await prisma.airWaybillDocument.updateMany({
    where: { id, agentKey: agent.key, product: "guia" },
    data: { guiaClientId: billTo?.id ?? null },
  });
  const driveError = await pushGuiaToDrive(id);
  revalidatePath("/guias");
  revalidatePath(`/guias/${id}`);
  const drive = driveError ? `&drive=${encodeURIComponent(driveError)}` : "&drive=ok";
  redirect(`/guias/${id}?issued=1${drive}`);
}

export async function saveGuiaToDrive(formData: FormData) {
  await requireGuiaTeam();
  const id = text(formData.get("id"));
  const driveError = await pushGuiaToDrive(id);
  revalidatePath(`/guias/${id}`);
  if (driveError) redirect(`/guias/${id}?drive=${encodeURIComponent(driveError)}`);
  redirect(`/guias/${id}?drive=ok`);
}

export async function saveCompanyProfile(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!isAdmin(user)) redirect("/guias?error=Settings%20are%20for%20admins");
  const agentKey = text(formData.get("agentKey"));
  if (agentKey !== "ack") redirect("/guias/settings?error=Unknown%20company");
  const agent = await prisma.issuingAgent.findUnique({ where: { key: "ack" } });
  if (!agent) redirect("/guias/settings?error=Unknown%20company");
  const file = formData.get("logo");
  let logo: Uint8Array<ArrayBuffer> | undefined;
  let logoMime: string | undefined;
  if (file instanceof File && file.size > 0) {
    const bytes = await file.arrayBuffer();
    logo = new Uint8Array(bytes);
    logoMime = file.type || "image/png";
  }
  const data = {
    brandName: text(formData.get("brandName")),
    letterheadName: text(formData.get("letterheadName")),
    address: text(formData.get("address")),
    phone: blank(text(formData.get("phone"))),
    fax: blank(text(formData.get("fax"))),
    opsEmail: blank(text(formData.get("opsEmail"))),
    contactName: blank(text(formData.get("contactName"))),
    contactTitle: blank(text(formData.get("contactTitle"))),
    termsUrl: blank(text(formData.get("termsUrl"))),
    tsaIacId: blank(text(formData.get("tsaIacId"))),
    ccsfId: blank(text(formData.get("ccsfId"))),
    warehouseName: blank(text(formData.get("warehouseName"))),
    warehouseAddress: blank(text(formData.get("warehouseAddress"))),
    signerName: text(formData.get("signerName")),
    signerTitle: blank(text(formData.get("signerTitle"))),
    ...(logo ? { logo, logoMime } : {}),
  };
  await prisma.companyProfile.upsert({
    where: { agentKey },
    create: { agentKey, ...data, signerName: data.signerName || agent.legalName },
    update: data,
  });
  revalidatePath("/guias/settings");
  redirect("/guias/settings?saved=1");
}
