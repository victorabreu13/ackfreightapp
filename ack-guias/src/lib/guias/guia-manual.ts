import type { GuiaValues } from "@/lib/guias/extract";

/**
 * The numbers a warehouse receipt can feed into a guía. When the user types one by hand it is marked manual and the
 * receipts stop overwriting it. The guía has no volume field, so the volume of a receipt is never copied.
 */
export const MANUAL_FIELDS = [
  { key: "pieces", flag: "piecesManual", label: "Pieces", unit: "" },
  { key: "grossKg", flag: "grossManual", label: "Gross weight", unit: "kg" },
  { key: "chargeableKg", flag: "chargeableManual", label: "Chargeable weight", unit: "kg" },
] as const;

export type ManualKey = (typeof MANUAL_FIELDS)[number]["key"];
export type ManualFlag = (typeof MANUAL_FIELDS)[number]["flag"];
export type ManualFlags = Record<ManualFlag, boolean>;

export const ALL_FLAGS_OFF: ManualFlags = { piecesManual: false, grossManual: false, chargeableManual: false };

export function isManualKey(value: string): value is ManualKey {
  return MANUAL_FIELDS.some((field) => field.key === value);
}

export function manualFieldOf(key: ManualKey) {
  return MANUAL_FIELDS.find((field) => field.key === key)!;
}

/** The fields of the guía that are marked as typed by hand. */
export function manualKeysOf(flags: Partial<ManualFlags>): Set<ManualKey> {
  return new Set(MANUAL_FIELDS.filter((field) => flags[field.flag]).map((field) => field.key));
}

function toNumber(value: string | number | null | undefined): number | null {
  const parsed = Number(String(value ?? "").replace(/,/g, "").trim());
  return String(value ?? "").trim() && Number.isFinite(parsed) ? parsed : null;
}

/** Whether two values are the same number, to the cent. Two blanks are the same. */
export function sameNumber(a: string | number | null | undefined, b: string | number | null | undefined): boolean {
  const left = toNumber(a);
  const right = toNumber(b);
  if (left == null || right == null) return left === right;
  return Math.abs(left - right) < 0.005;
}

const NUMERIC_KEYS: ReadonlySet<keyof GuiaValues> = new Set(["pieces", "grossKg", "chargeableKg", "rate"]);

export type FieldChange = { field: keyof GuiaValues; oldValue: string; newValue: string };

/** Every field of the form that changed between two versions of the guía. Numbers are compared as numbers. */
export function diffGuiaValues(before: GuiaValues, after: GuiaValues): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const key of Object.keys(after) as Array<keyof GuiaValues>) {
    if (key === "issuingCompany") continue;
    const oldValue = String(before[key] ?? "").trim();
    const newValue = String(after[key] ?? "").trim();
    const same = NUMERIC_KEYS.has(key) ? sameNumber(oldValue, newValue) : oldValue === newValue;
    if (!same) changes.push({ field: key, oldValue, newValue });
  }
  return changes;
}

/** The numbers the user changed by hand. Clearing a field is not "manual": the receipt can fill it again. */
export function manualEdits(before: GuiaValues, after: GuiaValues): ManualKey[] {
  return diffGuiaValues(before, after)
    .filter((change): change is FieldChange & { field: ManualKey } => isManualKey(change.field) && change.newValue !== "")
    .map((change) => change.field);
}

/** The receipt values the user chose to ignore. A damaged value reads as nothing ignored. */
export function parseDismissed(json: string | null | undefined): Partial<Record<ManualKey, string>> {
  try {
    const parsed = JSON.parse(json || "{}");
    return parsed && typeof parsed === "object" ? (parsed as Partial<Record<ManualKey, string>>) : {};
  } catch {
    return {};
  }
}

/** The label of a field of the guía in the change history. */
export function guiaFieldLabel(field: string): string {
  const manual = MANUAL_FIELDS.find((item) => item.key === field);
  if (manual) return manual.label;
  const labels: Record<string, string> = {
    client: "Client",
    shipper: "Shipper",
    shipperAddress: "Shipper address",
    consignee: "Consignee",
    consigneeAddress: "Consignee address",
    notify: "Notify",
    notifyAddress: "Notify address",
    origin: "Origen",
    destination: "Destino",
    flightNumber: "Flight",
    flightDate: "Flight date",
    rate: "Rate",
    goods: "Goods",
    handling: "Handling",
    aesItn: "AES ITN",
    hawb: "HAWB",
    dg: "Dangerous Goods",
    unNumbers: "UN numbers",
    bup: "BUP",
    bupItems: "BUP items",
    lithiumPi: "Lithium batteries",
  };
  return labels[field] ?? field;
}
