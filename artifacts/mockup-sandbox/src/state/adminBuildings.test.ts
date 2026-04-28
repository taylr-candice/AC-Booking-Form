/**
 * Unit tests for the building helpers / rollout summary in
 * `adminMockData.ts`. These cover the pure data-layer joins that the
 * Buildings view relies on — they deliberately don't go through React
 * so they stay fast and don't depend on jsdom.
 */

import { describe, expect, it } from "vitest";

import type { AdminBooking, AdminUnit } from "./adminMockData";
import {
  formatRolloutDateRange,
  getBuildingBookings,
  getBuildingById,
  getBuildingForUnit,
  getBuildingUnits,
  SEEDED_BOOKINGS,
  SEEDED_BUILDINGS,
  SEEDED_UNITS,
  summarizeBuildingRollout,
} from "./adminMockData";

// ── small helpers ──────────────────────────────────────────────────────────

function makeUnit(over: Partial<AdminUnit> = {}): AdminUnit {
  return {
    id: "u-test",
    addressLine1: "1 Test Street",
    addressLine2: "Sydney NSW 2000",
    ac: { type: "split", systems: 1, additional: 0 },
    agentId: null,
    buildingId: "bldg-test",
    ...over,
  };
}

function makeBooking(over: Partial<AdminBooking> = {}): AdminBooking {
  return {
    id: "bk-test",
    unitId: "u-test",
    customerName: "Test Customer",
    customerEmail: "test@example.com",
    customerPhone: "0400 000 000",
    bookerRole: "owner",
    bookerAgencyId: null,
    bookerAgencyOtherName: "",
    accessMethod: "owner_live_at_unit",
    tenants: [],
    systems: 1,
    additional: 0,
    acType: "split",
    discrepancy: null,
    serviceDate: "2026-05-01",
    serviceSlot: "morning",
    paymentStatus: "paid",
    serviceStatus: "scheduled",
    totalAud: 179,
    paymentTimeline: [],
    serviceTimeline: [],
    notes: "",
    ...over,
  };
}

// ── seed-data sanity ───────────────────────────────────────────────────────

describe("seeded buildings + units", () => {
  it("every seeded unit has a known buildingId", () => {
    const buildingIds = new Set(SEEDED_BUILDINGS.map((b) => b.id));
    for (const unit of SEEDED_UNITS) {
      expect(buildingIds.has(unit.buildingId)).toBe(true);
    }
  });

  it("every seeded building has at least one unit", () => {
    for (const building of SEEDED_BUILDINGS) {
      const units = getBuildingUnits(building.id, SEEDED_UNITS);
      expect(units.length).toBeGreaterThan(0);
    }
  });

  it("every seeded booking maps onto a building (via its unit)", () => {
    for (const booking of SEEDED_BOOKINGS) {
      const unit = SEEDED_UNITS.find((u) => u.id === booking.unitId);
      expect(unit).toBeDefined();
      const building = getBuildingForUnit(unit ?? null);
      expect(building).not.toBeNull();
    }
  });
});

// ── id-based lookups ───────────────────────────────────────────────────────

describe("getBuildingById", () => {
  it("returns the building for a known id", () => {
    expect(getBuildingById("bldg-aspen")?.name).toBe("Aspen Village");
  });

  it("returns null for an unknown or null id", () => {
    expect(getBuildingById("does-not-exist")).toBeNull();
    expect(getBuildingById(null)).toBeNull();
  });
});

describe("getBuildingForUnit", () => {
  it("follows buildingId on a unit", () => {
    const unit = SEEDED_UNITS.find((u) => u.id === "u1")!;
    expect(getBuildingForUnit(unit)?.id).toBe("bldg-aspen");
  });

  it("returns null for a null unit", () => {
    expect(getBuildingForUnit(null)).toBeNull();
  });

  it("returns null when the unit's buildingId is unknown", () => {
    const orphan = makeUnit({ buildingId: "bldg-not-real" });
    expect(getBuildingForUnit(orphan)).toBeNull();
  });
});

// ── group joins ────────────────────────────────────────────────────────────

describe("getBuildingUnits", () => {
  it("returns only units for the requested building", () => {
    const units = getBuildingUnits("bldg-marine", SEEDED_UNITS);
    expect(units.length).toBeGreaterThan(0);
    for (const u of units) {
      expect(u.buildingId).toBe("bldg-marine");
    }
  });

  it("returns an empty array for an unknown building", () => {
    expect(getBuildingUnits("bldg-nope", SEEDED_UNITS)).toEqual([]);
  });
});

describe("getBuildingBookings", () => {
  it("returns bookings whose unit lives in the building", () => {
    const bookings = getBuildingBookings(
      "bldg-marine",
      SEEDED_UNITS,
      SEEDED_BOOKINGS,
    );
    // Marine Parade has u2 (with two bookings: bk-1041, bk-1036) and u3 (bk-1039).
    const ids = bookings.map((b) => b.id).sort();
    expect(ids).toEqual(["bk-1036", "bk-1039", "bk-1041"]);
  });

  it("returns empty when the building has no bookings", () => {
    const units: AdminUnit[] = [
      makeUnit({ id: "u-empty-1", buildingId: "bldg-empty" }),
    ];
    expect(getBuildingBookings("bldg-empty", units, SEEDED_BOOKINGS)).toEqual(
      [],
    );
  });
});

// ── rollout summary ────────────────────────────────────────────────────────

describe("summarizeBuildingRollout", () => {
  it("counts each unit at most once even if it has multiple bookings", () => {
    const units: AdminUnit[] = [
      makeUnit({ id: "u-x", buildingId: "bldg-x" }),
      makeUnit({ id: "u-y", buildingId: "bldg-x" }),
    ];
    const bookings: AdminBooking[] = [
      makeBooking({ id: "bk-1", unitId: "u-x", serviceDate: "2026-05-01" }),
      makeBooking({ id: "bk-2", unitId: "u-x", serviceDate: "2026-05-08" }),
    ];
    const summary = summarizeBuildingRollout(
      "bldg-x",
      units,
      bookings,
      new Date("2026-04-28"),
    );
    expect(summary.totalUnits).toBe(2);
    expect(summary.bookedUnits).toBe(1);
    expect(summary.remainingUnits).toBe(1);
    expect(summary.totalBookings).toBe(2);
  });

  it("sums completed units only when service is complete or invoice_adjusted", () => {
    const units: AdminUnit[] = [
      makeUnit({ id: "u-a", buildingId: "bldg-x" }),
      makeUnit({ id: "u-b", buildingId: "bldg-x" }),
      makeUnit({ id: "u-c", buildingId: "bldg-x" }),
    ];
    const bookings: AdminBooking[] = [
      makeBooking({ id: "bk-a", unitId: "u-a", serviceStatus: "scheduled" }),
      makeBooking({ id: "bk-b", unitId: "u-b", serviceStatus: "complete" }),
      makeBooking({
        id: "bk-c",
        unitId: "u-c",
        serviceStatus: "invoice_adjusted",
      }),
    ];
    const summary = summarizeBuildingRollout(
      "bldg-x",
      units,
      bookings,
      new Date("2026-04-28"),
    );
    expect(summary.bookedUnits).toBe(3);
    expect(summary.completedUnits).toBe(2);
  });

  it("counts a unit as complete only when its latest booking is complete", () => {
    // u-a: old complete booking, then a newer scheduled re-booking →
    //      NOT complete (the rollout is still waiting on that unit).
    // u-b: old scheduled booking, then a newer complete booking →
    //      complete (most recent service is done).
    // u-c: single complete booking → complete.
    const units: AdminUnit[] = [
      makeUnit({ id: "u-a", buildingId: "bldg-x" }),
      makeUnit({ id: "u-b", buildingId: "bldg-x" }),
      makeUnit({ id: "u-c", buildingId: "bldg-x" }),
    ];
    const bookings: AdminBooking[] = [
      makeBooking({
        id: "bk-1000",
        unitId: "u-a",
        serviceStatus: "complete",
      }),
      makeBooking({
        id: "bk-1010",
        unitId: "u-a",
        serviceStatus: "scheduled",
      }),
      makeBooking({
        id: "bk-1001",
        unitId: "u-b",
        serviceStatus: "scheduled",
      }),
      makeBooking({
        id: "bk-1011",
        unitId: "u-b",
        serviceStatus: "complete",
      }),
      makeBooking({
        id: "bk-1002",
        unitId: "u-c",
        serviceStatus: "complete",
      }),
    ];
    const summary = summarizeBuildingRollout(
      "bldg-x",
      units,
      bookings,
      new Date("2026-04-28"),
    );
    expect(summary.bookedUnits).toBe(3);
    expect(summary.completedUnits).toBe(2);
  });

  it("derives the date range from earliest and latest serviceDate", () => {
    const units: AdminUnit[] = [
      makeUnit({ id: "u-a", buildingId: "bldg-x" }),
      makeUnit({ id: "u-b", buildingId: "bldg-x" }),
      makeUnit({ id: "u-c", buildingId: "bldg-x" }),
    ];
    const bookings: AdminBooking[] = [
      makeBooking({ id: "bk-a", unitId: "u-a", serviceDate: "2026-05-08" }),
      makeBooking({ id: "bk-b", unitId: "u-b", serviceDate: "2026-04-29" }),
      makeBooking({
        id: "bk-c",
        unitId: "u-c",
        serviceDate: null,
        serviceSlot: "to_be_coordinated",
      }),
    ];
    const summary = summarizeBuildingRollout(
      "bldg-x",
      units,
      bookings,
      new Date("2026-04-28"),
    );
    expect(summary.dateRange).toEqual({
      from: "2026-04-29",
      to: "2026-05-08",
    });
  });

  it("returns null dateRange + null nextScheduled when nothing is dated", () => {
    const units: AdminUnit[] = [
      makeUnit({ id: "u-a", buildingId: "bldg-x" }),
    ];
    const bookings: AdminBooking[] = [
      makeBooking({
        id: "bk-a",
        unitId: "u-a",
        serviceDate: null,
        serviceSlot: "to_be_coordinated",
      }),
    ];
    const summary = summarizeBuildingRollout(
      "bldg-x",
      units,
      bookings,
      new Date("2026-04-28"),
    );
    expect(summary.dateRange).toBeNull();
    expect(summary.nextScheduled).toBeNull();
    expect(summary.coordinationCount).toBe(1);
  });

  it("nextScheduled picks the earliest future scheduled slot, morning before afternoon", () => {
    const units: AdminUnit[] = [
      makeUnit({ id: "u-a", buildingId: "bldg-x" }),
      makeUnit({ id: "u-b", buildingId: "bldg-x" }),
      makeUnit({ id: "u-c", buildingId: "bldg-x" }),
    ];
    const bookings: AdminBooking[] = [
      // a past booking — must be ignored
      makeBooking({
        id: "bk-past",
        unitId: "u-a",
        serviceDate: "2026-04-20",
        serviceStatus: "complete",
      }),
      // afternoon today
      makeBooking({
        id: "bk-pm",
        unitId: "u-b",
        serviceDate: "2026-04-28",
        serviceSlot: "afternoon",
        serviceStatus: "scheduled",
      }),
      // morning today — should win
      makeBooking({
        id: "bk-am",
        unitId: "u-c",
        serviceDate: "2026-04-28",
        serviceSlot: "morning",
        serviceStatus: "en_route",
      }),
    ];
    const summary = summarizeBuildingRollout(
      "bldg-x",
      units,
      bookings,
      new Date("2026-04-28"),
    );
    expect(summary.nextScheduled).toEqual({
      date: "2026-04-28",
      slot: "morning",
    });
  });

  it("nextScheduled excludes complete bookings even if dated in the future", () => {
    const units: AdminUnit[] = [
      makeUnit({ id: "u-a", buildingId: "bldg-x" }),
    ];
    const bookings: AdminBooking[] = [
      makeBooking({
        id: "bk-a",
        unitId: "u-a",
        serviceDate: "2026-05-08",
        serviceStatus: "complete",
      }),
    ];
    const summary = summarizeBuildingRollout(
      "bldg-x",
      units,
      bookings,
      new Date("2026-04-28"),
    );
    expect(summary.nextScheduled).toBeNull();
  });

  it("an empty building yields zero counts", () => {
    const summary = summarizeBuildingRollout(
      "bldg-empty",
      [],
      [],
      new Date("2026-04-28"),
    );
    expect(summary.totalUnits).toBe(0);
    expect(summary.bookedUnits).toBe(0);
    expect(summary.remainingUnits).toBe(0);
    expect(summary.totalBookings).toBe(0);
  });
});

// ── formatRolloutDateRange ────────────────────────────────────────────────

describe("formatRolloutDateRange", () => {
  it("formats a multi-day range with an en-dash", () => {
    expect(
      formatRolloutDateRange({ from: "2026-04-29", to: "2026-05-02" }),
    ).toBe("29 Apr – 2 May");
  });

  it("collapses a single-day range to one date", () => {
    expect(
      formatRolloutDateRange({ from: "2026-05-01", to: "2026-05-01" }),
    ).toBe("1 May");
  });

  it("returns the placeholder when no range", () => {
    expect(formatRolloutDateRange(null)).toBe("—");
    expect(formatRolloutDateRange(null, "Not booked")).toBe("Not booked");
  });
});
