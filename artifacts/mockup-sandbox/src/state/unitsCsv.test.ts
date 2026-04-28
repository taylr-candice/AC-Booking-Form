/**
 * Pin-down tests for the admin Units CSV bulk import layer.
 *
 * The parser is the critical piece: every CSV nicety the spec calls
 * out (quoted fields, embedded commas, doubled quotes, CRLF, BOM,
 * blank lines, trailing newline, header order tolerance) is asserted
 * here so a future change to the parser can't silently regress the
 * upload flow. The validator + apply step round-trips are also
 * covered end to end.
 */

import { describe, expect, it } from "vitest";

import type { AdminAgent, AdminUnit } from "./adminMockData";
import {
  applyUnitsImport,
  formatUnitsCsv,
  parseCsvText,
  parseUnitsImport,
  unitsCsvTemplate,
  UNITS_CSV_COLUMNS,
} from "./unitsCsv";

const AGENTS: AdminAgent[] = [
  {
    id: "ag-001",
    firstName: "Mia",
    lastName: "Tran",
    company: "Aspen Property",
    email: "mia@example.com",
    phone: "0400 000 001",
    unitIds: [],
  },
  {
    id: "ag-002",
    firstName: "Sam",
    lastName: "Lee",
    company: "Coogee Realty",
    email: "sam@example.com",
    phone: "0400 000 002",
    unitIds: [],
  },
];

const UNITS: AdminUnit[] = [
  {
    id: "u1",
    addressLine1: "G01 / 335 Aspen Village",
    addressLine2: "Lot 3 · Greenway ACT 2900",
    ac: { type: "ducted", systems: 1, additional: 1 },
    agentId: "ag-001",
    buildingId: "bldg-aspen",
  },
  {
    id: "u2",
    addressLine1: "12 / 88 Marine Parade",
    addressLine2: "Lot 12 · Coogee NSW 2034",
    ac: { type: "split", systems: 2, additional: 0 },
    agentId: "ag-002",
    buildingId: "bldg-marine",
  },
];

// ─── parseCsvText ──────────────────────────────────────────────────────────

describe("parseCsvText", () => {
  it("handles a plain header + data row", () => {
    expect(parseCsvText("a,b,c\n1,2,3\n")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("respects quoted fields with embedded commas", () => {
    expect(parseCsvText('a,b\n"hello, world",2\n')).toEqual([
      ["a", "b"],
      ["hello, world", "2"],
    ]);
  });

  it("treats doubled quotes inside a quoted field as a literal quote", () => {
    expect(parseCsvText('a\n"she said ""hi"""\n')).toEqual([
      ["a"],
      ['she said "hi"'],
    ]);
  });

  it("supports CRLF line endings", () => {
    expect(parseCsvText("a,b\r\n1,2\r\n3,4\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("strips a leading UTF-8 BOM", () => {
    expect(parseCsvText("\uFEFFa,b\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("skips blank lines anywhere in the file", () => {
    expect(parseCsvText("a,b\n\n1,2\n,\n3,4\n\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("handles a row with no trailing newline", () => {
    expect(parseCsvText("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("preserves embedded newlines inside a quoted field", () => {
    expect(parseCsvText('a,b\n"line1\nline2",2\n')).toEqual([
      ["a", "b"],
      ["line1\nline2", "2"],
    ]);
  });

  it("does not throw on a malformed CSV with an unterminated quote", () => {
    // The reader treats everything after the opening quote as the
    // field's contents until the input ends — that's a well-defined
    // (if lossy) outcome and is preferable to throwing on partly
    // edited CSVs the admin is still typing.
    expect(() => parseCsvText('a,b\n"hello,world\n')).not.toThrow();
    const grid = parseCsvText('a,b\n"hello,world\n');
    expect(grid[0]).toEqual(["a", "b"]);
    expect(grid).toHaveLength(2);
  });
});

// ─── formatUnitsCsv / template ────────────────────────────────────────────

describe("formatUnitsCsv", () => {
  it("emits the canonical header in the documented order", () => {
    const csv = formatUnitsCsv([]);
    expect(csv.split("\n")[0]).toBe(UNITS_CSV_COLUMNS.join(","));
  });

  it("quotes fields containing a comma", () => {
    const unit: AdminUnit = {
      id: "u9",
      addressLine1: "10, Example St",
      addressLine2: "Lot 9 · Suburb 2000",
      ac: { type: "split", systems: 1, additional: 0 },
      agentId: null,
    };
    const csv = formatUnitsCsv([unit]);
    expect(csv).toContain('"10, Example St"');
  });

  it("round-trips: parse(format(units)) yields identical update rows", () => {
    const csv = formatUnitsCsv(UNITS);
    const preview = parseUnitsImport(csv, UNITS, AGENTS);
    expect(preview.fatal).toBeUndefined();
    // Every exported unit should come back as "unchanged".
    expect(preview.counts.unchanged).toBe(UNITS.length);
    expect(preview.counts.error).toBe(0);
    expect(preview.counts.new).toBe(0);
  });
});

describe("unitsCsvTemplate", () => {
  it("parses cleanly with no errors", () => {
    const preview = parseUnitsImport(unitsCsvTemplate(), UNITS, AGENTS);
    expect(preview.fatal).toBeUndefined();
    expect(preview.counts.error).toBe(0);
    // The template has one new + one update example row.
    expect(preview.counts.new).toBe(1);
    expect(preview.counts.update + preview.counts.unchanged).toBe(1);
  });
});

// ─── parseUnitsImport ─────────────────────────────────────────────────────

describe("parseUnitsImport", () => {
  it("flags an empty input as fatal", () => {
    const preview = parseUnitsImport("   ", UNITS, AGENTS);
    expect(preview.fatal).toMatch(/empty/i);
    expect(preview.rows).toEqual([]);
  });

  it("flags a missing required column as fatal", () => {
    const preview = parseUnitsImport(
      "id,addressLine2,acType\n,Lot 1,split\n",
      UNITS,
      AGENTS,
    );
    expect(preview.fatal).toMatch(/addressLine1/);
  });

  it("tolerates header order and extra unknown columns", () => {
    const csv = [
      "addressLine1,acType,systems,additional,agentId,addressLine2,id,note",
      '"99 New Street",split,3,1,ag-002,"Lot 99 · Suburb 2000",,ignored',
    ].join("\n");
    const preview = parseUnitsImport(csv, UNITS, AGENTS);
    expect(preview.fatal).toBeUndefined();
    expect(preview.counts.new).toBe(1);
    expect(preview.rows[0].parsed).toMatchObject({
      addressLine1: "99 New Street",
      addressLine2: "Lot 99 · Suburb 2000",
      ac: { type: "split", systems: 3, additional: 1 },
      agentId: "ag-002",
    });
  });

  it("treats blank acType as unknown and blank counts as 0", () => {
    const csv = [
      "id,addressLine1,addressLine2,acType,systems,additional,agentId",
      ",10 New Lane,,,,,",
    ].join("\n");
    const preview = parseUnitsImport(csv, UNITS, AGENTS);
    expect(preview.counts.error).toBe(0);
    expect(preview.rows[0].parsed).toMatchObject({
      ac: { type: "unknown", systems: 0, additional: 0 },
      agentId: null,
    });
  });

  it("accepts AC type case-insensitively", () => {
    const csv = [
      "id,addressLine1,addressLine2,acType,systems,additional,agentId",
      ",10 Lane,,SPLIT,1,0,",
      ",11 Lane,,Ducted,2,0,",
    ].join("\n");
    const preview = parseUnitsImport(csv, UNITS, AGENTS);
    expect(preview.counts.error).toBe(0);
    expect(preview.rows[0].parsed?.ac.type).toBe("split");
    expect(preview.rows[1].parsed?.ac.type).toBe("ducted");
  });

  it("rejects unknown AC type with a human-readable error", () => {
    const csv = [
      "id,addressLine1,addressLine2,acType,systems,additional,agentId",
      ",10 Lane,,foo,1,0,",
    ].join("\n");
    const preview = parseUnitsImport(csv, UNITS, AGENTS);
    expect(preview.counts.error).toBe(1);
    expect(preview.rows[0].errors[0]).toMatch(/Unknown AC type "foo"/);
  });

  it("rejects negative or non-integer counts", () => {
    const csv = [
      "id,addressLine1,addressLine2,acType,systems,additional,agentId",
      ",10 Lane,,split,-1,0,",
      ",11 Lane,,split,abc,0,",
      ",12 Lane,,split,1.5,0,",
    ].join("\n");
    const preview = parseUnitsImport(csv, UNITS, AGENTS);
    expect(preview.counts.error).toBe(3);
    for (const row of preview.rows) {
      expect(row.errors[0]).toMatch(/non-negative whole number/);
    }
  });

  it("rejects an unknown agentId", () => {
    const csv = [
      "id,addressLine1,addressLine2,acType,systems,additional,agentId",
      ",10 Lane,,split,1,0,ag-does-not-exist",
    ].join("\n");
    const preview = parseUnitsImport(csv, UNITS, AGENTS);
    expect(preview.counts.error).toBe(1);
    expect(preview.rows[0].errors[0]).toMatch(/Unknown agentId/);
  });

  it("matches updates by id", () => {
    const csv = [
      "id,addressLine1,addressLine2,acType,systems,additional,agentId",
      "u1,G01 / 335 Aspen Village,Lot 3 · Greenway ACT 2900,split,2,0,ag-001",
    ].join("\n");
    const preview = parseUnitsImport(csv, UNITS, AGENTS);
    expect(preview.counts.update).toBe(1);
    const row = preview.rows[0];
    expect(row.before?.id).toBe("u1");
    expect(row.diff?.length).toBeGreaterThan(0);
    expect(row.diff?.find((d) => d.field === "acType")).toMatchObject({
      before: "ducted",
      after: "split",
    });
    expect(row.diff?.find((d) => d.field === "systems")).toMatchObject({
      before: "1",
      after: "2",
    });
  });

  it("falls back to address-based matching when id is blank", () => {
    const csv = [
      "id,addressLine1,addressLine2,acType,systems,additional,agentId",
      ",12 / 88 Marine Parade,Lot 12 · Coogee NSW 2034,split,3,0,ag-002",
    ].join("\n");
    const preview = parseUnitsImport(csv, UNITS, AGENTS);
    expect(preview.counts.update).toBe(1);
    expect(preview.rows[0].before?.id).toBe("u2");
  });

  it("rejects an id that does not match any existing unit", () => {
    const csv = [
      "id,addressLine1,addressLine2,acType,systems,additional,agentId",
      "u-bogus,New Address,Lot 1,split,1,0,",
    ].join("\n");
    const preview = parseUnitsImport(csv, UNITS, AGENTS);
    expect(preview.counts.error).toBe(1);
    expect(preview.rows[0].errors[0]).toMatch(/Unknown unit id/);
  });

  it("rejects a row with no addressLine1", () => {
    const csv = [
      "id,addressLine1,addressLine2,acType,systems,additional,agentId",
      ",,Lot 1,split,1,0,",
    ].join("\n");
    const preview = parseUnitsImport(csv, UNITS, AGENTS);
    expect(preview.counts.error).toBe(1);
    expect(preview.rows[0].errors[0]).toMatch(/Missing addressLine1/);
  });

  it("flags two new rows targeting the same address as duplicates", () => {
    const csv = [
      "id,addressLine1,addressLine2,acType,systems,additional,agentId",
      ",100 Lane,Lot 1,split,1,0,",
      ",100 Lane,Lot 1,split,2,0,",
    ].join("\n");
    const preview = parseUnitsImport(csv, UNITS, AGENTS);
    expect(preview.counts.error).toBe(1);
    expect(preview.rows[1].errors[0]).toMatch(/Duplicate row/);
  });

  it("identifies an exact-match row as unchanged", () => {
    const csv = [
      "id,addressLine1,addressLine2,acType,systems,additional,agentId",
      "u1,G01 / 335 Aspen Village,Lot 3 · Greenway ACT 2900,ducted,1,1,ag-001",
    ].join("\n");
    const preview = parseUnitsImport(csv, UNITS, AGENTS);
    expect(preview.counts.unchanged).toBe(1);
    expect(preview.counts.update).toBe(0);
  });
});

// ─── applyUnitsImport ─────────────────────────────────────────────────────

describe("applyUnitsImport", () => {
  it("applies updates in place and appends new rows with generated ids", () => {
    const csv = [
      "id,addressLine1,addressLine2,acType,systems,additional,agentId",
      "u1,G01 / 335 Aspen Village,Lot 3 · Greenway ACT 2900,split,3,2,ag-001",
      ",99 Brand New Lane,Lot 99,split,1,0,",
    ].join("\n");
    const preview = parseUnitsImport(csv, UNITS, AGENTS);
    let n = 0;
    const next = applyUnitsImport(UNITS, preview, () => `u-test-${++n}`);

    expect(next).toHaveLength(UNITS.length + 1);
    const updated = next.find((u) => u.id === "u1");
    expect(updated?.ac).toEqual({ type: "split", systems: 3, additional: 2 });
    const created = next.find((u) => u.addressLine1 === "99 Brand New Lane");
    expect(created?.id).toBe("u-test-1");
  });

  it("skips error and unchanged rows", () => {
    const csv = [
      "id,addressLine1,addressLine2,acType,systems,additional,agentId",
      // unchanged
      "u1,G01 / 335 Aspen Village,Lot 3 · Greenway ACT 2900,ducted,1,1,ag-001",
      // error: bad ac type
      ",30 Bad Lane,,foo,1,0,",
    ].join("\n");
    const preview = parseUnitsImport(csv, UNITS, AGENTS);
    const next = applyUnitsImport(UNITS, preview, () => "u-new");
    expect(next).toEqual(UNITS);
  });

  it("does not mutate the input units array", () => {
    const csv = [
      "id,addressLine1,addressLine2,acType,systems,additional,agentId",
      "u1,G01 / 335 Aspen Village,Lot 3 · Greenway ACT 2900,split,3,2,ag-001",
      ",99 Brand New Lane,Lot 99,split,1,0,",
    ].join("\n");
    const preview = parseUnitsImport(csv, UNITS, AGENTS);
    const originalSnapshot = JSON.parse(JSON.stringify(UNITS));
    const next = applyUnitsImport(UNITS, preview, () => "u-new");
    expect(next).not.toBe(UNITS);
    // The original array reference and contents are unchanged.
    expect(UNITS).toEqual(originalSnapshot);
  });

  it("does not collide ids when the generator returns the same value twice", () => {
    const csv = [
      "id,addressLine1,addressLine2,acType,systems,additional,agentId",
      ",A New 1,Lot 1,split,1,0,",
      ",A New 2,Lot 2,split,1,0,",
    ].join("\n");
    const preview = parseUnitsImport(csv, UNITS, AGENTS);
    const next = applyUnitsImport(UNITS, preview, () => "u-dup");
    const newOnes = next.filter((u) => u.addressLine1.startsWith("A New"));
    expect(newOnes).toHaveLength(2);
    expect(new Set(newOnes.map((u) => u.id)).size).toBe(2);
  });
});
