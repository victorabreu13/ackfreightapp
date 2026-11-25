"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { GuiaLookupInput } from "@/components/guia-lookup-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PackageSelect } from "@/components/package-select";
import { TruckerInput } from "@/components/trucker-input";
import { roundUpText } from "@/lib/guias/round-up";
import { savePickupRequest, updatePickupRequest } from "@/server/pickup-actions";

const AREA = "block w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

/** What a saved pickup request fills the form with when it is corrected. Everything is text, as the form shows it. */
export type PickupFormValues = {
  id: string;
  client: string;
  destination: string;
  shipper: string;
  shipperAddress: string;
  consignee: string;
  consigneeAddress: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  pieces: string;
  packageType: string;
  weightKg: string;
  pickupDate: string;
  readyTime: string;
  description: string;
  truckerName: string;
  truckerPhone: string;
  driverName: string;
  notes: string;
};

/** The pickup request form. Saving a new one starts the draft AWB. With saved values it corrects that pickup request. */
export function PickupForm({
  awbOptions = [],
  truckers = [],
  initial,
}: {
  awbOptions?: Array<{ prefix: string; airline: string; left: number }>;
  truckers?: string[];
  initial?: PickupFormValues;
}) {
  const editing = Boolean(initial);
  const [client, setClient] = useState(initial?.client ?? "");
  const [shipper, setShipper] = useState(initial?.shipper ?? "");
  const [shipperAddress, setShipperAddress] = useState(initial?.shipperAddress ?? "");
  const [consignee, setConsignee] = useState(initial?.consignee ?? "");
  const [consigneeAddress, setConsigneeAddress] = useState(initial?.consigneeAddress ?? "");

  return (
    <form action={editing ? updatePickupRequest : savePickupRequest} className="space-y-4 rounded-lg border border-border bg-card p-4">
      {initial ? <input type="hidden" name="id" value={initial.id} /> : null}
      <div>
        <h2 className="font-display text-2xl">{editing ? "Edit pickup request" : "New pickup request"}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {editing
            ? "The pickup order of its AWB follows what you correct here, also when the AWB is already issued, except for fields the AWB already has its own value in. Pieces, kilos, destino and goods of an issued AWB are never changed from here."
            : "Saving it creates the AWB draft with this data. The pickup order comes from that AWB."}
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="client">Client</Label>
          {editing ? (
            <>
              <Input id="client" name="client" value={client} readOnly className="bg-muted" />
              <p className="text-xs text-muted-foreground">The client also decides how the AWB is billed, so it is changed in the AWB.</p>
            </>
          ) : (
            <GuiaLookupInput id="client" name="client" required type="client" value={client} onChange={setClient} onPick={(item) => setClient(item.name)} />
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="destination">Destino (aeropuerto)</Label>
          <Input id="destination" name="destination" placeholder="GUA" defaultValue={initial?.destination} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="shipper">Shipper (where it is picked up)</Label>
          <GuiaLookupInput
            id="shipper"
            name="shipper"
            required
            type="shipper"
            value={shipper}
            client={client}
            onChange={setShipper}
            onPick={(item) => {
              setShipper(item.name);
              if (item.address) setShipperAddress(item.address);
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="consignee">Consignee</Label>
          <GuiaLookupInput
            id="consignee"
            name="consignee"
            type="consignee"
            value={consignee}
            client={client}
            onChange={setConsignee}
            onPick={(item) => {
              setConsignee(item.name);
              if (item.address) setConsigneeAddress(item.address);
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="shipperAddress">Pickup address</Label>
          <textarea id="shipperAddress" name="shipperAddress" rows={3} value={shipperAddress} onChange={(event) => setShipperAddress(event.target.value)} className={AREA} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="consigneeAddress">Consignee address</Label>
          <textarea id="consigneeAddress" name="consigneeAddress" rows={3} value={consigneeAddress} onChange={(event) => setConsigneeAddress(event.target.value)} className={AREA} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="contactName">Pickup contact</Label>
          <Input id="contactName" name="contactName" defaultValue={initial?.contactName} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="contactPhone">Phone</Label>
            <Input id="contactPhone" name="contactPhone" defaultValue={initial?.contactPhone} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contactEmail">Email</Label>
            <Input id="contactEmail" name="contactEmail" type="email" defaultValue={initial?.contactEmail} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5 md:col-span-2">
          <div className="space-y-1.5">
            <Label htmlFor="pieces">Pieces</Label>
            <Input id="pieces" name="pieces" inputMode="numeric" defaultValue={initial?.pieces} />
          </div>
          <PackageSelect defaultValue={initial?.packageType} />
          <div className="space-y-1.5">
            <Label htmlFor="weightKg">Kilos</Label>
            <Input id="weightKg" name="weightKg" inputMode="decimal" defaultValue={initial?.weightKg} onBlur={(event) => (event.currentTarget.value = roundUpText(event.currentTarget.value))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pickupDate">Pickup date</Label>
            <Input id="pickupDate" name="pickupDate" type="date" defaultValue={initial?.pickupDate} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="readyTime">Ready time</Label>
            <Input id="readyTime" name="readyTime" type="time" defaultValue={initial?.readyTime} />
          </div>
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="description">Cargo description</Label>
          <textarea id="description" name="description" rows={2} defaultValue={initial?.description} className={AREA} />
        </div>
        <div className="grid gap-3 md:col-span-2 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="truckerName">Trucker</Label>
            <TruckerInput id="truckerName" name="truckerName" names={truckers} defaultValue={initial?.truckerName} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="truckerPhone">Trucker phone</Label>
            <Input id="truckerPhone" name="truckerPhone" defaultValue={initial?.truckerPhone} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="driverName">Chofer</Label>
            <Input id="driverName" name="driverName" defaultValue={initial?.driverName} />
          </div>
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="notes">Notas</Label>
          <textarea id="notes" name="notes" rows={2} defaultValue={initial?.notes} className={AREA} />
        </div>
      </div>
      {editing ? null : (
      <div className="space-y-3 rounded-md border border-border p-3">
        <div>
          <h3 className="font-display text-xl">AWB number (optional)</h3>
          <p className="mt-1 text-xs text-muted-foreground">When the draft is created this number from stock is assigned to it, and its drafts, labels and Folder Label already print with it. If you choose nothing, the AWB has no number.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="assignPrefix">Airline prefix stock</Label>
            <select id="assignPrefix" name="assignPrefix" defaultValue="" className="block h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">Do not assign yet</option>
              {awbOptions.map((row) => (
                <option key={row.prefix} value={row.prefix}>
                  {row.prefix} {row.airline} ({row.left} left)
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="assignAwb">Or a number in stock</Label>
            <Input id="assignAwb" name="assignAwb" placeholder="123-12345675" className="font-mono" />
          </div>
        </div>
      </div>
      )}
      <Button type="submit">{editing ? "Save pickup" : "Create pickup and AWB draft"}</Button>
    </form>
  );
}
