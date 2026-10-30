"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DriverFields } from "@/components/driver-fields";
import { GuiaLookupInput } from "@/components/guia-lookup-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { receiptTotals } from "@/lib/guias/wr";
import { EMPTY_RECEIPT_LINE, type ReceiptFormLine, type ReceiptFormValues } from "@/lib/guias/wr-form";
import { saveWarehouseReceipt } from "@/server/wr-actions";

const AREA = "block w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

function num(value: string): number | null {
  const parsed = Number(value.replace(",", "."));
  return value.trim() && Number.isFinite(parsed) ? parsed : null;
}

/** The warehouse receipt form: the header, the lines with their measures, and the totals the receipt will show. */
export function WarehouseReceiptForm({ initial, pickups }: { initial: ReceiptFormValues; pickups: Array<{ id: string; label: string; number: string }> }) {
  const [values, setValues] = useState(initial);
  const set = <K extends keyof ReceiptFormValues>(key: K, value: ReceiptFormValues[K]) => setValues((current) => ({ ...current, [key]: value }));
  const setLine = (index: number, key: keyof ReceiptFormLine, value: string) =>
    setValues((current) => ({ ...current, lines: current.lines.map((line, at) => (at === index ? { ...line, [key]: value } : line)) }));
  const totals = receiptTotals(
    values.lines.map((line) => ({ pieces: Math.max(0, Math.round(num(line.pieces) ?? 0)), length: num(line.length), width: num(line.width), height: num(line.height), weightKg: num(line.weightKg) })),
  );

  return (
    <form action={saveWarehouseReceipt} className="space-y-6">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      <section className="grid gap-4 rounded-lg border border-border bg-card p-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="pickupRequestId">Pickup request (opcional)</Label>
          <select
            id="pickupRequestId"
            name="pickupRequestId"
            value={values.pickupRequestId}
            onChange={(event) => {
              const chosen = pickups.find((pickup) => pickup.id === event.target.value);
              setValues((current) => ({ ...current, pickupRequestId: event.target.value, pickupNumber: chosen ? chosen.number : current.pickupNumber }));
            }}
            className="block h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Sin pickup</option>
            {pickups.map((pickup) => (
              <option key={pickup.id} value={pickup.id}>
                {pickup.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">Con un pickup, el receipt se liga a su borrador de guía y lo alimenta.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="client">Cliente</Label>
          <GuiaLookupInput id="client" name="client" type="client" value={values.client} onChange={(value) => set("client", value)} onPick={(item) => set("client", item.name)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="trackingNumber">Tracking / AWB</Label>
          <Input id="trackingNumber" name="trackingNumber" value={values.trackingNumber} onChange={(event) => set("trackingNumber", event.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="shipper">Shipper</Label>
          <GuiaLookupInput
            id="shipper"
            name="shipper"
            type="shipper"
            value={values.shipper}
            client={values.client}
            onChange={(value) => set("shipper", value)}
            onPick={(item) => setValues((current) => ({ ...current, shipper: item.name, shipperAddress: item.address || current.shipperAddress }))}
          />
          <textarea name="shipperAddress" rows={3} value={values.shipperAddress} onChange={(event) => set("shipperAddress", event.target.value)} className={AREA} placeholder="Dirección" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="consignee">Consignee</Label>
          <GuiaLookupInput
            id="consignee"
            name="consignee"
            type="consignee"
            value={values.consignee}
            client={values.client}
            onChange={(value) => set("consignee", value)}
            onPick={(item) => setValues((current) => ({ ...current, consignee: item.name, consigneeAddress: item.address || current.consigneeAddress }))}
          />
          <textarea name="consigneeAddress" rows={3} value={values.consigneeAddress} onChange={(event) => set("consigneeAddress", event.target.value)} className={AREA} placeholder="Dirección" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <DriverFields
            carrier={values.carrier}
            driver={values.driver}
            license={values.driverLicense}
            onChange={(next) => setValues((current) => ({ ...current, carrier: next.carrier, driver: next.driver, driverLicense: next.license }))}
          />
          {(
            [
              ["supplier", "Supplier"],
              ["invoiceNumber", "Invoice Number"],
              ["poNumber", "PO Number"],
              ["proNumber", "PRO Number"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="space-y-1.5">
              <Label htmlFor={key}>{label}</Label>
              <Input id={key} name={key} value={values[key]} onChange={(event) => set(key, event.target.value)} />
            </div>
          ))}
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="pickupNumber">Pick Up Number</Label>
            <Input
              id="pickupNumber"
              name="pickupNumber"
              value={values.pickupNumber}
              readOnly={Boolean(values.pickupRequestId)}
              onChange={(event) => set("pickupNumber", event.target.value)}
              className={values.pickupRequestId ? "bg-muted" : ""}
            />
            <p className="text-xs text-muted-foreground">
              {values.pickupRequestId ? "Lo da el pickup request (PU-0001, PU-0002…). No se escribe a mano." : "Se llena solo al elegir un pickup request. Sin pickup puedes escribir el número de otro sistema."}
            </p>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="warehouse">Warehouse</Label>
          <Input id="warehouse" name="warehouse" value={values.warehouse} onChange={(event) => set("warehouse", event.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="receivedBy">Received by</Label>
          <Input id="receivedBy" name="receivedBy" value={values.receivedBy} onChange={(event) => set("receivedBy", event.target.value)} placeholder="Tu nombre, si lo dejas vacío" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex items-center gap-2 pt-7 text-sm">
            <input type="checkbox" name="htPallet" value="1" checked={values.htPallet} onChange={(event) => set("htPallet", event.target.checked)} />
            HT Pallet
          </label>
          <div className="space-y-1.5">
            <Label htmlFor="palletType">Pallet type</Label>
            <Input id="palletType" name="palletType" value={values.palletType} onChange={(event) => set("palletType", event.target.value)} placeholder="HT WOOD PLT" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dangerousGood">Dangerous good</Label>
          <Input id="dangerousGood" name="dangerousGood" value={values.dangerousGood} onChange={(event) => set("dangerousGood", event.target.value)} placeholder="HAZMAT - UN 3481" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sealedDrum">Sealed drum</Label>
          <Input id="sealedDrum" name="sealedDrum" value={values.sealedDrum} onChange={(event) => set("sealedDrum", event.target.value)} />
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <h2 className="font-display text-2xl">Líneas</h2>
        <p className="text-xs text-muted-foreground">Una línea es una unidad de manejo, como un pallet: sus piezas, sus medidas en pulgadas y su peso en kg. El volumen y el peso volumétrico salen de las medidas.</p>
        <div className="space-y-3">
          {values.lines.map((line, index) => (
            <div key={index} className="grid gap-2 rounded-md border border-border p-3 md:grid-cols-6">
              <Input name="linePieces" aria-label="Piezas" placeholder="Pcs" inputMode="numeric" value={line.pieces} onChange={(event) => setLine(index, "pieces", event.target.value)} />
              <Input name="linePackage" aria-label="Package" placeholder="Package" value={line.packageType} onChange={(event) => setLine(index, "packageType", event.target.value)} />
              <Input name="lineLength" aria-label="Largo in" placeholder="Largo in" inputMode="decimal" value={line.length} onChange={(event) => setLine(index, "length", event.target.value)} />
              <Input name="lineWidth" aria-label="Ancho in" placeholder="Ancho in" inputMode="decimal" value={line.width} onChange={(event) => setLine(index, "width", event.target.value)} />
              <Input name="lineHeight" aria-label="Alto in" placeholder="Alto in" inputMode="decimal" value={line.height} onChange={(event) => setLine(index, "height", event.target.value)} />
              <Input name="lineWeight" aria-label="Peso kg" placeholder="Peso kg" inputMode="decimal" value={line.weightKg} onChange={(event) => setLine(index, "weightKg", event.target.value)} />
              <Input name="lineLocation" aria-label="Location" placeholder="Location" value={line.location} onChange={(event) => setLine(index, "location", event.target.value)} />
              <Input name="lineDescription" aria-label="Description" placeholder="Description" className="md:col-span-2" value={line.description} onChange={(event) => setLine(index, "description", event.target.value)} />
              <Input name="lineNotes" aria-label="Notes" placeholder="Notes" className="md:col-span-2" value={line.notes} onChange={(event) => setLine(index, "notes", event.target.value)} />
              <Input name="linePcTracking" aria-label="Pc. tracking no." placeholder="Pc. tracking no." value={line.pcTracking} onChange={(event) => setLine(index, "pcTracking", event.target.value)} />
              <div className="md:col-span-6">
                {values.lines.length > 1 ? (
                  <button type="button" className="text-xs text-stuck underline-offset-2 hover:underline" onClick={() => setValues((current) => ({ ...current, lines: current.lines.filter((_, at) => at !== index) }))}>
                    Quitar línea
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
        <Button type="button" variant="outline" onClick={() => setValues((current) => ({ ...current, lines: [...current.lines, { ...EMPTY_RECEIPT_LINE }] }))}>
          Agregar línea
        </Button>
        <p className="rounded-md bg-secondary px-3 py-2 text-sm">
          Total: {totals.pieces} pzas · {totals.weightKg.toFixed(2)} kg · {totals.volumeM3.toFixed(2)} m³ · {totals.volumeWeightKg.toFixed(2)} VKg · cobrable {totals.chargeableKg.toFixed(2)} kg
        </p>
      </section>

      <section className="space-y-1.5 rounded-lg border border-border bg-card p-4">
        <Label htmlFor="notes">Notas</Label>
        <textarea id="notes" name="notes" rows={3} value={values.notes} onChange={(event) => set("notes", event.target.value)} className={AREA} />
      </section>
      <Button type="submit">Guardar warehouse receipt</Button>
    </form>
  );
}
