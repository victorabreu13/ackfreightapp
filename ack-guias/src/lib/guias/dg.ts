/** The line printed in Handling Information when a guía carries declarable dangerous goods. */
export const DG_HANDLING_LINE = "Dangerous Goods as per associated DGD";

/** Every four-digit UN number in the text, once each, in the order written. */
export function parseUnNumbers(value: string | null | undefined): string[] {
  const found: string[] = [];
  for (const match of (value ?? "").matchAll(/(?<!\d)(\d{4})(?!\d)/g)) {
    const un = match[1];
    if (!found.includes(un)) found.push(un);
  }
  return found;
}

/** "3481 1950" becomes "UN3481, UN1950". */
export function formatUnNumbers(value: string | null | undefined): string {
  return parseUnNumbers(value)
    .map((un) => `UN${un}`)
    .join(", ");
}

/** UN3090, UN3091, UN3480 and UN3481 are the lithium battery entries. */
export function hasLithiumUn(value: string | null | undefined): boolean {
  return parseUnNumbers(value).some((un) => ["3090", "3091", "3480", "3481"].includes(un));
}

/** True when every UN number in the text is a lithium battery entry. */
export function onlyLithiumUn(value: string | null | undefined): boolean {
  const numbers = parseUnNumbers(value);
  return numbers.length > 0 && numbers.every((un) => ["3090", "3091", "3480", "3481"].includes(un));
}

/**
 * Lithium batteries prepared under Section II of the packing instructions are not shipped with a Shipper's
 * Declaration, so they do not carry the DGD line. The air waybill names the packing instruction instead.
 */
export const LITHIUM_SECTION_II = [
  { pi: "965", ion: true, label: "UN3480 lithium ion batteries (PI 965)" },
  { pi: "966", ion: true, label: "UN3481 lithium ion batteries packed with equipment (PI 966)" },
  { pi: "967", ion: true, label: "UN3481 lithium ion batteries contained in equipment (PI 967)" },
  { pi: "968", ion: false, label: "UN3090 lithium metal batteries (PI 968)" },
  { pi: "969", ion: false, label: "UN3091 lithium metal batteries packed with equipment (PI 969)" },
  { pi: "970", ion: false, label: "UN3091 lithium metal batteries contained in equipment (PI 970)" },
] as const;

/**
 * The battery types a guía can carry, as the boxes of the Lithium Battery Safety Document. A guía keeps the ones
 * checked as a comma list of these codes, such as "967,970". The "IB" ones are Section IB, which ship with a DGD.
 */
export const LITHIUM_TYPES = [
  { code: "965", pi: "965", section: "II", ion: true, short: "Ion: celdas/baterías solas (PI 965)" },
  { code: "966", pi: "966", section: "II", ion: true, short: "Ion: con equipo (PI 966)" },
  { code: "967", pi: "967", section: "II", ion: true, short: "Ion: dentro del equipo (PI 967)" },
  { code: "968", pi: "968", section: "II", ion: false, short: "Metal: celdas/baterías solas (PI 968)" },
  { code: "969", pi: "969", section: "II", ion: false, short: "Metal: con equipo (PI 969)" },
  { code: "970", pi: "970", section: "II", ion: false, short: "Metal: dentro del equipo (PI 970)" },
  { code: "965IB", pi: "965", section: "IB", ion: true, short: "Ion: solas, Sección IB (PI 965)" },
  { code: "968IB", pi: "968", section: "IB", ion: false, short: "Metal: solas, Sección IB (PI 968)" },
] as const;

export type LithiumTypeCode = (typeof LITHIUM_TYPES)[number]["code"];

/** The valid codes in a comma list, once each, in the order of the document. Anything else is dropped. */
export function parseLithiumTypes(value: string | null | undefined): LithiumTypeCode[] {
  const wanted = new Set((value ?? "").split(/[,\s]+/).map((part) => part.trim().toUpperCase()).filter(Boolean));
  return LITHIUM_TYPES.filter((type) => wanted.has(type.code)).map((type) => type.code);
}

/** True when any of the Section II types is checked. Those ship without a DGD. */
export function isLithiumPi(value: string | null | undefined): boolean {
  return parseLithiumTypes(value).some((code) => LITHIUM_TYPES.find((type) => type.code === code)?.section === "II");
}

/** Whether the guía carries any lithium battery type, Section II or IB. */
export function hasLithiumTypes(value: string | null | undefined): boolean {
  return parseLithiumTypes(value).length > 0;
}

/** One statement for each Section II type checked, for Handling Information. */
export function lithiumSectionIIStatements(value: string | null | undefined): string[] {
  return parseLithiumTypes(value)
    .map((code) => LITHIUM_TYPES.find((type) => type.code === code))
    .filter((type): type is (typeof LITHIUM_TYPES)[number] => Boolean(type) && type?.section === "II")
    .map((type) => `Lithium ${type.ion ? "ion" : "metal"} batteries in compliance with Section II of PI${type.pi}`);
}

/** The air waybill statement for a Section II lithium battery shipment, or "" when there is none. */
export function lithiumSectionIIStatement(pi: string | null | undefined): string {
  const entry = LITHIUM_SECTION_II.find((item) => item.pi === pi);
  if (!entry) return "";
  return `Lithium ${entry.ion ? "ion" : "metal"} batteries in compliance with Section II of PI${entry.pi}`;
}

/** The box of each type on the Lithium Battery Safety Document (612 x 792 pt, from the top): the center of the square. */
export const LITHIUM_BOX_CENTER: Record<LithiumTypeCode, { x: number; y: number }> = {
  "965": { x: 66.8, y: 314 },
  "968": { x: 316.1, y: 313.4 },
  "966": { x: 67, y: 386.6 },
  "969": { x: 316.2, y: 385.2 },
  "967": { x: 68, y: 456.2 },
  "970": { x: 317, y: 454.6 },
  "965IB": { x: 67.8, y: 525.8 },
  "968IB": { x: 318, y: 526 },
};
