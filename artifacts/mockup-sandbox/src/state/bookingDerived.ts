/**
 * Derived selectors for the booking session — pure functions of state.
 *
 * Step skipping logic per spec §7.1: three "coordination" access methods
 * cause Step 5 (Schedule) to be skipped, so the visible-step list goes
 * 1-2-3-4-6 and the progress indicator shows "Step X of 5".
 */

import {
  COORDINATION_ACCESS_METHODS,
  type AccessMethod,
  type BookingState,
  type StepId,
} from "./bookingSession";

export function isCoordinationFlow(s: Pick<BookingState, "access_method">): boolean {
  return s.access_method ? COORDINATION_ACCESS_METHODS.has(s.access_method) : false;
}

/** Canonical 6-step order. */
const ALL_STEPS: readonly StepId[] = [1, 2, 3, 4, 5, 6];

/** The step ids the user should walk through, given current state. */
export function visibleSteps(s: Pick<BookingState, "access_method">): StepId[] {
  if (isCoordinationFlow(s)) {
    return ALL_STEPS.filter((id) => id !== 5);
  }
  return [...ALL_STEPS];
}

/** Total steps to display in the progress indicator (5 or 6). */
export function totalSteps(s: Pick<BookingState, "access_method">): number {
  return visibleSteps(s).length;
}

/** Position (1-based) of `step` within the visible flow. */
export function visibleIndex(
  s: Pick<BookingState, "access_method">,
  step: StepId,
): number {
  const idx = visibleSteps(s).indexOf(step);
  // If `step` isn't visible (e.g. step 5 in a coordination flow), fall back
  // to the position of step 6 — the place the user would actually be.
  if (idx === -1) return visibleSteps(s).length;
  return idx + 1;
}

/** Next step id given the current one (skips hidden steps).
 *
 * If `current` is itself hidden (e.g. step 5 in a coordination flow that
 * was just enabled), snap forward to the next visible step rather than
 * returning a no-op.
 */
export function nextStepId(
  s: Pick<BookingState, "access_method">,
  current: StepId,
): StepId {
  const ids = visibleSteps(s);
  const idx = ids.indexOf(current);
  if (idx === -1) {
    const after = ids.find((id) => id > current);
    return after ?? ids[ids.length - 1];
  }
  if (idx === ids.length - 1) return current;
  return ids[idx + 1];
}

/** Previous step id given the current one (skips hidden steps).
 *
 * Same hidden-current handling as `nextStepId` but snapping backwards.
 */
export function prevStepId(
  s: Pick<BookingState, "access_method">,
  current: StepId,
): StepId {
  const ids = visibleSteps(s);
  const idx = ids.indexOf(current);
  if (idx === -1) {
    const before = [...ids].reverse().find((id) => id < current);
    return before ?? ids[0];
  }
  if (idx <= 0) return current;
  return ids[idx - 1];
}

/**
 * Step 1 gate: the "Continue" button stays disabled until the user has
 * picked BOTH a property (`unit_id`) and a role.
 *
 * Kept as a pure selector so it can be unit-tested without mounting the
 * Step 1 page, and so the mobile and desktop variants share one source
 * of truth for the rule.
 */
export function canContinueStep1(
  s: Pick<BookingState, "unit_id" | "role">,
): boolean {
  return !!s.unit_id && !!s.role;
}

export type { AccessMethod };
