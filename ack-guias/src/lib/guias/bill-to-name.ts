/**
 * Bill-to key for one company. "PACIFIKO, LLC" and "pacifiko llc" match.
 * LLC stays. The shipper is not a bill-to.
 */
export function normalizeBillToName(value: string | null | undefined): string {
  const folded = (value ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toUpperCase();
  return folded.replace(/[^A-Z0-9]+/g, " ").trim().replace(/ +/g, " ");
}
