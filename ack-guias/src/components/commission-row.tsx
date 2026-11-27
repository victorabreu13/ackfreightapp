"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { totalsOf, type Lines } from "@/lib/guias/acct-engine";
import { commissionOf } from "@/lib/guias/acct-import";
import { parseAmount, RUBROS, type AmountKey } from "@/lib/guias/commission-edit";
import { createInvoiceForShipment, recalcShipmentAction, saveShipmentAmounts } from "@/server/acct-actions";

export type DetailShipment = Lines & {
  id: string;
  awb: string;
  kopeInCost: boolean;
  invoicedOverride: number | null;
  invoiceNo: string | null;
  note: string | null;
  /** Columns that were typed by hand. */
  manualFields: string | null;
};

export type DetailSplit = { id: string; payee: string; pct: number; paid: boolean; house: boolean };

const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

/**
 * One commission row that opens to show the numbers of its shipment, rubro by rubro, and lets accounting correct any of
 * them. The cells of the row come from the server; the editor sits in the row that opens under it.
 */
export function CommissionRow({ children, columns, shipment, splits, invoice }: { children: ReactNode; columns: number; shipment: DetailShipment; splits: DetailSplit[]; invoice: { number: number; status: string } | null }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr className={`border-b border-border last:border-0 ${open ? "bg-secondary/40" : ""}`}>
        <td className="px-1 py-2">
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-label={open ? `Close the detail of ${shipment.awb}` : `Open the detail of ${shipment.awb}`}
            title={open ? "Close the detail" : "Show the detail and correct the amounts"}
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary"
          >
            <span aria-hidden className={`inline-block transition-transform ${open ? "rotate-90" : ""}`}>
              ▸
            </span>
          </button>
        </td>
        {children}
      </tr>
      {open ? (
        <tr className="border-b border-border bg-secondary/20">
          <td colSpan={columns} className="px-3 py-4">
            <ShipmentEditor shipment={shipment} splits={splits} invoice={invoice} onDone={() => setOpen(false)} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function show(value: number): string {
  return String(value);
}

function ShipmentEditor({ shipment, splits, invoice, onDone }: { shipment: DetailShipment; splits: DetailSplit[]; invoice: { number: number; status: string } | null; onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [amounts, setAmounts] = useState<Partial<Record<AmountKey, string>>>(() => {
    const first: Partial<Record<AmountKey, string>> = {};
    for (const rubro of RUBROS) for (const key of [rubro.cost, rubro.sold]) if (key) first[key] = show(shipment[key]);
    return first;
  });
  const [kopeInCost, setKopeInCost] = useState(shipment.kopeInCost);
  const [invoiced, setInvoiced] = useState(shipment.invoicedOverride == null ? "" : show(shipment.invoicedOverride));
  const [invoiceNo, setInvoiceNo] = useState(shipment.invoiceNo ?? "");
  const [note, setNote] = useState(shipment.note ?? "");
  const [percentages, setPercentages] = useState<Record<string, string>>(() => Object.fromEntries(splits.map((split) => [split.id, String(split.pct)])));

  const manual = new Set((shipment.manualFields ?? "").split(",").map((item) => item.trim()));
  const lines = {} as Lines;
  let valid = true;
  for (const rubro of RUBROS) {
    for (const key of [rubro.cost, rubro.sold]) {
      if (!key) continue;
      const parsed = parseAmount(amounts[key]);
      if (parsed == null) valid = false;
      lines[key] = parsed ?? 0;
    }
  }
  const override = invoiced.trim() === "" ? null : parseAmount(invoiced);
  if (invoiced.trim() !== "" && override == null) valid = false;
  const totals = totalsOf(lines, kopeInCost, override);
  const sum = splits.reduce((total, split) => total + (Number(percentages[split.id]?.replace(/[%\s]/g, "")) || 0), 0);
  const anyPaid = splits.some((split) => split.paid && !split.house);

  function save() {
    setMessage(null);
    start(async () => {
      const result = await saveShipmentAmounts(shipment.id, {
        amounts,
        kopeInCost,
        invoicedOverride: invoiced,
        invoiceNo,
        note,
        splits: splits.map((split) => ({ id: split.id, pct: percentages[split.id] ?? String(split.pct) })),
      });
      if (!result.ok) {
        setMessage({ kind: "error", text: result.error });
        return;
      }
      setMessage({ kind: "ok", text: `Saved. The profit is ${money(result.profit)}.` });
      router.refresh();
      onDone();
    });
  }

  function recalc() {
    setMessage(null);
    start(async () => {
      const result = await recalcShipmentAction(shipment.id);
      if (!result.ok) {
        setMessage({ kind: "error", text: result.error });
        return;
      }
      setMessage({ kind: "ok", text: "Worked out again with the rules of the client." });
      router.refresh();
      onDone();
    });
  }

  function makeInvoice() {
    setMessage(null);
    start(async () => {
      const result = await createInvoiceForShipment(shipment.id);
      if (!result.ok) {
        setMessage({ kind: "error", text: result.error });
        return;
      }
      setMessage({ kind: "ok", text: `Draft invoice #${result.number} made. Review it in Invoices.` });
      router.refresh();
    });
  }

  const cell = "px-2 py-1";
  return (
    // This sits inside the form that marks commissions as paid: Enter in a field must never submit that form.
    <div
      className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]"
      onKeyDown={(event) => {
        if (event.key === "Enter" && (event.target as HTMLElement).tagName === "INPUT") {
          event.preventDefault();
          if (valid && sum <= 100.0001 && !pending) save();
        }
      }}
    >
      <div>
        <p className="mb-2 text-xs uppercase tracking-[0.12em] text-muted-foreground">Amounts of {shipment.awb}</p>
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
            <tr>
              <th className={`${cell} text-left font-normal`}>Rubro</th>
              <th className={`${cell} text-right font-normal`}>Cost (what ACK pays)</th>
              <th className={`${cell} text-right font-normal`}>Sold (what the client pays)</th>
              <th className={`${cell} text-right font-normal`}>Margin</th>
            </tr>
          </thead>
          <tbody>
            {RUBROS.map((rubro) => {
              const cost = rubro.cost ? lines[rubro.cost] : 0;
              const sold = rubro.sold ? lines[rubro.sold] : 0;
              return (
                <tr key={rubro.label} className="border-t border-border">
                  <td className={cell}>
                    {rubro.label}
                    {rubro.cost === "kopeHandling" ? (
                      <label className="ml-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <input type="checkbox" checked={kopeInCost} onChange={(event) => setKopeInCost(event.target.checked)} />
                        counts as cost
                      </label>
                    ) : null}
                  </td>
                  {([rubro.cost, rubro.sold] as const).map((key, index) => (
                    <td key={index} className={`${cell} text-right`}>
                      {key ? (
                        <Input
                          aria-label={`${rubro.label} ${index === 0 ? "cost" : "sold"}`}
                          value={amounts[key] ?? ""}
                          onChange={(event) => setAmounts({ ...amounts, [key]: event.target.value })}
                          inputMode="decimal"
                          className={`ml-auto h-8 w-28 text-right ${parseAmount(amounts[key]) == null ? "border-stuck" : ""}`}
                          title={manual.has(key) ? "Corrected by hand before" : undefined}
                        />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  ))}
                  <td className={`${cell} text-right text-muted-foreground`}>{rubro.cost && rubro.sold ? money(sold - cost) : ""}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t border-border font-medium">
            <tr>
              <td className={cell}>Total</td>
              <td className={`${cell} text-right`}>{money(totals.costTotal)}</td>
              <td className={`${cell} text-right`}>{money(totals.invoiced)}</td>
              <td className={`${cell} text-right ${totals.profit < 0 ? "text-stuck" : ""}`}>{money(totals.profit)}</td>
            </tr>
          </tfoot>
        </table>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-2">
            Invoice total typed by hand
            <Input aria-label="Invoice total" value={invoiced} onChange={(event) => setInvoiced(event.target.value)} inputMode="decimal" placeholder="the sum of Sold" className="h-8 w-36 text-right" />
          </label>
          <span className="text-xs text-muted-foreground">Leave it blank for the invoice to be the sum of what was sold.</span>
        </div>
      </div>

      <div className="space-y-4 text-sm">
        <div>
          <p className="mb-2 text-xs uppercase tracking-[0.12em] text-muted-foreground">Commission of each person</p>
          <table className="w-full">
            <tbody>
              {splits.map((split) => {
                const pct = Number(percentages[split.id]?.replace(/[%\s]/g, "")) || 0;
                return (
                  <tr key={split.id} className="border-t border-border first:border-0">
                    <td className={cell}>
                      {split.payee}
                      {split.house ? <span className="ml-1 text-xs text-muted-foreground">(house)</span> : split.paid ? <span className="ml-1 text-xs text-muted-foreground">(paid)</span> : null}
                    </td>
                    <td className={`${cell} text-right`}>
                      <span className="inline-flex items-center gap-1">
                        <Input aria-label={`${split.payee} percentage`} value={percentages[split.id] ?? ""} onChange={(event) => setPercentages({ ...percentages, [split.id]: event.target.value })} inputMode="decimal" className="h-8 w-20 text-right" />%
                      </span>
                    </td>
                    <td className={`${cell} text-right font-medium`}>{money(commissionOf(totals.profit, pct))}</td>
                  </tr>
                );
              })}
              {splits.length === 0 ? (
                <tr>
                  <td className={`${cell} text-muted-foreground`}>This shipment has no split.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
          {sum > 100.0001 ? <p className="mt-1 text-xs text-stuck">The percentages add up to {Math.round(sum * 100) / 100}%. They cannot be more than 100%.</p> : null}
          {anyPaid ? <p className="mt-1 text-xs text-muted-foreground">Someone on this shipment was already paid. If the profit changes, what they were paid no longer matches their commission.</p> : null}
        </div>
        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-[0.12em] text-muted-foreground">Invoice #</span>
          <Input aria-label="Invoice number" value={invoiceNo} onChange={(event) => setInvoiceNo(event.target.value)} maxLength={40} className="h-8" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-[0.12em] text-muted-foreground">Note</span>
          <textarea aria-label="Note" value={note} onChange={(event) => setNote(event.target.value)} rows={3} maxLength={4000} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
        </label>
        {invoice ? (
          <p className="rounded-md bg-secondary px-3 py-2 text-xs text-muted-foreground">
            Invoice #{invoice.number} ({invoice.status}) was made from this shipment. When the invoice is saved, its lines are copied here: each one to its rubro, and the charges that have none (DGD, inspection) to Other charges. So what the client is billed is what counts in the profit and the commissions. Correcting the amounts here does not change the invoice.
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3 lg:col-span-2">
        <Button type="button" size="sm" onClick={save} disabled={pending || !valid || sum > 100.0001}>
          {pending ? "Saving…" : "Save corrections"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        {!invoice ? (
          <>
            <Button type="button" size="sm" variant="outline" onClick={recalc} disabled={pending} title="Works the shipment out again with the rates, charges and split the client has now. What was typed by hand stays.">
              Recalculate with the client rules
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={makeInvoice} disabled={pending} title="Makes the draft invoice from the numbers of this shipment as they are now.">
              Create invoice
            </Button>
          </>
        ) : null}
        {message ? <span className={`text-sm ${message.kind === "error" ? "text-stuck" : "text-muted-foreground"}`}>{message.text}</span> : null}
      </div>
    </div>
  );
}
