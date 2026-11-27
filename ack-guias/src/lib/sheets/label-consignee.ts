/**
 * Andres (Oct 12): the consignee must ALWAYS be on the 4x6 labels, taken from the AWB draft the Kope
 * team sends for that AWB. Before 1012b the leg label read only an *issued* AirWaybillDocument or the
 * client's saved consignee party, so a shipment whose second leg was only drafted (pre-alert → AWB draft)
 * printed a blank CONSIGNEE box (e.g. 999-96759972 / 369-11444440).
 *
 * Order (first non-blank wins):
 *   1. issued AWB document for the label's AWB
 *   2. Kope AWB draft (status "draft") for the shipment — the pre-alert / team draft (newest first)
 *   3. Shipment.consignee — parsed from the Kope team's draft email/PDF (teamPrealert, setConsignee backfill)
 *   4. any other issued AWB document on the shipment
 *   5. the client's saved consignee party (AWB parties)
 *   6. master labels only: the client name (the inbound master's consignee, as before)
 * Nothing found → missing=true and the label prints "CONSIGNEE MISSING" (never a blank box).
 */
export const CONSIGNEE_MISSING = "CONSIGNEE MISSING";

export type ConsigneeDoc = { awb: string; status: string; consigneeName: string | null; createdAt?: Date | string | null };
export type LabelConsigneeInput = {
  which: "master" | "leg";
  labelAwb: string;
  docs: ConsigneeDoc[];
  shipmentConsignee?: string | null;
  partyConsignee?: string | null;
  clientName?: string | null;
};
export type LabelConsigneeSource = "issuedAwb" | "awbDraft" | "teamDraftEmail" | "otherIssuedAwb" | "clientParty" | "clientName" | "missing";
export type LabelConsignee = { name: string; source: LabelConsigneeSource; missing: boolean };

const clean = (value: string | null | undefined) => String(value ?? "").replace(/\s+/g, " ").trim();
const digits = (awb: string | null | undefined) => String(awb ?? "").replace(/\D/g, "");
const time = (d: ConsigneeDoc) => (d.createdAt ? new Date(d.createdAt).getTime() : 0);

export function resolveLabelConsignee(input: LabelConsigneeInput): LabelConsignee {
  const want = digits(input.labelAwb);
  const docs = [...input.docs].sort((a, b) => time(b) - time(a));
  const named = (d: ConsigneeDoc) => clean(d.consigneeName) !== "" && clean(d.consigneeName).toUpperCase() !== CONSIGNEE_MISSING;
  const pick = (d: ConsigneeDoc | undefined, source: LabelConsigneeSource): LabelConsignee | null =>
    d ? { name: clean(d.consigneeName), source, missing: false } : null;
  const hit =
    pick(docs.find((d) => d.status === "issued" && want && digits(d.awb) === want && named(d)), "issuedAwb") ??
    pick(docs.find((d) => d.status === "draft" && named(d) && (!digits(d.awb) || digits(d.awb) === want)), "awbDraft") ??
    (clean(input.shipmentConsignee) ? { name: clean(input.shipmentConsignee), source: "teamDraftEmail" as const, missing: false } : null) ??
    pick(docs.find((d) => d.status === "issued" && named(d)), "otherIssuedAwb") ??
    (clean(input.partyConsignee) ? { name: clean(input.partyConsignee), source: "clientParty" as const, missing: false } : null) ??
    (input.which === "master" && clean(input.clientName) ? { name: clean(input.clientName), source: "clientName" as const, missing: false } : null);
  return hit ?? { name: CONSIGNEE_MISSING, source: "missing", missing: true };
}

/**
 * Consignee from a Kope team AWB draft email or draft PDF text:
 *   "CONSIGNEE: COLOCAR CARGO LOGISTICS S.A.S."         (team pre-alert reply, team-draft.ts)
 *   "CNEE: GROUNDFLEX SAS"                              (desk replies)
 *   "Consignee's Name and Address\nCOLOCAR CARGO …"     (AWB face text, next non-label line)
 * Returns null when nothing usable (blank, "—", a URL, or another field label).
 */
export function parseDraftConsignee(text: string | null | undefined): string | null {
  const body = String(text ?? "").replace(/\r/g, "");
  if (!body.trim()) return null;
  const valid = (raw: string | undefined) => {
    const v = clean(raw).replace(/^[:\-–\s]+/, "").replace(/\s*(?:CONSIGNEE'?S? ACCOUNT.*)$/i, "").trim();
    if (!v || /^[-—–.]+$/.test(v) || /^https?:/i.test(v) || v.length < 2) return null;
    if (/^(notify|shipper|pieces|gross|chargeable|routing|number|issued by|account)\b/i.test(v)) return null;
    if (v.toUpperCase() === CONSIGNEE_MISSING) return null;
    return v.slice(0, 120);
  };
  const inline = body.match(/^[ \t>*]*(?:consignee|cnee)\b(?:\s*name)?[ \t]*[:=][ \t]*(.+)$/im);
  const fromInline = valid(inline?.[1]);
  if (fromInline) return fromInline;
  const lines = body.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    if (!/consignee'?s?\s+name\s+and\s+address/i.test(lines[i])) continue;
    // AWB face, pdftotext -layout only: the consignee box is the left column, cut at the header's next column.
    // Plain (non-layout) PDF text loses the box order, so it is not trusted here.
    const m = lines[i].match(/consignee'?s?\s+name\s+and\s+address(\s{2,})\S/i);
    if (!m || m.index === undefined) continue;
    const cut = m.index + m[0].length - 1;
    const label = (v: string) => /^(consignee'?s?\s+account|shipper|issued by|it is agreed|copies)/i.test(v);
    for (let j = i + 1; j < Math.min(lines.length, i + 5); j += 1) {
      const seg = lines[j].slice(0, cut).trim();
      if (!seg || label(seg)) continue;
      const v = valid(seg);
      if (v) return v;
    }
  }
  return null;
}
