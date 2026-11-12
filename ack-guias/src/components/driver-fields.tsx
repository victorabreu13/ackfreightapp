"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Pick = { carrier: string; name: string; license: string; phone: string };

/**
 * The Carrier, Driver and Driver License of a receipt. Typing in Carrier or Driver suggests the drivers already saved,
 * and picking one fills the three. A new driver is saved with the receipt.
 */
export function DriverFields({
  carrier,
  driver,
  license,
  onChange,
}: {
  carrier: string;
  driver: string;
  license: string;
  onChange: (next: { carrier: string; driver: string; license: string }) => void;
}) {
  const [items, setItems] = useState<Pick[]>([]);
  const [open, setOpen] = useState<"carrier" | "driver" | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const request = useRef(0);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function search(text: string) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const mine = ++request.current;
      try {
        const response = await fetch(`/api/guias/drivers?q=${encodeURIComponent(text)}`);
        if (!response.ok) return;
        const body = (await response.json()) as { items?: Pick[] };
        if (mine === request.current) setItems(body.items ?? []);
      } catch {
        /* Suggestions are a convenience. Typing works without them. */
      }
    }, 180);
  }

  function suggestions(field: "carrier" | "driver") {
    if (open !== field || items.length === 0) return null;
    return (
      <ul role="listbox" className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-card shadow-lg">
        {items.map((item) => (
          <li
            key={`${item.carrier}-${item.name}`}
            role="option"
            aria-selected={false}
            className="cursor-pointer px-3 py-2 text-sm hover:bg-muted"
            onMouseDown={(event) => {
              event.preventDefault();
              onChange({ carrier: item.carrier, driver: item.name, license: item.license });
              setOpen(null);
              setItems([]);
            }}
          >
            <div className="font-medium">{item.name}</div>
            <div className="truncate text-xs text-muted-foreground">{[item.carrier, item.license].filter(Boolean).join(" · ")}</div>
          </li>
        ))}
      </ul>
    );
  }

  const field = (id: "carrier" | "driver", label: string, value: string) => (
    <div className="relative space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={id}
        value={value}
        autoComplete="off"
        onChange={(event) => {
          onChange({ carrier, driver, license, [id]: event.target.value });
          setOpen(id);
          search(event.target.value);
        }}
        onFocus={() => {
          setOpen(id);
          search(value);
        }}
        onBlur={() => setTimeout(() => setOpen((current) => (current === id ? null : current)), 120)}
      />
      {suggestions(id)}
    </div>
  );

  return (
    <>
      {field("carrier", "Carrier", carrier)}
      {field("driver", "Driver", driver)}
      <div className="space-y-1.5">
        <Label htmlFor="driverLicense">Driver License</Label>
        <Input id="driverLicense" name="driverLicense" value={license} onChange={(event) => onChange({ carrier, driver, license: event.target.value })} />
      </div>
    </>
  );
}
