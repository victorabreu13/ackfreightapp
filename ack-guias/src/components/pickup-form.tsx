"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { GuiaLookupInput } from "@/components/guia-lookup-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PackageSelect } from "@/components/package-select";
import { roundUpText } from "@/lib/guias/round-up";
import { savePickupRequest } from "@/server/pickup-actions";

const AREA = "block w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

/** The pickup request form. Saving it starts the draft guía. */
export function PickupForm({ awbOptions = [] }: { awbOptions?: Array<{ prefix: string; airline: string; left: number }> }) {
  const [client, setClient] = useState("");
  const [shipper, setShipper] = useState("");
  const [shipperAddress, setShipperAddress] = useState("");
  const [consignee, setConsignee] = useState("");
  const [consigneeAddress, setConsigneeAddress] = useState("");

  return (
    <form action={savePickupRequest} className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div>
        <h2 className="font-display text-2xl">New pickup request</h2>
        <p className="mt-1 text-sm text-muted-foreground">Saving it creates the guía draft with this data. The pickup order comes from that guía.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="client">Client</Label>
          <GuiaLookupInput id="client" name="client" required type="client" value={client} onChange={setClient} onPick={(item) => setClient(item.name)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="destination">Destino (aeropuerto)</Label>
          <Input id="destination" name="destination" placeholder="GUA" />
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
          <Input id="contactName" name="contactName" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="contactPhone">Phone</Label>
            <Input id="contactPhone" name="contactPhone" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contactEmail">Email</Label>
            <Input id="contactEmail" name="contactEmail" type="email" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5 md:col-span-2">
          <div className="space-y-1.5">
            <Label htmlFor="pieces">Pieces</Label>
            <Input id="pieces" name="pieces" inputMode="numeric" />
          </div>
          <PackageSelect />
          <div className="space-y-1.5">
            <Label htmlFor="weightKg">Kilos</Label>
            <Input id="weightKg" name="weightKg" inputMode="decimal" onBlur={(event) => (event.currentTarget.value = roundUpText(event.currentTarget.value))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pickupDate">Pickup date</Label>
            <Input id="pickupDate" name="pickupDate" type="date" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="readyTime">Ready time</Label>
            <Input id="readyTime" name="readyTime" type="time" />
          </div>
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="description">Cargo description</Label>
          <textarea id="description" name="description" rows={2} className={AREA} />
        </div>
        <div className="grid gap-3 md:col-span-2 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="truckerName">Trucker</Label>
            <Input id="truckerName" name="truckerName" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="truckerPhone">Trucker phone</Label>
            <Input id="truckerPhone" name="truckerPhone" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="driverName">Chofer</Label>
            <Input id="driverName" name="driverName" />
          </div>
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="notes">Notas</Label>
          <textarea id="notes" name="notes" rows={2} className={AREA} />
        </div>
      </div>
      <div className="space-y-3 rounded-md border border-border p-3">
        <div>
          <h3 className="font-display text-xl">Guía AWB (optional)</h3>
          <p className="mt-1 text-xs text-muted-foreground">When the draft is created this number from stock is assigned to it, and its drafts, labels and Folder Label already print with it. If you choose nothing, the guía has no number.</p>
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
      <Button type="submit">Create pickup and guía draft</Button>
    </form>
  );
}
