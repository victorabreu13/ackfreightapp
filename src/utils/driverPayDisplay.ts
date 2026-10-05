import { AwbPay, PublicPayOffer } from "../types";
import { toLocalDateString } from "./date";

export function money(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export function payHeadline(pay?: Pick<PublicPayOffer, "status" | "amount"> | null): {
  text: string;
  quoted: boolean;
} {
  if (pay && pay.status === "quoted" && typeof pay.amount === "number") {
    return { text: money(pay.amount), quoted: true };
  }
  return { text: "Pay set by dispatch", quoted: false };
}

export function routeSummary(
  miles: number | null | undefined,
  driveMinutes: number | null | undefined,
  approximate?: boolean
): string | null {
  if (typeof miles !== "number") return null;
  const mins = typeof driveMinutes === "number" ? ` · about ${driveMinutes} min` : "";
  return `${miles} mi${approximate ? " (approx.)" : ""}${mins}`;
}

export function tripPayTotal(pay: Pick<AwbPay, "amount" | "waitAmount" | "adjustment">): number {
  const base = typeof pay.amount === "number" ? pay.amount : 0;
  const wait = typeof pay.waitAmount === "number" ? pay.waitAmount : 0;
  const adj = pay.adjustment && typeof pay.adjustment.amount === "number" ? pay.adjustment.amount : 0;
  return Math.round((base + wait + adj) * 100) / 100;
}

export function mondayOf(ymd: string): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const weekday = date.getDay();
  const back = weekday === 0 ? 6 : weekday - 1;
  date.setDate(date.getDate() - back);
  return toLocalDateString(date);
}

export function addDays(ymd: string, days: number): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return toLocalDateString(date);
}

export type NavigationApp = "apple" | "google" | "waze";

export function navigationTargets(address: string): Record<NavigationApp, { appUrl: string; webUrl: string }> {
  const destination = encodeURIComponent(address);
  return {
    apple: {
      appUrl: `maps://?daddr=${destination}&dirflg=d`,
      webUrl: `http://maps.apple.com/?daddr=${destination}&dirflg=d`,
    },
    google: {
      appUrl: `comgooglemaps://?daddr=${destination}&directionsmode=driving`,
      webUrl: `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`,
    },
    waze: {
      appUrl: `waze://?q=${destination}&navigate=yes`,
      webUrl: `https://waze.com/ul?q=${destination}&navigate=yes`,
    },
  };
}
