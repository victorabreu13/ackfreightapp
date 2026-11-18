import assert from "node:assert/strict";
import test from "node:test";
import { airlineCode, formatRate, normalizeAirline, normalizeDestination, parseRate, rateMargin } from "@/lib/guias/airline-rates";

test("a destination is a three-letter airport code in upper case", () => {
  assert.equal(normalizeDestination(" gua "), "GUA");
  assert.equal(normalizeDestination("SJO"), "SJO");
  assert.equal(normalizeDestination("GU"), null);
  assert.equal(normalizeDestination("GUAT"), null);
  assert.equal(normalizeDestination("G1A"), null);
  assert.equal(normalizeDestination(""), null);
});

test("an airline name is trimmed and its spaces collapsed", () => {
  assert.equal(normalizeAirline("  LATAM   Cargo "), "LATAM Cargo");
});

test("a rate accepts a dollar sign and commas, empty clears it, and a bad one is refused", () => {
  assert.deepEqual(parseRate("1.55"), { ok: true, value: 1.55 });
  assert.deepEqual(parseRate(" $1,55 "), { ok: true, value: 1.55 });
  assert.deepEqual(parseRate("1,234.50"), { ok: true, value: 1234.5 });
  assert.deepEqual(parseRate("1,234"), { ok: true, value: 1234 });
  assert.deepEqual(parseRate("$3.10"), { ok: true, value: 3.1 });
  assert.deepEqual(parseRate(""), { ok: true, value: null });
  assert.deepEqual(parseRate("0"), { ok: true, value: 0 });
  assert.deepEqual(parseRate("-1"), { ok: false });
  assert.deepEqual(parseRate("abc"), { ok: false });
  assert.deepEqual(parseRate("1.23456"), { ok: true, value: 1.2346 });
});

test("the margin is sell less buy, and unknown until both are set", () => {
  assert.equal(rateMargin(1.55, 1.2), 0.35);
  assert.equal(rateMargin(1.1, 1.3), -0.2);
  assert.equal(rateMargin(1.55, null), null);
  assert.equal(rateMargin(null, 1.2), null);
});

test("a rate shows with cents", () => {
  assert.equal(formatRate(1.5), "1.50");
  assert.equal(formatRate(3.1), "3.10");
  assert.equal(formatRate(null), "");
});

test("an airline goes by its short code in upper case", () => {
  assert.equal(airlineCode(" latam "), "LATAM");
  assert.equal(airlineCode("avi"), "AVI");
});
