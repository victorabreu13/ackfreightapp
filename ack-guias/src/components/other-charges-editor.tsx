"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MAX_OTHER_CHARGES, parseOtherCharges, serializeOtherCharges } from "@/lib/guias/other-charges";

type Row = { description: string; amount: string };

/** Description and value lines for the Other Charges box of the guía. The rows travel in one hidden field as JSON. */
export function OtherChargesEditor({ value, onChange }: { value: string; onChange?: (value: string) => void }) {
  const [rows, setRows] = useState<Row[]>(() => parseOtherCharges(value).map((charge) => ({ description: charge.description, amount: String(charge.amount) })));

  function change(next: Row[]) {
    setRows(next);
    onChange?.(serializeOtherCharges(next));
  }

  function edit(index: number, key: keyof Row, text: string) {
    change(rows.map((row, at) => (at === index ? { ...row, [key]: text } : row)));
  }

  const total = parseOtherCharges(serializeOtherCharges(rows)).reduce((sum, charge) => sum + charge.amount, 0);

  return (
    <div className="space-y-2">
      <input type="hidden" name="otherCharges" value={serializeOtherCharges(rows)} />
      {rows.map((row, index) => (
        <div key={index} className="flex items-center gap-2">
          <Input
            aria-label={`Other charge ${index + 1} description`}
            value={row.description}
            maxLength={60}
            onChange={(event) => edit(index, "description", event.target.value)}
            placeholder="DG Charge"
            className="flex-1"
          />
          <Input
            aria-label={`Other charge ${index + 1} value`}
            value={row.amount}
            inputMode="decimal"
            onChange={(event) => edit(index, "amount", event.target.value)}
            placeholder="150.00"
            className="w-28 text-right"
          />
          <Button type="button" variant="outline" size="sm" onClick={() => change(rows.filter((_, at) => at !== index))}>
            Remove
          </Button>
        </div>
      ))}
      <div className="flex items-center gap-3">
        <Button type="button" variant="outline" size="sm" disabled={rows.length >= MAX_OTHER_CHARGES} onClick={() => change([...rows, { description: "", amount: "" }])}>
          Add charge
        </Button>
        {rows.length ? <span className="text-xs text-muted-foreground">Total other charges: {total.toFixed(2)}</span> : null}
      </div>
    </div>
  );
}
