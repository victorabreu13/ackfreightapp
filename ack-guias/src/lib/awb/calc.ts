export type GoodsInput = {
  pieces?: number | null;
  grossWeight?: number | null;
  kgLb?: string | null;
  rateClass?: string | null;
  commodity?: string | null;
  chargeableWeight?: number | null;
  rate?: number | null;
  total?: number | null;
  nature?: string | null;
  length?: number | null;
  width?: number | null;
  height?: number | null;
  dimUnit?: string | null;
};

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function volumeWeight(line: GoodsInput): number | null {
  const length = line.length ?? null;
  const width = line.width ?? null;
  const height = line.height ?? null;
  if (length == null || width == null || height == null || length <= 0 || width <= 0 || height <= 0) return null;
  const pieces = line.pieces && line.pieces > 0 ? line.pieces : 1;
  const unit = (line.dimUnit ?? "cm").toLowerCase();
  const divisor = unit === "in" || unit === "inch" || unit === "inches" ? 366 : 6000;
  return round2((pieces * length * width * height) / divisor);
}

export function settleLine(line: GoodsInput): GoodsInput {
  const volume = volumeWeight(line);
  const gross = line.grossWeight ?? null;
  let chargeable = line.chargeableWeight ?? null;
  if (volume != null) {
    const basis = gross != null ? Math.max(gross, volume) : volume;
    chargeable = round2(basis);
  } else if (chargeable == null && gross != null) {
    chargeable = round2(gross);
  }
  let total = line.total ?? null;
  if (line.rate != null && chargeable != null) total = round2(chargeable * line.rate);
  return { ...line, chargeableWeight: chargeable, total };
}

export type ChargeSides = {
  weightPrepaid: number;
  weightCollect: number;
  valuationPrepaid: number;
  valuationCollect: number;
  tax: number;
  otherDueAgent: number;
  otherDueCarrier: number;
  totalPrepaid: number;
  totalCollect: number;
  weightCharge: number;
};

export function settleCharges(input: {
  lines: GoodsInput[];
  wtVal: string;
  otherPpc: string;
  weightCharge?: number | null;
  valuationCharge?: number | null;
  taxCharge?: number | null;
  otherDueAgent?: number | null;
  otherDueCarrier?: number | null;
}): ChargeSides {
  const rated = input.lines.reduce((sum, line) => sum + (line.total ?? 0), 0);
  const weightCharge = round2(input.weightCharge ?? rated);
  const valuation = round2(input.valuationCharge ?? 0);
  const tax = round2(input.taxCharge ?? 0);
  const otherDueAgent = round2(input.otherDueAgent ?? 0);
  const otherDueCarrier = round2(input.otherDueCarrier ?? 0);
  const weightCollect = input.wtVal === "COLL";
  const otherCollect = input.otherPpc === "COLL";
  const weightPrepaid = weightCollect ? 0 : weightCharge;
  const weightCollectAmt = weightCollect ? weightCharge : 0;
  const valuationPrepaid = weightCollect ? 0 : valuation;
  const valuationCollect = weightCollect ? valuation : 0;
  const otherPrepaid = otherCollect ? 0 : tax + otherDueAgent + otherDueCarrier;
  const otherCollectAmt = otherCollect ? tax + otherDueAgent + otherDueCarrier : 0;
  return {
    weightPrepaid,
    weightCollect: weightCollectAmt,
    valuationPrepaid,
    valuationCollect,
    tax,
    otherDueAgent,
    otherDueCarrier,
    totalPrepaid: round2(weightPrepaid + valuationPrepaid + otherPrepaid),
    totalCollect: round2(weightCollectAmt + valuationCollect + otherCollectAmt),
    weightCharge,
  };
}

export function money(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "";
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function weightText(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "";
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
