/**
 * Unit tests for `slotIsAvailable` — the gate that decides whether
 * a window can accept a new booking under either scheduling mode.
 *
 * The actual customer-side slot picker (Tasks #27 / #29) computes its
 * own availability from sessionStorage; this helper is the contract
 * that the admin (and any future backend) would use when surfacing
 * "available / full" for a given booking attempt.
 */

import { afterEach, describe, expect, it } from "vitest";

import {
  __resetRolloutsForTests,
  consumeBookingCapacity,
  getActiveBookingForUnit,
  getRolloutById,
  releaseBookingCapacity,
  slotIsAvailable,
  type AdminBooking,
  type AdminSlot,
} from "./adminMockData";
import { getBookingDurationMinutes } from "./bookingDerived";

/** Build a fully-populated `AdminBooking` for unit tests. The fixture
 *  defaults to a paid, scheduled booking on the Aspen rollout so the
 *  capacity helpers have a real rollout to mutate. Override per-test
 *  via the `over` partial. */
function makeBooking(over: Partial<AdminBooking> = {}): AdminBooking {
  return {
    id: "bk-test",
    unitId: "u1",
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
    serviceDate: "2026-04-30",
    serviceSlot: "morning",
    paymentStatus: "paid",
    serviceStatus: "scheduled",
    totalAud: 179,
    paymentTimeline: [],
    serviceTimeline: [],
    notes: "",
    rolloutId: "rl-ac-aspen",
    ...over,
  };
}

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

// ─── Uniqueness gate (Task #49) ─────────────────────────────────────────────
//
// `getActiveBookingForUnit` is the customer-flow uniqueness gate: at
// the unit picker (up-front) and again at submit (transactional), it
// answers "is this unit free on this rollout?". The four branches —
// none / paid / invoice_pending / cancelled-ignored — together pin the
// "one confirmed booking per unit per service rollout" rule.

describe("getActiveBookingForUnit — Task #49 uniqueness gate", () => {
  it("returns 'none' when no bookings match the unit", () => {
    const v = getActiveBookingForUnit("u-empty", [], "rl-ac-aspen");
    expect(v.kind).toBe("none");
  });

  it("returns 'paid' when a paid booking exists on the same rollout", () => {
    const paid = makeBooking({ id: "bk-paid", paymentStatus: "paid" });
    const v = getActiveBookingForUnit("u1", [paid], "rl-ac-aspen");
    expect(v.kind).toBe("paid");
    if (v.kind === "paid") expect(v.booking.id).toBe("bk-paid");
  });

  it("returns 'invoice_pending' when only a pending booking exists", () => {
    const pending = makeBooking({
      id: "bk-pending",
      paymentStatus: "pending",
    });
    const v = getActiveBookingForUnit("u1", [pending], "rl-ac-aspen");
    expect(v.kind).toBe("invoice_pending");
    if (v.kind === "invoice_pending") {
      expect(v.booking.id).toBe("bk-pending");
    }
  });

  it("prefers a paid booking over a concurrent pending one", () => {
    const pending = makeBooking({
      id: "bk-pending",
      paymentStatus: "pending",
    });
    const paid = makeBooking({ id: "bk-paid", paymentStatus: "paid" });
    const v = getActiveBookingForUnit(
      "u1",
      [pending, paid],
      "rl-ac-aspen",
    );
    expect(v.kind).toBe("paid");
  });

  it("ignores cancelled bookings entirely", () => {
    const cancelled = makeBooking({
      id: "bk-cancelled",
      serviceStatus: "cancelled",
      paymentStatus: "paid",
    });
    const v = getActiveBookingForUnit(
      "u1",
      [cancelled],
      "rl-ac-aspen",
    );
    expect(v.kind).toBe("none");
  });

  it("ignores bookings on a different rollout (same unit)", () => {
    // Same unit, but the booking lives on a different rollout —
    // shouldn't block a new booking on this one.
    const onOther = makeBooking({
      id: "bk-other-rollout",
      rolloutId: "rl-ac-marine",
      paymentStatus: "paid",
    });
    const v = getActiveBookingForUnit(
      "u1",
      [onOther],
      "rl-ac-aspen",
    );
    expect(v.kind).toBe("none");
  });

  it("returns 'none' when rolloutId is null (legacy unit with no rollout)", () => {
    const paid = makeBooking({ paymentStatus: "paid" });
    const v = getActiveBookingForUnit("u1", [paid], null);
    expect(v.kind).toBe("none");
  });
});

// ─── Capacity mutators (Task #49) ───────────────────────────────────────────
//
// release/consume mutate the module-level rollouts store. Tests reset
// it after each case so cross-test interference can't cause flakes.

describe("releaseBookingCapacity / consumeBookingCapacity — Task #49", () => {
  afterEach(() => __resetRolloutsForTests());

  it("releaseBookingCapacity decrements time_budget by job duration", () => {
    // Aspen 4/30 morning is seeded at bookedMinutes=165. A 1-system
    // booking (45 min) in that window should drop it back to 120.
    const before = getRolloutById("rl-ac-aspen");
    const beforeMin = before!.days.find((d) => d.isoDate === "2026-04-30")!
      .morning.bookedMinutes;
    expect(beforeMin).toBe(165);

    const ok = releaseBookingCapacity(
      makeBooking({ serviceDate: "2026-04-30", serviceSlot: "morning" }),
    );
    expect(ok).toBe(true);

    const after = getRolloutById("rl-ac-aspen");
    expect(
      after!.days.find((d) => d.isoDate === "2026-04-30")!.morning
        .bookedMinutes,
    ).toBe(120);
  });

  it("releaseBookingCapacity decrements slots_per_window by 1", () => {
    // Marine 4/30 PM is seeded at bookedCount=1, but afternoonOpen=false
    // — closure doesn't matter for capacity mutation, only for the
    // customer picker. Use 4/27 PM (bookedCount=1) to be unambiguous.
    const before = getRolloutById("rl-ac-marine");
    expect(
      before!.days.find((d) => d.isoDate === "2026-04-27")!.afternoon
        .bookedCount,
    ).toBe(1);

    const ok = releaseBookingCapacity(
      makeBooking({
        rolloutId: "rl-ac-marine",
        serviceDate: "2026-04-27",
        serviceSlot: "afternoon",
      }),
    );
    expect(ok).toBe(true);

    const after = getRolloutById("rl-ac-marine");
    expect(
      after!.days.find((d) => d.isoDate === "2026-04-27")!.afternoon
        .bookedCount,
    ).toBe(0);
  });

  it("releaseBookingCapacity clamps at 0 (never goes negative)", () => {
    // Drop the same Marine slot to 0, then call again — should stay
    // at 0 rather than wrap negative, even though the helper still
    // returns true (it found a real rollout/day/slot to mutate).
    const b = makeBooking({
      rolloutId: "rl-ac-marine",
      serviceDate: "2026-04-27",
      serviceSlot: "afternoon",
    });
    releaseBookingCapacity(b);
    releaseBookingCapacity(b);
    const after = getRolloutById("rl-ac-marine");
    expect(
      after!.days.find((d) => d.isoDate === "2026-04-27")!.afternoon
        .bookedCount,
    ).toBe(0);
  });

  it("releaseBookingCapacity is a safe no-op for coordination bookings", () => {
    const ok = releaseBookingCapacity(
      makeBooking({ rolloutId: null, serviceSlot: "to_be_coordinated" }),
    );
    expect(ok).toBe(false);
  });

  it("consumeBookingCapacity increments time_budget by job duration", () => {
    // Aspen 5/2 morning is seeded at 120 min. Adding a 90-min job
    // (2 systems, 0 extra) should bump it to 210.
    const before = getRolloutById("rl-ac-aspen");
    expect(
      before!.days.find((d) => d.isoDate === "2026-05-02")!.morning
        .bookedMinutes,
    ).toBe(120);

    const b = makeBooking({ systems: 2, additional: 0 });
    const ok = consumeBookingCapacity(
      b,
      "rl-ac-aspen",
      "2026-05-02",
      "morning",
    );
    expect(ok).toBe(true);
    const after = getRolloutById("rl-ac-aspen");
    expect(
      after!.days.find((d) => d.isoDate === "2026-05-02")!.morning
        .bookedMinutes,
    ).toBe(210);
  });

  it("release + consume on different slots = full reschedule round-trip", () => {
    // Move a 45-min booking from Aspen 4/30 morning (165→120) to
    // Aspen 5/4 afternoon (60→105). Pins the symmetry the
    // Reschedule modal relies on.
    const b = makeBooking({ serviceDate: "2026-04-30", serviceSlot: "morning" });
    releaseBookingCapacity(b);
    consumeBookingCapacity(
      { ...b, serviceDate: "2026-05-04", serviceSlot: "afternoon" },
      "rl-ac-aspen",
      "2026-05-04",
      "afternoon",
    );
    const r = getRolloutById("rl-ac-aspen")!;
    expect(
      r.days.find((d) => d.isoDate === "2026-04-30")!.morning.bookedMinutes,
    ).toBe(120);
    expect(
      r.days.find((d) => d.isoDate === "2026-05-04")!.afternoon
        .bookedMinutes,
    ).toBe(105);
  });
});
