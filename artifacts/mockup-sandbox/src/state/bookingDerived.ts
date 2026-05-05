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
import { readLiveOtherServicesFromStorage } from "./liveOtherServices";

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
    | "primary_residence"
    | "agency_id"
    | "agency_other_name"
    | "contact_first_name"
    | "contact_last_name"
    | "contact_email"
    | "contact_phone"
  >,
): boolean {
  if (!s.unit_id || !s.role) return false;
  if (s.role === "owner" && !s.primary_residence) return false;
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
 * Per-AC-type service rule used to compute booking duration.
 *
 * The shape mirrors the configurable Service catalogue (Task #182):
 * each catalogue entry exposes a `baseMinutes` (per-system) value and
 * an `addonMinutes` (per-extra-indoor / per-extra-grille) value. The
 * defaults below preserve the legacy 45/15 numbers so callers that
 * never register a resolver behave exactly as before.
 */
export type ServiceRule = {
  baseMinutes: number;
  addonMinutes: number;
};

/**
 * Where the unit's outdoor unit lives, used to compute the
 * "rooftop access" overhead surcharge per system. `in_property`
 * contributes nothing; `rooftop` adds `overheadMinutes` per AC system
 * captured on the booking (the tech climbs once per system in the
 * mockup model — Task #182's worked example).
 */
export type OutdoorPlacementContext =
  | { kind: "in_property" }
  | { kind: "rooftop"; overheadMinutes: number };

/**
 * Per-unit context the duration helper needs to compute placement
 * overhead and resolve a default AC type when the booking session
 * hasn't committed one yet (e.g. fresh slot picker render).
 */
export type UnitDurationContext = {
  acType: "split" | "ducted" | null;
  placement: OutdoorPlacementContext;
};

const DEFAULT_SERVICE_RULE: ServiceRule = {
  baseMinutes: MINUTES_PER_SYSTEM,
  addonMinutes: MINUTES_PER_ADDITIONAL_INDOOR,
};

const DEFAULT_UNIT_CONTEXT: UnitDurationContext = {
  acType: null,
  placement: { kind: "in_property" },
};

/**
 * Per-id rule for a generic ("other") service (Task #186) — the
 * customer-flow projection of an `AdminService` row whose `acTypeKey`
 * is `null`. Carries everything the booking flow needs to size its
 * duration math and render the customer pricing card without
 * re-importing the AdminService type (and its admin-only `acTypeKey`,
 * `defaultJobMinutes`, etc.) here.
 */
export type OtherServiceRule = {
  id: string;
  name: string;
  baseMinutes: number;
  addonMinutes: number;
  priceAud: number;
  addonPriceAud: number;
  appliesToNote?: string;
  /** Add-on stepper label (e.g. "additional bathroom"). The customer
   *  flow doesn't expose a separate stepper for "other" service add-ons
   *  — selecting the service contributes one base + one add-on — but
   *  the label is surfaced in the price card so the customer sees what
   *  the add-on charge covers. */
  addonLabel: string;
  /** Optional per-service quantity ceiling. Callers must fall back
   *  to the global 99 ceiling when missing (legacy blobs). */
  maxQty?: number;
};

let serviceRuleResolver: (acType: "split" | "ducted") => ServiceRule = () =>
  DEFAULT_SERVICE_RULE;
let unitDurationContextResolver: (
  unitId: string | null,
) => UnitDurationContext = () => DEFAULT_UNIT_CONTEXT;

/**
 * Default "other" service lookup — reads from the cross-iframe
 * sessionStorage bridge so the customer-flow iframe sees the parent
 * frame's `AdminApp` Service-catalogue edits without needing a
 * resolver to be registered in the iframe's JS realm. Tests / the
 * canvas-isolated mode can register a custom resolver via
 * {@link setOtherServiceLookup}; passing `null` resets to this
 * sessionStorage-backed default (which itself returns `null` when
 * storage is empty).
 */
const STORAGE_BACKED_OTHER_SERVICE_LOOKUP = (
  id: string,
): OtherServiceRule | null => {
  const all = readLiveOtherServicesFromStorage();
  return all.find((r) => r.id === id) ?? null;
};
let otherServiceLookup: (id: string) => OtherServiceRule | null =
  STORAGE_BACKED_OTHER_SERVICE_LOOKUP;

/**
 * Register a resolver that returns the per-AC-type service rule.
 * Pass `null` to restore the legacy 45/15 defaults — used by the
 * canvas-isolated mode and by tests that don't need the catalogue.
 */
export function setServiceRuleResolver(
  fn: ((acType: "split" | "ducted") => ServiceRule) | null,
): void {
  serviceRuleResolver = fn ?? (() => DEFAULT_SERVICE_RULE);
}

/**
 * Register a resolver that returns the per-unit placement + recorded
 * AC type. Pass `null` to restore the in-property / unknown-type
 * defaults.
 */
export function setUnitDurationContextResolver(
  fn: ((unitId: string | null) => UnitDurationContext) | null,
): void {
  unitDurationContextResolver = fn ?? (() => DEFAULT_UNIT_CONTEXT);
}

/**
 * Register a resolver that maps a catalogue id to its
 * {@link OtherServiceRule}. The admin shell wires this in
 * `AdminApp.tsx` so the customer-facing booking flow sees ops-edited
 * "other" services (Task #186). Returns `null` for unknown ids so
 * callers can silently skip stale ids carried over from
 * sessionStorage after the catalogue changed.
 *
 * Pass `null` to reset to the no-op default — used by tests and the
 * canvas-isolated mode where no admin shell is mounted.
 */
export function setOtherServiceLookup(
  fn: ((id: string) => OtherServiceRule | null) | null,
): void {
  otherServiceLookup = fn ?? STORAGE_BACKED_OTHER_SERVICE_LOOKUP;
}

/**
 * Resolve a list of catalogue ids to their {@link OtherServiceRule}
 * entries via the registered lookup. Stale / unknown ids are dropped
 * silently — the customer flow is allowed to carry an id forward in
 * sessionStorage even if ops removes the catalogue entry, and we
 * prefer "service quietly disappears from the price card" over
 * "booking flow throws and the customer can't continue".
 *
 * Order is preserved (matches the order of `ids`), so the price card
 * lists services in the order the customer toggled them.
 */
export function resolveOtherServiceRules(
  ids: readonly string[],
): OtherServiceRule[] {
  if (ids.length === 0) return [];
  const out: OtherServiceRule[] = [];
  for (const id of ids) {
    const rule = otherServiceLookup(id);
    if (rule) out.push(rule);
  }
  return out;
}

/**
 * Resolve a quantity map (Task #201) to its {@link OtherServiceRule}
 * entries plus the chosen quantity, in the map's iteration order.
 * Stale / unknown ids are dropped silently for the same reason
 * {@link resolveOtherServiceRules} drops them — the customer must
 * never be blocked from paying because ops just edited the catalogue.
 */
export function resolveOtherServiceQuantities(
  quantities: Readonly<Record<string, number>>,
): { rule: OtherServiceRule; qty: number }[] {
  const out: { rule: OtherServiceRule; qty: number }[] = [];
  for (const [id, qty] of Object.entries(quantities)) {
    if (qty <= 0) continue;
    const rule = otherServiceLookup(id);
    if (rule) out.push({ rule, qty });
  }
  return out;
}

/**
 * Per-service minutes contribution under the Task #201 quantity model.
 *
 *   minutes = baseMinutes × qty + addonMinutes × max(qty − 1, 0)
 *
 * Mirrors the AC indoor-unit math: the first unit pays the full
 * `baseMinutes`, every additional unit pays the smaller `addonMinutes`
 * on top of another `baseMinutes` block (so a service the catalogue
 * priced at "30 min base + 10 min add-on" runs to 30 min for qty 1,
 * 70 min for qty 2, 110 min for qty 3, …). Returns 0 for qty ≤ 0 so
 * it's safe to call without a guard.
 */
export function otherServiceMinutes(
  rule: Pick<OtherServiceRule, "baseMinutes" | "addonMinutes">,
  qty: number,
): number {
  if (qty <= 0) return 0;
  return rule.baseMinutes * qty + rule.addonMinutes * Math.max(qty - 1, 0);
}

/**
 * Per-service price contribution under the Task #201 quantity model
 * (mirrors {@link otherServiceMinutes}, swapping minutes for AUD).
 */
export function otherServicePrice(
  rule: Pick<OtherServiceRule, "priceAud" | "addonPriceAud">,
  qty: number,
): number {
  if (qty <= 0) return 0;
  return rule.priceAud * qty + rule.addonPriceAud * Math.max(qty - 1, 0);
}

/**
 * Two-tier breakdown of {@link otherServicePrice} (Task #211): splits the
 * combined per-service total into the base-price tier (`qty × priceAud`)
 * and the add-on tier (`(qty − 1) × addonPriceAud`) so the price card
 * and the Pay-step receipt can render them as separate self-explanatory
 * line items for higher quantities. The combined `total` always equals
 * {@link otherServicePrice}, so callers comparing against the pricing
 * formula can use either helper interchangeably.
 *
 * Returns zeroed counts / subtotals when `qty ≤ 0` so callers can
 * treat it as a safe pure formatter without guards.
 */
export function otherServicePriceBreakdown(
  rule: Pick<OtherServiceRule, "priceAud" | "addonPriceAud">,
  qty: number,
): {
  baseQty: number;
  baseUnitAud: number;
  baseSubtotalAud: number;
  addonQty: number;
  addonUnitAud: number;
  addonSubtotalAud: number;
  totalAud: number;
} {
  const safeQty = qty > 0 ? qty : 0;
  const addonQty = Math.max(safeQty - 1, 0);
  const baseSubtotalAud = rule.priceAud * safeQty;
  const addonSubtotalAud = rule.addonPriceAud * addonQty;
  return {
    baseQty: safeQty,
    baseUnitAud: rule.priceAud,
    baseSubtotalAud,
    addonQty,
    addonUnitAud: rule.addonPriceAud,
    addonSubtotalAud,
    totalAud: baseSubtotalAud + addonSubtotalAud,
  };
}

/**
 * How long the customer's current booking will take, in minutes.
 *
 * Formula:
 *   `baseMinutes × num_systems`
 * + `addonMinutes × num_additional_indoor`
 * + `rooftopOverheadMinutes × num_systems` (only when the unit's
 *   building / unit-override places the outdoor unit on a rooftop)
 *
 * `baseMinutes` and `addonMinutes` come from the registered Service
 * catalogue resolver, keyed by the AC type the customer / unit
 * resolves to. With no resolver registered the helper falls back to
 * the legacy 45 / 15 / 0 constants — preserving the pre-Task-#182
 * behaviour for tests and isolated component renders.
 *
 * When the customer answered "I'm not sure" on the AC step
 * (`ac_discrepancy.customer.type === "unsure"`) we don't trust the
 * seeded stepper values, so we fall back to
 * {@link UNSURE_FALLBACK_MINUTES} — the smallest job Taylr will
 * dispatch — without applying any rooftop surcharge. Any "other"
 * services the customer ALSO toggled in the AC step (Task #186) still
 * contribute their deterministic catalogue minutes on top of the
 * unsure baseline — those services are independent of the AC
 * head-count guesswork.
 *
 * Pure function — used by the slot picker (to size each slot's time
 * budget) and by the admin mockup (to render the booked job's
 * duration).
 */
export function getBookingDurationMinutes(
  s: Pick<
    BookingState,
    "num_systems" | "num_additional_indoor" | "ac_discrepancy"
  > & {
    unit_id?: string | null;
    other_service_quantities?: Readonly<Record<string, number>>;
  },
): number {
  // Task #201: each selected "other" service contributes
  // `baseMinutes × qty + addonMinutes × (qty − 1)` minutes — the AC
  // indoor-unit pattern, where the first unit pays the full base
  // rate and every additional unit pays both base + add-on. Even
  // when the AC selection is "unsure", any "other" service the
  // customer ALSO chose still has a known per-qty duration (the
  // catalogue gives us deterministic minutes). The slot picker must
  // size the slot to fit them, and the Pay-step total must reflect
  // them, so add their minutes to the unsure-fallback baseline
  // rather than dropping them on the floor (which would let the
  // customer book a slot too small for the very services they just
  // selected).
  const quantities = s.other_service_quantities ?? {};
  const others = resolveOtherServiceQuantities(quantities);
  let othersMinutes = 0;
  for (const { rule, qty } of others) {
    othersMinutes += otherServiceMinutes(rule, qty);
  }
  if (s.ac_discrepancy?.customer.type === "unsure") {
    return UNSURE_FALLBACK_MINUTES + othersMinutes;
  }
  const ctx = unitDurationContextResolver(s.unit_id ?? null);
  // Pick the AC type the rule resolver should key off. Prefer the
  // customer's confirmed selection, fall back to whatever was on file
  // for the unit, then to the unit context's recorded type, and
  // finally to "split" so a brand-new session still produces a
  // meaningful number.
  const customerType = s.ac_discrepancy?.customer.type;
  const recordedType = s.ac_discrepancy?.recorded.type;
  const acType: "split" | "ducted" =
    customerType === "split" || customerType === "ducted"
      ? customerType
      : recordedType === "split" || recordedType === "ducted"
        ? recordedType
        : ctx.acType ?? "split";
  const rule = serviceRuleResolver(acType);
  const base =
    s.num_systems * rule.baseMinutes +
    s.num_additional_indoor * rule.addonMinutes;
  const overhead =
    ctx.placement.kind === "rooftop"
      ? ctx.placement.overheadMinutes * s.num_systems
      : 0;
  return base + overhead + othersMinutes;
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
