/** A guía cannot be issued without a rate: the air freight is charged by it, on the AWB and on the invoice. */
export const NO_RATE_MESSAGE = "Add the rate before issuing the guía. It is in the guía form, next to the chargeable kilos.";

export function hasRate(lines: Array<{ rate?: number | null }>): boolean {
  return lines.some((line) => typeof line.rate === "number" && Number.isFinite(line.rate) && line.rate > 0);
}
