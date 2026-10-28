"use client";

import { removeOrphanDocuments } from "@/server/guia-document-actions";

/** For the documents of a guía that was deleted: removes them from Documentos and gives the AWB number back to stock. */
export function OrphanRemoveButton({ awb, count }: { awb: string; count: number }) {
  return (
    <form
      action={removeOrphanDocuments}
      onSubmit={(event) => {
        const ok = window.confirm(`¿Eliminar de Documentos los ${count} documentos de ${awb}?\n\nLa guía ya no existe. Si el número AWB está en el stock, vuelve a quedar disponible. No se puede deshacer. Las copias de Google Drive no se tocan.`);
        if (!ok) event.preventDefault();
      }}
    >
      <input type="hidden" name="awb" value={awb} />
      <button type="submit" className="rounded-md border border-input px-2 py-1 text-xs text-stuck hover:bg-secondary">
        Eliminar de Documentos
      </button>
    </form>
  );
}
