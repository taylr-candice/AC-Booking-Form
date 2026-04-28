/**
 * Regression checks for the new Step 1 behavior.
 *
 * These two rules are easy to break by accident; lock them in:
 *
 *   1. The Step 1 "Continue" button stays disabled until BOTH a property
 *      and a role have been picked. (`canContinueStep1`)
 *   2. Picking a coordination access method makes the on-page step
 *      counter switch to "of 5" and skips the Schedule step.
 *      (`totalSteps` / `visibleSteps`)
 */

import { describe, expect, it } from "vitest";

import {
  canContinueStep1,
  isCoordinationFlow,
  nextStepId,
  prevStepId,
  totalSteps,
  visibleIndex,
  visibleSteps,
} from "./bookingDerived";
import {
  COORDINATION_ACCESS_METHODS,
  type AccessMethod,
  type StepId,
} from "./bookingSession";

describe("canContinueStep1 — Step 1 Continue gate", () => {
  it("is disabled when neither property nor role have been picked", () => {
    expect(canContinueStep1({ unit_id: null, role: null })).toBe(false);
  });

  it("is disabled when only a property is picked", () => {
    expect(canContinueStep1({ unit_id: "u1", role: null })).toBe(false);
  });

  it("is disabled when only a role is picked", () => {
    expect(canContinueStep1({ unit_id: null, role: "owner" })).toBe(false);
    expect(canContinueStep1({ unit_id: null, role: "agent" })).toBe(false);
  });

  it("is disabled when the property id is the empty string", () => {
    // Defensive: empty strings are falsy and must not satisfy the gate.
    expect(canContinueStep1({ unit_id: "", role: "owner" })).toBe(false);
  });

  it("becomes enabled only once BOTH a property and a role are picked", () => {
    expect(canContinueStep1({ unit_id: "u1", role: "owner" })).toBe(true);
    expect(canContinueStep1({ unit_id: "u2", role: "agent" })).toBe(true);
  });
});

describe("step counter / Schedule skipping for coordination flows", () => {
  it("shows 6 visible steps including Schedule for a non-coordination flow", () => {
    const s = { access_method: null };
    expect(totalSteps(s)).toBe(6);
    expect(visibleSteps(s)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(isCoordinationFlow(s)).toBe(false);
  });

  it("still shows 6 visible steps for non-coordination access methods (e.g. agent_be_there)", () => {
    const s = { access_method: "agent_be_there" as const };
    expect(totalSteps(s)).toBe(6);
    expect(visibleSteps(s)).toContain(5);
    expect(isCoordinationFlow(s)).toBe(false);
  });

  it("drops to 5 visible steps and skips Schedule (step 5) for every coordination access method", () => {
    // Drives every entry of the canonical coordination set so the test
    // automatically covers any future additions to the set.
    const coordinationMethods: AccessMethod[] = Array.from(
      COORDINATION_ACCESS_METHODS,
    );
    expect(coordinationMethods.length).toBeGreaterThan(0);

    for (const access_method of coordinationMethods) {
      const s = { access_method };
      expect(isCoordinationFlow(s)).toBe(true);
      expect(totalSteps(s)).toBe(5);
      expect(visibleSteps(s)).toEqual([1, 2, 3, 4, 6]);
      expect(visibleSteps(s)).not.toContain(5);
    }
  });

  it("the agent_tenant_self method is intentionally NOT a coordination flow (Schedule still required)", () => {
    // Spec note from bookingSession.ts: agent_tenant_self means the agent
    // arranges the slot directly with the tenant, so they still pick a slot.
    const s = { access_method: "agent_tenant_self" as const };
    expect(isCoordinationFlow(s)).toBe(false);
    expect(totalSteps(s)).toBe(6);
    expect(visibleSteps(s)).toContain(5);
  });
});

describe("visibleIndex — progress-bar pill position", () => {
  it("returns the natural 1..6 position for every step in a non-coordination flow", () => {
    const s = { access_method: null };
    const expected: Array<[StepId, number]> = [
      [1, 1],
      [2, 2],
      [3, 3],
      [4, 4],
      [5, 5],
      [6, 6],
    ];
    for (const [step, pos] of expected) {
      expect(visibleIndex(s, step)).toBe(pos);
    }
  });

  it("treats a non-coordination access method (agent_be_there) the same as a null one", () => {
    const s = { access_method: "agent_be_there" as const };
    expect(visibleIndex(s, 5)).toBe(5);
    expect(visibleIndex(s, 6)).toBe(6);
  });

  it("compresses positions to 1..5 in a coordination flow, with step 6 sliding into slot 5", () => {
    // Schedule (step 5) is hidden, so the visible order is 1-2-3-4-6 and the
    // progress-bar pill for step 6 must read "Step 5 of 5".
    const s = { access_method: "agent_tenant_taylr" as const };
    expect(visibleIndex(s, 1)).toBe(1);
    expect(visibleIndex(s, 2)).toBe(2);
    expect(visibleIndex(s, 3)).toBe(3);
    expect(visibleIndex(s, 4)).toBe(4);
    expect(visibleIndex(s, 6)).toBe(5);
  });

  it("falls back to the last visible position when asked for a hidden step (step 5 in a coordination flow)", () => {
    // This guards the wrapper when it's mid-transition: the user sat on
    // step 5, then picked a coordination method. The pill must not show
    // "Step 0 of 5" or crash — it should read as if they're on step 6.
    for (const access_method of COORDINATION_ACCESS_METHODS) {
      const s = { access_method };
      expect(visibleIndex(s, 5)).toBe(totalSteps(s));
      expect(visibleIndex(s, 5)).toBe(5);
    }
  });
});

describe("nextStepId — forward navigation that respects hidden steps", () => {
  it("walks 1→2→3→4→5→6 in a non-coordination flow", () => {
    const s = { access_method: null };
    expect(nextStepId(s, 1)).toBe(2);
    expect(nextStepId(s, 2)).toBe(3);
    expect(nextStepId(s, 3)).toBe(4);
    expect(nextStepId(s, 4)).toBe(5);
    expect(nextStepId(s, 5)).toBe(6);
  });

  it("returns the same step when called from the last step (no next)", () => {
    // No-op at the end of the flow — the wrapper relies on this so the
    // "Continue" button can't push the user past the final step.
    expect(nextStepId({ access_method: null }, 6)).toBe(6);
    expect(nextStepId({ access_method: "agent_tenant_taylr" as const }, 6)).toBe(6);
  });

  it("skips Schedule (step 5) when going forward in a coordination flow", () => {
    for (const access_method of COORDINATION_ACCESS_METHODS) {
      const s = { access_method };
      // 4 is the last visible step before Schedule, so next must jump to 6.
      expect(nextStepId(s, 4)).toBe(6);
      // Earlier steps still march forward one slot at a time.
      expect(nextStepId(s, 1)).toBe(2);
      expect(nextStepId(s, 2)).toBe(3);
      expect(nextStepId(s, 3)).toBe(4);
    }
  });

  it("snaps forward to the next visible step when called from a hidden current step", () => {
    // Edge case: user was on step 5 when they switched to a coordination
    // access method. nextStepId(state, 5) must land on 6, not stall.
    for (const access_method of COORDINATION_ACCESS_METHODS) {
      const s = { access_method };
      expect(nextStepId(s, 5)).toBe(6);
    }
  });
});

describe("prevStepId — backward navigation that respects hidden steps", () => {
  it("walks 6→5→4→3→2→1 in a non-coordination flow", () => {
    const s = { access_method: null };
    expect(prevStepId(s, 6)).toBe(5);
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

  it("skips Schedule (step 5) when going backward in a coordination flow", () => {
    for (const access_method of COORDINATION_ACCESS_METHODS) {
      const s = { access_method };
      // From 6 we should jump straight back over the hidden Schedule step.
      expect(prevStepId(s, 6)).toBe(4);
      // Earlier steps still walk back one slot at a time.
      expect(prevStepId(s, 4)).toBe(3);
      expect(prevStepId(s, 3)).toBe(2);
      expect(prevStepId(s, 2)).toBe(1);
    }
  });

  it("snaps backward to the previous visible step when called from a hidden current step", () => {
    // Mirror of the nextStepId hidden-current edge case: a user mid-switch
    // sitting on step 5 in a coordination flow should be sent back to step 4.
    for (const access_method of COORDINATION_ACCESS_METHODS) {
      const s = { access_method };
      expect(prevStepId(s, 5)).toBe(4);
    }
  });
});
