"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { GuiaLookupInput } from "@/components/guia-lookup-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
        <h2 className="font-display text-2xl">Nuevo pickup request</h2>
        <p className="mt-1 text-sm text-muted-foreground">Al guardarlo se crea el borrador de la guía con estos datos. El pickup order sale desde esa guía.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="client">Cliente</Label>
          <GuiaLookupInput id="client" name="client" required type="client" value={client} onChange={setClient} onPick={(item) => setClient(item.name)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="destination">Destino (aeropuerto)</Label>
          <Input id="destination" name="destination" placeholder="GUA" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="shipper">Shipper (dónde se recoge)</Label>
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
          <Label htmlFor="shipperAddress">Dirección del pickup</Label>
          <textarea id="shipperAddress" name="shipperAddress" rows={3} value={shipperAddress} onChange={(event) => setShipperAddress(event.target.value)} className={AREA} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="consigneeAddress">Dirección del consignee</Label>
          <textarea id="consigneeAddress" name="consigneeAddress" rows={3} value={consigneeAddress} onChange={(event) => setConsigneeAddress(event.target.value)} className={AREA} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="contactName">Contacto en el pickup</Label>
          <Input id="contactName" name="contactName" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="contactPhone">Teléfono</Label>
            <Input id="contactPhone" name="contactPhone" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contactEmail">Correo</Label>
            <Input id="contactEmail" name="contactEmail" type="email" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:col-span-2">
          <div className="space-y-1.5">
            <Label htmlFor="pieces">Piezas</Label>
            <Input id="pieces" name="pieces" inputMode="numeric" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="weightKg">Kilos</Label>
            <Input id="weightKg" name="weightKg" inputMode="decimal" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pickupDate">Fecha del pickup</Label>
            <Input id="pickupDate" name="pickupDate" type="date" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="readyTime">Hora lista</Label>
            <Input id="readyTime" name="readyTime" type="time" />
          </div>
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="description">Descripción de la carga</Label>
          <textarea id="description" name="description" rows={2} className={AREA} />
        </div>
        <div className="grid gap-3 md:col-span-2 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="truckerName">Trucker</Label>
            <Input id="truckerName" name="truckerName" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="truckerPhone">Teléfono del trucker</Label>
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
          <h3 className="font-display text-xl">AWB de la guía (opcional)</h3>
          <p className="mt-1 text-xs text-muted-foreground">Al crear el borrador se le asigna este número del stock, y sus drafts, labels y Folder Label ya salen con él. Sin elegir nada, la guía queda sin número.</p>
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
      </div>
      <Button type="submit">Crear pickup y borrador de guía</Button>
    </form>
  );
}
