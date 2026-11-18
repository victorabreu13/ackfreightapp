import assert from "node:assert/strict";
import test from "node:test";
import type { CompanyView } from "@/lib/guias/company-profile";
import { renderInvoicePdf, usDate } from "@/lib/guias/invoice-pdf";

const company = { agentKey: "ack", brandName: "ACK", letterheadName: "ACK TEAM LLC", logo: null } as unknown as CompanyView;

test("the invoice of the example renders as a PDF", async () => {
  const pdf = await renderInvoicePdf(
    {
      number: 2188,
      billToName: "PACIFIKO LLC",
      billToAddress: "8504 NW 70 ST\nDoral FL 33166",
      invoiceDate: "2026-11-04",
      dueDate: "2026-11-14",
      terms: "Due on receipt",
      lines: [
        { serviceDate: "2026-10-31", product: "PICKUP", description: "PACIFIKO LLC, 8504 NW 70 ST", qty: 1, rate: 75, amount: 75 },
        { serviceDate: "2026-11-04", product: "AIRFREIGHT", description: "MIA-GUA AWB 045-56631411", qty: 278.4, rate: 1.58, amount: 439.87 },
      ],
      total: 514.87,
    },
    company,
  );
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.ok(pdf.length > 1500);
});

test("a long invoice goes on to a second page", async () => {
  const lines = Array.from({ length: 40 }, (_, index) => ({ serviceDate: "2026-11-04", product: `LINE ${index + 1}`, description: "A description", qty: 1, rate: 10, amount: 10 }));
  const pdf = await renderInvoicePdf({ number: 3000, billToName: "X", billToAddress: "", invoiceDate: "2026-11-04", dueDate: "2026-11-14", terms: "Due on receipt", lines, total: 400 }, company);
  assert.ok((pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length >= 2);
});

test("dates print as month, day and year", () => {
  assert.equal(usDate("2026-11-04"), "11/04/2026");
  assert.equal(usDate(null), "");
});
