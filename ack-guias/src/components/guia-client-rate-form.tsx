"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveAgreedRate } from "@/server/guia-billing-actions";

export type GuiaClientOption = {
  id: string;
  name: string;
  ratePerKg: number | null;
};

export function GuiaClientRateForm({
  guiaId,
  clients,
  selectedId,
}: {
  guiaId: string;
  clients: GuiaClientOption[];
  selectedId: string | null;
}) {
  const initial = clients.find((row) => row.id === selectedId) ?? null;
  const [clientId, setClientId] = useState(initial?.id ?? "");
  const [rate, setRate] = useState(initial?.ratePerKg != null ? String(initial.ratePerKg) : "");

  return (
    <form action={saveAgreedRate} className="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] sm:items-end">
      <input type="hidden" name="id" value={guiaId} />
      <div className="space-y-1">
        <Label htmlFor={`client-${guiaId}`}>Cliente</Label>
        <select
          id={`client-${guiaId}`}
          name="guiaClientId"
          required
          className="field"
          value={clientId}
          onChange={(event) => {
            const nextId = event.target.value;
            setClientId(nextId);
            const next = clients.find((row) => row.id === nextId);
            setRate(next?.ratePerKg != null ? String(next.ratePerKg) : "");
          }}
        >
          <option value="">Elige un cliente</option>
          {clients.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`rate-${guiaId}`}>Tarifa acordada (USD/kg cobrable)</Label>
        <Input
          id={`rate-${guiaId}`}
          name="ratePerKg"
          inputMode="decimal"
          required
          value={rate}
          onChange={(event) => setRate(event.target.value)}
        />
      </div>
      <Button type="submit" variant="outline">
        Guardar
      </Button>
    </form>
  );
}
