/**
 * Customer-side rendering of per-rollout window times (Task #123).
 *
 * Two seeded buildings (Aspen and Marine) carry visibly different
 * `windowDefaults`. The customer slot picker reads each rollout's own
 * resolved range via `resolveSlotTimes`, so two units placed against
 * the two rollouts must surface two different `timeLabel` strings on
 * the same window. These tests pin that contract end-to-end so a
 * regression that hard-codes a global time table fails loudly.
 */

import { afterEach, describe, expect, it } from "vitest";

import {
  __resetRolloutsForTests,
  setRolloutSlotTimeOverride,
  setRolloutWindowDefault,
  type RolloutSlotStatus,
} from "../../../state/adminMockData";

import {
  getVisibleServiceDays,
  getVisibleWindowsForDay,
  resolveCustomerSlotData,
  type CustomerDay,
  type CustomerSlot,
} from "./customerSlotData";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeSlot(
  window: CustomerSlot["window"],
  status: RolloutSlotStatus,
  id?: string,
): CustomerSlot {
  return {
    id: id ?? `slot-${window}`,
    window,
    windowMinutes: 270,
    bookedMinutes: 0,
    status,
    startTime: "08:00",
    endTime: "12:30",
    timeLabel: "8am – 12:30pm",
  };
}

function makeDay(
  morning: RolloutSlotStatus,
  afternoon: RolloutSlotStatus,
  evening?: RolloutSlotStatus,
  date = "2026-05-10",
): CustomerDay {
  const day: CustomerDay = {
    date,
    weekday: "SUN",
    day: 10,
    month: "MAY",
    morning: makeSlot("morning", morning, `m-${date}`),
    afternoon: makeSlot("afternoon", afternoon, `a-${date}`),
  };
  if (evening !== undefined) {
    day.evening = makeSlot("evening", evening, `e-${date}`);
  }
  return day;
}

afterEach(() => {
  __resetRolloutsForTests();
});

// 45 minutes is the seeded standard service length — small enough that
// every window in the seed registers as `available` so we can assert on
// the time label irrespective of capacity status.
const STD_JOB_MIN = 45;

// ─── getVisibleServiceDays ───────────────────────────────────────────────────

describe("getVisibleServiceDays", () => {
  it("hides a day where all windows are full", () => {
    const days = [makeDay("full", "full")];
    expect(getVisibleServiceDays(days)).toHaveLength(0);
  });

  it("hides a day where windows are not_enough_time / not_yet_open", () => {
    const days = [makeDay("not_enough_time", "not_yet_open")];
    expect(getVisibleServiceDays(days)).toHaveLength(0);
  });

  it("shows a day that has at least one available morning window", () => {
    const days = [makeDay("available", "full")];
    expect(getVisibleServiceDays(days)).toHaveLength(1);
  });

  it("shows a day that has at least one available afternoon window", () => {
    const days = [makeDay("full", "available")];
    expect(getVisibleServiceDays(days)).toHaveLength(1);
  });

  it("shows a day where only the evening window is available", () => {
    const days = [makeDay("full", "full", "available")];
    expect(getVisibleServiceDays(days)).toHaveLength(1);
  });

  it("passes through all-available days unchanged", () => {
    const days = [
      makeDay("available", "available", undefined, "2026-05-10"),
      makeDay("available", "available", undefined, "2026-05-11"),
    ];
    expect(getVisibleServiceDays(days)).toHaveLength(2);
  });

  it("filters mixed list correctly — only available days survive", () => {
    const days = [
      makeDay("full", "full", undefined, "2026-05-10"),
      makeDay("available", "full", undefined, "2026-05-11"),
      makeDay("full", "full", undefined, "2026-05-12"),
      makeDay("full", "available", undefined, "2026-05-13"),
    ];
    const result = getVisibleServiceDays(days);
    expect(result).toHaveLength(2);
    expect(result.map((d) => d.date)).toEqual(["2026-05-11", "2026-05-13"]);
  });

  it("returns empty array when all days are fully booked", () => {
    const days = [
      makeDay("full", "full", undefined, "2026-05-10"),
      makeDay("full", "full", undefined, "2026-05-11"),
    ];
    expect(getVisibleServiceDays(days)).toHaveLength(0);
  });

  it("returns empty array when given an empty list", () => {
    expect(getVisibleServiceDays([])).toHaveLength(0);
  });
});

// ─── getVisibleWindowsForDay ─────────────────────────────────────────────────

describe("getVisibleWindowsForDay", () => {
  it("returns no windows when all are full", () => {
    const day = makeDay("full", "full");
    expect(getVisibleWindowsForDay(day)).toHaveLength(0);
  });

  it("returns only the morning window when afternoon is full", () => {
    const day = makeDay("available", "full");
    const result = getVisibleWindowsForDay(day);
    expect(result).toHaveLength(1);
    expect(result[0]!.window).toBe("morning");
  });

  it("returns only the afternoon window when morning is full", () => {
    const day = makeDay("full", "available");
    const result = getVisibleWindowsForDay(day);
    expect(result).toHaveLength(1);
    expect(result[0]!.window).toBe("afternoon");
  });

  it("returns morning and afternoon when both are available (no evening)", () => {
    const day = makeDay("available", "available");
    const result = getVisibleWindowsForDay(day);
    expect(result).toHaveLength(2);
    expect(result.map((w) => w.window)).toEqual(["morning", "afternoon"]);
  });

  it("includes evening when it is available", () => {
    const day = makeDay("full", "full", "available");
    const result = getVisibleWindowsForDay(day);
    expect(result).toHaveLength(1);
    expect(result[0]!.window).toBe("evening");
  });

  it("returns all three windows when morning, afternoon and evening are available", () => {
    const day = makeDay("available", "available", "available");
    const result = getVisibleWindowsForDay(day);
    expect(result).toHaveLength(3);
    expect(result.map((w) => w.window)).toEqual([
      "morning",
      "afternoon",
      "evening",
    ]);
  });

  it("omits evening when it is not_yet_open even though morning/afternoon available", () => {
    const day = makeDay("available", "available", "not_yet_open");
    const result = getVisibleWindowsForDay(day);
    expect(result).toHaveLength(2);
    expect(result.map((w) => w.window)).toEqual(["morning", "afternoon"]);
  });
});

// ─── resolveCustomerSlotData — per-rollout time labels ───────────────────────

describe("resolveCustomerSlotData — per-rollout time labels", () => {
  it("two rollouts side by side render different morning/evening labels", () => {
    // u1 → Aspen (morning 8:00–12:30), u-marine-04 → Marine (7:30–12:00).
    const aspen = resolveCustomerSlotData("u1", STD_JOB_MIN);
    const marine = resolveCustomerSlotData("u-marine-04", STD_JOB_MIN);

    expect(aspen.rollout?.id).toBe("rl-ac-aspen");
    expect(marine.rollout?.id).toBe("rl-ac-marine");

    const aspenMorning = aspen.days[0]!.morning;
    const marineMorning = marine.days[0]!.morning;
    expect(aspenMorning.timeLabel).toBe("8am – 12:30pm");
    expect(marineMorning.timeLabel).toBe("7:30am – 12pm");
    // The 24h start times the editor stores must round-trip too.
    expect(aspenMorning.startTime).toBe("08:00");
    expect(marineMorning.startTime).toBe("07:30");
  });

  it("falls back to the rollout default when a slot has no per-day override", () => {
    const data = resolveCustomerSlotData("u1", STD_JOB_MIN);
    // None of the seeded Aspen days carry a morning override, so every
    // released morning slot should match the rollout default.
    for (const day of data.days) {
      expect(day.morning.startTime).toBe("08:00");
      expect(day.morning.endTime).toBe("12:30");
    }
  });

  it("a per-day override wins over the rollout default for that one slot only", () => {
    const data0 = resolveCustomerSlotData("u1", STD_JOB_MIN);
    const targetDate = data0.days[0]!.date;

    setRolloutSlotTimeOverride("rl-ac-aspen", targetDate, "morning", {
      start: "10:00",
      end: "13:00",
    });

    const data1 = resolveCustomerSlotData("u1", STD_JOB_MIN);
    const overridden = data1.days.find((d) => d.date === targetDate)!.morning;
    expect(overridden.timeLabel).toBe("10am – 1pm");

    // Every other day still reflects the rollout default.
    const otherDay = data1.days.find((d) => d.date !== targetDate)!;
    expect(otherDay.morning.startTime).toBe("08:00");
  });

  it("editing the rollout default propagates to every non-overridden day immediately", () => {
    const before = resolveCustomerSlotData("u1", STD_JOB_MIN);
    expect(before.days[0]!.morning.startTime).toBe("08:00");

    setRolloutWindowDefault("rl-ac-aspen", "morning", {
      start: "06:00",
      end: "11:00",
    });

    const after = resolveCustomerSlotData("u1", STD_JOB_MIN);
    for (const day of after.days) {
      expect(day.morning.startTime).toBe("06:00");
      expect(day.morning.endTime).toBe("11:00");
    }
  });
});
