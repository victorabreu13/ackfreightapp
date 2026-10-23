"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { DeleteUploadButton, type GuiaUploadRow } from "@/components/guia-uploads";
import { MAX_UPLOAD_BYTES } from "@/lib/guias/upload-rules";
import { uploadGuiaFiles } from "@/server/guia-upload-actions";

/** The DGD comes signed from the shipper, so it is not generated here: this row takes the signed file. */
export function DgdUpload({ guiaId, files }: { guiaId: string; files: GuiaUploadRow[] }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, startTransition] = useTransition();
  const done = files.length > 0;

  function send(list: FileList | null) {
    const file = list?.[0];
    if (!file) return;
    if (file.size <= 0) return setError("El archivo está vacío.");
    if (file.size > MAX_UPLOAD_BYTES) return setError("El archivo supera 20 MB.");
    setError(null);
    const data = new FormData();
    data.set("id", guiaId);
    data.set("dgd", "1");
    data.append("files", file);
    startTransition(() => {
      void uploadGuiaFiles(data);
    });
  }

  return (
    <div className="flex flex-col gap-1 sm:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-input px-3 py-3 text-sm">
        <span>
          <span className="font-medium">DGD firmado</span>
          <span className="ml-3 text-xs text-muted-foreground">{done ? "Subido" : "Falta: dos copias firmadas por el shipper"}</span>
        </span>
        <input ref={inputRef} type="file" className="hidden" onChange={(event) => { send(event.target.files); event.target.value = ""; }} />
        <Button type="button" variant="outline" size="sm" disabled={submitting} onClick={() => inputRef.current?.click()}>
          {submitting ? "Subiendo…" : done ? "Subir otro" : "Subir DGD firmado"}
        </Button>
      </div>
      {error ? <p className="px-1 text-xs text-stuck">{error}</p> : null}
      {files.map((file) => (
        <div key={file.id} className="flex flex-wrap items-center gap-3 px-1 text-xs text-muted-foreground">
          <span>{file.fileName}</span>
          {file.canDownload ? (
            <a className="underline-offset-2 hover:underline" href={`/api/guias/uploads/${file.id}`}>
              Descargar
            </a>
          ) : null}
          {file.driveUrl ? (
            <a className="underline-offset-2 hover:underline" href={file.driveUrl} target="_blank" rel="noreferrer">
              Ver en Drive
            </a>
          ) : null}
          {file.canDelete ? <DeleteUploadButton id={file.id} fileName={file.fileName} returnTo={`/guias/${guiaId}`} /> : null}
        </div>
      ))}
    </div>
  );
}
