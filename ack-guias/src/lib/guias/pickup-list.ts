import type { Prisma } from "@prisma/client";
import { awbVariants, shiftDay } from "@/lib/guias/wr-list";

/** The filters and the order of the Pickup requests list. They travel in the address, like those of the warehouse receipts. */
export type PickupFilters = {
  /** The pickup number, typed as PU-0061, PU61 or 61. */
  number: string;
  /** Part of the client or of the shipper. */
  client: string;
  /** Part of the AWB number. */
  awb: string;
  /** Part of the destino. */
  destination: string;
  /** The days the pickup request was created, as YYYY-MM-DD, in New York time. */
  from: string;
  to: string;
  /** Whether a warehouse receipt has already arrived for it. */
  warehouse: "" | "received" | "pending";
  sort: "pickup" | "created" | "client" | "destination" | "awb";
  dir: "asc" | "desc";
};

export const PICKUP_SORTS: ReadonlyArray<PickupFilters["sort"]> = ["pickup", "created", "client", "destination", "awb"];
export const PICKUP_LIST_LIMIT = 300;

function pick(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key];
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

function day(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

export function pickupFiltersFrom(params: Record<string, string | string[] | undefined>): PickupFilters {
  const sort = pick(params, "sort") as PickupFilters["sort"];
  const warehouse = pick(params, "warehouse");
  return {
    number: pick(params, "number"),
    client: pick(params, "client"),
    awb: pick(params, "awb"),
    destination: pick(params, "destination"),
    from: day(pick(params, "from")),
    to: day(pick(params, "to")),
    warehouse: warehouse === "received" || warehouse === "pending" ? warehouse : "",
    sort: PICKUP_SORTS.includes(sort) ? sort : "pickup",
    dir: pick(params, "dir") === "asc" ? "asc" : "desc",
  };
}

/** The number in "PU-0061", "pu61" or "61". Anything else is not a pickup number. */
export function pickupSeqFrom(text: string): number | null {
  const match = /^\s*(?:pu)?\s*-?\s*(\d{1,9})\s*$/i.exec(text);
  return match ? Number(match[1]) : null;
}

export function pickupWhere(filters: PickupFilters): Prisma.PickupRequestWhereInput {
  const and: Prisma.PickupRequestWhereInput[] = [];
  if (filters.number) {
    const seq = pickupSeqFrom(filters.number);
    // Something that is not a number matches nothing, so the list says there is no pickup like that.
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
  if (filters.awb) and.push({ OR: awbVariants(filters.awb).map((variant) => ({ guia: { is: { awb: { contains: variant } } } })) });
  if (filters.destination) and.push({ destination: { contains: filters.destination, mode: "insensitive" } });
  if (filters.warehouse === "received") and.push({ receipts: { some: {} } });
  if (filters.warehouse === "pending") and.push({ receipts: { none: {} } });
  // The database trims with a day to spare and the exact day, in New York time, is checked with matchesDays of wr-list.
  if (filters.from) and.push({ createdAt: { gte: shiftDay(filters.from, -1) } });
  if (filters.to) and.push({ createdAt: { lte: shiftDay(filters.to, 2) } });
  return and.length ? { AND: and } : {};
}

export function pickupOrderBy(filters: PickupFilters): Prisma.PickupRequestOrderByWithRelationInput[] {
  const dir = filters.dir;
  if (filters.sort === "created") return [{ createdAt: dir }, { seq: dir }];
  if (filters.sort === "client") return [{ clientLabel: dir }, { seq: "desc" }];
  if (filters.sort === "destination") return [{ destination: { sort: dir, nulls: "last" } }, { seq: "desc" }];
  if (filters.sort === "awb") return [{ guia: { awb: dir } }, { seq: "desc" }];
  return [{ seq: dir }];
}

/** The address of the list with some filters changed, for the column headers and the clear link. */
export function pickupHref(filters: PickupFilters, change: Partial<PickupFilters> = {}): string {
  const next = { ...filters, ...change };
  const query = new URLSearchParams();
  for (const key of ["number", "client", "awb", "destination", "from", "to", "warehouse"] as const) if (next[key]) query.set(key, next[key]);
  if (next.sort !== "pickup" || next.dir !== "desc") {
    query.set("sort", next.sort);
    query.set("dir", next.dir);
  }
  const text = query.toString();
  return text ? `/guias/pickups?${text}` : "/guias/pickups";
}

/** Clicking the column that is already the order flips it. Another column starts with its natural direction. */
export function pickupSortChange(filters: PickupFilters, sort: PickupFilters["sort"]): Partial<PickupFilters> {
  if (filters.sort === sort) return { dir: filters.dir === "asc" ? "desc" : "asc" };
  return { sort, dir: sort === "client" || sort === "destination" || sort === "awb" ? "asc" : "desc" };
}
