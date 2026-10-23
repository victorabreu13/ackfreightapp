// Same text regardless of case, spaces, dashes or dots ("045-5406 6773" = "04554066773").
export function searchKey(text: string | undefined | null): string {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

type Field = string | number | undefined | null;

/**
 * Every word typed must be found in at least one of the fields. A word matches a
 * field as plain text, or ignoring case / spaces / dashes (so AWB numbers match
 * however they were typed). One word is checked against one field at a time, so
 * text never "matches" across the end of one field and the start of the next.
 */
export function matchesTokens(fields: Field[], query: string): boolean {
  const tokens = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return true;
  const lowered = fields.map((f) => String(f ?? "").toLowerCase());
  const keyed = fields.map((f) => searchKey(String(f ?? "")));
  return tokens.every((token) => {
    const tokenKey = searchKey(token);
    return lowered.some((text, i) => text.includes(token) || (tokenKey.length >= 2 && keyed[i].includes(tokenKey)));
  });
}
