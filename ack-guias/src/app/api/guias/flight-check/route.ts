import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { checkFlights } from "@/lib/guias/flight-check";

export const dynamic = "force-dynamic";

function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Called on a schedule (Cloud Scheduler, every 30 minutes). It looks up the flights of the guías that are
 * about to fly or just flew, and emails the client when a status changes. The shared secret keeps it private.
 */
async function run(request: Request) {
  const expected = process.env.FLIGHT_CHECK_SECRET?.trim() ?? "";
  const given = request.headers.get("x-flight-check-secret") ?? "";
  if (!expected || !sameSecret(given, expected)) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  try {
    const summary = await checkFlights();
    return NextResponse.json(summary);
  } catch (error) {
    console.error("flight check", error);
    return NextResponse.json({ error: "The check failed." }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
