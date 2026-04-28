/**
 * Unit tests for `slotIsAvailable` — the gate that decides whether
 * a window can accept a new booking under either scheduling mode.
 *
 * The actual customer-side slot picker (Tasks #27 / #29) computes its
 * own availability from sessionStorage; this helper is the contract
 * that the admin (and any future backend) would use when surfacing
 * "available / full" for a given booking attempt.
 */

import { describe, expect, it } from "vitest";

import {
  slotIsAvailable,
  type AdminSlot,
} from "./adminMockData";
import { getBookingDurationMinutes } from "./bookingDerived";

function timeSlot(overrides: Partial<AdminSlot> = {}): AdminSlot {
  return {
    id: "test-am",
    window: "morning",
    mode: "time_based",
    windowMinutes: 240,
    bookedMinutes: 0,
    slotCount: 4,
    bookedCount: 0,
    ...overrides,
  };
}

function countSlot(overrides: Partial<AdminSlot> = {}): AdminSlot {
  return {
    id: "test-pm",
    window: "afternoon",
    mode: "count_based",
    windowMinutes: 300,
    bookedMinutes: 0,
    slotCount: 5,
    bookedCount: 0,
    ...overrides,
  };
}

describe("slotIsAvailable — time_based", () => {
  it("returns true for an empty window", () => {
    expect(slotIsAvailable(timeSlot(), 60)).toBe(true);
  });

  it("returns true when the job exactly fits the remaining minutes", () => {
    expect(
      slotIsAvailable(timeSlot({ bookedMinutes: 180 }), 60),
    ).toBe(true);
  });

  it("returns false when the job is one minute too long for what's left", () => {
    expect(
      slotIsAvailable(timeSlot({ bookedMinutes: 180 }), 61),
    ).toBe(false);
  });

  it("returns false when the window is fully booked, regardless of jobMinutes", () => {
    const full = timeSlot({ bookedMinutes: 240 });
    expect(slotIsAvailable(full, 1)).toBe(false);
    expect(slotIsAvailable(full, 30)).toBe(false);
  });

  it("treats jobMinutes=0 as 'is there ANY room left' (>=1 minute)", () => {
    expect(slotIsAvailable(timeSlot({ bookedMinutes: 239 }), 0)).toBe(true);
    expect(slotIsAvailable(timeSlot({ bookedMinutes: 240 }), 0)).toBe(false);
  });
});

describe("slotIsAvailable — count_based", () => {
  it("returns true for an empty count window", () => {
    expect(slotIsAvailable(countSlot(), 60)).toBe(true);
  });

  it("returns true when at least one slot remains, regardless of jobMinutes", () => {
    const oneLeft = countSlot({ bookedCount: 4 });
    expect(slotIsAvailable(oneLeft, 1)).toBe(true);
    expect(slotIsAvailable(oneLeft, 9999)).toBe(true);
  });

  it("returns false when all slots are booked", () => {
    const full = countSlot({ bookedCount: 5 });
    expect(slotIsAvailable(full, 1)).toBe(false);
    expect(slotIsAvailable(full, 0)).toBe(false);
  });

  it("ignores bookedMinutes / windowMinutes entirely in count mode", () => {
    // Time-based fields say "completely full", count fields say "wide open"
    const slot = countSlot({
      bookedMinutes: 9999,
      windowMinutes: 60,
      slotCount: 5,
      bookedCount: 0,
    });
    expect(slotIsAvailable(slot, 120)).toBe(true);
  });
});

// ─── Admin "New booking" flow framings ──────────────────────────────────────
//
// The admin-side per-window "is this bookable for this specific job?"
// gate calls `slotIsAvailable(slot, getBookingDurationMinutes(input))`.
// These tests pin that combined decision so the new-booking flow can't
// silently disagree with the customer-side picker about a job's fit.

describe("admin new-booking per-window decision (time_based)", () => {
  it("a 1-system + 0-extra job (45 min) fits a 240-min morning with 195 min booked", () => {
    const slot = timeSlot({ bookedMinutes: 195 }); // 45 min remaining
    const jobMinutes = getBookingDurationMinutes({
      num_systems: 1,
      num_additional_indoor: 0,
      ac_discrepancy: null,
    });
    expect(jobMinutes).toBe(45);
    expect(slotIsAvailable(slot, jobMinutes)).toBe(true);
  });

  it("a 2-system + 0-extra job (90 min) does NOT fit 45 min remaining", () => {
    const slot = timeSlot({ bookedMinutes: 195 }); // 45 min remaining
    const jobMinutes = getBookingDurationMinutes({
      num_systems: 2,
      num_additional_indoor: 0,
      ac_discrepancy: null,
    });
    expect(jobMinutes).toBe(90);
    expect(slotIsAvailable(slot, jobMinutes)).toBe(false);
  });

  it("a 2-system + 2-extra job (120 min) fits an empty afternoon (300 min)", () => {
    const slot = timeSlot({ windowMinutes: 300, bookedMinutes: 0 });
    const jobMinutes = getBookingDurationMinutes({
      num_systems: 2,
      num_additional_indoor: 2,
      ac_discrepancy: null,
    });
    expect(jobMinutes).toBe(120);
    expect(slotIsAvailable(slot, jobMinutes)).toBe(true);
  });

  it("an 'unsure' job falls back to 45 min and still fits a tight window", () => {
    const slot = timeSlot({ bookedMinutes: 195 });
    const jobMinutes = getBookingDurationMinutes({
      num_systems: 99, // intentionally bogus — should be ignored when unsure
      num_additional_indoor: 99,
      ac_discrepancy: {
        recorded: { type: "split", systems: 1, additional: 0 },
        customer: { type: "unsure" },
      },
    });
    expect(jobMinutes).toBe(45);
    expect(slotIsAvailable(slot, jobMinutes)).toBe(true);
  });
});

describe("admin new-booking per-window decision (count_based)", () => {
  it("a 4-system + 4-extra job (240 min!) still fits a count-based window with one slot left", () => {
    // The whole point of count mode: the booking duration is irrelevant
    // — capacity is the only gate. So even a "9-hour" admin booking is
    // bookable as long as one count slot remains.
    const slot = countSlot({ slotCount: 5, bookedCount: 4 });
    const jobMinutes = getBookingDurationMinutes({
      num_systems: 4,
      num_additional_indoor: 4,
      ac_discrepancy: null,
    });
    expect(jobMinutes).toBe(240);
    expect(slotIsAvailable(slot, jobMinutes)).toBe(true);
  });

  it("a 1-system job (45 min) is rejected when every count slot is taken", () => {
    const slot = countSlot({ slotCount: 5, bookedCount: 5 });
    const jobMinutes = getBookingDurationMinutes({
      num_systems: 1,
      num_additional_indoor: 0,
      ac_discrepancy: null,
    });
    expect(slotIsAvailable(slot, jobMinutes)).toBe(false);
  });
});
