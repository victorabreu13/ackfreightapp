import { REVIEW_FIELDS, type ReviewField } from "@/lib/guias/extract";

/** Flags still checked on the form. An unchecked "Needs review" box is omitted, so the note stays gone. */
export function reviewFieldsToSave(submitted: string): ReviewField[] {
  const selected = new Set(
    submitted
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
  return REVIEW_FIELDS.filter((field) => selected.has(field));
}
