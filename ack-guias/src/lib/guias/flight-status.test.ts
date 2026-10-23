import assert from "node:assert/strict";
import test from "node:test";
import { inWatchWindow } from "@/lib/guias/flight-check";
import {
  FLIGHT_STATUS_LABEL,
  fetchFlightStatus,
  flightDateIso,
  flightEmail,
  flightNumberKey,
  isFinalStatus,
  pickFlight,
  shouldNotify,
  statusFromAeroDataBox,
} from "@/lib/guias/flight-status";

test("the source's statuses are folded into the ones the client sees", () => {
  assert.equal(statusFromAeroDataBox("Expected"), "SCHEDULED");
  assert.equal(statusFromAeroDataBox("Boarding"), "SCHEDULED");
  assert.equal(statusFromAeroDataBox("Delayed"), "DELAYED");
  assert.equal(statusFromAeroDataBox("Departed"), "DEPARTED");
  assert.equal(statusFromAeroDataBox("EnRoute"), "DEPARTED");
  assert.equal(statusFromAeroDataBox("Arrived"), "ARRIVED");
  assert.equal(statusFromAeroDataBox("Canceled"), "CANCELED");
  assert.equal(statusFromAeroDataBox("Diverted"), "DIVERTED");
  assert.equal(statusFromAeroDataBox("Unknown"), "UNKNOWN");
  assert.equal(statusFromAeroDataBox(undefined), "UNKNOWN");
  assert.equal(FLIGHT_STATUS_LABEL.DEPARTED, "En ruta");
  assert.equal(isFinalStatus("ARRIVED"), true);
  assert.equal(isFinalStatus("DELAYED"), false);
});

test("flight dates and numbers are read from the way the guía form stores them", () => {
  assert.equal(flightDateIso("2026-10-21"), "2026-10-21");
  assert.equal(flightDateIso("Oct/21/26"), "2026-10-21");
  assert.equal(flightDateIso("Sep/3/2026"), "2026-09-03");
  assert.equal(flightDateIso("21 Oct 2026"), "2026-10-21");
  assert.equal(flightDateIso("soon"), null);
  assert.equal(flightDateIso(""), null);
  assert.equal(flightNumberKey("L7 1803"), "L71803");
  assert.equal(flightNumberKey("la-401"), "LA401");
});

test("a flight is watched from the day before to two days after it flies", () => {
  const now = new Date("2026-10-22T15:00:00.000Z");
  assert.equal(inWatchWindow("2026-10-23", now), true);
  assert.equal(inWatchWindow("2026-10-22", now), true);
  assert.equal(inWatchWindow("2026-10-20", now), true);
  assert.equal(inWatchWindow("2026-10-19", now), false);
  assert.equal(inWatchWindow("2026-10-24", now), false);
});

test("an email is worth sending for a real change, not for the first on-schedule sighting", () => {
  assert.equal(shouldNotify(null, "SCHEDULED"), false);
  assert.equal(shouldNotify(null, "DEPARTED"), true);
  assert.equal(shouldNotify("SCHEDULED", "DEPARTED"), true);
  assert.equal(shouldNotify("DEPARTED", "DEPARTED"), false);
  assert.equal(shouldNotify("DEPARTED", "UNKNOWN"), false);
  assert.equal(shouldNotify("SCHEDULED", "DELAYED"), true);
  assert.equal(shouldNotify("DEPARTED", "ARRIVED"), true);
});

test("the flight that leaves the guía's origin is the one picked", () => {
  const flights = [
    { status: "Expected", departure: { airport: { iata: "BOG" } } },
    { status: "Departed", departure: { airport: { iata: "MIA" } } },
  ];
  assert.equal(pickFlight(flights, "MIA")?.status, "Departed");
  assert.equal(pickFlight(flights, "JFK")?.status, "Expected");
  assert.equal(pickFlight([], "MIA"), null);
});

test("the lookup asks the source for the flight number and date and reads the answer", async () => {
  let requested = "";
  let key = "";
  const fake = async (url: string, init?: RequestInit) => {
    requested = url;
    key = String((init?.headers as Record<string, string>)["x-rapidapi-key"]);
    return new Response(
      JSON.stringify([
        {
          status: "Departed",
          departure: { airport: { iata: "MIA" }, scheduledTime: { local: "2026-10-22 08:00-04:00" }, revisedTime: { local: "2026-10-22 08:25-04:00" } },
          arrival: { airport: { iata: "BOG" }, scheduledTime: { local: "2026-10-22 11:00-05:00" } },
        },
      ]),
      { status: 200 },
    );
  };
  const result = await fetchFlightStatus({ flightNumber: "LA401", date: "2026-10-22", origin: "MIA", apiKey: "secret-key", fetchImpl: fake });
  assert.match(requested, /\/flights\/number\/LA401\/2026-10-22$/);
  assert.equal(key, "secret-key");
  assert.equal(result?.status, "DEPARTED");
  assert.equal(result?.detail.arrivalAirport, "BOG");
  assert.equal(result?.detail.revisedDeparture, "2026-10-22 08:25-04:00");
  const missing = await fetchFlightStatus({ flightNumber: "XX1", date: "2026-10-22", origin: "MIA", apiKey: "k", fetchImpl: async () => new Response(null, { status: 204 }) });
  assert.equal(missing, null);
  await assert.rejects(fetchFlightStatus({ flightNumber: "XX1", date: "2026-10-22", origin: "MIA", apiKey: "k", fetchImpl: async () => new Response("no", { status: 500 }) }));
});

test("the email tells the client the new status in Spanish and links to the portal", () => {
  const message = flightEmail({
    awb: "045-55219415",
    flightNumber: "LA401",
    route: "MIA - BOG",
    status: "DEPARTED",
    detail: { revisedDeparture: "2026-10-22 08:25-04:00", scheduledArrival: "2026-10-22 11:00-05:00" },
    portalUrl: "https://example.test/portal",
  });
  assert.equal(message.subject, "AWB 045-55219415: vuelo LA401 en ruta");
  assert.match(message.text, /cambió a: En ruta/);
  assert.match(message.text, /Salida: 2026-10-22 08:25/);
  assert.match(message.text, /https:\/\/example\.test\/portal/);
  assert.ok(!message.html.includes("<script"));
});
