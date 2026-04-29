/**
 * Integration check for the schedule-then-undo capacity round-trip
 * (Task #92).
 *
 * The success-toast Undo path in `AdminApp.scheduleCoordinationBooking`
 * relies on `consumeBookingCapacity` + `releaseBookingCapacity` to
 * reverse exactly what was consumed on the rollout slot. Because
 * `updateRolloutSlot` is immutable (replaces the rollout/day/slot
 * objects), any cached pre-consume snapshot would be stale — so the
 * release MUST go through the helper, which re-reads the current slot
 * from the rollouts store.
 *
 * These tests prove that for both capacity models a consume followed
 * by a release returns `bookedCount` / `bookedMinutes` to *exactly*
 * the pre-consume values, including when the starting values are
 * non-zero (i.e. the slot already had bookings on it).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  __resetRolloutsForTests,
  consumeBookingCapacity,
  getRolloutById,
  releaseBookingCapacity,
  SEEDED_BOOKINGS,
  updateRolloutSlot,
  type AdminBooking,
} from "./adminMockData";

beforeEach(() => {
  __resetRolloutsForTests();
});
afterEach(() => {
  __resetRolloutsForTests();
});

function findCoordinationBooking(): AdminBooking {
  const b = SEEDED_BOOKINGS.find(
    (x) => x.serviceSlot === "to_be_coordinated" && x.rolloutId !== null,
  );
  if (!b) throw new Error("Expected a seeded coordination booking");
  return b;
}

function findRolloutId(model: "slots_per_window" | "time_budget_per_window") {
  // Walk the seed bookings to find a rollout running this model.
  for (const b of SEEDED_BOOKINGS) {
    if (!b.rolloutId) continue;
    const r = getRolloutById(b.rolloutId);
    if (r && r.capacityModel === model) return r.id;
  }
  throw new Error(`No seeded rollout with capacityModel=${model}`);
}

function getSlot(
  rolloutId: string,
  date: string,
  window: "morning" | "afternoon",
) {
  const r = getRolloutById(rolloutId);
  if (!r) throw new Error("rollout missing");
  const day = r.days.find((d) => d.isoDate === date);
  if (!day) throw new Error("day missing");
  const slot = window === "morning" ? day.morning : day.afternoon;
  if (!slot) throw new Error("slot missing");
  return slot;
}

function pickOpenDate(
  rolloutId: string,
  window: "morning" | "afternoon",
): string {
  const r = getRolloutById(rolloutId)!;
  const day = r.days.find((d) => {
    if (!d.open) return false;
    const s = window === "morning" ? d.morning : d.afternoon;
    return s.openByAdmin;
  });
  if (!day) throw new Error("no open day on this rollout");
  return day.isoDate;
}

describe("schedule + undo rollout capacity round-trip", () => {
  it("returns bookedCount to its pre-schedule value on a slots_per_window rollout (zero start)", () => {
    const booking = findCoordinationBooking();
    const rolloutId = findRolloutId("slots_per_window");
    const window = "morning" as const;
    const date = pickOpenDate(rolloutId, window);

    updateRolloutSlot(rolloutId, date, window, { bookedCount: 0 });
    const before = getSlot(rolloutId, date, window).bookedCount ?? 0;

    expect(consumeBookingCapacity(booking, rolloutId, date, window)).toBe(true);
    expect(getSlot(rolloutId, date, window).bookedCount).toBe(before + 1);

    expect(
      releaseBookingCapacity({
        ...booking,
        rolloutId,
        serviceDate: date,
        serviceSlot: window,
      }),
    ).toBe(true);
    expect(getSlot(rolloutId, date, window).bookedCount ?? 0).toBe(before);
  });

  it("returns bookedCount to its pre-schedule value on a slots_per_window rollout (non-zero start)", () => {
    const booking = findCoordinationBooking();
    const rolloutId = findRolloutId("slots_per_window");
    const window = "morning" as const;
    const date = pickOpenDate(rolloutId, window);

    // Slot already has 2 bookings on it — proves the helper releases
    // against current state, not the pre-consume snapshot.
    updateRolloutSlot(rolloutId, date, window, { bookedCount: 2 });
    const before = getSlot(rolloutId, date, window).bookedCount ?? 0;

    consumeBookingCapacity(booking, rolloutId, date, window);
    expect(getSlot(rolloutId, date, window).bookedCount).toBe(before + 1);

    releaseBookingCapacity({
      ...booking,
      rolloutId,
      serviceDate: date,
      serviceSlot: window,
    });
    expect(getSlot(rolloutId, date, window).bookedCount).toBe(before);
  });

  it("returns bookedMinutes to its pre-schedule value on a time_budget_per_window rollout (non-zero start)", () => {
    const booking = findCoordinationBooking();
    const rolloutId = findRolloutId("time_budget_per_window");
    const window = "afternoon" as const;
    const date = pickOpenDate(rolloutId, window);

    // Slot already has 30 minutes booked.
    updateRolloutSlot(rolloutId, date, window, { bookedMinutes: 30 });
    const before = getSlot(rolloutId, date, window).bookedMinutes;

    consumeBookingCapacity(booking, rolloutId, date, window);
    const afterConsume = getSlot(rolloutId, date, window).bookedMinutes;
    expect(afterConsume).toBeGreaterThan(before);

    releaseBookingCapacity({
      ...booking,
      rolloutId,
      serviceDate: date,
      serviceSlot: window,
    });
    expect(getSlot(rolloutId, date, window).bookedMinutes).toBe(before);
  });
});
