import type { Prisma } from "@prisma/client";
import type { CompanyView } from "@/lib/guias/company-profile";
import { companyLogo, renderCorteAwb, renderCorteDo, renderCorteTsa, renderLithiumLetter } from "@/lib/guias/corte";
import { renderMagayaCcsf, renderMagayaCcsp, renderMagayaLabels, renderMagayaPickup } from "@/lib/guias/magaya-docs";
import { deliveryOrder, type DocumentOptions } from "@/lib/sheets/documents";
import { tsaUnknownLetter, type ExtraLetter } from "@/lib/sheets/extra-letters";
import { formatAwb, isValidSerial, parseAwb } from "@/lib/awb/number";
import { guiaBillToName } from "@/lib/guias/guia-client";
import { identityFor, kopeIdentity, normalizeTrucker, signerName } from "@/lib/sheets/layout";

export type GuiaRecord = Prisma.AirWaybillDocumentGetPayload<{
  include: { lines: true; agent: true; guiaClient: true };
}>;

export type GuiaPrintOptions = {
  email: string;
  name?: string | null;
  trucker?: string | null;
  truckerPhone?: string | null;
  seal?: string | null;
  driver?: string | null;
  now?: Date;
  /** Master labels use the shipment AWB, master carrier, and destination MIA. */
  masterLabel?: boolean;
  /** One draft copy of the AWB face, marked DRAFT. Works before the guía is issued. */
  draft?: boolean;
  /** AWB number the labels carry while the guía is not issued yet. */
  labelAwb?: string | null;
};

export const GUIA_FILE_KINDS = ["awb", "delivery", "pickup", "tsa", "tsa-unknown", "ccsp", "ccsf-alternate", "lithium", "labels"] as const;
export type GuiaFileKind = (typeof GUIA_FILE_KINDS)[number];

type SheetLoaded = Parameters<typeof deliveryOrder>[0];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function guiaFileName(kind: GuiaFileKind, awb = "", master = "", extras?: { masterLabel?: boolean }): string {
  const number = awb.trim() || "DRAFT";
  const masterNumber = master.trim() || number;
  if (kind === "awb") return `${number} - GUIA MADRE.pdf`;
  if (kind === "delivery") return `DO-${number}.pdf`;
  if (kind === "pickup") return `PICKUP ORDER ${masterNumber}.pdf`;
  if (kind === "tsa") return `TSA_${number}.pdf`;
  if (kind === "tsa-unknown") return `TSA_UNKNOWN_${number}.pdf`;
  if (kind === "ccsp") return `${number}_CCSF.pdf`;
  if (kind === "ccsf-alternate") return `${number}_CCSP.pdf`;
  if (kind === "lithium") return `FORM_LithiumBatteryLetter_${number}.pdf`;
  if (extras?.masterLabel) return `MASTER-LABELS ${masterNumber}.pdf`;
  return `LABELS ${number}.pdf`;
}

function wallDate(value: string | null | undefined): Date | null {
  const raw = value?.trim() ?? "";
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
  const slashed = raw.match(/^([A-Za-z]{3})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashed) {
    const month = MONTHS.findIndex((item) => item.toLowerCase() === slashed[1].toLowerCase());
    const year = slashed[3].length === 2 ? 2000 + Number(slashed[3]) : Number(slashed[3]);
    if (month >= 0) return new Date(Date.UTC(year, month, Number(slashed[2])));
  }
  const named = raw.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/);
  if (named) {
    const month = MONTHS.findIndex((item) => item.toLowerCase() === named[2].slice(0, 3).toLowerCase());
    if (month >= 0) return new Date(Date.UTC(Number(named[3]), month, Number(named[1])));
  }
  return null;
}

/** ACK Guías has no shipment book. Labels and pickup use the guía itself. */
async function loadShipment(_shipmentId?: string | null): Promise<null> {
  return null;
}

function sheetOptions(document: GuiaRecord, options: GuiaPrintOptions): DocumentOptions {
  const trucker = normalizeTrucker(options.trucker ?? document.truckerName);
  const driver = (options.driver ?? document.driverName ?? "").trim();
  const seal = (options.seal ?? document.seal ?? "").trim();
  return {
    labelsFor: options.masterLabel ? "master" : "leg",
    seal: seal || undefined,
    trucker: trucker || undefined,
    driver: driver || undefined,
    email: options.email,
  };
}

/** Prisma-shaped shipment the original sheet functions read. Drawing stays in documents.ts. */
export function sheetLoaded(document: GuiaRecord, shipment: any): SheetLoaded {
  const piecesFromLines = document.lines.reduce((sum, row) => sum + (row.pieces ?? 0), 0);
  const chargeableFromLines = document.lines.reduce((sum, row) => sum + (row.chargeableWeight ?? 0), 0);
  const grossFromLines = document.lines.reduce((sum, row) => sum + (row.grossWeight ?? 0), 0);
  const legAwb = document.awb.trim();
  const masterAwb = shipment?.awb?.trim() || legAwb;
  const matched = shipment?.legs.find((leg: { awb?: string | null }) => leg.awb && leg.awb === legAwb) ?? shipment?.legs[0] ?? null;
  const leg = {
    id: matched?.id ?? "guia-leg",
    shipmentId: shipment?.id ?? "guia",
    awb: legAwb || matched?.awb || null,
    hawb: document.hawb?.trim() || matched?.hawb || null,
    flightNumber: document.flightNumber?.trim() || matched?.flightNumber || null,
    etd: wallDate(document.flightDate) ?? matched?.etd ?? shipment?.etd ?? null,
    departureTime: matched?.departureTime ?? null,
    arrivalTime: matched?.arrivalTime ?? null,
    status: matched?.status ?? null,
    statusSource: matched?.statusSource ?? "MANUAL",
    trackedAt: matched?.trackedAt ?? null,
    trackingEvent: matched?.trackingEvent ?? null,
    trackingResult: matched?.trackingResult ?? null,
    notes: matched?.notes ?? null,
    sortOrder: 0,
  };
  const clientName = guiaBillToName(document) || shipment?.client?.name || "";
  const parties = shipment?.client?.awbParties ?? [];
  const guiaDoc = {
    ...document,
    awb: legAwb,
    lines: [...document.lines].sort((a, b) => a.sortOrder - b.sortOrder),
  };
  const others = (shipment?.airWaybills ?? []).filter((item: { id?: string }) => item.id !== document.id);
  return {
    ...(shipment ?? {
      id: shipment?.id ?? "guia",
      clientId: "",
      charterType: null,
      notes: null,
      verified: false,
      kgsSource: null,
      pcsSource: null,
      prealertText: null,
      flightLabel: null,
      acasStatus: null,
      nomination1f: null,
      flightStatus: null,
      flightStatusSource: "MANUAL",
      feesPaid: null,
      readyForPickup: null,
      pickupStatus: null,
      status7512: null,
      invoiced: null,
      pickupLocation: null,
      transfer: null,
      pickupTime: null,
      phase: "ACTIVE",
      phaseLocked: false,
      archived: false,
      stuck: false,
      stuckSummary: null,
      trackedAt: null,
      trackingEvent: null,
      trackingResult: null,
      source: "SHEET",
      sourceSheet: null,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    }),
    awb: masterAwb,
    dest: shipment?.dest?.trim() || document.destination?.trim() || null,
    origin: shipment?.origin?.trim() || document.departure?.trim() || null,
    pcs: shipment?.pcs ?? (piecesFromLines || null),
    kgs: shipment?.kgs ?? (grossFromLines || null),
    chw: shipment?.chw ?? (chargeableFromLines || null),
    build: shipment?.build ?? null,
    flightNumber: shipment?.flightNumber?.trim() || null,
    eta: shipment?.eta ?? null,
    etd: shipment?.etd ?? leg.etd,
    consignee: shipment?.consignee ?? null,
    client: {
      name: clientName,
      code: shipment?.client?.code ?? "",
      awbParties: parties,
    },
    legs: [leg],
    airWaybills: [guiaDoc, ...others],
  } as SheetLoaded;
}

export async function loadedForGuia(document: GuiaRecord, _company: CompanyView, _options: GuiaPrintOptions): Promise<SheetLoaded> {
  return sheetLoaded(document, await loadShipment(null));
}

function extraFromGuia(document: GuiaRecord, company: CompanyView, options: GuiaPrintOptions): ExtraLetter {
  const identity = document.agentKey === "ack" ? identityFor("ack", company) : kopeIdentity();
  const logo = companyLogo(company);
  return {
    agentKey: document.agentKey,
    identity,
    logo,
    legAwb: document.awb.trim(),
    destination: document.destination?.trim() || "",
    shipperName: document.shipperName?.trim() || "",
    flightDate: document.flightDate?.trim() || "",
    trucker: normalizeTrucker(options.trucker ?? document.truckerName),
    seal: (options.seal ?? document.seal ?? "").trim(),
    driver: (options.driver ?? document.driverName ?? "").trim(),
    signerName: signerName(options.name, options.email),
    documentDate: options.now ?? new Date(),
  };
}

export async function renderGuiaPdf(kind: GuiaFileKind, document: GuiaRecord, company: CompanyView, options: GuiaPrintOptions): Promise<Buffer> {
  if (document.status !== "issued" && (kind === "awb" || kind === "labels") && !options.draft) {
    throw Object.assign(new Error("Issue the guía before printing the AWB or labels."), { status: 409 });
  }
  if (kind === "labels" && document.status !== "issued") {
    const parsed = parseAwb(options.labelAwb ?? "");
    if (!parsed) throw Object.assign(new Error("Enter the AWB number the labels will carry, like 123-12345675."), { status: 400 });
    if (!isValidSerial(parsed.serial)) {
      throw Object.assign(new Error(`${formatAwb(parsed.prefix, parsed.serial)} fails the mod-7 check digit.`), { status: 400 });
    }
    document = { ...document, awb: formatAwb(parsed.prefix, parsed.serial), prefix: parsed.prefix, serial: parsed.serial };
  }
  const opts = sheetOptions(document, options);
  if ((kind === "delivery" || kind === "pickup") && !opts.trucker) {
    throw Object.assign(new Error("Enter a trucker before this document."), { status: 400 });
  }
  if (kind === "awb") return renderCorteAwb(document, company, options);
  if (kind === "delivery") return renderCorteDo(document, company, options);
  if (kind === "tsa") return renderCorteTsa(document, company, options);
  if (kind === "lithium") return renderLithiumLetter(document, company, options);
  if (kind === "tsa-unknown") return tsaUnknownLetter(extraFromGuia(document, company, options));
  if (kind === "ccsf-alternate") return renderMagayaCcsp(document, company, options);
  const loaded = await loadedForGuia(document, company, options);
  if (kind === "pickup") return renderMagayaPickup(document, company, options, loaded);
  if (kind === "ccsp") return renderMagayaCcsf(document, company, options);
  return renderMagayaLabels(document, company, options, loaded);
}
