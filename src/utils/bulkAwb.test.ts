import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { awbFromFileName, FileRow, parseSheet, placeFiles, slotFromFileName } from "./bulkAwb";

const f = (name: string) => ({ uri: "blob:" + name, name });
const make = (awbNumber: string): FileRow => ({ awbNumber, files: {} });

describe("bulk AWB: reading file names", () => {
  it("finds the AWB number in the usual spellings", () => {
    assert.equal(awbFromFileName("045-54066773.pdf"), "045-54066773");
    assert.equal(awbFromFileName("AWB 045-54066773 LOA.pdf"), "045-54066773");
    assert.equal(awbFromFileName("04554066773_DO.PDF"), "045-54066773");
    assert.equal(awbFromFileName("045 5406 6773.jpg"), "045-54066773");
    assert.equal(awbFromFileName("scan_045.5406.6773 (1).pdf"), "045-54066773");
    assert.equal(awbFromFileName("invoice.pdf"), null);
    assert.equal(awbFromFileName("123456.pdf"), null);
    // a longer digit run is not an AWB
    assert.equal(awbFromFileName("0455406677312345.pdf"), null);
  });

  it("tells which document a file is", () => {
    assert.equal(slotFromFileName("045-54066773.pdf"), "awb");
    assert.equal(slotFromFileName("045-54066773 AWB.pdf"), "awb");
    assert.equal(slotFromFileName("045-54066773 LOA.pdf"), "loa");
    assert.equal(slotFromFileName("Letter of Authorization 045-54066773.pdf"), "loa");
    assert.equal(slotFromFileName("045-54066773_DO.pdf"), "do");
    assert.equal(slotFromFileName("045-54066773 delivery order.pdf"), "do");
    assert.equal(slotFromFileName("045-54066773 Delivery Ticket.pdf"), "do");
    assert.equal(slotFromFileName("045-54066773 dock.pdf"), "awb");
  });
});

describe("bulk AWB: grouping files", () => {
  it("groups the files of one AWB and starts a row per AWB", () => {
    const { rows, left } = placeFiles(
      [],
      [f("045-54066773 AWB.pdf"), f("045-54066773 LOA.pdf"), f("045-54066773 DO.pdf"), f("176-11112222.pdf")],
      make
    );
    assert.equal(left.length, 0);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].awbNumber, "045-54066773");
    assert.ok(rows[0].files.awb && rows[0].files.loa && rows[0].files.do);
    assert.equal(rows[1].awbNumber, "176-11112222");
    assert.ok(rows[1].files.awb);
  });

  it("adds to an existing row, whatever the spelling, and keeps what was typed there", () => {
    const existing: FileRow[] = [{ awbNumber: "0455406 6773", files: {} }];
    const { rows } = placeFiles(existing, [f("045-54066773 LOA.pdf")], make);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].awbNumber, "0455406 6773");
    assert.ok(rows[0].files.loa);
    assert.deepEqual(existing[0].files, {}); // the input is not changed
  });

  it("returns the files it can't place, with the reason", () => {
    const { rows, left } = placeFiles(
      [],
      [f("045-54066773.pdf"), f("045-54066773 copy.pdf"), f("notes.pdf")],
      make
    );
    assert.equal(rows.length, 1);
    assert.equal(left.length, 2);
    assert.match(left[0].reason, /already has a AWB/);
    assert.match(left[1].reason, /No AWB number/);
  });
});

describe("bulk AWB: pasted list", () => {
  it("reads a sheet with a header, columns in any order", () => {
    const rows = parseSheet("KG\tAWB\tPieces\tType\tHazmat\tUN\n120.5\t045-54066773\t3\tPMC\tyes\tUN3481\n80\t176-11112222\t1\t\t\t");
    assert.deepEqual(rows, [
      { awbNumber: "045-54066773", qtyPieces: 3, kilograms: 120.5, type: "PMC", hazmat: true, unNumber: "UN3481" },
      { awbNumber: "176-11112222", qtyPieces: 1, kilograms: 80 },
    ]);
  });

  it("reads plain CSV rows without a header, in the order AWB, pieces, kg, type", () => {
    const rows = parseSheet("045-54066773, 3, 1,200.5, skid\n176-11112222; 2; 40; ake");
    assert.equal(rows[0].awbNumber, "045-54066773");
    assert.equal(rows[1].awbNumber, "176-11112222");
    assert.equal(rows[1].qtyPieces, 2);
    assert.equal(rows[1].kilograms, 40);
    assert.equal(rows[1].type, "AKE");
  });

  it("skips empty and non-AWB lines", () => {
    assert.deepEqual(parseSheet(""), []);
    assert.deepEqual(parseSheet("\n\nhello\n"), []);
  });
});
