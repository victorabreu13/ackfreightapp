/**
 * Some papers carry the name and the full address of a shipper or consignee and nothing else: no phone, fax, email or
 * contact person. Guía addresses are free text and often carry those details, on their own line or at the end of the
 * address line, so they are cut here.
 */

/** Words that start a contact person, and so cut the rest of the line. */
const CONTACT_PERSON = /(?:^|[\s.,;(])(?:contact|contacto|attn|attention|atención|atencion)\b/i;
/** Words that start a phone number or an email, and cut the line when a colon, a digit or an @ follows. */
const CONTACT_CHANNEL = /(?:^|[\s.,;(])(?:tel|tels|telf|telefono|teléfono|phone|fax|cel|celular|mobile|movil|móvil|whatsapp|email|e-mail|correo)\b\.?\s*(?::|[\d+(]|\S*@)/i;

function cutContact(line: string): string {
  let end = line.length;
  for (const pattern of [CONTACT_PERSON, CONTACT_CHANNEL]) {
    const match = pattern.exec(line);
    if (match) end = Math.min(end, match.index);
  }
  if (end === line.length) return line;
  return line.slice(0, end).replace(/[\s.,;:\-(]+$/, "").trim();
}

function isContactLine(line: string): boolean {
  if (/@/.test(line)) return true;
  // A line that is only a phone number.
  const digits = (line.match(/\d/g) ?? []).length;
  return /^[+()\d\s.\-/]+$/.test(line) && digits >= 10;
}

/** The address lines without contact details. A line that mixes the address and a contact keeps the address. */
export function cleanDgAddress(address: string | null | undefined): string {
  return (address ?? "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .map(cutContact)
    .filter((line) => line && !isContactLine(line))
    .join("\n");
}

/** The same cleaning under a name that fits the papers other than the DGD. */
export const addressOnly = cleanDgAddress;

/** A line such as "ACME CORP, 100 MAIN ST" keeps its text. Only the contact details of an address block are removed. */
export function dgParty(name: string | null | undefined, address: string | null | undefined): { name: string; address: string } {
  return { name: (name ?? "").replace(/\s+/g, " ").trim(), address: cleanDgAddress(address) };
}
