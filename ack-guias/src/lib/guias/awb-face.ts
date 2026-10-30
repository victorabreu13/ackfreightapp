import { codeForPlace, countryForAirport } from "@/lib/awb/airports";
import { miamiDate } from "@/lib/awb/document";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Airport code for the routing To box. A free-text place that is not an airport stays off the box. */
export function routingTo(destination: string | null | undefined): string {
  const code = codeForPlace(destination ?? "");
  return /^[A-Z]{3}$/.test(code) ? code : "";
}

export function destinationCountry(destination: string | null | undefined): string {
  const code = routingTo(destination);
  return code ? countryForAirport(code) : "";
}

/** Sample face dates look like Oct/20/2026. Unparsed text is kept so a typed date is not dropped. */
export function awbDate(value: string | null | undefined): string {
  const text = value?.trim() ?? "";
  if (!text) return "";
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const month = MONTHS[Number(iso[2]) - 1];
    if (month) return `${month}/${iso[3]}/${iso[1]}`;
  }
  const named = text.match(/^(\d{1,2})\s+([A-Za-z]{3,})(?:\s+(\d{4}))?$/);
  if (named) {
    const month = named[2].slice(0, 1).toUpperCase() + named[2].slice(1, 3).toLowerCase();
    const year = named[3] ?? "";
    return year ? `${month}/${named[1].padStart(2, "0")}/${year}` : text;
  }
  const slashed = text.match(/^([A-Za-z]{3})\/(\d{1,2})\/(\d{4})$/);
  if (slashed) {
    const month = slashed[1].slice(0, 1).toUpperCase() + slashed[1].slice(1, 3).toLowerCase();
    return `${month}/${slashed[2].padStart(2, "0")}/${slashed[3]}`;
  }
  return text;
}

/** Flight and date for the Flight Date box. The renderer shrinks the line so it stays inside the cell. */
export function flightDateLine(flightNumber: string | null | undefined, flightDate: string | null | undefined): string {
  const flight = flightNumber?.trim() ?? "";
  const date = awbDate(flightDate);
  return [flight, date].filter(Boolean).join(" ");
}

export function notifyLine(name: string | null | undefined, address: string | null | undefined): string {
  return [name, address].map((part) => part?.trim()).filter(Boolean).join(", ");
}

export function guiaPdfOverlay(input: {
  destination: string | null;
  carrierName: string | null;
  flightNumber: string | null;
  flightDate: string | null;
  notifyName: string | null;
  notifyAddress: string | null;
  status: string;
  executedOn: string | null;
  updatedAt: Date;
}): {
  to1: string;
  by1: string;
  destCountry: string;
  flightDate: string;
  executedOn: string;
  notifyParty: string;
  asArranged: true;
} {
  const carrier = (input.carrierName ?? "").trim();
  return {
    to1: routingTo(input.destination),
    by1: carrier && carrier.toUpperCase() !== "ISSUING CARRIER" ? carrier : "",
    destCountry: destinationCountry(input.destination),
    flightDate: flightDateLine(input.flightNumber, input.flightDate),
    executedOn: input.executedOn?.trim() || (input.status === "issued" ? miamiDate(input.updatedAt) : ""),
    notifyParty: notifyLine(input.notifyName, input.notifyAddress),
    asArranged: true,
  };
}
