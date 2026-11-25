/**
 * Correcting a pickup request also corrects the AWB it started, because the pickup order is printed from the AWB. An AWB
 * field is only changed when it still holds what the pickup request had before: if the team already changed it in the AWB,
 * that value stays and is reported. On an AWB that is already issued only the parties and the trucker are corrected; its
 * destination, pieces, weights and goods are never touched.
 */
export type PickupFields = {
  shipperName: string;
  shipperAddress: string;
  consigneeName: string | null;
  consigneeAddress: string | null;
  destination: string | null;
  pieces: number | null;
  weightKg: number | null;
  description: string | null;
  truckerName: string | null;
  truckerPhone: string | null;
  driverName: string | null;
  packageType: string | null;
  notes: string | null;
};

export type GuiaPickupView = {
  shipperName: string | null;
  shipperAddress: string | null;
  consigneeName: string | null;
  consigneeAddress: string | null;
  destination: string | null;
  truckerName: string | null;
  pickupTruckerName: string | null;
  pickupNotes: string | null;
  truckerPhone: string | null;
  driverName: string | null;
  packageType: string | null;
  line: { id: string; pieces: number | null; grossWeight: number | null; chargeableWeight: number | null; nature: string | null } | null;
};

export type PickupSyncPlan = {
  /** Columns of the AWB to write. */
  guia: Record<string, string | null>;
  /** Columns of its first goods line to write. */
  line: Record<string, string | number | null>;
  /** For the change history of the AWB: the field name it shows, the value before and the value after. */
  changes: Array<{ field: string; oldValue: string; newValue: string }>;
  /** Labels of the fields left as they were because the AWB had its own value. */
  kept: string[];
};

type Value = string | number | null | undefined;

function norm(value: Value): string | number | null {
  if (typeof value === "number") return value;
  const trimmed = String(value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

function same(left: Value, right: Value): boolean {
  return norm(left) === norm(right);
}

function show(value: Value): string {
  return String(norm(value) ?? "");
}

function asText(value: Value): string | null {
  const clean = norm(value);
  return clean == null ? null : String(clean);
}

type Rule = {
  label: string;
  /** The name the change history shows. */
  field: string;
  from: Value;
  to: Value;
  current: Value;
  /** "cargo" fields are left alone on an issued AWB. */
  scope: "party" | "cargo";
  write: (plan: PickupSyncPlan, value: Value) => void;
};

export function planPickupSync(before: PickupFields, after: PickupFields, guia: GuiaPickupView, issued: boolean): PickupSyncPlan {
  const plan: PickupSyncPlan = { guia: {}, line: {}, changes: [], kept: [] };
  const column = (name: string) => (target: PickupSyncPlan, value: Value) => {
    target.guia[name] = asText(value);
  };
  const line = guia.line;
  const rules: Rule[] = [
    { label: "Shipper", field: "shipper", from: before.shipperName, to: after.shipperName, current: guia.shipperName, scope: "party", write: column("shipperName") },
    { label: "Pickup address", field: "shipperAddress", from: before.shipperAddress, to: after.shipperAddress, current: guia.shipperAddress, scope: "party", write: column("shipperAddress") },
    { label: "Consignee", field: "consignee", from: before.consigneeName, to: after.consigneeName, current: guia.consigneeName, scope: "party", write: column("consigneeName") },
    { label: "Consignee address", field: "consigneeAddress", from: before.consigneeAddress, to: after.consigneeAddress, current: guia.consigneeAddress, scope: "party", write: column("consigneeAddress") },
    { label: "Trucker", field: "trucker", from: before.truckerName, to: after.truckerName, current: guia.truckerName, scope: "party", write: column("truckerName") },
    { label: "Pickup trucker", field: "pickupTrucker", from: before.truckerName, to: after.truckerName, current: guia.pickupTruckerName, scope: "party", write: column("pickupTruckerName") },
    { label: "Trucker phone", field: "truckerPhone", from: before.truckerPhone, to: after.truckerPhone, current: guia.truckerPhone, scope: "party", write: column("truckerPhone") },
    { label: "Driver", field: "driver", from: before.driverName, to: after.driverName, current: guia.driverName, scope: "party", write: column("driverName") },
    { label: "Pickup notes", field: "pickupNotes", from: before.notes, to: after.notes, current: guia.pickupNotes, scope: "party", write: column("pickupNotes") },
    { label: "Package", field: "packageType", from: before.packageType, to: after.packageType, current: guia.packageType, scope: "party", write: column("packageType") },
    { label: "Destino", field: "destination", from: before.destination, to: after.destination, current: guia.destination, scope: "cargo", write: column("destination") },
  ];
  if (line) {
    rules.push(
      { label: "Goods", field: "goods", from: before.description, to: after.description, current: line.nature, scope: "cargo", write: (target, value) => { target.line.nature = asText(value); } },
      { label: "Pieces", field: "pieces", from: before.pieces, to: after.pieces, current: line.pieces, scope: "cargo", write: (target, value) => { target.line.pieces = norm(value) as number | null; } },
      { label: "Gross weight", field: "grossKg", from: before.weightKg, to: after.weightKg, current: line.grossWeight, scope: "cargo", write: (target, value) => { target.line.grossWeight = norm(value) as number | null; } },
      { label: "Chargeable weight", field: "chargeableKg", from: before.weightKg, to: after.weightKg, current: line.chargeableWeight, scope: "cargo", write: (target, value) => { target.line.chargeableWeight = norm(value) as number | null; } },
    );
  }
  for (const rule of rules) {
    if (same(rule.from, rule.to)) continue;
    if (issued && rule.scope === "cargo") continue;
    if (norm(rule.current) == null || same(rule.current, rule.from)) {
      rule.write(plan, rule.to);
      plan.changes.push({ field: rule.field, oldValue: show(rule.current), newValue: show(rule.to) });
    } else {
      plan.kept.push(rule.label);
    }
  }
  return plan;
}
