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
