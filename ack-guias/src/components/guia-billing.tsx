import { GuiaClientRateForm, type GuiaClientOption } from "@/components/guia-client-rate-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { companyTitle } from "@/lib/guias/qbo";
import { createQboInvoice, markGuiaInvoiced } from "@/server/guia-billing-actions";

function money(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function isoDay(value: Date | null): string {
  if (!value) return "";
  return value.toISOString().slice(0, 10);
}

export function GuiaBilling({
  guiaId,
  agentKey,
  issued,
  pieces,
  chargeableKg,
  agreedRatePerKg,
  clientName,
  companyClients,
  selectedClientId,
  canEditRate,
  canInvoice,
  qboConnected,
  invoiceNumber,
  invoiceDate,
  invoiceAmount,
  qboInvoiceId,
  qboDocNumber,
}: {
  guiaId: string;
  agentKey: string;
  issued: boolean;
  pieces: number;
  chargeableKg: number;
  agreedRatePerKg: number | null;
  clientName: string | null;
  companyClients?: GuiaClientOption[];
  selectedClientId?: string | null;
  canEditRate: boolean;
  canInvoice: boolean;
  qboConnected: boolean;
  invoiceNumber: string | null;
  invoiceDate: Date | null;
  invoiceAmount: number | null;
  qboInvoiceId: string | null;
  qboDocNumber: string | null;
}) {
  const company = companyTitle(agentKey);
  const estimate = agreedRatePerKg != null && chargeableKg > 0 ? Math.round((chargeableKg * agreedRatePerKg + Number.EPSILON) * 100) / 100 : null;
  const qboDone = Boolean(qboInvoiceId && !qboInvoiceId.startsWith("pending:"));
  const qboPending = Boolean(qboInvoiceId?.startsWith("pending:"));

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div>
        <h2 className="font-display text-2xl">Factura {company}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          La tarifa acordada es de {company}. El importe es kilos cobrables por esa tarifa. La tarifa de la guía aérea no se usa.
        </p>
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Cliente</dt>
          <dd className="font-medium">{clientName || "Sin cliente guardado"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Kilos cobrables</dt>
          <dd className="font-medium">{chargeableKg || "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Tarifa acordada</dt>
          <dd className="font-medium">{agreedRatePerKg != null ? `${money(agreedRatePerKg)} / kg` : "Sin tarifa acordada"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Importe</dt>
          <dd className="font-medium">{estimate != null ? money(estimate) : "—"}</dd>
        </div>
      </dl>
      <p className="text-xs text-muted-foreground">{pieces} piezas</p>
      {canEditRate ? (
        companyClients && companyClients.length > 0 ? (
          <GuiaClientRateForm guiaId={guiaId} clients={companyClients} selectedId={selectedClientId ?? null} />
        ) : (
          <p className="text-sm text-muted-foreground">Guarda el cliente en la guía para crearlo en {company}.</p>
        )
      ) : null}
      {invoiceNumber ? (
        <p className="text-sm">
          Factura {invoiceNumber}
          {invoiceDate ? ` · ${isoDay(invoiceDate)}` : ""}
          {invoiceAmount != null ? ` · ${money(invoiceAmount)}` : ""}
        </p>
      ) : null}
      {qboDone ? <p className="text-sm">Factura en QuickBooks {qboDocNumber || qboInvoiceId}.</p> : null}
      {qboPending ? <p className="text-sm text-stuck">Ya se está creando la factura de esta guía en QuickBooks.</p> : null}
      {canInvoice && issued ? (
        <form action={markGuiaInvoiced} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input type="hidden" name="id" value={guiaId} />
          <div className="space-y-1">
            <Label htmlFor={`inv-${guiaId}`}>Número de factura</Label>
            <Input id={`inv-${guiaId}`} name="invoiceNumber" defaultValue={invoiceNumber ?? ""} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`date-${guiaId}`}>Fecha</Label>
            <Input id={`date-${guiaId}`} name="invoiceDate" type="date" defaultValue={isoDay(invoiceDate)} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`amt-${guiaId}`}>Monto USD</Label>
            <Input id={`amt-${guiaId}`} name="invoiceAmount" inputMode="decimal" defaultValue={invoiceAmount ?? estimate ?? ""} required />
          </div>
          <div className="flex items-end">
            <Button type="submit" variant="outline" className="w-full">
              Marcar como facturada
            </Button>
          </div>
        </form>
      ) : null}
      {canInvoice && !issued ? <p className="text-sm text-muted-foreground">Emite la guía antes de facturar.</p> : null}
      {canInvoice && issued && !qboDone && !qboPending ? (
        <form action={createQboInvoice}>
          <input type="hidden" name="id" value={guiaId} />
          <Button type="submit">Crear factura en QuickBooks</Button>
          {qboConnected ? null : <p className="mt-2 text-xs text-muted-foreground">QuickBooks de {company} no está conectado. El botón no crea la factura.</p>}
        </form>
      ) : null}
    </section>
  );
}
