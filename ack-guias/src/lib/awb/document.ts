import { carrierBlock, countryForAirport } from "./airports";
import { settleLine, type GoodsInput } from "./calc";
import type { AwbPdfModel } from "./pdf";

export type AgentRecord = {
  key: string;
  legalName: string;
  address: string;
  phone: string | null;
  city: string;
  iataCode: string;
  accountNo: string | null;
  signatureLine: string;
  conditions: string;
  copyLabel: string | null;
};

export function signatureFor(agent: AgentRecord, personName: string): string {
  return agent.signatureLine.replaceAll("{name}", personName.trim() || "Authorized Agent");
}

export function miamiDate(date = new Date()): string {
  return calendarDate(date, "America/New_York");
}

function calendarDate(date: Date, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      month: "short",
      day: "2-digit",
      year: "numeric",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.month}/${parts.day}/${parts.year}`;
}

/** Date only, in the form Grecia prints (`Oct/04/2026`). The flight number stays blank for the desk. */
export function secondLegFlightDate(etd: Date | null | undefined): string {
  if (!etd || Number.isNaN(etd.getTime())) return "";
  return calendarDate(etd, "UTC");
}

export function toPdfModel(
  document: {
    awb: string;
    prefix: string;
    serial: string;
    shipperName: string | null;
    shipperAddress: string | null;
    shipperAccount: string | null;
    consigneeName: string | null;
    consigneeAddress: string | null;
    consigneeAccount: string | null;
    carrierName: string | null;
    carrierAddress: string | null;
    accountNo: string | null;
    referenceNumber: string | null;
    departure: string | null;
    to1: string | null;
    by1: string | null;
    to2: string | null;
    by2: string | null;
    to3: string | null;
    by3: string | null;
    currency: string;
    chgsCode: string;
    wtVal: string;
    otherPpc: string;
    declaredCarriage: string;
    declaredCustoms: string;
    destination: string | null;
    flightDate: string | null;
    insurance: string | null;
    handling: string | null;
    sci: string | null;
    destCountry: string | null;
    otherChargesText: string | null;
    accountingInfo: string | null;
    weightCharge: number | null;
    valuationCharge: number | null;
    taxCharge: number | null;
    otherDueAgent: number | null;
    otherDueCarrier: number | null;
    shipperSignature: string | null;
    executedOn: string | null;
    executedAt: string | null;
    carrierSignature: string | null;
    lines: GoodsInput[];
  },
  agent: AgentRecord,
): AwbPdfModel {
  return { ...document, agent };
}

export function prefillFromShipment(input: {
  awb: string;
  prefix: string;
  airline: string | null;
  origin: string | null;
  dest: string | null;
  pcs: number | null;
  kgs: number | null;
  chw: number | null;
  requestedFlightDate: Date | null;
  clientName: string;
  ulds: { code: string; contour: string | null; pcs: number | null }[];
  agent: AgentRecord;
  signer: string;
}): {
  carrierName: string;
  carrierAddress: string;
  departure: string;
  destination: string;
  to1: string;
  by1: string;
  destCountry: string;
  flightDate: string;
  shipperName: string;
  executedOn: string;
  executedAt: string;
  carrierSignature: string;
  lines: GoodsInput[];
} {
  const carrier = carrierBlock(input.prefix, input.airline);
  const destination = (input.dest ?? "").toUpperCase();
  const uldLines = input.ulds.map((uld) => {
    const bits = [uld.code, uld.contour].filter(Boolean).join(" ");
    return uld.pcs ? `${bits} - ${uld.pcs} PCS` : bits;
  });
  const nature = ["GENERAL CARGO", ...uldLines].filter(Boolean).join("\n");
  return {
    carrierName: carrier.name,
    carrierAddress: carrier.address,
    departure: (input.origin || "MIA").toUpperCase(),
    destination,
    to1: destination,
    by1: carrier.name,
    destCountry: countryForAirport(destination),
    flightDate: secondLegFlightDate(input.requestedFlightDate),
    shipperName: input.clientName,
    executedOn: miamiDate(),
    executedAt: input.agent.city,
    carrierSignature: signatureFor(input.agent, input.signer),
    lines: [
      settleLine({
        pieces: input.pcs,
        grossWeight: input.kgs,
        chargeableWeight: input.chw,
        kgLb: "K",
        nature,
      }),
    ],
  };
}
