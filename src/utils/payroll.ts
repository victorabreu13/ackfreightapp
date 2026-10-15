import type { DriverPayType, Trip } from "../types";
import { uldCountForTrip } from "./uld";

export function baseAmount(
  trips: Pick<Trip, "kilograms" | "uldCount" | "unitTypes">[],
  payType: DriverPayType | undefined,
  payRate: number | undefined
): number {
  if (!payType || !payRate) return 0;
  if (payType === "perTrip") return trips.length * payRate;
  if (payType === "perUld") return trips.reduce((sum, t) => sum + uldCountForTrip(t), 0) * payRate;
  return trips.reduce((sum, t) => sum + (t.kilograms || 0), 0) * payRate;
}

export interface DailyTopUp {
  date: string;
  earned: number; // what that day's trips came to
  topUp: number; // added to reach the daily minimum
  settled: boolean; // every trip that day is already paid
}

type PayTrip = Pick<Trip, "date" | "paid" | "kilograms" | "uldCount" | "unitTypes">;

/**
 * Owed / paid for a driver over a set of trips. With a daily minimum, any day
 * the driver worked (at least one trip) that earns less than the minimum is
 * topped up to it. The top-up counts as owed until every trip of that day is
 * marked paid, then as paid.
 */
export function payrollSummary(
  trips: PayTrip[],
  payType: DriverPayType | undefined,
  payRate: number | undefined,
  dailyMinPay: number | undefined
): { unpaid: number; paid: number; topUps: DailyTopUp[] } {
  let unpaid = baseAmount(trips.filter((t) => !t.paid), payType, payRate);
  let paid = baseAmount(trips.filter((t) => t.paid), payType, payRate);
  const topUps: DailyTopUp[] = [];
  if (dailyMinPay && dailyMinPay > 0) {
    const byDay = new Map<string, PayTrip[]>();
    for (const t of trips) {
      if (!byDay.has(t.date)) byDay.set(t.date, []);
      byDay.get(t.date)!.push(t);
    }
    for (const [date, dayTrips] of [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const earned = baseAmount(dayTrips, payType, payRate);
      if (earned >= dailyMinPay) continue;
      const topUp = Math.round((dailyMinPay - earned) * 100) / 100;
      const settled = dayTrips.every((t) => t.paid);
      if (settled) paid += topUp;
      else unpaid += topUp;
      topUps.push({ date, earned, topUp, settled });
    }
  }
  return { unpaid, paid, topUps };
}
