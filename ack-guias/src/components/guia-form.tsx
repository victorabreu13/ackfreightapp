"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { GuiaLookupInput, type LookupType } from "@/components/guia-lookup-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LITHIUM_SECTION_II, onlyLithiumUn } from "@/lib/guias/dg";
import type { GuiaValues } from "@/lib/guias/extract";
import { saveGuia, saveNewGuia } from "@/server/guia-actions";

const FIELDS: Array<{ key: keyof GuiaValues; label: string; area?: boolean; hint?: string }> = [
  { key: "client", label: "Client" },
  { key: "shipper", label: "Shipper" },
  { key: "shipperAddress", label: "Shipper address", area: true },
  { key: "consignee", label: "Consignee" },
  { key: "consigneeAddress", label: "Consignee address", area: true },
  { key: "notify", label: "Notify" },
  { key: "notifyAddress", label: "Notify address", area: true },
  { key: "origin", label: "Origin" },
  { key: "destination", label: "Destination" },
  { key: "flightNumber", label: "Flight" },
  { key: "flightDate", label: "Flight date" },
  { key: "pieces", label: "Pieces" },
  { key: "chargeableKg", label: "Chargeable kg" },
  {
    key: "rate",
    label: "Rate printed on the AWB (per kg, optional)",
    hint: "Prints in the Rate / Charge column and the total is rate x chargeable kg. It is not the rate billed to the client; that one is set under Clientes y tarifas.",
  },
  { key: "grossKg", label: "Gross kg (optional, not billed)" },
  { key: "goods", label: "Goods description", area: true },
  { key: "handling", label: "Special handling", area: true },
  {
    key: "aesItn",
    label: "AES ITN (optional)",
    hint: "Prints in Handling Information as AES ITN: …. Leave it blank to print NO EEI REQ 30.37(a). Goods and special handling are printed as entered.",
  },
  { key: "hawb", label: "HAWB (optional, on labels)" },
];

/** Fields that search the directory while typing. Shippers and consignees also fill their address. */
const LOOKUP: Partial<Record<keyof GuiaValues, { type: LookupType; addressKey?: keyof GuiaValues }>> = {
  client: { type: "client" },
  shipper: { type: "shipper", addressKey: "shipperAddress" },
  consignee: { type: "consignee", addressKey: "consigneeAddress" },
  notify: { type: "notify", addressKey: "notifyAddress" },
};

export function GuiaForm({
  mode,
  id,
  values,
  review,
  snippets,
  note,
  truckerName = "",
  truckerPhone = "",
  driverName = "",
  seal = "",
  awbOptions = [],
}: {
  mode: "new" | "edit";
  id?: string;
  values: GuiaValues;
  review: string[];
  snippets: Partial<Record<string, string>>;
  note?: string;
  truckerName?: string;
  truckerPhone?: string;
  driverName?: string;
  seal?: string;
  /** Airline prefixes with the numbers left in stock. Only the new guía form offers them. */
  awbOptions?: Array<{ prefix: string; airline: string; left: number }>;
}) {
  const [paste, setPaste] = useState("");
  const [draft, setDraft] = useState(values);
  const [flags, setFlags] = useState<string[]>(review);
  const [sources, setSources] = useState(snippets);
  const [banner, setBanner] = useState(note ?? "");
  const [busy, setBusy] = useState(false);
  const [extractError, setExtractError] = useState("");

  const reviewSet = useMemo(() => new Set(flags), [flags]);

  function update(key: keyof GuiaValues, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
    if (value.trim()) setFlags((current) => current.filter((field) => field !== key));
  }

  function clearFlag(key: string) {
    setFlags((current) => current.filter((field) => field !== key));
  }

  async function extract() {
    setBusy(true);
    setExtractError("");
    try {
      const response = await fetch("/api/guias/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: paste }),
      });
      const body = (await response.json()) as {
        error?: string;
        values?: GuiaValues;
        review?: string[];
        snippets?: Partial<Record<string, string>>;
        note?: string;
      };
      if (!response.ok || !body.values) {
        setExtractError(body.error || "Extract failed.");
        return;
      }
      setDraft(body.values);
      setFlags(body.review ?? []);
      setSources(body.snippets ?? {});
      setBanner(body.note || "Check every highlighted field. Nothing uncertain was kept.");
    } catch {
      setExtractError("Extract failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form action={mode === "new" ? saveNewGuia : saveGuia} className="space-y-6">
      {id ? <input type="hidden" name="id" value={id} /> : null}
      <input type="hidden" name="review" value={flags.join(",")} />
      <input type="hidden" name="snippetJson" value={JSON.stringify(sources)} />
      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <div>
          <h2 className="font-display text-2xl">Client instructions</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Paste the email or the instructions. Extract leaves unsure fields empty and marks them for review.
          </p>
        </div>
        <textarea
          value={paste}
          onChange={(event) => setPaste(event.target.value)}
          rows={8}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          placeholder="From: client@example.com"
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={extract} disabled={busy || !paste.trim()}>
            {busy ? "Extracting" : "Extract"}
          </Button>
          {extractError ? <p className="text-sm text-stuck">{extractError}</p> : null}
        </div>
        {banner ? <p className="text-sm text-muted-foreground">{banner}</p> : null}
      </section>
      {flags.length ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
          <p className="text-sm text-amber-900">Hay campos en revisión. No impiden emitir.</p>
          <Button type="button" variant="outline" onClick={() => setFlags([])}>
            Confirmar todo
          </Button>
        </div>
      ) : null}
      <section className="grid gap-4 md:grid-cols-2">
        {FIELDS.map((field) => {
          const flagged = reviewSet.has(field.key);
          return (
            <div key={field.key} className={field.area ? "md:col-span-2 space-y-1.5" : "space-y-1.5"}>
              <Label htmlFor={field.key}>{field.label}</Label>
              {field.area ? (
                <textarea
                  id={field.key}
                  name={field.key}
                  rows={3}
                  value={draft[field.key]}
                  onChange={(event) => update(field.key, event.target.value)}
                  className={`w-full rounded-md border bg-background px-3 py-2 text-sm ${flagged ? "border-amber-500 bg-amber-50" : "border-input"}`}
                />
              ) : LOOKUP[field.key] ? (
                <GuiaLookupInput
                  id={field.key}
                  name={field.key}
                  type={LOOKUP[field.key]!.type}
                  value={draft[field.key]}
                  client={draft.client}
                  onChange={(value) => update(field.key, value)}
                  onPick={(item) => {
                    update(field.key, item.name);
                    const addressKey = LOOKUP[field.key]?.addressKey;
                    if (addressKey && item.address) update(addressKey, item.address);
                  }}
                  className={flagged ? "border-amber-500 bg-amber-50" : ""}
                />
              ) : (
                <Input
                  id={field.key}
                  name={field.key}
                  value={draft[field.key]}
                  onChange={(event) => update(field.key, event.target.value)}
                  className={flagged ? "border-amber-500 bg-amber-50" : ""}
                />
              )}
              {flagged ? (
                <label className="flex items-center gap-2 text-xs text-amber-800">
                  <input
                    type="checkbox"
                    checked
                    onChange={(event) => {
                      if (!event.target.checked) clearFlag(field.key);
                    }}
                  />
                  Needs review
                </label>
              ) : null}
              {field.hint ? <p className="text-xs text-muted-foreground">{field.hint}</p> : null}
              {sources[field.key] ? <p className="text-xs text-muted-foreground">Source: {sources[field.key]}</p> : null}
            </div>
          );
        })}
        <div className="space-y-3 rounded-md border border-border p-3 md:col-span-2">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" name="dg" value="1" checked={draft.dg === "1"} onChange={(event) => update("dg", event.target.checked ? "1" : "")} />
            Lleva mercancía peligrosa declarable (DG)
          </label>
          {draft.dg === "1" ? (
            <div className="space-y-1.5">
              <Label htmlFor="unNumbers">UN</Label>
              <Input id="unNumbers" name="unNumbers" required value={draft.unNumbers} onChange={(event) => update("unNumbers", event.target.value)} placeholder="UN3481, UN1950" />
              <p className="text-xs text-muted-foreground">
                Prints in Handling Information: Dangerous Goods as per associated DGD. The DGD comes from the shipper. Several UN numbers can go in the same field.
              </p>
              {onlyLithiumUn(draft.unNumbers) ? (
                <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  Lithium batteries under Section II do not ship with a DGD. If these are Section II, uncheck DG and use the lithium Section II option below. Keep DG only for Section IA or IB.
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="lithiumPi">Baterías de litio Sección II (sin DGD)</Label>
            <select
              id="lithiumPi"
              name="lithiumPi"
              value={draft.lithiumPi}
              onChange={(event) => update("lithiumPi", event.target.value)}
              className="block h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">No</option>
              {LITHIUM_SECTION_II.map((entry) => (
                <option key={entry.pi} value={entry.pi}>
                  {entry.label}
                </option>
              ))}
            </select>
            {draft.lithiumPi ? (
              <p className="text-xs text-muted-foreground">
                No DGD. Prints in Handling Information: Lithium {LITHIUM_SECTION_II.find((entry) => entry.pi === draft.lithiumPi)?.ion ? "ion" : "metal"} batteries in compliance with Section II of PI{draft.lithiumPi}.
              </p>
            ) : null}
          </div>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" name="bup" value="1" checked={draft.bup === "1"} onChange={(event) => update("bup", event.target.checked ? "1" : "")} />
            BUP (unit load device)
          </label>
          {draft.bup === "1" ? <p className="text-xs text-muted-foreground">The shipment checklist will list the CCSF and the CCSP.</p> : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="issuingCompany">Issuing company</Label>
          <input type="hidden" name="issuingCompany" value="ack" />
          <p id="issuingCompany" className="flex h-9 items-center rounded-md border border-input bg-muted px-3 text-sm">
            ACK TEAM LLC
          </p>
        </div>
      </section>
      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="truckerName">Trucker</Label>
          <Input id="truckerName" name="truckerName" defaultValue={truckerName} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="truckerPhone">Trucker phone</Label>
          <Input id="truckerPhone" name="truckerPhone" defaultValue={truckerPhone} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="driverName">Driver name</Label>
          <Input id="driverName" name="driverName" defaultValue={driverName} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="seal">Seal (optional)</Label>
          <Input id="seal" name="seal" defaultValue={seal} />
        </div>
      </section>
      {mode === "new" ? (
        <section className="space-y-3 rounded-md border border-border p-3">
          <div>
            <h2 className="font-display text-2xl">Asignar AWB ahora (opcional)</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Reserva el número del stock al guardar. El borrador de la guía, los labels y el Folder Label ya salen con ese número, y al emitir se usa el mismo.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="assignPrefix">Airline prefix stock</Label>
              <select id="assignPrefix" name="assignPrefix" defaultValue="" className="block h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">No asignar todavía</option>
                {awbOptions.map((row) => (
                  <option key={row.prefix} value={row.prefix}>
                    {row.prefix} {row.airline} ({row.left} left)
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="assignAwb">O un número en stock</Label>
              <Input id="assignAwb" name="assignAwb" placeholder="123-12345675" className="font-mono" />
            </div>
          </div>
        </section>
      ) : null}
      <Button type="submit">{mode === "new" ? "Save draft" : "Save guía"}</Button>
    </form>
  );
}
