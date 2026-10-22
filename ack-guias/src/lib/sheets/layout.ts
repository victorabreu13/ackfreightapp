import { ACK_TSA_IAC, type CompanyView } from "@/lib/guias/company-profile";
import { cityForAirport } from "@/lib/awb/airports";

export const LABEL_PIECE_CAP = 300;
export const TRACKING_SYSTEM_ID = "9690";
/** Sheet kinds that refuse to render until a trucker is typed. Original documents.ts calls `.has`. */
export const TRUCKER_REQUIRED_DOCS = new Set<string>(["deliveryOrder", "pickupOrder"]);

export const TSA_NUMBER = "SE1701005";
export const CCSF_NUMBER = "MIA.C.05.20.2025.582";
export const KOPE_CCSF_FACILITY = "6450 NW 97TH AVE, STE 130, DORAL, FL 33178";
export const KOPE_CCSF_ALTERNATE_FACILITY = "6450 NW 97TH AVE, SUITE 130 Doral, FL 33178";
export const KOPE_CCSF_ALTERNATE_DSA = "DSA2-6450";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type Identity = {
  name: string;
  labelLines: string[];
  labelTel: string;
  letterLines: string[];
  phone: string;
  fax: string;
  email: string;
  pickupName: string;
  officeName: string;
  pickupLines: string[];
  pickupPhone: string;
  pickupFax: string;
  pickupEmail: string;
  billLines: string[];
  termsName: string;
  termsUrl: string;
  tsaNumber: string;
  ccsfNumber: string;
  facility: string;
  letterFooter: string;
  ccsfFooter: string;
};

export type Terminal = { name: string; lines: string[] };

/** Sheet trucker: trim, collapse spaces, uppercase, cap at 120. No alias expansion. */
export function normalizeTrucker(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toUpperCase().slice(0, 120);
}

export function kopeIdentity(): Identity {
  return {
    name: "KOPE LOGISTICS INC.",
    labelLines: ["6550 NW 97TH AVE, SUITE 220", "DORAL, FL 33178.", "UNITED STATES"],
    labelTel: "Tel:  +1 (786) 719-0590,  Fax:  +1 (305) 503-9451",
    letterLines: ["6550 NW 97TH AVE, SUITE 220,", "DORAL, FL 33178,", "UNITED STATES"],
    phone: "Phone: +1 (786) 719-0590",
    fax: "Fax: +1 (305) 503-9451",
    email: "Email: info@kopelogistics.com",
    pickupName: "KOPE LOGISTICS INC (KOPE2)",
    officeName: "KOPE LOGISTICS INC (KOPE1)",
    pickupLines: ["6450 NW 97TH AVE, SUITE 130", "DOORS 41 TO 51, DORAL, FL", "33178,", "UNITED STATES"],
    pickupPhone: "Phone: (786) 719-0590",
    pickupFax: "Fax: (305) 503-9451",
    pickupEmail: "Email: info@kopelogistics.com",
    billLines: ["6550 NW 97TH AVE, SUITE 220,", "DORAL, FL 33178, UNITED STATES"],
    termsName: "Kope Logistics Inc.",
    termsUrl: "https://www.kopelogistics.com/toc",
    tsaNumber: TSA_NUMBER,
    ccsfNumber: CCSF_NUMBER,
    facility: KOPE_CCSF_FACILITY,
    letterFooter: "6550 NW 97TH AVE, SUITE 220, DORAL FL 33178 UNITED STATES, Tel: +1 (786) 719-0590, Fax: +1 (305) 503-9451",
    ccsfFooter: "6450 NW 97TH AVE, SUITE 130 DORAL, FL 33178 | PH. 786-719-0590",
  };
}

function linesOf(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function identityFor(agentKey: string, company?: CompanyView | null): Identity {
  if (agentKey !== "ack") return kopeIdentity();
  const name = company?.letterheadName?.trim() || company?.brandName?.trim() || "ACK TEAM LLC";
  const address = linesOf(company?.address);
  const phone = company?.phone?.trim() ?? "";
  const fax = company?.fax?.trim() ?? "";
  const email = company?.opsEmail?.trim() ?? "";
  const warehouse = linesOf(company?.warehouseAddress);
  return {
    name,
    labelLines: address,
    labelTel: [phone ? `Tel: ${phone}` : "", fax ? `Fax: ${fax}` : ""].filter(Boolean).join(", "),
    letterLines: address,
    phone: phone ? `Phone: ${phone}` : "",
    fax: fax ? `Fax: ${fax}` : "",
    email: email ? `Email: ${email}` : "",
    pickupName: name,
    officeName: name,
    pickupLines: warehouse.length ? warehouse : address,
    pickupPhone: phone ? `Phone: ${phone}` : "",
    pickupFax: fax ? `Fax: ${fax}` : "",
    pickupEmail: email ? `Email: ${email}` : "",
    billLines: address,
    termsName: name,
    termsUrl: company?.termsUrl?.trim() || "",
    tsaNumber: company?.tsaIacId?.trim() || ACK_TSA_IAC,
    ccsfNumber: company?.ccsfId?.trim() || "",
    facility: warehouse.join(", ") || address.join(", "),
    letterFooter: [address.join(", "), phone ? `Tel: ${phone}` : "", fax ? `Fax: ${fax}` : ""].filter(Boolean).join(", "),
    ccsfFooter: [warehouse.join(" ") || address.join(" "), phone ? `PH. ${phone}` : ""].filter(Boolean).join(" | "),
  };
}

export function airlineTerminal(airline: string, prefix: string): Terminal {
  const name = airline.trim();
  const upper = name.toUpperCase();
  if (prefix === "369" || upper.includes("ATLAS")) {
    return {
      name: "ATLAS AIR",
      lines: ["Worldwide Flight Services (WFS)", "4350 NW 36TH ST POD C, MIAMI,", "FL", "33166, UNITED STATES", "Phone: (305) 777-7295"],
    };
  }
  if (prefix === "045" || upper.includes("LATAM")) {
    return {
      name: "LATAM AIRLINES GROUP",
      lines: ["1801 NW 66 AVENUE", "BLDG 709", "MIAMI , FLORIDA 33122 UNITED STATES", "Phone: (305) 599-7200"],
    };
  }
  return { name: upper, lines: [] };
}

export function labelCount(pieces: number): number {
  const count = Math.floor(Number.isFinite(pieces) ? pieces : 0);
  if (count <= 0) return 1;
  return Math.min(LABEL_PIECE_CAP, count);
}

export function mawbBarcode(awb: string, piece: number): string {
  return `${awb.replace(/\D/g, "")}${String(piece).padStart(4, "0")}`;
}

export function trackingCode(awb: string, _piece = 1): string {
  return `${TRACKING_SYSTEM_ID}-${awb}-1Z`;
}

export const TRACKING_CAPTION = "Tracking Number.  (SystemID-Warehouse Receipt-ItemID)";

const TRUCKER_BLOCKS: Record<string, string[]> = {
  "KAY AIR DELIVERY MIA LLC": ["2469 SW 23RD TER", "MIAMI, FL 33145", "Phone: (305) 993-8568"],
};

export function truckerLines(name: string): string[] {
  const trimmed = name.trim();
  if (!trimmed) return [];
  return [trimmed, ...(TRUCKER_BLOCKS[trimmed] ?? [])];
}

export function pickupNumber(awb: string): string {
  const digits = awb.replace(/\D/g, "");
  const serial = (digits.slice(3) || digits).padStart(8, "0").slice(-8);
  return `KPU-${serial}`;
}

export function fileNumber(master: string, leg: string): string {
  if (master && leg && master !== leg) return `${master} - ${leg}`;
  return leg || master;
}

export function labelNotes(input: { inboundFlight: string; outboundFlight: string; hawb: string; masterAwb: string }): string {
  const hawb = input.hawb.trim();
  const parts = [
    input.inboundFlight ? `IN ${input.inboundFlight}` : "",
    input.outboundFlight ? `OUT ${input.outboundFlight}` : "",
    hawb ? `HAWB ${hawb}` : "",
    input.masterAwb ? `INBOUND ${input.masterAwb}` : "",
  ].filter(Boolean);
  return parts.join("   ");
}

export function kgText(value: number): string {
  const number = Number.isFinite(value) ? value : 0;
  return `${number.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`;
}

export function vkgText(value: number): string {
  const number = Number.isFinite(value) ? value : 0;
  return `${number.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} VKg`;
}

function fromParts(year: number, month: number, day: number, style: "long" | "short"): string {
  const mon = MONTHS[month - 1] ?? "Jan";
  const dd = String(day).padStart(2, "0");
  const y = style === "short" ? String(year).slice(-2) : String(year);
  return `${mon}/${dd}/${y}`;
}

export function sheetDate(value: Date, style: "long" | "short" = "long"): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  return fromParts(year, month, day, style);
}

export function formatFlightDate(value: string | null | undefined, style: "long" | "short" = "long"): string {
  const raw = value?.trim() ?? "";
  if (!raw) return "";
  const slashed = raw.match(/^([A-Za-z]{3})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashed) {
    const month = MONTHS.findIndex((item) => item.toLowerCase() === slashed[1].toLowerCase()) + 1;
    const year = slashed[3].length === 2 ? 2000 + Number(slashed[3]) : Number(slashed[3]);
    if (month > 0) return fromParts(year, month, Number(slashed[2]), style);
  }
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return fromParts(Number(iso[1]), Number(iso[2]), Number(iso[3]), style);
  const named = raw.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/);
  if (named) {
    const month = MONTHS.findIndex((item) => item.toLowerCase() === named[2].slice(0, 3).toLowerCase()) + 1;
    if (month > 0) return fromParts(Number(named[3]), month, Number(named[1]), style);
  }
  return raw;
}

export function placeName(code: string): string {
  const city = cityForAirport(code);
  return city || code;
}

export function signerName(name: string | null | undefined, email: string): string {
  const trimmed = name?.trim() ?? "";
  if (trimmed) return trimmed;
  const local = email.split("@")[0] ?? "";
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}
