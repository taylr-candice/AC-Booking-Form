/**
 * Regression checks for the new 5-step flow's derived selectors.
 *
 * These rules are easy to break by accident; lock them in:
 *
 *   1. The Step 1 "Continue" button stays disabled until property + role
 *      + complete contact details (and agency for agents) are provided.
 *      (`canContinueStep1`)
 *   2. Picking a coordination access method makes the on-page step
 *      counter switch to "of 4" and skips the Slots step (Step 4).
 *      (`totalSteps` / `visibleSteps`)
 */

import { describe, expect, it } from "vitest";

import {
  canContinueStep1,
  formatDurationMinutes,
  getBookingDurationMinutes,
  isCoordinationFlow,
  MINUTES_PER_ADDITIONAL_INDOOR,
  MINUTES_PER_SYSTEM,
  nextStepId,
  prevStepId,
  slotFitStatus,
  totalSteps,
  UNSURE_FALLBACK_MINUTES,
  visibleIndex,
  visibleSteps,
} from "./bookingDerived";
import {
  COORDINATION_ACCESS_METHODS,
  type AccessMethod,
  type StepId,
} from "./bookingSession";
import { OTHER_AGENCY_ID } from "./accessMethodCatalog";

/** Baseline of valid contact details so each test only has to express
 *  what it cares about (the field under test) rather than re-spelling
 *  the full happy-path payload. */
const validContact = {
  contact_first_name: "Ada",
  contact_last_name: "Lovelace",
  contact_email: "ada@example.com",
  contact_phone: "0412345678",
};

/** Step 1 args for an owner with valid contact (no agency required). */
const ownerComplete = {
  unit_id: "u1",
  role: "owner" as const,
  agency_id: null,
  agency_other_name: "",
  ...validContact,
};

/** Step 1 args for an agent with valid contact + a real (non-Other) agency. */
const agentComplete = {
  unit_id: "u1",
  role: "agent" as const,
  agency_id: "agency-001",
  agency_other_name: "",
  ...validContact,
};

describe("canContinueStep1 — Step 1 Continue gate", () => {
  it("is disabled when neither property nor role have been picked", () => {
    expect(
      canContinueStep1({
        unit_id: null,
        role: null,
        agency_id: null,
        agency_other_name: "",
        ...validContact,
      }),
    ).toBe(false);
  });

  it("is disabled when only a property is picked (no role)", () => {
    expect(
      canContinueStep1({
        unit_id: "u1",
        role: null,
        agency_id: null,
        agency_other_name: "",
        ...validContact,
      }),
    ).toBe(false);
  });

  it("is disabled when only a role is picked (no property)", () => {
    expect(
      canContinueStep1({
        unit_id: null,
        role: "owner",
        agency_id: null,
        agency_other_name: "",
        ...validContact,
      }),
    ).toBe(false);
  });

  it("is disabled when the property id is the empty string", () => {
    // Defensive: empty strings are falsy and must not satisfy the gate.
    expect(canContinueStep1({ ...ownerComplete, unit_id: "" })).toBe(false);
  });

  it("is enabled for an owner once unit + role + valid contact are filled", () => {
    expect(canContinueStep1(ownerComplete)).toBe(true);
  });

  it("is enabled for an agent once unit + role + valid contact + real agency are filled", () => {
    expect(canContinueStep1(agentComplete)).toBe(true);
  });

  it("is disabled for an agent who hasn't picked an agency yet", () => {
    expect(canContinueStep1({ ...agentComplete, agency_id: null })).toBe(false);
  });

  it("is disabled for an agent who picked 'Other' but hasn't typed a company name", () => {
    expect(
      canContinueStep1({
        ...agentComplete,
        agency_id: OTHER_AGENCY_ID,
        agency_other_name: "",
      }),
    ).toBe(false);
  });

  it("is enabled for an agent who picked 'Other' and provided a company name", () => {
    expect(
      canContinueStep1({
        ...agentComplete,
        agency_id: OTHER_AGENCY_ID,
        agency_other_name: "Westside Property Co.",
      }),
    ).toBe(true);
  });

  it("is disabled when any required contact field is blank", () => {
    expect(canContinueStep1({ ...ownerComplete, contact_first_name: "" })).toBe(false);
    expect(canContinueStep1({ ...ownerComplete, contact_last_name: "" })).toBe(false);
    expect(canContinueStep1({ ...ownerComplete, contact_email: "" })).toBe(false);
    expect(canContinueStep1({ ...ownerComplete, contact_phone: "" })).toBe(false);
  });

  it("is disabled when the email looks malformed", () => {
    expect(canContinueStep1({ ...ownerComplete, contact_email: "ada-at-example" })).toBe(false);
  });

  it("is disabled when the mobile has fewer than 10 digits", () => {
    expect(canContinueStep1({ ...ownerComplete, contact_phone: "12345" })).toBe(false);
  });
});

describe("step counter / Slots skipping for coordination flows", () => {
  it("shows 5 visible steps including Slots for a non-coordination flow", () => {
    const s = { access_method: null };
    expect(totalSteps(s)).toBe(5);
    expect(visibleSteps(s)).toEqual([1, 2, 3, 4, 5]);
    expect(isCoordinationFlow(s)).toBe(false);
  });

  it("still shows 5 visible steps for non-coordination access methods (e.g. agent_be_there)", () => {
    const s = { access_method: "agent_be_there" as const };
    expect(totalSteps(s)).toBe(5);
    expect(visibleSteps(s)).toContain(4);
    expect(isCoordinationFlow(s)).toBe(false);
  });

  it("drops to 4 visible steps and skips Slots (step 4) for every coordination access method", () => {
    // Drives every entry of the canonical coordination set so the test
    // automatically covers any future additions to the set.
    const coordinationMethods: AccessMethod[] = Array.from(
      COORDINATION_ACCESS_METHODS,
    );
    expect(coordinationMethods.length).toBeGreaterThan(0);

    for (const access_method of coordinationMethods) {
      const s = { access_method };
      expect(isCoordinationFlow(s)).toBe(true);
      expect(totalSteps(s)).toBe(4);
      expect(visibleSteps(s)).toEqual([1, 2, 3, 5]);
      expect(visibleSteps(s)).not.toContain(4);
    }
  });

  it("the agent_tenant_self method is intentionally NOT a coordination flow (Slots still required)", () => {
    // Spec note from bookingSession.ts: agent_tenant_self means the agent
    // arranges the slot directly with the tenant, so they still pick a slot.
    const s = { access_method: "agent_tenant_self" as const };
    expect(isCoordinationFlow(s)).toBe(false);
    expect(totalSteps(s)).toBe(5);
    expect(visibleSteps(s)).toContain(4);
  });
});

describe("visibleIndex — progress-bar pill position", () => {
  it("returns the natural 1..5 position for every step in a non-coordination flow", () => {
    const s = { access_method: null };
    const expected: Array<[StepId, number]> = [
      [1, 1],
      [2, 2],
      [3, 3],
      [4, 4],
      [5, 5],
    ];
    for (const [step, pos] of expected) {
      expect(visibleIndex(s, step)).toBe(pos);
    }
  });

  it("treats a non-coordination access method (agent_be_there) the same as a null one", () => {
    const s = { access_method: "agent_be_there" as const };
    expect(visibleIndex(s, 4)).toBe(4);
    expect(visibleIndex(s, 5)).toBe(5);
  });

  it("compresses positions to 1..4 in a coordination flow, with step 5 sliding into slot 4", () => {
    // Slots (step 4) is hidden, so the visible order is 1-2-3-5 and the
    // progress-bar pill for step 5 must read "Step 4 of 4".
    const s = { access_method: "agent_tenant_taylr" as const };
    expect(visibleIndex(s, 1)).toBe(1);
    expect(visibleIndex(s, 2)).toBe(2);
    expect(visibleIndex(s, 3)).toBe(3);
    expect(visibleIndex(s, 5)).toBe(4);
  });

  it("falls back to the last visible position when asked for a hidden step (step 4 in a coordination flow)", () => {
    // This guards the wrapper when it's mid-transition: the user sat on
    // step 4, then picked a coordination method. The pill must not show
    // "Step 0 of 4" or crash — it should read as if they're on step 5.
    for (const access_method of COORDINATION_ACCESS_METHODS) {
      const s = { access_method };
      expect(visibleIndex(s, 4)).toBe(totalSteps(s));
      expect(visibleIndex(s, 4)).toBe(4);
    }
  });
});

describe("nextStepId — forward navigation that respects hidden steps", () => {
  it("walks 1→2→3→4→5 in a non-coordination flow", () => {
    const s = { access_method: null };
    expect(nextStepId(s, 1)).toBe(2);
    expect(nextStepId(s, 2)).toBe(3);
    expect(nextStepId(s, 3)).toBe(4);
    expect(nextStepId(s, 4)).toBe(5);
  });

  it("returns the same step when called from the last step (no next)", () => {
    // No-op at the end of the flow — the wrapper relies on this so the
    // "Continue" button can't push the user past the final step.
    expect(nextStepId({ access_method: null }, 5)).toBe(5);
    expect(nextStepId({ access_method: "agent_tenant_taylr" as const }, 5)).toBe(5);
  });

  it("skips Slots (step 4) when going forward in a coordination flow", () => {
    for (const access_method of COORDINATION_ACCESS_METHODS) {
      const s = { access_method };
      // 3 is the last visible step before Slots, so next must jump to 5.
      expect(nextStepId(s, 3)).toBe(5);
      // Earlier steps still march forward one slot at a time.
      expect(nextStepId(s, 1)).toBe(2);
      expect(nextStepId(s, 2)).toBe(3);
    }
  });

  it("snaps forward to the next visible step when called from a hidden current step", () => {
    // Edge case: user was on step 4 when they switched to a coordination
    // access method. nextStepId(state, 4) must land on 5, not stall.
    for (const access_method of COORDINATION_ACCESS_METHODS) {
      const s = { access_method };
      expect(nextStepId(s, 4)).toBe(5);
    }
  });
});

describe("prevStepId — backward navigation that respects hidden steps", () => {
  it("walks 5→4→3→2→1 in a non-coordination flow", () => {
    const s = { access_method: null };
    expect(prevStepId(s, 5)).toBe(4);
    expect(prevStepId(s, 4)).toBe(3);
    expect(prevStepId(s, 3)).toBe(2);
    expect(prevStepId(s, 2)).toBe(1);
  });

  it("returns the same step when called from the first step (no prev)", () => {
    // No-op at the start of the flow — the wrapper relies on this so the
    // "Back" button can't push the user before step 1.
    expect(prevStepId({ access_method: null }, 1)).toBe(1);
    expect(prevStepId({ access_method: "agent_tenant_taylr" as const }, 1)).toBe(1);
  });

  it("skips Slots (step 4) when going backward in a coordination flow", () => {
    for (const access_method of COORDINATION_ACCESS_METHODS) {
      const s = { access_method };
      // From 5 we should jump straight back over the hidden Slots step.
      expect(prevStepId(s, 5)).toBe(3);
      // Earlier steps still walk back one slot at a time.
      expect(prevStepId(s, 3)).toBe(2);
      expect(prevStepId(s, 2)).toBe(1);
    }
  });

  it("snaps backward to the previous visible step when called from a hidden current step", () => {
    // Mirror of the nextStepId hidden-current edge case: a user mid-switch
    // sitting on step 4 in a coordination flow should be sent back to step 3.
    for (const access_method of COORDINATION_ACCESS_METHODS) {
      const s = { access_method };
      expect(prevStepId(s, 4)).toBe(3);
    }
  });
});

describe("getBookingDurationMinutes — slot picker time-budget", () => {
  it("returns 45 minutes for a 1-system, 0-extra booking (the smallest job)", () => {
    expect(
      getBookingDurationMinutes({
        num_systems: 1,
        num_additional_indoor: 0,
        ac_discrepancy: null,
      }),
    ).toBe(45);
    // Cross-check against the published constant so the test catches
    // accidental drift in either direction.
    expect(MINUTES_PER_SYSTEM).toBe(45);
  });

  it("adds 15 minutes per additional indoor unit on top of the per-system base", () => {
    // 2 systems + 1 extra indoor = 2×45 + 1×15 = 105 (the spec's worked example).
    expect(
      getBookingDurationMinutes({
        num_systems: 2,
        num_additional_indoor: 1,
        ac_discrepancy: null,
      }),
    ).toBe(105);
    // 3 systems + 2 extras = 3×45 + 2×15 = 165.
    expect(
      getBookingDurationMinutes({
        num_systems: 3,
        num_additional_indoor: 2,
        ac_discrepancy: null,
      }),
    ).toBe(165);
    expect(MINUTES_PER_ADDITIONAL_INDOOR).toBe(15);
  });

  it("falls back to the unsure default when the customer answered 'I'm not sure' on AC", () => {
    // Even though the steppers carry seeded values, the customer never
    // confirmed them — so the slot picker should size the booking at the
    // documented fallback (one base system).
    expect(
      getBookingDurationMinutes({
        num_systems: 5,
        num_additional_indoor: 3,
        ac_discrepancy: {
          recorded: { type: "split", systems: 2, additional: 0 },
          customer: { type: "unsure" },
        },
      }),
    ).toBe(UNSURE_FALLBACK_MINUTES);
    expect(UNSURE_FALLBACK_MINUTES).toBe(45);
  });

  it("ignores a non-unsure discrepancy snapshot and trusts the steppers", () => {
    // A customer who confirmed "ducted, 2 systems, 1 extra" but whose
    // record on file said something different still has a committed
    // count — the duration must use the steppers, not the fallback.
    expect(
      getBookingDurationMinutes({
        num_systems: 2,
        num_additional_indoor: 1,
        ac_discrepancy: {
          recorded: { type: "split", systems: 1, additional: 0 },
          customer: { type: "ducted", systems: 2, additional: 1 },
        },
      }),
    ).toBe(105);
  });
});

describe("formatDurationMinutes — compact slot-tile labels", () => {
  it("renders sub-hour values with the minutes suffix only", () => {
    expect(formatDurationMinutes(0)).toBe("0m");
    expect(formatDurationMinutes(15)).toBe("15m");
    expect(formatDurationMinutes(45)).toBe("45m");
  });

  it("drops the minutes segment when the duration lands on a whole hour", () => {
    expect(formatDurationMinutes(60)).toBe("1h");
    expect(formatDurationMinutes(240)).toBe("4h");
  });

  it("renders mixed hours + minutes without a leading zero or extra spaces", () => {
    expect(formatDurationMinutes(75)).toBe("1h 15m");
    expect(formatDurationMinutes(105)).toBe("1h 45m");
    expect(formatDurationMinutes(165)).toBe("2h 45m");
  });

  it("clamps negative inputs to zero so a slot can't display a negative remainder", () => {
    expect(formatDurationMinutes(-5)).toBe("0m");
  });
});

describe("slotFitStatus — customer-side slot picker label", () => {
  const slot = (windowMinutes: number, bookedMinutes: number) => ({
    windowMinutes,
    bookedMinutes,
  });

  it("returns 'available' when the window has more than enough time left", () => {
    expect(slotFitStatus(slot(240, 60), 45)).toBe("available");
  });

  it("returns 'available' when the job exactly equals the remaining minutes", () => {
    expect(slotFitStatus(slot(240, 195), 45)).toBe("available");
  });

  it("returns 'not_enough_time' when the window has SOME time left but less than the job needs", () => {
    expect(slotFitStatus(slot(240, 220), 45)).toBe("not_enough_time");
    expect(slotFitStatus(slot(240, 196), 45)).toBe("not_enough_time");
  });

  it("returns 'full' when the window is completely booked out, regardless of job size", () => {
    expect(slotFitStatus(slot(240, 240), 45)).toBe("full");
    expect(slotFitStatus(slot(240, 240), 1)).toBe("full");
    // Defensive: an over-booked window (clamped remaining = 0) still reads as full.
    expect(slotFitStatus(slot(240, 999), 45)).toBe("full");
  });

  it("treats a 0-minute job as 'is there ANY room left' so empty windows don't read as full", () => {
    // Mirrors the admin-side `slotIsAvailable` semantics in adminMockData.ts.
    expect(slotFitStatus(slot(240, 239), 0)).toBe("available");
    expect(slotFitStatus(slot(240, 240), 0)).toBe("full");
  });
});
