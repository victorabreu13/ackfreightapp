import type { GuiaValues } from "@/lib/guias/extract";
import type { ReviewField } from "@/lib/guias/extract";

export function blank(value: string): string | null {
  return value || null;
}

export function numberOrNull(value: string): number | null {
  if (!value) return null;
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function lineData(values: GuiaValues) {
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

export function documentData(values: GuiaValues, review: ReviewField[], snippets: Record<string, string>, guiaClientId: string | null) {
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
    bupItems: blank(values.bupItems),
    lithiumPi: blank(values.lithiumPi),
    reviewJson: JSON.stringify(review),
    snippetJson: JSON.stringify(snippets),
  };
}


/** The form values of a saved guía. */
export function guiaValuesOf(document: {
  clientLabel: string | null;
  guiaClient?: { name: string } | null;
  shipperName: string | null;
  shipperAddress: string | null;
  consigneeName: string | null;
  consigneeAddress: string | null;
  notifyName: string | null;
  notifyAddress: string | null;
  departure: string | null;
  destination: string | null;
  flightNumber: string | null;
  flightDate: string | null;
  handling: string | null;
  aesItn: string | null;
  hawb: string | null;
  dgDeclarable: boolean;
  unNumbers: string | null;
  bup: boolean;
  bupItems: string | null;
  lithiumPi: string | null;
  agentKey: string;
  lines: Array<{ pieces: number | null; chargeableWeight: number | null; grossWeight: number | null; rate: number | null; nature: string | null }>;
}): GuiaValues {
  const line = document.lines[0];
  return {
    client: document.clientLabel || document.guiaClient?.name || "",
    shipper: document.shipperName || "",
    shipperAddress: document.shipperAddress || "",
    consignee: document.consigneeName || "",
    consigneeAddress: document.consigneeAddress || "",
    notify: document.notifyName || "",
    notifyAddress: document.notifyAddress || "",
    origin: document.departure || "",
    destination: document.destination || "",
    flightNumber: document.flightNumber || "",
    flightDate: document.flightDate || "",
    pieces: line?.pieces ? String(line.pieces) : "",
    chargeableKg: line?.chargeableWeight ? String(line.chargeableWeight) : "",
    rate: line?.rate != null ? String(line.rate) : "",
    grossKg: line?.grossWeight ? String(line.grossWeight) : "",
    goods: line?.nature || "",
    handling: document.handling || "",
    aesItn: document.aesItn || "",
    hawb: document.hawb || "",
    dg: document.dgDeclarable ? "1" : "",
    unNumbers: document.unNumbers || "",
    bup: document.bup ? "1" : "",
    bupItems: document.bupItems || "",
    lithiumPi: document.lithiumPi || "",
    issuingCompany: "ack",
  };
}
