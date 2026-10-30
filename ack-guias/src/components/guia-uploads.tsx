"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { MAX_UPLOAD_BYTES, formatBytes } from "@/lib/guias/upload-rules";
import { deleteGuiaUpload, uploadGuiaFiles } from "@/server/guia-upload-actions";

export type GuiaUploadRow = {
  id: string;
  fileName: string;
  mime: string | null;
  size: number | null;
  uploadedBy: string;
  createdAt: string;
  status: string;
  error: string | null;
  driveUrl: string | null;
  canDownload: boolean;
  canDelete: boolean;
};

export function DeleteUploadButton({ id, fileName, returnTo }: { id: string; fileName: string; returnTo: string }) {
  return (
    <form
      action={deleteGuiaUpload}
      onSubmit={(event) => {
        const ok = window.confirm(`¿Eliminar «${fileName}»? Se quita de la guía y de Drive.`);
        if (!ok) event.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <button type="submit" className="text-stuck underline-offset-2 hover:underline">
        Eliminar
      </button>
    </form>
  );
}

export function GuiaUploads({
  guiaId,
  files,
  notice,
  error,
  readOnly = false,
}: {
  guiaId: string;
  files: GuiaUploadRow[];
  notice: string | null;
  error: string | null;
  readOnly?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [submitting, startTransition] = useTransition();

  function addFiles(list: FileList | File[] | null) {
    const incoming = list ? [...list] : [];
    if (!incoming.length) return;
    if (!list?.length) return;
    const next = [...pending];
    const problems: string[] = [];
    for (const file of incoming) {
      if (file.size > MAX_UPLOAD_BYTES) {
        problems.push(`«${file.name}» supera 20 MB.`);
        continue;
      }
      if (file.size <= 0) {
        problems.push(`«${file.name || "archivo"}» está vacío.`);
        continue;
      }
      const already = next.some((item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified);
      if (!already) next.push(file);
    }
    setPending(next);
    setLocalError(problems.length ? problems.join(" ") : null);
  }

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div>
        <h2 className="font-display text-2xl">Archivos / Upload</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {readOnly
            ? "Archivos de esta guía. Puedes descargarlos."
            : "El equipo puede subir PDF, imágenes, Excel u otros archivos. Varios a la vez. Se guardan en Drive bajo ACK Guías / cliente / AWB y quedan en esta guía y en Documentos."}
        </p>
      </div>
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
      {error ? <p className="rounded-md bg-[#fff1e4] px-3 py-2 text-sm text-stuck">{error}</p> : null}
      {localError ? <p className="rounded-md bg-[#fff1e4] px-3 py-2 text-sm text-stuck">{localError}</p> : null}
      {readOnly ? null : (
      <form
        data-upload-drop
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const dropped = [...(event.dataTransfer.files ?? [])];
          if (dropped.length === 0) {
            for (const item of event.dataTransfer.items ?? []) {
              if (item.kind !== "file") continue;
              const file = item.getAsFile();
              if (file) dropped.push(file);
            }
          }
          addFiles(dropped);
        }}
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (pending.length === 0) {
            setLocalError("Elige al menos un archivo.");
            return;
          }
          const data = new FormData();
          data.set("id", guiaId);
          for (const file of pending) data.append("files", file);
          startTransition(() => {
            void uploadGuiaFiles(data);
          });
        }}
      >
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            addFiles(event.dataTransfer.files);
          }}
          className={`rounded-md border border-dashed px-4 py-6 text-center ${dragging ? "border-primary bg-secondary" : "border-input bg-background"}`}
        >
          <p className="text-sm">Arrastra archivos aquí o elige varios.</p>
          <p className="mt-1 text-xs text-muted-foreground">Hasta 20 MB por archivo.</p>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="mx-auto mt-3 block max-w-full text-sm"
            onChange={(event) => {
              addFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </div>
        {pending.length ? (
          <ul className="space-y-1 text-sm">
            {pending.map((file) => (
              <li key={`${file.name}-${file.size}-${file.lastModified}`} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {file.name} <span className="text-muted-foreground">({formatBytes(file.size)})</span>
                </span>
                <button
                  type="button"
                  className="text-xs underline-offset-2 hover:underline"
                  onClick={() => setPending((current) => current.filter((item) => item !== file))}
                >
                  Quitar
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <Button type="submit" disabled={pending.length === 0 || submitting}>
          {submitting ? "Subiendo…" : "Subir archivos"}
        </Button>
      </form>
      )}
      {files.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay archivos en esta guía.</p>
      ) : (
        <ul className="space-y-3">
          {files.map((file) => (
            <li key={file.id} className="flex flex-col gap-1 border-t border-border pt-3 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate font-medium">{file.fileName}</p>
                <p className="text-xs text-muted-foreground">
                  {file.mime || "tipo desconocido"} · {formatBytes(file.size)} · {file.uploadedBy} · {file.createdAt}
                  {file.status === "FAILED" ? " · Falló" : ""}
                </p>
                {file.error ? <p className="text-xs text-stuck">{file.error}</p> : null}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {file.canDownload ? (
                  <a className="underline-offset-2 hover:underline" href={`/api/guias/uploads/${file.id}`}>
                    Descargar
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground">Sin archivo en Drive</span>
                )}
                {file.driveUrl ? (
                  <a className="underline-offset-2 hover:underline" href={file.driveUrl} target="_blank" rel="noreferrer">
                    Ver en Drive
                  </a>
                ) : null}
                {file.canDelete ? <DeleteUploadButton id={file.id} fileName={file.fileName} returnTo={`/guias/${guiaId}`} /> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
