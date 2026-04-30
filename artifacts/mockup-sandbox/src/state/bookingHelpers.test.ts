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

import { afterEach, describe, expect, it } from "vitest";

import {
  computeAcDiscrepancy,
  getAcBrand,
  getAcMode,
  getAcRecord,
  getAcType,
  isPastDate,
  unitCity,
  type AcRecord,
} from "./bookingHelpers";
import {
  setLiveBuildingsSource,
  setLiveUnitsSource,
  type AdminBuilding,
  type AdminUnit,
} from "./adminMockData";

describe("getAcRecord", () => {
  it("returns the recorded snapshot for known split units", () => {
    expect(getAcRecord("u2")).toEqual({
      type: "split",
      brand: "Mitsubishi",
      systems: 2,
      additional: 0,
    });
  });

  it("returns the recorded snapshot for known ducted units", () => {
    expect(getAcRecord("u1")).toEqual({
      type: "ducted",
      brand: "Daikin",
      systems: 1,
      additional: 1,
    });
    // u5 is in the Anzac Parade building, which is seeded as
    // ducted/Panasonic — the brand inherits from the building since
    // u5's own `ac.brand` is empty (Task #110).
    expect(getAcRecord("u5")).toEqual({
      type: "ducted",
      brand: "Panasonic",
      systems: 2,
      additional: 0,
    });
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

describe("getAcMode", () => {
  // Task #50 — drives the Step 2 branch between the on-file (minimal)
  // view, the overridden full-config view, and the no-record view.
  // The mode is fully determined by (a) whether we have a record on
  // file for the unit, and (b) the per-session override flag.
  it("returns 'on-file' when we have a record and the override flag is false", () => {
    expect(getAcMode("u1", false)).toBe("on-file");
    expect(getAcMode("u2", false)).toBe("on-file");
    expect(getAcMode("u5", false)).toBe("on-file");
  });

  it("returns 'overridden' when we have a record and the override flag is true", () => {
    expect(getAcMode("u1", true)).toBe("overridden");
    expect(getAcMode("u2", true)).toBe("overridden");
  });

  it("returns 'no-record' when the unit has no record on file, regardless of the flag", () => {
    // Catalog units flagged 'unknown'.
    expect(getAcMode("u3", false)).toBe("no-record");
    expect(getAcMode("u3", true)).toBe("no-record");
    expect(getAcMode("u4", false)).toBe("no-record");
    expect(getAcMode("u4", true)).toBe("no-record");
  });

  it("returns 'no-record' for unknown ids and for null (no unit selected yet)", () => {
    expect(getAcMode("does-not-exist", false)).toBe("no-record");
    expect(getAcMode("does-not-exist", true)).toBe("no-record");
    expect(getAcMode(null, false)).toBe("no-record");
    expect(getAcMode(null, true)).toBe("no-record");
  });

  it("respects the legacy unit alias — same mode for canonical and alias id", () => {
    expect(getAcMode("unit-g01-335-aspen", false)).toBe(getAcMode("u1", false));
    expect(getAcMode("unit-g01-335-aspen", true)).toBe(getAcMode("u1", true));
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

describe("isPastDate", () => {
  // Pinned clock so these assertions never drift over time. The slot
  // picker seed data is anchored to fixed 2026 dates, so we test
  // around that anchor.
  const pinnedNow = new Date(2026, 3, 28, 14, 30); // Apr 28 2026, 14:30 local

  it("returns true for any date strictly before today's local date", () => {
    expect(isPastDate("2026-04-27", pinnedNow)).toBe(true);
    expect(isPastDate("2025-12-31", pinnedNow)).toBe(true);
    expect(isPastDate("1999-01-01", pinnedNow)).toBe(true);
  });

  it("returns false for today (regardless of the time of day)", () => {
    expect(isPastDate("2026-04-28", pinnedNow)).toBe(false);
    expect(isPastDate("2026-04-28", new Date(2026, 3, 28, 0, 0))).toBe(false);
    expect(isPastDate("2026-04-28", new Date(2026, 3, 28, 23, 59))).toBe(false);
  });

  it("returns false for any date in the future", () => {
    expect(isPastDate("2026-04-29", pinnedNow)).toBe(false);
    expect(isPastDate("2026-05-09", pinnedNow)).toBe(false);
    expect(isPastDate("2030-01-01", pinnedNow)).toBe(false);
  });

  it("handles month and year rollovers correctly", () => {
    const newYearsEve = new Date(2026, 11, 31, 12, 0); // Dec 31 2026
    expect(isPastDate("2026-12-30", newYearsEve)).toBe(true);
    expect(isPastDate("2026-12-31", newYearsEve)).toBe(false);
    expect(isPastDate("2027-01-01", newYearsEve)).toBe(false);
  });
});


describe("getAcType / getAcBrand — unit override + building inheritance (Task #110)", () => {
  // Helper: build minimal building + unit fixtures and register them as
  // the live source so the helpers read from them.
  const make = (
    buildingPatch: Partial<AdminBuilding>,
    unitPatch: Partial<AdminUnit> & { ac: AdminUnit["ac"] },
  ): { building: AdminBuilding; unit: AdminUnit } => {
    const building: AdminBuilding = {
      id: "bldg-x",
      name: "Test Tower",
      addressLine1: "1 Test St",
      addressLine2: "Suburb NSW 2000",
      acType: "split",
      acBrand: "Daikin",
      ...buildingPatch,
    };
    const unit: AdminUnit = {
      id: "u-x",
      addressLine1: "1 / 1 Test St",
      addressLine2: "Suburb NSW 2000",
      agentId: null,
      buildingId: building.id,
      ...unitPatch,
    } as AdminUnit;
    return { building, unit };
  };

  afterEach(() => {
    // Restore default getters so other test files start clean.
    setLiveBuildingsSource(null);
    setLiveUnitsSource(null);
  });

  it("uses the unit's own type even when its counts are blank (does not fall back to the building's type)", () => {
    const { building, unit } = make(
      { acType: "split", acBrand: "Mitsubishi" },
      { ac: { type: "ducted", brand: "", systems: null, additional: null } },
    );
    setLiveBuildingsSource(() => [building]);
    setLiveUnitsSource(() => [unit]);

    // The unit overrides type to "ducted" — even though counts are
    // blank (no record on file), the type must stay "ducted" so the
    // customer never sees the type picker for a known unit.
    expect(getAcType(unit.id)).toBe("ducted");
    // Brand is blank on the unit, so it inherits from the building.
    expect(getAcBrand(unit.id)).toBe("Mitsubishi");
    // Counts are blank, so the on-file record is null (no-record mode).
    expect(getAcRecord(unit.id)).toBeNull();
  });

  it("falls back to the building's type when the unit's type is 'unknown'", () => {
    const { building, unit } = make(
      { acType: "ducted", acBrand: "Panasonic" },
      { ac: { type: "unknown", brand: "", systems: null, additional: null } },
    );
    setLiveBuildingsSource(() => [building]);
    setLiveUnitsSource(() => [unit]);

    expect(getAcType(unit.id)).toBe("ducted");
    expect(getAcBrand(unit.id)).toBe("Panasonic");
  });

  it("uses the unit's own brand when set (overrides the building's brand)", () => {
    const { building, unit } = make(
      { acType: "split", acBrand: "Daikin" },
      { ac: { type: "split", brand: "Fujitsu", systems: 1, additional: 0 } },
    );
    setLiveBuildingsSource(() => [building]);
    setLiveUnitsSource(() => [unit]);

    expect(getAcBrand(unit.id)).toBe("Fujitsu");
    expect(getAcRecord(unit.id)).toEqual({
      type: "split",
      brand: "Fujitsu",
      systems: 1,
      additional: 0,
    });
  });
});

