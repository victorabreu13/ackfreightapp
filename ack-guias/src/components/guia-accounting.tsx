import Link from "next/link";
import { GuiaBilling } from "@/components/guia-billing";
import { GuiaUploads, type GuiaUploadRow } from "@/components/guia-uploads";
import { Button } from "@/components/ui/button";
import { companyTitle } from "@/lib/guias/qbo";

const LABELS: Record<string, string> = {
  awb: "Guía aérea (12 páginas)",
  delivery: "Orden de entrega",
  pickup: "Orden de recogida",
  tsa: "Carta TSA",
  "tsa-unknown": "Carta TSA embarcador desconocido",
  ccsp: "Certificado CCSF",
  "ccsf-alternate": "Certificación CCSP",
  lithium: "Carta de baterías de litio",
  labels: "Etiquetas",
};

export function GuiaAccountingView({
  id,
  awb,
  agentKey,
  status,
  clientName,
  origin,
  destination,
  pieces,
  chargeableKg,
  agreedRatePerKg,
  canInvoice,
  qboConnected,
  invoiceNumber,
  invoiceDate,
  invoiceAmount,
  qboInvoiceId,
  qboDocNumber,
  files,
  uploads,
  notice,
  error,
}: {
  id: string;
  awb: string;
  agentKey: string;
  status: string;
  clientName: string | null;
  origin: string;
  destination: string;
  pieces: number;
  chargeableKg: number;
  agreedRatePerKg: number | null;
  canInvoice: boolean;
  qboConnected: boolean;
  invoiceNumber: string | null;
  invoiceDate: Date | null;
  invoiceAmount: number | null;
  qboInvoiceId: string | null;
  qboDocNumber: string | null;
  files: string[];
  uploads: GuiaUploadRow[];
  notice: string | null;
  error: string | null;
}) {
  const issued = status === "issued";
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          <Link href="/guias">Guías {companyTitle(agentKey)}</Link>
        </p>
        <h1 className="font-display text-4xl">{awb || "Borrador"}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {issued ? "Emitida" : "Borrador"} · {origin || "—"} → {destination || "—"} · {clientName || "Sin cliente"}
        </p>
      </div>
      {error ? <p className="rounded-md bg-[#fff1e4] px-3 py-2 text-sm text-stuck">{error}</p> : null}
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
      <GuiaBilling
        guiaId={id}
        agentKey={agentKey}
        issued={issued}
        pieces={pieces}
        chargeableKg={chargeableKg}
        agreedRatePerKg={agreedRatePerKg}
        clientName={clientName}
        canEditRate={false}
        canInvoice={canInvoice}
        qboConnected={qboConnected}
        invoiceNumber={invoiceNumber}
        invoiceDate={invoiceDate}
        invoiceAmount={invoiceAmount}
        qboInvoiceId={qboInvoiceId}
        qboDocNumber={qboDocNumber}
      />
      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <h2 className="font-display text-2xl">Documentos</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {files.map((kind) => {
            const needsIssue = (kind === "awb" || kind === "labels") && !issued;
            const label = LABELS[kind] ?? kind;
            return needsIssue ? (
              <span key={kind} title="Emite la guía primero" className="inline-flex cursor-not-allowed">
                <Button type="button" disabled variant="outline" className="w-full justify-start">
                  {label}
                </Button>
              </span>
            ) : (
              <Button key={kind} asChild variant="outline" className="justify-start">
                <a href={`/api/guias/${id}/file?kind=${kind}`} target="_blank" rel="noreferrer">
                  {label}
                </a>
              </Button>
            );
          })}
        </div>
      </section>
      <GuiaUploads guiaId={id} files={uploads} notice={null} error={null} readOnly />
    </div>
  );
}
