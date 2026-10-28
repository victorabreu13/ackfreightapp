"use client";

import { useEffect, useRef, useState } from "react";
import { deleteGuia, setGuiaCompleted } from "@/server/guia-actions";

/**
 * "More options" of a row of the Guías screen. Each choice asks to be confirmed, and the screen then says what was
 * done. The menu is drawn at a fixed place under its button so the table's own scrolling does not cut it.
 */
export function GuiaRowMenu({ id, label, issued, canDelete }: { id: string; label: string; issued: boolean; canDelete: boolean }) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<{ top: number; right: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle() {
    if (!open && button.current) {
      const rect = button.current.getBoundingClientRect();
      setPlace({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
    setOpen((current) => !current);
  }

  const completeMessage = `¿Marcar la guía ${label} como completada?\n\nSale de la pantalla Guías. Sigue en Documentos.`;
  const deleteMessage = `¿Eliminar la guía ${label}?\n\nSe borra también de Documentos con todos sus documentos y el número AWB vuelve al stock.${issued ? "\nYa está emitida." : ""}\nNo se puede deshacer. Las copias que ya están en Google Drive no se tocan.`;

  return (
    <div className="inline-block text-left">
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
        className="rounded-md border border-input px-2 py-1 text-xs hover:bg-secondary"
      >
        More options ▾
      </button>
      {open && place ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div role="menu" style={{ top: place.top, right: place.right }} className="fixed z-50 w-48 rounded-md border border-border bg-card p-1 shadow-lg">
            <form
              action={setGuiaCompleted}
              onSubmit={(event) => {
                if (!window.confirm(completeMessage)) {
                  event.preventDefault();
                  setOpen(false);
                }
              }}
            >
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="done" value="1" />
              <input type="hidden" name="returnTo" value="/guias" />
              <button type="submit" role="menuitem" className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-secondary">
                Marcar completada
              </button>
            </form>
            {canDelete ? (
              <form
                action={deleteGuia}
                onSubmit={(event) => {
                  if (!window.confirm(deleteMessage)) {
                    event.preventDefault();
                    setOpen(false);
                  }
                }}
              >
                <input type="hidden" name="id" value={id} />
                <button type="submit" role="menuitem" className="block w-full rounded px-3 py-2 text-left text-sm text-stuck hover:bg-secondary">
                  Eliminar
                </button>
              </form>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
