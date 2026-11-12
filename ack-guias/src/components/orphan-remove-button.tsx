"use client";

import { removeOrphanDocuments } from "@/server/guia-document-actions";

/** For the documents of a guía that was deleted: removes them from Documentos and gives the AWB number back to stock. */
export function OrphanRemoveButton({ awb, count }: { awb: string; count: number }) {
  return (
    <form
      action={removeOrphanDocuments}
      onSubmit={(event) => {
        const ok = window.confirm(`Delete the ${count} documents of ${awb} from Documents?\n\nThe guía no longer exists. If the AWB number is in stock, it becomes available again. This cannot be undone. Google Drive copies are not touched.`);
        if (!ok) event.preventDefault();
      }}
    >
      <input type="hidden" name="awb" value={awb} />
      <button type="submit" className="rounded-md border border-input px-2 py-1 text-xs text-stuck hover:bg-secondary">
        Delete from Documents
      </button>
    </form>
  );
}
