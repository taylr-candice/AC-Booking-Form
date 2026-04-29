/**
 * Unit tests for the per-rollout schedule model introduced in Task #59.
 *
 * Covers:
 *  - Capacity-mode classification (`time_budget_per_window` vs
 *    `slots_per_window`) — the two scheduling modes the admin can pick
 *    when creating a rollout.
 *  - Rollout lookup helpers (`getRolloutById`, `getRolloutsForBuilding`,
 *    `findRolloutForBooking`) — these gate which buildings a customer
 *    can book against.
 *  - The four `RolloutSlotStatus` outcomes the customer slot picker
 *    surfaces — "available" / "not_enough_time" / "full" / "not_yet_open".
 */

import { afterEach, describe, expect, it } from "vitest";

import {
  __resetRolloutsForTests,
  findRolloutForBooking,
  getRolloutById,
  getRolloutsForBuilding,
  rolloutSlotStatus,
  type RolloutDay,
  type RolloutSlot,
} from "./adminMockData";

afterEach(() => {
  __resetRolloutsForTests();
});

function timeBudgetSlot(overrides: Partial<RolloutSlot> = {}): RolloutSlot {
  return {
    id: "slot-am",
    window: "morning",
    windowMinutes: 240,
    bookedMinutes: 0,
    openByAdmin: true,
    ...overrides,
  };
}

function slotCountSlot(overrides: Partial<RolloutSlot> = {}): RolloutSlot {
  return {
    id: "slot-am",
    window: "morning",
    windowMinutes: 240,
    bookedMinutes: 0,
    slotCount: 4,
    bookedCount: 0,
    openByAdmin: true,
    ...overrides,
  };
}

function dayWith(slot: RolloutSlot, open = true): RolloutDay {
  return {
    isoDate: "2026-04-30",
    dayLabel: "30",
    weekdayLabel: "Thu",
    monthLabel: "Apr",
    open,
    morning: slot,
    afternoon: slot,
  };
}

describe("rolloutSlotStatus — time_budget_per_window mode", () => {
  it("returns 'available' when there is enough time budget left", () => {
    const slot = timeBudgetSlot({ bookedMinutes: 90 });
    expect(
      rolloutSlotStatus(dayWith(slot), slot, "time_budget_per_window", 45),
    ).toBe("available");
  });

  it("returns 'not_enough_time' when the remaining budget is less than the job length", () => {
    // 240 - 210 = 30 minutes left; a 45-min AC service no longer fits.
    const slot = timeBudgetSlot({ bookedMinutes: 210 });
    expect(
      rolloutSlotStatus(dayWith(slot), slot, "time_budget_per_window", 45),
    ).toBe("not_enough_time");
  });

  it("returns 'full' when the window is fully booked, regardless of job length", () => {
    const slot = timeBudgetSlot({ bookedMinutes: 240 });
    expect(
      rolloutSlotStatus(dayWith(slot), slot, "time_budget_per_window", 45),
    ).toBe("full");
  });

  it("returns 'not_yet_open' when the admin has not released the window", () => {
    const slot = timeBudgetSlot({ openByAdmin: false });
    expect(
      rolloutSlotStatus(dayWith(slot), slot, "time_budget_per_window", 45),
    ).toBe("not_yet_open");
  });

  it("returns 'not_yet_open' when the day itself is closed (e.g. weekend)", () => {
    const slot = timeBudgetSlot();
    expect(
      rolloutSlotStatus(
        dayWith(slot, /*open*/ false),
        slot,
        "time_budget_per_window",
        45,
      ),
    ).toBe("not_yet_open");
  });
});

describe("rolloutSlotStatus — slots_per_window mode", () => {
  it("returns 'available' when bookedCount < slotCount", () => {
    const slot = slotCountSlot({ slotCount: 4, bookedCount: 2 });
    expect(
      rolloutSlotStatus(dayWith(slot), slot, "slots_per_window", 45),
    ).toBe("available");
  });

  it("returns 'full' when every slot in the window is taken", () => {
    const slot = slotCountSlot({ slotCount: 4, bookedCount: 4 });
    expect(
      rolloutSlotStatus(dayWith(slot), slot, "slots_per_window", 45),
    ).toBe("full");
  });

  it("ignores the job-length parameter — fixed-count mode is one-slot-per-booking", () => {
    // A 9-hour service should still be bookable as long as a slot is free —
    // the slots_per_window model intentionally hides minute math from
    // both admins and customers.
    const slot = slotCountSlot({ slotCount: 4, bookedCount: 0 });
    expect(
      rolloutSlotStatus(dayWith(slot), slot, "slots_per_window", 540),
    ).toBe("available");
  });

  it("returns 'not_yet_open' when the slot is staged but unreleased", () => {
    const slot = slotCountSlot({ openByAdmin: false });
    expect(
      rolloutSlotStatus(dayWith(slot), slot, "slots_per_window", 45),
    ).toBe("not_yet_open");
  });
});

describe("rollout lookup helpers", () => {
  it("getRolloutById returns null for unknown / null IDs", () => {
    expect(getRolloutById(null)).toBeNull();
    expect(getRolloutById("rl-does-not-exist")).toBeNull();
  });

  it("getRolloutById returns the seeded Aspen rollout", () => {
    const r = getRolloutById("rl-ac-aspen");
    expect(r).not.toBeNull();
    expect(r?.serviceId).toBe("svc-ac");
    expect(r?.buildingId).toBe("bldg-aspen");
    expect(r?.capacityModel).toBe("time_budget_per_window");
  });

  it("getRolloutsForBuilding returns only the rollouts for that building", () => {
    const aspen = getRolloutsForBuilding("bldg-aspen");
    expect(aspen.map((r) => r.id)).toEqual(["rl-ac-aspen"]);

    const marine = getRolloutsForBuilding("bldg-marine");
    expect(marine.map((r) => r.id)).toEqual(["rl-ac-marine"]);
    expect(marine[0]?.capacityModel).toBe("slots_per_window");
  });

  it("getRolloutsForBuilding returns [] for buildings without a rollout (Anzac)", () => {
    expect(getRolloutsForBuilding("bldg-anzac")).toEqual([]);
  });

  it("findRolloutForBooking resolves a unit to its building's rollout", () => {
    // u1 is the first seeded Aspen unit → should resolve to rl-ac-aspen.
    const r = findRolloutForBooking("svc-ac", "u1");
    expect(r?.id).toBe("rl-ac-aspen");
  });

  it("findRolloutForBooking returns null for buildings with no rollout (Anzac)", () => {
    // Pick any Anzac unit — none should resolve since Anzac has no rollout.
    const r = findRolloutForBooking("svc-ac", "u-anzac-03");
    expect(r).toBeNull();
  });

  it("findRolloutForBooking returns null when the unit ID is null", () => {
    expect(findRolloutForBooking("svc-ac", null)).toBeNull();
  });
});
