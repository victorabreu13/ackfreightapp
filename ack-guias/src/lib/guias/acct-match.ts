import { normalizeBillToName } from "@/lib/guias/bill-to-name";

/** The accounting client (Clients & team) that goes with a client of the AWBs, by the link it already has or by its name. */

export type AcctCandidate = { id: string; name: string; guiaClientId: string | null };

/**
 * The accounting client of a client of the AWBs. One already linked to it comes first. Otherwise one that is not linked yet
 * and has the same name ("PACIFIKO, LLC" and "pacifiko llc"), or whose name is the first words of it ("PACIFIKO" for
 * "PACIFIKO LLC"). Null when there is none, and then one is made.
 */
export function matchAcctClient(candidates: AcctCandidate[], guia: { id: string; name: string }): AcctCandidate | null {
  const linked = candidates.find((candidate) => candidate.guiaClientId === guia.id);
  if (linked) return linked;
  const wanted = normalizeBillToName(guia.name);
  if (!wanted) return null;
  const free = candidates.filter((candidate) => !candidate.guiaClientId);
  return (
    free.find((candidate) => normalizeBillToName(candidate.name) === wanted) ??
    free.find((candidate) => {
      const key = normalizeBillToName(candidate.name);
      return key.length >= 3 && wanted.startsWith(`${key} `);
    }) ??
    null
  );
}

/** The name a new accounting client takes: the name of the client, in capitals, the way the others are. */
export function acctNameFor(name: string): string {
  return name.replace(/\s+/g, " ").trim().toUpperCase();
}
