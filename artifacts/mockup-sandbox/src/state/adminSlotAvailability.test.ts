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
