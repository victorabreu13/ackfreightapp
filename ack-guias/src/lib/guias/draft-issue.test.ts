import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { issueErrorInSpanish, IssueConflict } from "@/lib/awb/issue";
import { botPasswordMatches, GUIAS_BOT_EMAIL } from "@/lib/guias/bot-login";
import { draftPrintPage } from "@/lib/guias/draft-print-page";
import { reviewFieldsToSave } from "@/lib/guias/review";

test("an unchecked review list is saved empty", () => {
  assert.deepEqual(reviewFieldsToSave(""), []);
  assert.deepEqual(reviewFieldsToSave("client,pieces"), ["client", "pieces"]);
  assert.deepEqual(reviewFieldsToSave("client,not-a-field"), ["client"]);
});

test("a draft AWB or labels URL is a Spanish page", () => {
  const html = draftPrintPage("guia_123");
  assert.match(html, /Emite la guía primero/);
  assert.match(html, /href="\/guias\/guia_123"/);
  assert.doesNotMatch(html, /\{"error"/);
  assert.equal(draftPrintPage("bad id<script>").includes("<script>"), false);
});

test("the bot password matches only the secret for the bot email", () => {
  assert.equal(botPasswordMatches(GUIAS_BOT_EMAIL, "s3cret", "s3cret"), true);
  assert.equal(botPasswordMatches(GUIAS_BOT_EMAIL, "nope", "s3cret"), false);
  assert.equal(botPasswordMatches("andres.alvarado@ackfreight.com", "s3cret", "s3cret"), false);
  assert.equal(botPasswordMatches(GUIAS_BOT_EMAIL, "s3cret", undefined), false);
});

test("issue failures name the reason in Spanish", () => {
  assert.equal(issueErrorInSpanish(new IssueConflict("no_stock", "No stock left")), "No queda stock para ese prefijo.");
  assert.equal(issueErrorInSpanish(new IssueConflict("invalid", "Enter a valid mod-7 AWB")), "El número no es un AWB válido (mod-7).");
  assert.equal(issueErrorInSpanish(new IssueConflict("number_taken", "number already issued")), "Ese número ya fue emitido.");
  assert.equal(issueErrorInSpanish(new Error("boom")), "No se pudo emitir la guía.");
});

test("the draft guía page does not block Issue on review", () => {
  const page = readFileSync(new URL("../../app/(portal)/guias/[id]/page.tsx", import.meta.url), "utf8");
  const form = readFileSync(new URL("../../components/guia-form.tsx", import.meta.url), "utf8");
  assert.equal(page.includes("Issuing stays blocked"), false);
  assert.match(page, /Emite la guía primero/);
  assert.match(form, /Confirmar todo/);
});
