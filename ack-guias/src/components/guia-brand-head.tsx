"use client";

import { useEffect } from "react";
import { brandIconPath, brandTitle, type GuiaBrand } from "@/lib/guias/brand";

/** Keeps the tab title and favicon on the same company as the header. */
export function GuiaBrandHead({ brand }: { brand: GuiaBrand }) {
  useEffect(() => {
    document.title = brandTitle(brand);
    const href = brandIconPath(brand);
    const type = brand === "ack" ? "image/png" : "image/svg+xml";
    const links = document.querySelectorAll<HTMLLinkElement>("link[rel='icon']");
    if (links.length === 0) {
      const link = document.createElement("link");
      link.rel = "icon";
      link.href = href;
      link.type = type;
      document.head.appendChild(link);
      return;
    }
    for (const link of links) {
      link.href = href;
      link.type = type;
    }
  }, [brand]);
  return null;
}
