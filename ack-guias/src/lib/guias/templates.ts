import { GUIA_FILE_LABELS } from "@/lib/guias/documents-index";
import { GUIA_FILE_KINDS, guiaFileName, type GuiaFileKind, type GuiaPrintOptions, type GuiaRecord } from "@/lib/guias/files";

export type GuiaTemplate = {
  kind: GuiaFileKind;
  name: string;
  /** What the document is for. */
  purpose: string;
  /** Page size and count of the sample render. */
  format: string;
  /** What the guía needs before the real document can be printed. */
  needs: string;
  fileName: string;
};

const INFO: Record<GuiaFileKind, { purpose: string; format: string; needs: string }> = {
  awb: {
    purpose: "Master air waybill with the 12-copy set and the conditions of contract.",
    format: "12 pages",
    needs: "The guía must be issued.",
  },
  delivery: {
    purpose: "Delivery order the trucker presents to pick up the freight.",
    format: "Letter",
    needs: "Trucker name.",
  },
  pickup: {
    purpose: "Pick up order (Magaya KPU form) with shipper, consignee, and goods table.",
    format: "Letter",
    needs: "Trucker name.",
  },
  tsa: {
    purpose: "TSA letter for known-shipper cargo tendered to the carrier.",
    format: "Letter",
    needs: "Nothing extra.",
  },
  "tsa-unknown": {
    purpose: "TSA letter for an unknown shipper.",
    format: "Letter",
    needs: "Nothing extra.",
  },
  ccsp: {
    purpose: "CCSSSF certificate of tender to a cargo carrier. Always issued by Kope Logistics Inc., with Kope's TSA and CCSSSF numbers and logo.",
    format: "Letter, 3 copies (3 pages)",
    needs: "Nothing extra. A seal number is optional.",
  },
  "ccsf-alternate": {
    purpose: "Indirect air carrier certification for CCSF cargo (CCSP).",
    format: "Letter, 3 copies (3 pages)",
    needs: "Nothing extra. A seal number is optional.",
  },
  lithium: {
    purpose: "Lithium battery letter.",
    format: "Letter",
    needs: "Nothing extra.",
  },
  labels: {
    purpose: "Magaya cargo labels, one per piece.",
    format: "One label page per piece",
    needs: "The guía must be issued.",
  },
};

export const SAMPLE_AWB = "045-55219415";

/** Download name of a template. The internal kinds ccsp and ccsf-alternate are swapped, so name them by what they print. */
export function templateFileName(kind: GuiaFileKind): string {
  const label = kind === "ccsp" ? "ccsf" : kind === "ccsf-alternate" ? "ccsp" : kind;
  return `TEMPLATE-${label}.pdf`;
}

export function isTemplateKind(value: string): value is GuiaFileKind {
  return GUIA_FILE_KINDS.some((kind) => kind === value);
}

export function guiaTemplates(): GuiaTemplate[] {
  return GUIA_FILE_KINDS.map((kind) => ({
    kind,
    name: GUIA_FILE_LABELS[kind],
    ...INFO[kind],
    fileName: guiaFileName(kind, "<AWB>").replace("<AWB>", "{AWB}"),
  }));
}

/** Made-up guía used to draw a template. It is never saved. */
export function sampleGuia(): GuiaRecord {
  const at = new Date("2026-01-15T12:00:00.000Z");
  return {
    id: "template-sample",
    agentKey: "ack",
    awb: SAMPLE_AWB,
    prefix: "045",
    serial: "55219415",
    status: "issued",
    product: "guia",
    hawb: "H44110",
    carrierName: "LATAM",
    destination: "BOG",
    departure: "MIA",
    shipperName: "SAMPLE SHIPPER CORP",
    shipperAddress: "1300 DOVE ST STE 205 NEWPORT BEACH, CA 92660, UNITED STATES",
    consigneeName: "SAMPLE CONSIGNEE S.A.S",
    consigneeAddress: "CALLE 26 92 32, BOGOTA, COLOMBIA",
    clientLabel: "Sample client",
    flightNumber: "LA401",
    flightDate: "2026-01-16",
    truckerName: "SAMPLE TRUCKER LLC",
    truckerPhone: "(305) 555-0199",
    seal: "",
    driverName: "Sample Driver",
    currency: "USD",
    chgsCode: "PP",
    wtVal: "PPD",
    otherPpc: "PPD",
    declaredCarriage: "NVD",
    declaredCustoms: "NVD",
    lines: [{ id: "line", documentId: "template-sample", pieces: 2, chargeableWeight: 1820, grossWeight: 1666, nature: "GENERAL CARGO", kgLb: "K", sortOrder: 0 }],
    agent: { key: "ack", legalName: "ACK TEAM LLC" },
    createdAt: at,
    updatedAt: at,
  } as unknown as GuiaRecord;
}

export function samplePrintOptions(email: string, name?: string | null): GuiaPrintOptions {
  return {
    email,
    name,
    trucker: "SAMPLE TRUCKER LLC",
    truckerPhone: "(305) 555-0199",
    driver: "Sample Driver",
    seal: "",
    now: new Date("2026-01-15T18:00:00.000Z"),
  };
}
