"use client";

import { useState } from "react";
import { GuiaLookupInput } from "@/components/guia-lookup-input";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { roundUpText } from "@/lib/guias/round-up";
import { saveHouse, saveNewHouse } from "@/server/house-actions";

export type HouseFormValues = {
  hawb: string;
  masterId: string;
  client: string;
  shipper: string;
  shipperAddress: string;
  consignee: string;
  consigneeAddress: string;
  notify: string;
  notifyAddress: string;
  origin: string;
  destination: string;
  pieces: string;
  grossKg: string;
  chargeableKg: string;
  rate: string;
  goods: string;
  handling: string;
};

export const EMPTY_HOUSE: HouseFormValues = {
  hawb: "",
  masterId: "",
  client: "",
  shipper: "",
  shipperAddress: "",
  consignee: "",
  consigneeAddress: "",
  notify: "",
  notifyAddress: "",
  origin: "",
  destination: "",
  pieces: "",
  grossKg: "",
  chargeableKg: "",
  rate: "",
  goods: "",
  handling: "",
};

const AREA = "block w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

/** The form of a house air waybill: its parties, its numbers, its goods, and the master it travels under. */
export function HouseForm({ id, initial, masters }: { id?: string; initial: HouseFormValues; masters: Array<{ id: string; label: string }> }) {
  const [values, setValues] = useState(initial);
  const set = <K extends keyof HouseFormValues>(key: K, value: HouseFormValues[K]) => setValues((current) => ({ ...current, [key]: value }));
  const rounded = (key: "pieces" | "grossKg" | "chargeableKg") => () => set(key, roundUpText(values[key]));

  return (
    <form action={id ? saveHouse : saveNewHouse} className="space-y-6">
      {id ? <input type="hidden" name="id" value={id} /> : null}
      <section className="grid gap-4 rounded-lg border border-border bg-card p-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="hawb">House number (HAWB)</Label>
          <Input id="hawb" name="hawb" value={values.hawb} onChange={(event) => set("hawb", event.target.value)} placeholder={id ? "" : "Assigned when you save"} className="font-mono" />
          <p className="text-xs text-muted-foreground">The next ACK number is assigned on its own. Type one only if it must be a different number.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="masterId">Master guía</Label>
          <select id="masterId" name="masterId" value={values.masterId} onChange={(event) => set("masterId", event.target.value)} className="block h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option value="">Not linked yet</option>
            {masters.map((master) => (
              <option key={master.id} value={master.id}>
                {master.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">The master this house travels under. Its flight, airports and airline print on the house.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="client">Client</Label>
          <GuiaLookupInput id="client" name="client" type="client" required value={values.client} onChange={(value) => set("client", value)} onPick={(item) => set("client", item.name)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rate">Rate printed on the house (per kg, optional)</Label>
          <Input id="rate" name="rate" inputMode="decimal" value={values.rate} onChange={(event) => set("rate", event.target.value)} />
        </div>
      </section>

      <section className="grid gap-4 rounded-lg border border-border bg-card p-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="shipper">Shipper</Label>
          <GuiaLookupInput
            id="shipper"
            name="shipper"
            type="shipper"
            client={values.client}
            value={values.shipper}
            onChange={(value) => set("shipper", value)}
            onPick={(item) => setValues((current) => ({ ...current, shipper: item.name, shipperAddress: item.address || current.shipperAddress }))}
          />
          <textarea name="shipperAddress" rows={3} value={values.shipperAddress} onChange={(event) => set("shipperAddress", event.target.value)} placeholder="Shipper address" className={AREA} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="consignee">Consignee</Label>
          <GuiaLookupInput
            id="consignee"
            name="consignee"
            type="consignee"
            client={values.client}
            value={values.consignee}
            onChange={(value) => set("consignee", value)}
            onPick={(item) => setValues((current) => ({ ...current, consignee: item.name, consigneeAddress: item.address || current.consigneeAddress }))}
          />
          <textarea name="consigneeAddress" rows={3} value={values.consigneeAddress} onChange={(event) => set("consigneeAddress", event.target.value)} placeholder="Consignee address" className={AREA} />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="notify">Notify (optional)</Label>
          <GuiaLookupInput
            id="notify"
            name="notify"
            type="notify"
            client={values.client}
            value={values.notify}
            onChange={(value) => set("notify", value)}
            onPick={(item) => setValues((current) => ({ ...current, notify: item.name, notifyAddress: item.address || current.notifyAddress }))}
          />
          <textarea name="notifyAddress" rows={2} value={values.notifyAddress} onChange={(event) => set("notifyAddress", event.target.value)} placeholder="Notify address" className={AREA} />
        </div>
      </section>

      <section className="grid gap-4 rounded-lg border border-border bg-card p-4 md:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="origin">Origin</Label>
          <Input id="origin" name="origin" value={values.origin} onChange={(event) => set("origin", event.target.value)} placeholder="From the master" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="destination">Destination</Label>
          <Input id="destination" name="destination" value={values.destination} onChange={(event) => set("destination", event.target.value)} placeholder="From the master" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pieces">Pieces</Label>
          <Input id="pieces" name="pieces" inputMode="numeric" value={values.pieces} onChange={(event) => set("pieces", event.target.value)} onBlur={rounded("pieces")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="grossKg">Gross kg</Label>
          <Input id="grossKg" name="grossKg" inputMode="decimal" value={values.grossKg} onChange={(event) => set("grossKg", event.target.value)} onBlur={rounded("grossKg")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="chargeableKg">Chargeable kg</Label>
          <Input id="chargeableKg" name="chargeableKg" inputMode="decimal" value={values.chargeableKg} onChange={(event) => set("chargeableKg", event.target.value)} onBlur={rounded("chargeableKg")} />
        </div>
        <div className="space-y-1.5 md:col-span-3">
          <Label htmlFor="goods">Goods description</Label>
          <textarea id="goods" name="goods" rows={3} value={values.goods} onChange={(event) => set("goods", event.target.value)} className={AREA} />
        </div>
        <div className="space-y-1.5 md:col-span-3">
          <Label htmlFor="handling">Special handling</Label>
          <textarea id="handling" name="handling" rows={2} value={values.handling} onChange={(event) => set("handling", event.target.value)} className={AREA} />
        </div>
      </section>

      <SubmitButton pendingLabel="Saving…">{id ? "Save house" : "Create house"}</SubmitButton>
    </form>
  );
}
