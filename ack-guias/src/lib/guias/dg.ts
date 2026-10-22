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

export function isLithiumPi(value: string | null | undefined): boolean {
  return LITHIUM_SECTION_II.some((entry) => entry.pi === value);
}

/** The air waybill statement for a Section II lithium battery shipment, or "" when there is none. */
export function lithiumSectionIIStatement(pi: string | null | undefined): string {
  const entry = LITHIUM_SECTION_II.find((item) => item.pi === pi);
  if (!entry) return "";
  return `Lithium ${entry.ion ? "ion" : "metal"} batteries in compliance with Section II of PI${entry.pi}`;
}
