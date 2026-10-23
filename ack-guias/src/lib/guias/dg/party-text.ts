/**
 * The Shipper and Consignee fields of the DGD carry the name and the full address, and nothing else: no phone,
 * fax, email or contact person. Guía addresses are free text and often carry those lines, so they are dropped here.
 */
const CONTACT_WORD = /\b(tel|tels|telf|telefono|teléfono|phone|ph|fax|cel|celular|mobile|movil|móvil|email|e-mail|correo|contact|contacto|attn|attention|atención|atencion|whatsapp)\b\.?:?/i;

function isContactLine(line: string): boolean {
  if (/@/.test(line)) return true;
  if (CONTACT_WORD.test(line)) return true;
  // A line that is only a phone number.
  const digits = (line.match(/\d/g) ?? []).length;
  return /^[+()\d\s.\-/]+$/.test(line) && digits >= 10;
}

/** The address lines without contact details. A contact word inside a street name is not touched when it is part of a longer line of text. */
export function cleanDgAddress(address: string | null | undefined): string {
  return (address ?? "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line && !isContactLine(line))
    .join("\n");
}

/** A line such as "ACME CORP, 100 MAIN ST" keeps its text. Only the contact details of an address block are removed. */
export function dgParty(name: string | null | undefined, address: string | null | undefined): { name: string; address: string } {
  return { name: (name ?? "").replace(/\s+/g, " ").trim(), address: cleanDgAddress(address) };
}
