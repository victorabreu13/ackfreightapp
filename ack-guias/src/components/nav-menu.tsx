"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/** A header menu that opens a small list of links. It closes when a link is used, on Escape, or on a click outside. */
export function NavMenu({ label, links }: { label: string; links: Array<{ href: string; label: string }> }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const active = links.some((link) => pathname === link.href || pathname.startsWith(`${link.href}/`));

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={`flex items-center gap-1 rounded-md px-2.5 py-1 hover:bg-white/10 ${active ? "bg-white/10" : ""}`}
      >
        {label}
        <span aria-hidden className="text-[9px] opacity-70">
          ▾
        </span>
      </button>
      {open ? (
        <ul role="menu" className="absolute left-0 top-full z-30 mt-1 min-w-44 overflow-hidden rounded-md border border-white/15 bg-[#3f2a12] py-1 shadow-lg">
          {links.map((link) => (
            <li key={link.href} role="none">
              {link.href === "/guias/users" ? (
                <a role="menuitem" href={link.href} className="block px-3 py-1.5 hover:bg-white/10">
                  {link.label}
                </a>
              ) : (
                <Link role="menuitem" href={link.href} onClick={() => setOpen(false)} className="block px-3 py-1.5 hover:bg-white/10">
                  {link.label}
                </Link>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
