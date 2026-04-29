/**
 * Derived selectors for the booking session — pure functions of state.
 *
 * Step skipping logic per spec §7.1: three "coordination" access methods
 * cause Step 4 (Schedule) to be skipped, so the visible-step list goes
 * 1-2-3-5 and the progress indicator shows "Step X of 4".
 */

import {
  COORDINATION_ACCESS_METHODS,
  type AccessMethod,
  type BookingState,
  type StepId,
} from "./bookingSession";
import { isOtherAgency } from "./accessMethodCatalog";

export function isCoordinationFlow(s: Pick<BookingState, "access_method">): boolean {
  return s.access_method ? COORDINATION_ACCESS_METHODS.has(s.access_method) : false;
}

/** Canonical 5-step order. */
const ALL_STEPS: readonly StepId[] = [1, 2, 3, 4, 5];

/** The step ids the user should walk through, given current state. */
export function visibleSteps(s: Pick<BookingState, "access_method">): StepId[] {
  if (isCoordinationFlow(s)) {
    return ALL_STEPS.filter((id) => id !== 4);
  }
  return [...ALL_STEPS];
}

/** Total steps to display in the progress indicator (4 or 5). */
export function totalSteps(s: Pick<BookingState, "access_method">): number {
  return visibleSteps(s).length;
}

/** Position (1-based) of `step` within the visible flow. */
export function visibleIndex(
  s: Pick<BookingState, "access_method">,
  step: StepId,
): number {
  const idx = visibleSteps(s).indexOf(step);
  // If `step` isn't visible (e.g. step 4 in a coordination flow), fall back
  // to the position of step 5 — the place the user would actually be.
  if (idx === -1) return visibleSteps(s).length;
  return idx + 1;
}

/** Next step id given the current one (skips hidden steps).
 *
 * If `current` is itself hidden (e.g. step 4 in a coordination flow that
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

// ─── Field validation helpers (shared by Step 1 page + canContinueStep1) ──

/** Email-shape check used by the Step 1 contact form. Returns an error
 *  message string, or null when the value is valid. */
export function validateEmail(v: string): string | null {
  const t = v.trim();
  if (!t) return "Email address is required";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) {
    return "Please enter a valid email address";
  }
  return null;
}

/** Mobile-number check used by the Step 1 contact form. Strips
 *  non-digits and requires at least 10 of them. */
export function validatePhone(v: string): string | null {
  const digits = v.replace(/\D/g, "");
  if (!digits) return "Mobile number is required";
  if (digits.length < 10) return "Mobile number must be at least 10 digits";
  return null;
}

/** Generic "must not be blank" check for first/last name. */
export function validateRequired(v: string, label: string): string | null {
  if (!v.trim()) return `${label} is required`;
  return null;
}

/**
 * Step 1 gate: the "Continue" button stays disabled until the user has
 * picked a property (`unit_id`), a role, and filled in valid contact
 * details. Agents must additionally pick an agency from the dropdown
 * (and provide a free-text company name when "Other / not listed" is
 * selected).
 *
 * Kept as a pure selector so it can be unit-tested without mounting the
 * Step 1 page, and so the mobile and desktop variants share one source
 * of truth for the rule.
 */
export function canContinueStep1(
  s: Pick<
    BookingState,
    | "unit_id"
    | "role"
    | "agency_id"
    | "agency_other_name"
    | "contact_first_name"
    | "contact_last_name"
    | "contact_email"
    | "contact_phone"
  >,
): boolean {
  if (!s.unit_id || !s.role) return false;
  if (validateRequired(s.contact_first_name, "First name")) return false;
  if (validateRequired(s.contact_last_name, "Last name")) return false;
  if (validateEmail(s.contact_email)) return false;
  if (validatePhone(s.contact_phone)) return false;
  if (s.role === "agent") {
    if (!s.agency_id) return false;
    if (isOtherAgency(s.agency_id) && !s.agency_other_name.trim()) return false;
  }
  return true;
}

// ─── Booking duration (time-budget model) ──────────────────────────────────

/**
 * Per-system base duration in minutes — every booking starts here.
 * Mirrors the slot picker's time-budget model (Task #27).
 */
export const MINUTES_PER_SYSTEM = 45;

/**
 * Per-additional-indoor add-on duration in minutes.
 */
export const MINUTES_PER_ADDITIONAL_INDOOR = 15;

/**
 * Fallback duration used when the customer's AC selection is "I'm not sure"
 * (so `num_systems` / `num_additional_indoor` are not committed values).
 *
 * Equivalent to a single-system booking with no extras — the smallest job
 * Taylr will dispatch — so the slot picker leans permissive rather than
 * locking the customer out of slots they might actually fit. The admin
 * mockup will surface the unsure flag separately and let ops adjust.
 */
export const UNSURE_FALLBACK_MINUTES = MINUTES_PER_SYSTEM;

/**
 * How long the customer's current booking will take, in minutes.
 *
 * Formula: `45 × num_systems + 15 × num_additional_indoor`.
 *
 * When the customer answered "I'm not sure" on the AC step
 * (`ac_discrepancy.customer.type === "unsure"`) we don't trust the seeded
 * stepper values, so we fall back to {@link UNSURE_FALLBACK_MINUTES}.
 *
 * Pure function — used by the slot picker (to size each slot's time
 * budget) and by the admin mockup later (to render the booked job's
 * duration).
 */
export function getBookingDurationMinutes(
  s: Pick<
    BookingState,
    "num_systems" | "num_additional_indoor" | "ac_discrepancy"
  >,
): number {
  if (s.ac_discrepancy?.customer.type === "unsure") {
    return UNSURE_FALLBACK_MINUTES;
  }
  return (
    s.num_systems * MINUTES_PER_SYSTEM +
    s.num_additional_indoor * MINUTES_PER_ADDITIONAL_INDOOR
  );
}

// ─── Customer-side slot fit status ────────────────────────────────────────

/**
 * Why the customer sees a particular state for a time-based slot.
 *
 * - `available`     — there's enough time left in the window for this job.
 * - `not_enough_time` — the window has SOME time left, but less than the job
 *                       requires (e.g. 30 min remaining, job is 45 min).
 * - `full`          — the window is completely booked out (0 minutes left).
 *
 * The mirror of {@link slotIsAvailable} from `adminMockData.ts`, but
 * scoped to the time-based fields the customer slot picker actually
 * models (it has no notion of count-based windows). When ops run a
 * count-based window in admin and it's out of slots, the customer
 * picker just sees a window with 0 remaining minutes and shows "Full",
 * which is the same plain message — the distinction is admin-only.
 */
export type SlotFitStatus = "available" | "not_enough_time" | "full";

/**
 * Decide which of the three states a time-based slot is in for the
 * customer's current job size. Pure function — no DOM, no session
 * access — so the slot picker variants and their tests share one
 * source of truth for the rule.
 *
 * `jobMinutes` is treated as at least 1: a "0-minute job" makes no
 * sense, so the function falls back to "is there ANY room left?",
 * matching the admin-side {@link slotIsAvailable} semantics.
 */
export function slotFitStatus(
  slot: { windowMinutes: number; bookedMinutes: number },
  jobMinutes: number,
): SlotFitStatus {
  const remaining = Math.max(0, slot.windowMinutes - slot.bookedMinutes);
  const required = Math.max(jobMinutes, 1);
  if (remaining >= required) return "available";
  if (remaining <= 0) return "full";
  return "not_enough_time";
}

/**
 * Compact human-friendly minutes label, e.g. `45m`, `1h 45m`, `4h`.
 *
 * Intentionally terse so it fits inside a slot tile and a top-of-page
 * chip without wrapping. Negative inputs are clamped to zero.
 */
export function formatDurationMinutes(total: number): string {
  const m = Math.max(0, Math.round(total));
  const hours = Math.floor(m / 60);
  const mins = m % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

export type { AccessMethod };
