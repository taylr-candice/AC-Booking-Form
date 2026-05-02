/**
 * Unit tests for the admin "New booking" flow's pure helpers:
 *   - {@link nextBookingId} — monotonic id generation across an
 *     existing bookings list (skips the live row, ignores non-numeric
 *     ids, never collides with seeded ids).
 *   - {@link buildAdminCreatedBooking} — the `AdminBooking` shape used
 *     by phone bookings: pending payment, admin-attribution timeline
 *     entry, derived discrepancy + total, and the "to be coordinated"
 *     sibling outcome.
 *   - {@link computeAdminAcDiscrepancy} — comparison rules between the
 *     unit's recorded AC and what the admin captured.
 */

import { describe, expect, it } from "vitest";

import {
  ADMIN_USER_LABEL,
  buildAdminCreatedBooking,
  computeAdminAcDiscrepancy,
  nextBookingId,
  PRICE_PER_ADDITIONAL_INDOOR_AUD,
  PRICE_PER_SYSTEM_AUD,
  SEEDED_BOOKINGS,
  SEEDED_UNITS,
  type AdminBooking,
  type AdminUnit,
} from "./adminMockData";

const recordedDuctedUnit: AdminUnit = {
  id: "u-test-1",
  addressLine1: "Test 101",
  addressLine2: "Sydney NSW",
  ac: { type: "ducted", brand: "", systems: 1, additional: 1 },
  agentId: null,
  buildingId: "bldg-aspen",
};

const unknownAcUnit: AdminUnit = {
  id: "u-test-2",
  addressLine1: "Test 202",
  addressLine2: "Sydney NSW",
  ac: { type: "unknown", brand: "", systems: 0, additional: 0 },
  agentId: null,
  buildingId: "bldg-aspen",
};

describe("nextBookingId", () => {
  it("is one above the highest seeded numeric id", () => {
    // Only pure-numeric bk-NNN ids count; non-numeric slugs (e.g.
    // bk-lakeside-01) are intentionally skipped by nextBookingId and
    // must also be excluded from the test's own max computation.
    const numericIds = SEEDED_BOOKINGS.map((b) => {
      const m = /^bk-(\d+)$/.exec(b.id);
      return m ? parseInt(m[1], 10) : null;
    }).filter((n): n is number => n !== null);
    const seededMax = Math.max(...numericIds);
    expect(nextBookingId(SEEDED_BOOKINGS)).toBe(`bk-${seededMax + 1}`);
  });

  it("ignores the bk-live sentinel row", () => {
    const liveRow: AdminBooking = {
      ...SEEDED_BOOKINGS[0],
      id: "bk-live",
      isLive: true,
    };
    const numericIds = SEEDED_BOOKINGS.map((b) => {
      const m = /^bk-(\d+)$/.exec(b.id);
      return m ? parseInt(m[1], 10) : null;
    }).filter((n): n is number => n !== null);
    const seededMax = Math.max(...numericIds);
    expect(nextBookingId([liveRow, ...SEEDED_BOOKINGS])).toBe(
      `bk-${seededMax + 1}`,
    );
  });

  it("falls back to bk-1043 when no numeric ids exist", () => {
    expect(nextBookingId([])).toBe("bk-1043");
  });

  it("monotonically increments across multiple admin-created bookings", () => {
    let bookings: AdminBooking[] = [...SEEDED_BOOKINGS];
    const first = nextBookingId(bookings);
    bookings = [
      { ...SEEDED_BOOKINGS[0], id: first },
      ...bookings,
    ];
    const second = nextBookingId(bookings);
    expect(second).toBe(
      `bk-${parseInt(first.replace("bk-", ""), 10) + 1}`,
    );
    expect(second).not.toBe(first);
  });
});

describe("computeAdminAcDiscrepancy", () => {
  it("returns null when the unit has no record on file", () => {
    expect(
      computeAdminAcDiscrepancy(unknownAcUnit.ac, {
        type: "split",
        systems: 2,
        additional: 0,
      }),
    ).toBeNull();
  });

  it("returns null when the captured config matches the record exactly", () => {
    expect(
      computeAdminAcDiscrepancy(recordedDuctedUnit.ac, {
        type: "ducted",
        systems: 1,
        additional: 1,
      }),
    ).toBeNull();
  });

  it("flags a type mismatch", () => {
    const d = computeAdminAcDiscrepancy(recordedDuctedUnit.ac, {
      type: "split",
      systems: 1,
      additional: 1,
    });
    expect(d).not.toBeNull();
    expect(d!.recorded.type).toBe("ducted");
    expect(d!.customer).toEqual({ type: "split", systems: 1, additional: 1 });
  });

  it("flags a numeric mismatch even when the type matches", () => {
    const d = computeAdminAcDiscrepancy(recordedDuctedUnit.ac, {
      type: "ducted",
      systems: 2,
      additional: 1,
    });
    expect(d).not.toBeNull();
    expect(d!.customer).toEqual({ type: "ducted", systems: 2, additional: 1 });
  });

  it("flags an 'unsure' capture against a known recorded type", () => {
    const d = computeAdminAcDiscrepancy(recordedDuctedUnit.ac, {
      type: "unsure",
      systems: 0,
      additional: 0,
    });
    expect(d).not.toBeNull();
    expect(d!.customer).toEqual({ type: "unsure" });
  });
});

describe("buildAdminCreatedBooking", () => {
  const baseInput = {
    unit: SEEDED_UNITS.find((u) => u.id === "u1")!,
    customerName: "Phone Caller",
    customerEmail: "caller@example.com",
    customerPhone: "0411 000 111",
    bookerRole: "owner" as const,
    bookerAgencyId: null,
    bookerAgencyOtherName: "",
    ac: { type: "ducted" as const, systems: 1, additional: 1 },
    timestamp: "Apr 28 · 14:00",
  };

  it("lands as paymentStatus 'pending' with an admin-created marker on the timeline", () => {
    const b = buildAdminCreatedBooking(
      {
        ...baseInput,
        schedule: { kind: "slot", date: "2026-04-30", window: "morning" },
      },
      "bk-9001",
    );
    expect(b.paymentStatus).toBe("pending");
    expect(b.serviceStatus).toBe("scheduled");
    expect(b.serviceTimeline).toHaveLength(1);
    expect(b.serviceTimeline[0]).toMatchObject({
      status: "scheduled",
      label: "Booking created by admin (phone)",
      by: ADMIN_USER_LABEL,
    });
    expect(b.paymentTimeline).toHaveLength(1);
    expect(b.paymentTimeline[0]).toMatchObject({
      status: "pending",
      by: ADMIN_USER_LABEL,
    });
    expect(b.id).toBe("bk-9001");
  });

  it("computes the customer-side total ($179/system + $39/extra)", () => {
    const b = buildAdminCreatedBooking(
      {
        ...baseInput,
        ac: { type: "split", brand: "", systems: 2, additional: 1 },
        schedule: { kind: "slot", date: "2026-05-01", window: "afternoon" },
      },
      "bk-9002",
    );
    expect(b.totalAud).toBe(
      2 * PRICE_PER_SYSTEM_AUD + 1 * PRICE_PER_ADDITIONAL_INDOOR_AUD,
    );
  });

  it("uses a single-system placeholder total when AC is 'unsure'", () => {
    const b = buildAdminCreatedBooking(
      {
        ...baseInput,
        ac: { type: "unsure", systems: 0, additional: 0 },
        schedule: { kind: "slot", date: "2026-05-01", window: "morning" },
      },
      "bk-9003",
    );
    expect(b.totalAud).toBe(PRICE_PER_SYSTEM_AUD);
    expect(b.acType).toBe("unsure");
  });

  it("surfaces a discrepancy when the captured AC differs from the unit record", () => {
    const b = buildAdminCreatedBooking(
      {
        ...baseInput,
        unit: SEEDED_UNITS.find((u) => u.id === "u1")!, // ducted 1+1
        ac: { type: "split", brand: "", systems: 2, additional: 0 },
        schedule: { kind: "slot", date: "2026-05-02", window: "morning" },
      },
      "bk-9004",
    );
    expect(b.discrepancy).not.toBeNull();
    expect(b.discrepancy!.recorded.type).toBe("ducted");
    expect(b.discrepancy!.customer).toEqual({
      type: "split",
      systems: 2,
      additional: 0,
    });
  });

  it("accepts an evening slot and stamps it on the booking (Task #187)", () => {
    const b = buildAdminCreatedBooking(
      {
        ...baseInput,
        schedule: { kind: "slot", date: "2026-04-29", window: "evening" },
      },
      "bk-9006",
    );
    expect(b.serviceDate).toBe("2026-04-29");
    expect(b.serviceSlot).toBe("evening");
    expect(b.serviceStatus).toBe("scheduled");
  });

  it("encodes the 'to be coordinated' outcome with no date and the coordination slot", () => {
    const b = buildAdminCreatedBooking(
      {
        ...baseInput,
        schedule: { kind: "to_be_coordinated" },
      },
      "bk-9005",
    );
    expect(b.serviceDate).toBeNull();
    expect(b.serviceSlot).toBe("to_be_coordinated");
    expect(b.serviceTimeline[0].label).toBe("Booking created by admin (phone)");
  });

  it("carries the agent's agency id (and 'Other' free text only when applicable)", () => {
    const agentBooking = buildAdminCreatedBooking(
      {
        ...baseInput,
        bookerRole: "agent",
        bookerAgencyId: "agency-001",
        bookerAgencyOtherName: "Should be ignored",
        schedule: { kind: "to_be_coordinated" },
      },
      "bk-9006",
    );
    expect(agentBooking.bookerAgencyId).toBe("agency-001");
    // Free-text only carried for the OTHER_AGENCY_ID id.
    expect(agentBooking.bookerAgencyOtherName).toBe("");

    const otherBooking = buildAdminCreatedBooking(
      {
        ...baseInput,
        bookerRole: "agent",
        bookerAgencyId: "agency-005",
        bookerAgencyOtherName: "Boutique Realty",
        schedule: { kind: "to_be_coordinated" },
      },
      "bk-9007",
    );
    expect(otherBooking.bookerAgencyId).toBe("agency-005");
    expect(otherBooking.bookerAgencyOtherName).toBe("Boutique Realty");

    // Owner bookings drop both fields regardless of what was passed in.
    const ownerBooking = buildAdminCreatedBooking(
      {
        ...baseInput,
        bookerAgencyId: "agency-001",
        bookerAgencyOtherName: "Trying to leak",
        schedule: { kind: "to_be_coordinated" },
      },
      "bk-9008",
    );
    expect(ownerBooking.bookerAgencyId).toBeNull();
    expect(ownerBooking.bookerAgencyOtherName).toBe("");
  });
});
