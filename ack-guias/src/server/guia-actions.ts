"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { miamiDate, signatureFor } from "@/lib/awb/document";
import { destinationCountry, routingTo } from "@/lib/guias/awb-face";
import { assignDraftAwb, issueErrorInSpanish, issueWaybillAtomic, releaseDraftAwb } from "@/lib/awb/issue";
import { canManageGuias, isAdmin } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveCarrier } from "@/lib/guias/carriers";
import { loadCompany } from "@/lib/guias/company";
import { guiaAwbFolder, publishRenderedPdf, saveDocumentLog } from "@/lib/guias/document-log";
import { ensureGuiaClient, guiaBillToName } from "@/lib/guias/guia-client";
import { type GuiaValues, type ReviewField } from "@/lib/guias/extract";
import { formatUnNumbers, parseLithiumTypes } from "@/lib/guias/dg";
import { checkFlights } from "@/lib/guias/flight-check";
import { safeGuiaReturn } from "@/lib/guias/upload-rules";
import { rememberGuiaParties } from "@/lib/guias/parties";
import { reviewFieldsToSave } from "@/lib/guias/review";
import { GUIA_FILE_KINDS, guiaFileName, renderGuiaPdf, type GuiaFileKind } from "@/lib/guias/files";

/** Every guía belongs to a client of the book. The client portal and its emails depend on it. */
const CLIENT_REQUIRED = "Escribe el cliente de la guía.";

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
    dg: text(formData.get("dg")) === "1" ? "1" : "",
    unNumbers: text(formData.get("dg")) === "1" ? formatUnNumbers(text(formData.get("unNumbers"))) : "",
    bup: text(formData.get("bup")) === "1" ? "1" : "",
    lithiumPi: parseLithiumTypes(formData.getAll("lithiumPi").map((item) => String(item)).join(",")).join(","),
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
    dgDeclarable: values.dg === "1",
    unNumbers: blank(values.unNumbers),
    bup: values.bup === "1",
    lithiumPi: blank(values.lithiumPi),
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
  if (!values.client) redirect(`/guias/new?error=${encodeURIComponent(CLIENT_REQUIRED)}`);
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
  await applyCarrier(created.id, text(formData.get("carrierId")), null);
  const wantedAwb = text(formData.get("assignAwb"));
  const wantedPrefix = text(formData.get("assignPrefix"));
  if (wantedAwb || wantedPrefix) {
    try {
      await assignAwbTo(created.id, wantedAwb, wantedPrefix);
    } catch (error) {
      revalidatePath("/guias");
      redirect(`/guias/${created.id}?error=${encodeURIComponent(`La guía se guardó, pero no se asignó el AWB. ${issueErrorInSpanish(error)}`)}`);
    }
    revalidatePath("/guias");
    redirect(`/guias/${created.id}?assigned=1`);
  }
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
  if (!values.client) redirect(`/guias/${id}?error=${encodeURIComponent(CLIENT_REQUIRED)}`);
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
  await applyCarrier(id, text(formData.get("carrierId")), existing.carrierId);
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

/** The carrier block and routing that come from the airline prefix. Used when the number is assigned and again at issue. */
async function carrierData(agent: { accountNo: string | null }, destination: string | null, awbPrefix: string, carrierId: string | null = null) {
  const carrier = await resolveCarrier({ carrierId, awbPrefix });
  return {
    carrierName: carrier.name,
    carrierAddress: carrier.address,
    to1: routingTo(destination) || null,
    by1: carrier.name,
    destCountry: destinationCountry(destination) || null,
    accountNo: agent.accountNo,
  };
}

/**
 * Saves the carrier picked in the form and prints it as the first carrier. With none picked nothing changes, unless one
 * was picked before: then the airline prefix of the AWB decides again.
 */
async function applyCarrier(id: string, carrierId: string, before: string | null) {
  if (!carrierId && !before) return;
  const row = carrierId ? await prisma.carrier.findUnique({ where: { id: carrierId } }) : null;
  const current = await prisma.airWaybillDocument.findUnique({ where: { id }, select: { awb: true } });
  const prefix = (current?.awb ?? "").replace(/\D/g, "").slice(0, 3);
  if (!row && !prefix) {
    await prisma.airWaybillDocument.update({ where: { id }, data: { carrierId: null, carrierName: null, carrierAddress: null, by1: null } });
    return;
  }
  const carrier = await resolveCarrier({ carrierId: row?.id ?? null, awbPrefix: prefix });
  await prisma.airWaybillDocument.update({
    where: { id },
    data: { carrierId: row?.id ?? null, carrierName: carrier.name, carrierAddress: carrier.address, by1: carrier.name },
  });
}

async function assignAwbTo(id: string, manualAwb: string, prefix: string) {
  const existing = await prisma.airWaybillDocument.findUnique({ where: { id } });
  const agent = await prisma.issuingAgent.findUnique({ where: { key: "ack" } });
  if (!existing || existing.product !== "guia" || !agent) throw new Error("Waybill not found");
  const awbPrefix = manualAwb.replace(/\D/g, "").slice(0, 3) || prefix.replace(/\D/g, "");
  await assignDraftAwb({
    documentId: id,
    agentKey: agent.key,
    manualAwb: manualAwb || null,
    prefix,
    data: await carrierData(agent, existing.destination, awbPrefix, existing.carrierId),
  });
}

/** Reserves an AWB number for a draft now, so its drafts and labels already carry it. */
export async function assignGuiaAwb(formData: FormData) {
  await requireGuiaTeam();
  const id = text(formData.get("id"));
  try {
    await assignAwbTo(id, text(formData.get("manualAwb")), text(formData.get("prefix")));
  } catch (error) {
    redirect(`/guias/${id}?error=${encodeURIComponent(issueErrorInSpanish(error))}`);
  }
  revalidatePath(`/guias/${id}`);
  redirect(`/guias/${id}?assigned=1`);
}

/** Gives the number back to stock. Only a draft can do it. */
export async function releaseGuiaAwb(formData: FormData) {
  await requireGuiaTeam();
  const id = text(formData.get("id"));
  const before = await prisma.airWaybillDocument.findUnique({ where: { id }, select: { carrierId: true } });
  try {
    await releaseDraftAwb(id, "ack");
    // Giving the number back clears the carrier block. The one the team picked stays.
    if (before?.carrierId) await applyCarrier(id, before.carrierId, before.carrierId);
  } catch (error) {
    redirect(`/guias/${id}?error=${encodeURIComponent(issueErrorInSpanish(error))}`);
  }
  revalidatePath(`/guias/${id}`);
  redirect(`/guias/${id}?released=1`);
}

export async function issueGuia(formData: FormData) {
  const user = await requireGuiaTeam();
  const id = text(formData.get("id"));
  const existing = await prisma.airWaybillDocument.findUnique({ where: { id } });
  if (!existing || existing.product !== "guia") redirect("/guias?error=Gu%C3%ADa%20not%20found");
  if (existing.agentKey !== "ack") redirect(`/guias/${id}?error=ACK%20TEAM%20LLC%20is%20the%20only%20issuer`);
  const agent = await prisma.issuingAgent.findUnique({ where: { key: "ack" } });
  if (!agent) redirect(`/guias/${id}?error=ACK%20TEAM%20LLC%20is%20the%20only%20issuer`);
  const assignedStock = existing.awb.trim() ? await prisma.awbStockNumber.findFirst({ where: { documentId: id, agentKey: "ack" } }) : null;
  const manual = assignedStock ? "" : text(formData.get("manualAwb"));
  const prefix = assignedStock ? assignedStock.prefix : text(formData.get("prefix"));
  const airlinePrefix = manual.replace(/\D/g, "").slice(0, 3) || prefix;
  const carrier = await resolveCarrier({ carrierId: existing.carrierId, awbPrefix: airlinePrefix });
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
        // The AES ITN is entered once, in the guía form, and issuing leaves it as saved.
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

/** Looks up the flight of one guía now, and emails the client if the status changed. */
export async function checkGuiaFlight(formData: FormData) {
  await requireGuiaTeam();
  const id = text(formData.get("id"));
  const summary = await checkFlights({ guiaIds: [id] });
  const target = safeGuiaReturn(text(formData.get("returnTo")), `/guias/${id}`);
  const joiner = target.includes("?") ? "&" : "?";
  revalidatePath(`/guias/${id}`);
  revalidatePath("/guias/awb-status");
  if (summary.errors.length) redirect(`${target}${joiner}flight=${encodeURIComponent(summary.errors[0])}`);
  redirect(`${target}${joiner}flight=ok`);
}

/** The team marks a guía completed so it leaves the Guías screen, or brings it back. */
export async function setGuiaCompleted(formData: FormData) {
  const user = await requireGuiaTeam();
  const id = text(formData.get("id"));
  const done = text(formData.get("done")) === "1";
  const guia = await prisma.airWaybillDocument.findFirst({ where: { id, product: "guia" }, select: { id: true } });
  if (!guia) redirect(`/guias?error=${encodeURIComponent("No se encontró la guía.")}`);
  await prisma.airWaybillDocument.update({
    where: { id },
    data: done ? { completedAt: new Date(), completedBy: user.email } : { completedAt: null, completedBy: null },
  });
  revalidatePath("/guias");
  revalidatePath(`/guias/${id}`);
  redirect(safeGuiaReturn(text(formData.get("returnTo")), done ? "/guias" : `/guias/${id}`));
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
