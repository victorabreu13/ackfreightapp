import type { GuiaFileKind } from "@/lib/guias/files";

/** The aircraft the cargo flies on. It decides which TSA letter goes with the guía. */
export const AIRCRAFT = ["pax", "cargo"] as const;
export type Aircraft = (typeof AIRCRAFT)[number];

export const AIRCRAFT_LABEL: Record<Aircraft, string> = { pax: "Pax", cargo: "Carguero" };

export function aircraftFrom(value: unknown): Aircraft | "" {
  const text = String(value ?? "").trim().toLowerCase();
  return (AIRCRAFT as readonly string[]).includes(text) ? (text as Aircraft) : "";
}

export type PackChoices = { aircraft?: string | null; screened?: boolean | null };

/**
 * The documents a guía carries, in the order they are shown and zipped: the guía, the TSA letter of its aircraft, the
 * lithium battery letter and the delivery order, plus the CCSF and the CCSP when the cargo goes screened. A guía that
 * has no aircraft picked yet shows both TSA letters, so none goes missing. The signed DGD and the invoices or
 * manifests are uploads, so they are not here.
 */
export function packKinds(choices: PackChoices): GuiaFileKind[] {
  const aircraft = aircraftFrom(choices.aircraft);
  const kinds: GuiaFileKind[] = ["awb"];
  if (aircraft !== "cargo") kinds.push("tsa");
  if (aircraft !== "pax") kinds.push("tsa-unknown");
  kinds.push("lithium", "delivery");
  if (choices.screened) kinds.push("ccsp", "ccsf-alternate");
  return kinds;
}

/** Kept in the system and in Drive, but not offered with the documents to download. */
export const STORED_KINDS: readonly GuiaFileKind[] = ["pickup"];

/** Downloaded only when someone asks for them, never with the documents. */
export const OPTIONAL_KINDS: readonly GuiaFileKind[] = ["checklist"];

/** The labels have their own section. */
export const LABEL_KINDS: readonly GuiaFileKind[] = ["labels", "folder-label"];

/** What issuing a guía saves to Drive: its documents, and the pickup order that is only kept. */
export function driveKinds(choices: PackChoices): GuiaFileKind[] {
  return [...packKinds(choices), ...STORED_KINDS];
}
