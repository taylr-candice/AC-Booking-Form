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

// ─── Per-rollout window times + release ladder (Task #123) ─────────────────

import {
  consumeBookingCapacity,
  evaluateAutoRelease,
  formatSlotTimeRange,
  isSlotTimeOverridden,
  releaseNextBatchManual,
  releasedSlots,
  resolveSlotTimes,
  setRolloutReleaseStrategy,
  setRolloutSlotTimeOverride,
  setRolloutWindowDefault,
  shouldNudgeManualRelease,
  slotFillRatio,
  stagedSlotsChrono,
  updateRolloutSlot,
  SEEDED_BOOKINGS,
  type AdminBooking,
} from "./adminMockData";

function bookingFor(rolloutId: string): AdminBooking {
  // Re-use a seeded booking and just point it at the rollout under
  // test. We only need the shape (`acType`, `systems`, etc.) for
  // `bookingDurationMinutes` to work — every other field is ignored
  // by `consumeBookingCapacity`.
  const b = SEEDED_BOOKINGS.find((x) => x.acType !== "unsure");
  if (!b) throw new Error("Expected a seeded booking with a known acType");
  return { ...b, rolloutId };
}

describe("per-rollout window defaults — Task #123", () => {
  it("seeded Aspen / Marine / Bourke each carry distinct window defaults", () => {
    const aspen = getRolloutById("rl-ac-aspen")!;
    const marine = getRolloutById("rl-ac-marine")!;
    const bourke = getRolloutById("rl-ac-bourke")!;
    expect(aspen.windowDefaults.morning.start).toBe("08:00");
    expect(marine.windowDefaults.morning.start).toBe("07:30");
    expect(bourke.windowDefaults.morning.start).toBe("09:00");
  });

  it("setRolloutWindowDefault round-trips for every window", () => {
    setRolloutWindowDefault("rl-ac-aspen", "morning", {
      start: "06:00",
      end: "11:00",
    });
    const r = getRolloutById("rl-ac-aspen")!;
    expect(r.windowDefaults.morning).toEqual({ start: "06:00", end: "11:00" });
  });

  it("resolveSlotTimes falls back to the rollout default when the slot has no override", () => {
    const r = getRolloutById("rl-ac-marine")!;
    const day = r.days[0]!;
    const range = resolveSlotTimes(r, day.morning);
    expect(range.start).toBe(r.windowDefaults.morning.start);
    expect(range.end).toBe(r.windowDefaults.morning.end);
  });

  it("resolveSlotTimes returns the override when the slot has one", () => {
    const r = getRolloutById("rl-ac-marine")!;
    const day = r.days[0]!;
    setRolloutSlotTimeOverride("rl-ac-marine", day.isoDate, "morning", {
      start: "10:00",
      end: "14:00",
    });
    const r2 = getRolloutById("rl-ac-marine")!;
    const day2 = r2.days[0]!;
    expect(isSlotTimeOverridden(day2.morning)).toBe(true);
    expect(resolveSlotTimes(r2, day2.morning)).toEqual({
      start: "10:00",
      end: "14:00",
    });
  });

  it("clearing a slot override (passing null) snaps back to the rollout default", () => {
    const r = getRolloutById("rl-ac-marine")!;
    const day = r.days[0]!;
    setRolloutSlotTimeOverride("rl-ac-marine", day.isoDate, "morning", {
      start: "10:00",
      end: "14:00",
    });
    setRolloutSlotTimeOverride("rl-ac-marine", day.isoDate, "morning", null);
    const r2 = getRolloutById("rl-ac-marine")!;
    const day2 = r2.days[0]!;
    expect(isSlotTimeOverridden(day2.morning)).toBe(false);
    expect(resolveSlotTimes(r2, day2.morning).start).toBe(
      r2.windowDefaults.morning.start,
    );
  });

  it("changing the default leaves an existing slot override untouched", () => {
    const r = getRolloutById("rl-ac-marine")!;
    const day = r.days[0]!;
    setRolloutSlotTimeOverride("rl-ac-marine", day.isoDate, "morning", {
      start: "10:00",
      end: "14:00",
    });
    setRolloutWindowDefault("rl-ac-marine", "morning", {
      start: "06:00",
      end: "11:00",
    });
    const r2 = getRolloutById("rl-ac-marine")!;
    const day2 = r2.days[0]!;
    expect(resolveSlotTimes(r2, day2.morning)).toEqual({
      start: "10:00",
      end: "14:00",
    });
    // And every non-overridden day picks up the new default.
    const otherDay = r2.days.find(
      (d) => d.isoDate !== day.isoDate && d.morning.openByAdmin,
    )!;
    expect(resolveSlotTimes(r2, otherDay.morning).start).toBe("06:00");
  });

  it("formatSlotTimeRange renders the customer-facing label using the resolved range", () => {
    const r = getRolloutById("rl-ac-aspen")!;
    const day = r.days[0]!;
    expect(formatSlotTimeRange(r, day.morning)).toBe("8am – 12:30pm");
  });
});

describe("release strategy — Task #123", () => {
  it("manual release flips exactly one staged batch (days mode, batchSize 2)", () => {
    setRolloutReleaseStrategy("rl-ac-aspen", {
      mode: "manual_nudge",
      unit: "days",
      batchSize: 2,
    });
    const stagedBefore = stagedSlotsChrono(getRolloutById("rl-ac-aspen")!);
    const stagedDays = new Set(stagedBefore.map((s) => s.day.isoDate));
    expect(stagedDays.size).toBeGreaterThan(0);
    const flipped = releaseNextBatchManual("rl-ac-aspen");
    expect(flipped.length).toBeGreaterThan(0);
    const flippedDays = new Set(flipped.map((f) => f.isoDate));
    // batchSize = 2 → at most 2 distinct days; possibly fewer if the
    // staged set was thinner than the batch.
    expect(flippedDays.size).toBeLessThanOrEqual(2);
    for (const d of flippedDays) {
      expect(stagedDays.has(d)).toBe(true);
    }
    const r2 = getRolloutById("rl-ac-aspen")!;
    expect(r2.releaseStrategy.audit[0]?.by).toBe("admin");
    expect(r2.releaseStrategy.audit[0]?.trigger).toBe("manual");
  });

  it("manual release works regardless of mode (auto_when_full)", () => {
    setRolloutReleaseStrategy("rl-ac-aspen", { mode: "auto_when_full" });
    const before = stagedSlotsChrono(getRolloutById("rl-ac-aspen")!).length;
    const flipped = releaseNextBatchManual("rl-ac-aspen");
    expect(flipped.length).toBeGreaterThan(0);
    const after = stagedSlotsChrono(getRolloutById("rl-ac-aspen")!).length;
    expect(after).toBeLessThan(before);
  });

  it("manual release returns [] when there is nothing staged left to flip", () => {
    // Drain the staged set first by calling the manual release in a
    // wide batch, then assert a follow-up call no-ops.
    setRolloutReleaseStrategy("rl-ac-aspen", {
      mode: "manual_nudge",
      unit: "windows",
      batchSize: 99,
    });
    releaseNextBatchManual("rl-ac-aspen");
    expect(stagedSlotsChrono(getRolloutById("rl-ac-aspen")!)).toEqual([]);
    const auditBefore = getRolloutById("rl-ac-aspen")!.releaseStrategy.audit.length;
    const flipped = releaseNextBatchManual("rl-ac-aspen");
    expect(flipped).toEqual([]);
    const auditAfter = getRolloutById("rl-ac-aspen")!.releaseStrategy.audit.length;
    expect(auditAfter).toBe(auditBefore);
  });

  it("evaluateAutoRelease is a no-op for manual_nudge mode even when released slots are full", () => {
    const r = getRolloutById("rl-ac-bourke")!;
    expect(r.releaseStrategy.mode).toBe("manual_nudge");
    // Force every released slot to 100% by setting bookedMinutes to
    // windowMinutes — the evaluator must NOT flip in manual mode.
    for (const rs of releasedSlots(r)) {
      updateRolloutSlot(r.id, rs.day.isoDate, rs.window, {
        bookedMinutes: rs.slot.windowMinutes,
      });
    }
    const flipped = evaluateAutoRelease(r.id);
    expect(flipped).toEqual([]);
  });

  it("auto_when_full flips the next batch once every released slot is full", () => {
    setRolloutReleaseStrategy("rl-ac-aspen", {
      mode: "auto_when_full",
      unit: "days",
      batchSize: 1,
    });
    const r = getRolloutById("rl-ac-aspen")!;
    const stagedBefore = stagedSlotsChrono(r).length;
    expect(stagedBefore).toBeGreaterThan(0);
    // Saturate every released slot so the trigger fires.
    for (const rs of releasedSlots(r)) {
      updateRolloutSlot(r.id, rs.day.isoDate, rs.window, {
        bookedMinutes: rs.slot.windowMinutes,
      });
    }
    const flipped = evaluateAutoRelease(r.id);
    expect(flipped.length).toBeGreaterThan(0);
    const r2 = getRolloutById("rl-ac-aspen")!;
    expect(r2.releaseStrategy.audit[0]?.by).toBe("system");
    expect(r2.releaseStrategy.audit[0]?.trigger).toBe("auto_full");
    expect(r2.releaseStrategy.hasUnseenAuto).toBe(true);
  });

  it("auto_at_threshold flips when every released slot crosses the threshold", () => {
    setRolloutReleaseStrategy("rl-ac-aspen", {
      mode: "auto_at_threshold",
      thresholdPct: 80,
      unit: "days",
      batchSize: 1,
    });
    const r = getRolloutById("rl-ac-aspen")!;
    // Bring every released slot to ≥80% — short of full, but past
    // the threshold. The trigger should still fire.
    for (const rs of releasedSlots(r)) {
      updateRolloutSlot(r.id, rs.day.isoDate, rs.window, {
        bookedMinutes: Math.ceil(rs.slot.windowMinutes * 0.85),
      });
    }
    const flipped = evaluateAutoRelease(r.id);
    expect(flipped.length).toBeGreaterThan(0);
    const r2 = getRolloutById("rl-ac-aspen")!;
    expect(r2.releaseStrategy.audit[0]?.trigger).toBe("auto_threshold");
  });

  it("a booking confirm that fills the released set re-evaluates and may flip the next batch", () => {
    setRolloutReleaseStrategy("rl-ac-marine", {
      mode: "auto_when_full",
      unit: "windows",
      batchSize: 1,
    });
    // Stage every released window except one so the next consume
    // saturates the released set.
    const r0 = getRolloutById("rl-ac-marine")!;
    const released = releasedSlots(r0);
    expect(released.length).toBeGreaterThan(0);
    // Re-stage all but the first released window.
    for (let i = 1; i < released.length; i++) {
      const rs = released[i]!;
      updateRolloutSlot(r0.id, rs.day.isoDate, rs.window, {
        openByAdmin: false,
      });
    }
    const target = released[0]!;
    // Pre-fill the one remaining released slot so the next single
    // booking lands it at capacity.
    updateRolloutSlot(r0.id, target.day.isoDate, target.window, {
      bookedCount: (target.slot.slotCount ?? 1) - 1,
    });
    const stagedBeforeConsume = stagedSlotsChrono(getRolloutById("rl-ac-marine")!).length;
    consumeBookingCapacity(
      bookingFor("rl-ac-marine"),
      "rl-ac-marine",
      target.day.isoDate,
      target.window,
    );
    const stagedAfter = stagedSlotsChrono(getRolloutById("rl-ac-marine")!).length;
    // Auto-flip should have released exactly one more window.
    expect(stagedAfter).toBe(stagedBeforeConsume - 1);
    const r2 = getRolloutById("rl-ac-marine")!;
    expect(r2.releaseStrategy.audit[0]?.by).toBe("system");
  });

  it("by-windows release flips the next N staged windows in chronological order", () => {
    setRolloutReleaseStrategy("rl-ac-aspen", {
      mode: "manual_nudge",
      unit: "windows",
      batchSize: 2,
    });
    const stagedBefore = stagedSlotsChrono(getRolloutById("rl-ac-aspen")!);
    const expectedFirstTwo = stagedBefore.slice(0, 2).map((s) => ({
      isoDate: s.day.isoDate,
      window: s.window,
    }));
    const flipped = releaseNextBatchManual("rl-ac-aspen");
    expect(flipped.length).toBe(2);
    expect(flipped).toEqual(expectedFirstTwo);
  });

  it("shouldNudgeManualRelease only fires for manual_nudge with released ≥80% and staged left", () => {
    // Bourke is manual_nudge by seed and starts well below threshold → no nudge.
    expect(shouldNudgeManualRelease(getRolloutById("rl-ac-bourke")!)).toBe(false);

    // Saturate every released window — staged set still has things → nudge fires.
    const r = getRolloutById("rl-ac-bourke")!;
    for (const rs of releasedSlots(r)) {
      updateRolloutSlot(r.id, rs.day.isoDate, rs.window, {
        bookedMinutes: rs.slot.windowMinutes,
      });
    }
    expect(shouldNudgeManualRelease(getRolloutById("rl-ac-bourke")!)).toBe(true);

    // Switching off manual mode silences the nudge even when saturation persists.
    setRolloutReleaseStrategy("rl-ac-bourke", { mode: "auto_when_full" });
    expect(shouldNudgeManualRelease(getRolloutById("rl-ac-bourke")!)).toBe(false);
  });

  it("slotFillRatio handles both capacity models without divide-by-zero", () => {
    expect(
      slotFillRatio(
        slotCountSlot({ slotCount: 0, bookedCount: 0 }),
        "slots_per_window",
      ),
    ).toBe(0);
    expect(
      slotFillRatio(
        timeBudgetSlot({ windowMinutes: 0, bookedMinutes: 0 }),
        "time_budget_per_window",
      ),
    ).toBe(0);
    expect(
      slotFillRatio(
        slotCountSlot({ slotCount: 4, bookedCount: 2 }),
        "slots_per_window",
      ),
    ).toBeCloseTo(0.5);
  });
});

// ─── Architect follow-ups: undo, threshold negatives, clone isolation ──────

import { popLatestReleaseAuditEvent } from "./adminMockData";

describe("manual release undo round-trip — Task #123", () => {
  it("popLatestReleaseAuditEvent + re-stage drops the audit row and visually returns the rollout to the pre-release state", () => {
    setRolloutReleaseStrategy("rl-ac-aspen", {
      mode: "manual_nudge",
      unit: "windows",
      batchSize: 2,
    });
    const stagedBefore = stagedSlotsChrono(getRolloutById("rl-ac-aspen")!).length;
    const auditBefore = getRolloutById("rl-ac-aspen")!.releaseStrategy.audit.length;

    const flipped = releaseNextBatchManual("rl-ac-aspen");
    expect(flipped.length).toBe(2);
    expect(getRolloutById("rl-ac-aspen")!.releaseStrategy.audit.length).toBe(
      auditBefore + 1,
    );

    // Undo: re-stage every flipped window then pop the audit row.
    for (const f of flipped) {
      updateRolloutSlot("rl-ac-aspen", f.isoDate, f.window!, {
        openByAdmin: false,
      });
    }
    popLatestReleaseAuditEvent("rl-ac-aspen");

    const r = getRolloutById("rl-ac-aspen")!;
    expect(r.releaseStrategy.audit.length).toBe(auditBefore);
    expect(stagedSlotsChrono(r).length).toBe(stagedBefore);
  });

  it("popLatestReleaseAuditEvent is a safe no-op when the audit list is empty", () => {
    expect(getRolloutById("rl-ac-marine")!.releaseStrategy.audit).toEqual([]);
    expect(() => popLatestReleaseAuditEvent("rl-ac-marine")).not.toThrow();
    expect(getRolloutById("rl-ac-marine")!.releaseStrategy.audit).toEqual([]);
  });

  it("popLatestReleaseAuditEvent on an unknown rollout id is a no-op", () => {
    expect(() => popLatestReleaseAuditEvent("rl-does-not-exist")).not.toThrow();
  });
});

describe("auto-release negative cases — Task #123", () => {
  it("auto_when_full does NOT flip when even one released slot is below capacity", () => {
    setRolloutReleaseStrategy("rl-ac-aspen", {
      mode: "auto_when_full",
      unit: "days",
      batchSize: 1,
    });
    const r = getRolloutById("rl-ac-aspen")!;
    const released = releasedSlots(r);
    expect(released.length).toBeGreaterThan(1);
    // Saturate everything except the very first released slot.
    for (let i = 1; i < released.length; i++) {
      const rs = released[i]!;
      updateRolloutSlot(r.id, rs.day.isoDate, rs.window, {
        bookedMinutes: rs.slot.windowMinutes,
      });
    }
    expect(evaluateAutoRelease(r.id)).toEqual([]);
  });

  it("auto_at_threshold does NOT flip when one released slot is below the configured threshold", () => {
    setRolloutReleaseStrategy("rl-ac-aspen", {
      mode: "auto_at_threshold",
      thresholdPct: 80,
      unit: "days",
      batchSize: 1,
    });
    const r = getRolloutById("rl-ac-aspen")!;
    const released = releasedSlots(r);
    expect(released.length).toBeGreaterThan(1);
    // Bring all-but-one above 80%, leave one at 50%.
    for (let i = 1; i < released.length; i++) {
      const rs = released[i]!;
      updateRolloutSlot(r.id, rs.day.isoDate, rs.window, {
        bookedMinutes: Math.ceil(rs.slot.windowMinutes * 0.85),
      });
    }
    const cold = released[0]!;
    updateRolloutSlot(r.id, cold.day.isoDate, cold.window, {
      bookedMinutes: Math.floor(cold.slot.windowMinutes * 0.5),
    });
    expect(evaluateAutoRelease(r.id)).toEqual([]);
  });
});

describe("rollout store immutability — Task #123", () => {
  it("__resetRolloutsForTests deep-clones audit released entries (no shared references across tests)", () => {
    setRolloutReleaseStrategy("rl-ac-aspen", {
      mode: "manual_nudge",
      unit: "windows",
      batchSize: 1,
    });
    releaseNextBatchManual("rl-ac-aspen");
    const auditA = getRolloutById("rl-ac-aspen")!.releaseStrategy.audit[0]!;
    const releasedRefBefore = auditA.released[0]!;

    __resetRolloutsForTests();
    setRolloutReleaseStrategy("rl-ac-aspen", {
      mode: "manual_nudge",
      unit: "windows",
      batchSize: 1,
    });
    releaseNextBatchManual("rl-ac-aspen");
    const auditB = getRolloutById("rl-ac-aspen")!.releaseStrategy.audit[0]!;
    const releasedRefAfter = auditB.released[0]!;

    // Even when the seed serializes to identical content, the cloned
    // objects must be distinct references — otherwise mutations in one
    // test bleed into another.
    expect(releasedRefAfter).not.toBe(releasedRefBefore);
  });

  it("setRolloutWindowDefault produces a fresh rollout reference each call", () => {
    const before = getRolloutById("rl-ac-aspen");
    setRolloutWindowDefault("rl-ac-aspen", "morning", {
      start: "09:30",
      end: "12:30",
    });
    const after = getRolloutById("rl-ac-aspen");
    expect(after).not.toBe(before);
    expect(after?.windowDefaults.morning).not.toBe(before?.windowDefaults.morning);
  });
});
