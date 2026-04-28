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
  totalSteps,
  visibleSteps,
} from "./bookingDerived";
import { COORDINATION_ACCESS_METHODS, type AccessMethod } from "./bookingSession";

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
