"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";

export type LookupType = "client" | "shipper" | "consignee" | "notify";

export type LookupPick = { name: string; address: string; clientName: string };

/**
 * A text field that suggests matches from the directory while the person types. Picking one fills the
 * field, and for shippers and consignees the address too. Typing something new is always allowed.
 */
export function GuiaLookupInput({
  id,
  name,
  type,
  value,
  onChange,
  onPick,
  client = "",
  className = "",
}: {
  id: string;
  name: string;
  type: LookupType;
  value: string;
  onChange: (value: string) => void;
  onPick: (item: LookupPick) => void;
  /** The client typed on the form. Its own shippers and consignees are suggested first. */
  client?: string;
  className?: string;
}) {
  const [items, setItems] = useState<LookupPick[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const request = useRef(0);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function search(text: string) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const mine = ++request.current;
      try {
        const params = new URLSearchParams({ type, q: text });
        if (client.trim()) params.set("client", client.trim());
        const response = await fetch(`/api/guias/lookup?${params.toString()}`);
        if (!response.ok) return;
        const body = (await response.json()) as { items?: LookupPick[] };
        if (mine !== request.current) return;
        setItems(body.items ?? []);
        setActive(-1);
      } catch {
        /* Suggestions are a convenience. Typing still works without them. */
      }
    }, 180);
  }

  function choose(item: LookupPick) {
    onPick(item);
    setOpen(false);
    setItems([]);
  }

  return (
    <div className="relative">
      <Input
        id={id}
        name={name}
        value={value}
        autoComplete="off"
        role="combobox"
        aria-expanded={open && items.length > 0}
        aria-controls={`${id}-suggestions`}
        className={className}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          search(event.target.value);
        }}
        onFocus={() => {
          setOpen(true);
          search(value);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(event) => {
          if (!open || items.length === 0) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive((current) => Math.min(items.length - 1, current + 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((current) => Math.max(0, current - 1));
          } else if (event.key === "Enter" && active >= 0) {
            event.preventDefault();
            choose(items[active]);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && items.length > 0 ? (
        <ul
          id={`${id}-suggestions`}
          role="listbox"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border border-border bg-card shadow-lg"
        >
          {items.map((item, index) => (
            <li
              key={`${item.name}-${item.clientName}-${index}`}
              role="option"
              aria-selected={index === active}
              onMouseDown={(event) => {
                event.preventDefault();
                choose(item);
              }}
              onMouseEnter={() => setActive(index)}
              className={`cursor-pointer px-3 py-2 text-sm ${index === active ? "bg-muted" : ""}`}
            >
              <div className="font-medium">{item.name}</div>
              {item.address || item.clientName ? (
                <div className="truncate text-xs text-muted-foreground">
                  {[item.clientName, item.address.split(/\r?\n/)[0]].filter(Boolean).join(" · ")}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
