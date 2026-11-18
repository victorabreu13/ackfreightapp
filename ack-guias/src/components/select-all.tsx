"use client";

/** A checkbox that ticks or clears every checkbox with a name inside a form. */
export function SelectAll({ formId, name }: { formId: string; name: string }) {
  return (
    <input
      type="checkbox"
      aria-label="Select all"
      onChange={(event) => {
        const form = document.getElementById(formId);
        form?.querySelectorAll<HTMLInputElement>(`input[type="checkbox"][name="${name}"]`).forEach((box) => {
          box.checked = event.target.checked;
        });
      }}
    />
  );
}
