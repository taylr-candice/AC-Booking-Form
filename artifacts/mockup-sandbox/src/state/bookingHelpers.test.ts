/**
 * Coverage for the AC catalog accessors and the discrepancy comparator
 * that powers Step 4's two-intent "Something not right?" affordance.
 *
 * - `getAcRecord` returns the record on file for a unit, or `null` when
 *   either (a) the unit isn't in the catalog or (b) the unit is in the
 *   catalog but tagged "unknown" (no records). The Step 4 page uses
 *   that null to skip the records-aware seeding/affordance entirely.
 *
 * - `computeAcDiscrepancy` is a pure comparator — `null` means "the
 *   customer's selection matches what we have on record exactly", any
 *   non-null value is the snapshot we persist for the admin mockup.
 *   The "unsure" branch is intentionally always treated as a
 *   discrepancy when there's a record on file (the customer is opting
 *   out of confirming a known recorded type).
 */

import { describe, expect, it } from "vitest";

import {
  computeAcDiscrepancy,
  getAcRecord,
  unitCity,
  type AcRecord,
} from "./bookingHelpers";

describe("getAcRecord", () => {
  it("returns the recorded snapshot for known split units", () => {
    expect(getAcRecord("u2")).toEqual({ type: "split", systems: 2, additional: 0 });
  });

  it("returns the recorded snapshot for known ducted units", () => {
    expect(getAcRecord("u1")).toEqual({ type: "ducted", systems: 1, additional: 1 });
    expect(getAcRecord("u5")).toEqual({ type: "ducted", systems: 2, additional: 0 });
  });

  it("treats the legacy alias for u1 the same as the canonical id", () => {
    // 'unit-g01-335-aspen' is an older id that still appears in some
    // demo links — keep them in lockstep so deep-links don't drift.
    expect(getAcRecord("unit-g01-335-aspen")).toEqual(getAcRecord("u1"));
  });

  it("returns null for units flagged as 'unknown' (no records on file)", () => {
    expect(getAcRecord("u3")).toBeNull();
    expect(getAcRecord("u4")).toBeNull();
  });

  it("returns null for ids not in the catalog at all", () => {
    expect(getAcRecord("does-not-exist")).toBeNull();
  });

  it("returns null when no unit is selected yet", () => {
    expect(getAcRecord(null)).toBeNull();
  });
});

describe("computeAcDiscrepancy", () => {
  const recorded: AcRecord = { type: "split", systems: 2, additional: 1 };

  it("returns null when type and both counts match exactly", () => {
    const got = computeAcDiscrepancy(recorded, {
      type: "split",
      systems: 2,
      additional: 1,
    });
    expect(got).toBeNull();
  });

  it("returns a snapshot when only the type differs", () => {
    const got = computeAcDiscrepancy(recorded, {
      type: "ducted",
      systems: 2,
      additional: 1,
    });
    expect(got).toEqual({
      recorded,
      customer: { type: "ducted", systems: 2, additional: 1 },
    });
  });

  it("returns a snapshot when the systems count differs", () => {
    const got = computeAcDiscrepancy(recorded, {
      type: "split",
      systems: 3,
      additional: 1,
    });
    expect(got).not.toBeNull();
    expect(got?.customer).toEqual({ type: "split", systems: 3, additional: 1 });
  });

  it("returns a snapshot when the additional-units count differs", () => {
    const got = computeAcDiscrepancy(recorded, {
      type: "split",
      systems: 2,
      additional: 0,
    });
    expect(got).not.toBeNull();
    expect(got?.customer).toEqual({ type: "split", systems: 2, additional: 0 });
  });

  it("always returns a snapshot when the customer is 'unsure', even with a record on file", () => {
    const got = computeAcDiscrepancy(recorded, { type: "unsure" });
    expect(got).toEqual({
      recorded,
      customer: { type: "unsure" },
    });
  });

  it("preserves the recorded values verbatim in the snapshot", () => {
    const ducted: AcRecord = { type: "ducted", systems: 1, additional: 1 };
    const got = computeAcDiscrepancy(ducted, {
      type: "ducted",
      systems: 2,
      additional: 1,
    });
    expect(got?.recorded).toEqual(ducted);
  });
});

describe("unitCity", () => {
  it("returns Sydney for NSW units", () => {
    expect(unitCity("u2")).toBe("Sydney");
    expect(unitCity("u3")).toBe("Sydney");
    expect(unitCity("u4")).toBe("Sydney");
    expect(unitCity("u5")).toBe("Sydney");
  });

  it("returns Canberra for ACT units", () => {
    expect(unitCity("u1")).toBe("Canberra");
  });

  it("falls back to Sydney for an unknown unit id", () => {
    expect(unitCity("does-not-exist")).toBe("Sydney");
  });

  it("falls back to Sydney when no unit is selected", () => {
    expect(unitCity(null)).toBe("Sydney");
  });
});
