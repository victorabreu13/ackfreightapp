"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { DeleteUploadButton, type GuiaUploadRow } from "@/components/guia-uploads";
import { MAX_UPLOAD_BYTES } from "@/lib/guias/upload-rules";
import { uploadGuiaFiles } from "@/server/guia-upload-actions";

/**
 * A field of the guía's Documents for files that come from outside, such as the signed DGD or the invoices and
 * manifests. The files are saved with the field's name in front of them, so they are told apart wherever they are
 * listed, and they show here under the field.
 */
export function CategoryUpload({
  guiaId,
  category,
  title,
  missing,
  files,
  multiple = false,
  buttonLabel,
}: {
  guiaId: string;
  category: "dgd" | "invoice";
  title: string;
  /** What the field says while nothing is uploaded. */
  missing: string;
  files: GuiaUploadRow[];
  multiple?: boolean;
  buttonLabel: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, startTransition] = useTransition();
  const done = files.length > 0;

  function send(list: FileList | null) {
    const chosen = list ? [...list] : [];
    if (chosen.length === 0) return;
    for (const file of chosen) {
      if (file.size <= 0) return setError(`«${file.name}» está vacío.`);
      if (file.size > MAX_UPLOAD_BYTES) return setError(`«${file.name}» supera 20 MB.`);
    }
    setError(null);
    const data = new FormData();
    data.set("id", guiaId);
    data.set("category", category);
    for (const file of chosen) data.append("files", file);
    startTransition(() => {
      void uploadGuiaFiles(data);
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-input px-3 py-3 text-sm">
        <span>
          <span className="font-medium">{title}</span>
          <span className="ml-3 text-xs text-muted-foreground">{done ? `${files.length} ${files.length === 1 ? "archivo" : "archivos"}` : missing}</span>
        </span>
        <input
          ref={inputRef}
          type="file"
          multiple={multiple}
          className="hidden"
          onChange={(event) => {
            send(event.target.files);
            event.target.value = "";
          }}
        />
        <Button type="button" variant="outline" size="sm" disabled={submitting} onClick={() => inputRef.current?.click()}>
          {submitting ? "Subiendo…" : done ? "Subir otro" : buttonLabel}
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
