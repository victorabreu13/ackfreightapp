import type { Prisma } from "@prisma/client";

/** The filters and the order of the Warehouse receipts list. They travel in the address, so a search can be shared. */
export type WrFilters = {
  /** The receipt number, typed as K5554 or 5554. */
  number: string;
  /** Part of the client or of the shipper. */
  client: string;
  /** Part of the AWB number, or of the tracking number of the receipt. */
  awb: string;
  /** Days, as YYYY-MM-DD, in New York time. */
  from: string;
  to: string;
  link: "" | "linked" | "unlinked";
  sort: "receipt" | "received" | "client" | "awb";
  dir: "asc" | "desc";
};

/** The day of a moment in New York, as YYYY-MM-DD. */
function nyDay(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export const WR_SORTS: ReadonlyArray<WrFilters["sort"]> = ["receipt", "received", "client", "awb"];
export const WR_LIST_LIMIT = 300;

function pick(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key];
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

function day(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

export function wrFiltersFrom(params: Record<string, string | string[] | undefined>): WrFilters {
  const sort = pick(params, "sort") as WrFilters["sort"];
  const link = pick(params, "link");
  return {
    number: pick(params, "number"),
    client: pick(params, "client"),
    awb: pick(params, "awb"),
    from: day(pick(params, "from")),
    to: day(pick(params, "to")),
    link: link === "linked" || link === "unlinked" ? link : "",
    sort: WR_SORTS.includes(sort) ? sort : "receipt",
    dir: pick(params, "dir") === "asc" ? "asc" : "desc",
  };
}

/** The number in "K5554", "k 5554" or "5554". Anything else is not a receipt number. */
export function receiptSeqFrom(text: string): number | null {
  const match = /^\s*k?\s*(\d{1,9})\s*$/i.exec(text);
  return match ? Number(match[1]) : null;
}

/** The ways an AWB can be written in the database for what was typed: as typed, and with the dash after the prefix. */
export function awbVariants(text: string): string[] {
  const typed = text.trim();
  if (!typed) return [];
  const variants = new Set([typed]);
  const digits = typed.replace(/\D/g, "");
  if (digits.length > 3 && !typed.includes("-")) variants.add(`${digits.slice(0, 3)}-${digits.slice(3)}`);
  return [...variants];
}

export function shiftDay(value: string, days: number): Date {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

export function wrWhere(filters: WrFilters): Prisma.WarehouseReceiptWhereInput {
  const and: Prisma.WarehouseReceiptWhereInput[] = [];
  if (filters.number) {
    const seq = receiptSeqFrom(filters.number);
    // Something that is not a number matches nothing, so the list says there is no receipt like that.
    and.push(seq == null ? { id: "none" } : { seq });
  }
  if (filters.client) {
    and.push({
      OR: [
        { clientLabel: { contains: filters.client, mode: "insensitive" } },
        { shipperName: { contains: filters.client, mode: "insensitive" } },
      ],
    });
  }
  if (filters.awb) {
    and.push({
      OR: [
        ...awbVariants(filters.awb).map((variant) => ({ guia: { is: { awb: { contains: variant } } } })),
        { trackingNumber: { contains: filters.awb, mode: "insensitive" as const } },
      ],
    });
  }
  if (filters.link === "linked") and.push({ guiaId: { not: null } });
  if (filters.link === "unlinked") and.push({ guiaId: null });
  // A day in New York is never more than a day away from the same day in UTC, so the database trims with a day to spare
  // and the exact day is checked in matchesDays.
  if (filters.from) and.push({ receivedAt: { gte: shiftDay(filters.from, -1) } });
  if (filters.to) and.push({ receivedAt: { lte: shiftDay(filters.to, 2) } });
  return and.length ? { AND: and } : {};
}

export function wrOrderBy(filters: WrFilters): Prisma.WarehouseReceiptOrderByWithRelationInput[] {
  const dir = filters.dir;
  if (filters.sort === "received") return [{ receivedAt: dir }, { seq: dir }];
  if (filters.sort === "client") return [{ clientLabel: { sort: dir, nulls: "last" } }, { seq: "desc" }];
  if (filters.sort === "awb") return [{ guia: { awb: dir } }, { seq: "desc" }];
  return [{ seq: dir }];
}

/** The exact day check, in New York time, for the receipts the database let through. */
export function matchesDays(receivedAt: Date, filters: Pick<WrFilters, "from" | "to">): boolean {
  const received = nyDay(receivedAt);
  if (filters.from && received < filters.from) return false;
  if (filters.to && received > filters.to) return false;
  return true;
}

/** The address of the list with some filters changed, for the column headers and the clear link. */
export function wrHref(filters: WrFilters, change: Partial<WrFilters> = {}): string {
  const next = { ...filters, ...change };
  const query = new URLSearchParams();
  for (const key of ["number", "client", "awb", "from", "to", "link"] as const) if (next[key]) query.set(key, next[key]);
  if (next.sort !== "receipt" || next.dir !== "desc") {
    query.set("sort", next.sort);
    query.set("dir", next.dir);
  }
  const text = query.toString();
  return text ? `/guias/warehouse?${text}` : "/guias/warehouse";
}

/** Clicking the column that is already the order flips it. Another column starts with its natural direction. */
export function wrSortChange(filters: WrFilters, sort: WrFilters["sort"]): Partial<WrFilters> {
  if (filters.sort === sort) return { dir: filters.dir === "asc" ? "desc" : "asc" };
  return { sort, dir: sort === "client" || sort === "awb" ? "asc" : "desc" };
}
