import table from "@/lib/guias/dg/un-table.json";
import { parseUnNumbers } from "@/lib/guias/dg";

/**
 * Dangerous goods lookup. The data is the Hazardous Materials Table of 49 CFR 172.101 (a public US document),
 * which lists each UN number with its proper shipping name, class or division, packing group, label codes and the
 * passenger and cargo aircraft quantity limits. It is not the IATA DGR. A few air-only rules are added below, and
 * every result must be confirmed against the current IATA Dangerous Goods Regulations before shipping.
 */
export type UnRow = {
  un: string;
  name: string;
  cls: string;
  pg: string;
  labels: string[];
  pax: string;
  cargo: string;
  symbols: string;
};

const ROWS = table as UnRow[];

export function lookupUn(un: string): UnRow[] {
  return ROWS.filter((row) => row.un === un);
}

/** Label keys the generator draws. Hazard labels use the class or division code, like "3" or "1.4G". */
export type LabelKey = string;

export const LITHIUM_UNS = ["3090", "3091", "3480", "3481"];

/** Air-only differences from the US table that change what goes on the package. */
const AIR_OVERRIDES: Record<string, { labels?: LabelKey[]; note: string; stub?: { name: string; cls: string; pax?: string; cargo?: string } }> = {
  "1845": {
    labels: ["9"],
    note: "Dry ice. The US table asks for no label, but air transport needs the Class 9 label and the marking UN1845, Carbon dioxide, solid (Dry ice) with the net weight in kg.",
  },
  "2807": {
    labels: ["MAGNETIZED"],
    stub: { name: "Magnetized material", cls: "9" },
    note: "Magnetized material is not in the US table. Air transport needs the Magnetized material handling label.",
  },
  "3245": { labels: [], stub: { name: "Genetically modified microorganisms or organisms", cls: "9" }, note: "Not in the US table. Check the DGR for its marking and labelling." },
  "3373": {
    labels: [],
    note: "Biological substance, Category B. No hazard label. The package is marked UN3373 in a diamond with the proper shipping name.",
  },
  "2910": { labels: [], note: "Radioactive material, excepted package. No hazard label. The package is marked with the UN number." },
  "2908": { labels: [], note: "Radioactive material, excepted package. No hazard label. The package is marked with the UN number." },
  "2909": { labels: [], note: "Radioactive material, excepted package. No hazard label. The package is marked with the UN number." },
  "2911": { labels: [], note: "Radioactive material, excepted package. No hazard label. The package is marked with the UN number." },
};

const LITHIUM_NOTE =
  "Lithium batteries. Uses the Class 9 lithium battery label. Section II shipments use the lithium battery mark instead, which is not generated here.";

export type UnPlan = {
  un: string;
  found: boolean;
  rows: UnRow[];
  /** Primary row. Several packing groups share a UN number and the same labels. */
  name: string;
  cls: string;
  pg: string;
  /** Hazard labels, primary hazard first, then subsidiary. */
  labels: LabelKey[];
  /** Forbidden on passenger aircraft, so the package needs the Cargo Aircraft Only label. */
  cargoOnly: boolean;
  /** Forbidden on cargo aircraft too, so it cannot fly. */
  forbidden: boolean;
  /** The limits are in litres, so the package probably holds liquid and needs orientation arrows. */
  liquid: boolean;
  pax: string;
  cargo: string;
  notes: string[];
};

function isForbidden(value: string): boolean {
  return /^forbidden$/i.test(value.trim());
}

export function planUn(un: string): UnPlan {
  const rows = lookupUn(un);
  const override = AIR_OVERRIDES[un];
  const primary = rows[0] ?? (override?.stub ? { un, name: override.stub.name, cls: override.stub.cls, pg: "", labels: [], pax: override.stub.pax ?? "", cargo: override.stub.cargo ?? "", symbols: "" } : undefined);
  if (!primary) {
    return {
      un,
      found: false,
      rows: [],
      name: "",
      cls: "",
      pg: "",
      labels: [],
      cargoOnly: false,
      forbidden: false,
      liquid: false,
      pax: "",
      cargo: "",
      notes: [`UN${un} is not in the table. Look it up in the current IATA DGR.`],
    };
  }
  const notes: string[] = [];
  let labels = [...primary.labels];
  if (override) {
    if (override.labels) labels = [...override.labels];
    notes.push(override.note);
  }
  if (LITHIUM_UNS.includes(un)) {
    labels = ["9A"];
    notes.push(LITHIUM_NOTE);
  }
  if (primary.cls === "7" && !override) notes.push("Radioactive. The labels carry the category, contents, activity and transport index, so they are filled in by hand and are not generated here.");
  const paxForbidden = isForbidden(primary.pax);
  const forbidden = paxForbidden && isForbidden(primary.cargo);
  const packingGroups = rows.map((row) => row.pg).filter(Boolean);
  if (new Set(rows.map((row) => row.labels.join("+"))).size > 1) {
    notes.push("The packing groups of this UN number do not share the same labels. The first entry is used. Check the DGR.");
  }
  return {
    un,
    found: true,
    rows,
    name: primary.name,
    cls: primary.cls,
    pg: packingGroups.join(" / "),
    labels,
    cargoOnly: paxForbidden && !forbidden,
    forbidden,
    liquid: /\b(m?L)\b/.test(`${primary.pax} ${primary.cargo}`),
    pax: primary.pax,
    cargo: primary.cargo,
    notes,
  };
}

export type LabelChoice = "auto" | "yes" | "no";

export type DgLabelRequest = {
  un: string;
  /** Packages, and so copies of each set of labels. */
  copies: number;
  cargoAircraftOnly: LabelChoice;
  arrows: LabelChoice;
  marks: boolean;
};

export type DgLabelItem =
  | { kind: "hazard"; code: LabelKey; un: string; copy: number }
  | { kind: "cao"; un: string; copy: number }
  | { kind: "arrows"; un: string; copy: number }
  | { kind: "mark"; un: string; name: string; copy: number };

export type DgLabelPlan = {
  units: UnPlan[];
  items: DgLabelItem[];
  warnings: string[];
};

export const MAX_COPIES = 50;

export function planDgLabels(request: DgLabelRequest): DgLabelPlan {
  const copies = Math.max(1, Math.min(MAX_COPIES, Math.round(request.copies) || 1));
  const units = parseUnNumbers(request.un).map(planUn);
  const items: DgLabelItem[] = [];
  const warnings: string[] = [];
  for (const unit of units) {
    if (!unit.found) {
      warnings.push(`UN${unit.un} is not in the table.`);
      continue;
    }
    if (unit.forbidden) warnings.push(`UN${unit.un} is forbidden on passenger and cargo aircraft in the table. Check the DGR before booking it.`);
    const cao = request.cargoAircraftOnly === "yes" || (request.cargoAircraftOnly === "auto" && unit.cargoOnly);
    const arrows = request.arrows === "yes" || (request.arrows === "auto" && unit.liquid);
    for (let copy = 1; copy <= copies; copy += 1) {
      for (const code of unit.labels) items.push({ kind: "hazard", code, un: unit.un, copy });
      if (cao) items.push({ kind: "cao", un: unit.un, copy });
      if (arrows) items.push({ kind: "arrows", un: unit.un, copy });
      if (request.marks) items.push({ kind: "mark", un: unit.un, name: unit.name, copy });
    }
  }
  return { units, items, warnings };
}
