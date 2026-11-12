import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { issueErrorMessage, IssueConflict } from "@/lib/awb/issue";
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
  assert.match(html, /Issue the guía first/);
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

test("issue failures name the reason", () => {
  assert.equal(issueErrorMessage(new IssueConflict("no_stock", "No stock left")), "There is no stock left for that prefix.");
  assert.equal(issueErrorMessage(new IssueConflict("invalid", "Enter a valid mod-7 AWB")), "The number is not a valid AWB (mod-7).");
  assert.equal(issueErrorMessage(new IssueConflict("number_taken", "number already issued")), "That number was already issued.");
  assert.equal(issueErrorMessage(new Error("boom")), "The guía could not be issued.");
});

test("the draft guía page does not block Issue on review", () => {
  const page = readFileSync(new URL("../../app/(portal)/guias/[id]/page.tsx", import.meta.url), "utf8");
  const form = readFileSync(new URL("../../components/guia-form.tsx", import.meta.url), "utf8");
  assert.equal(page.includes("Issuing stays blocked"), false);
  assert.match(page, /Issue the guía or use Print without issuing/);
  assert.match(form, /Confirm all/);
});
