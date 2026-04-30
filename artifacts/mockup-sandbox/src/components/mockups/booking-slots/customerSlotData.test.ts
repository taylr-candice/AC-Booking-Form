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
} from "../../../state/adminMockData";

import { resolveCustomerSlotData } from "./customerSlotData";

afterEach(() => {
  __resetRolloutsForTests();
});

// 45 minutes is the seeded standard service length — small enough that
// every window in the seed registers as `available` so we can assert on
// the time label irrespective of capacity status.
const STD_JOB_MIN = 45;

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
