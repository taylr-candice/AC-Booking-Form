/**
 * Booking-form session store.
 *
 * Single source of truth for the customer booking flow, persisted to
 * sessionStorage so that the BookingFlow* wrapper and every iframed step
 * page see the same state. Cross-iframe sync happens via the browser's
 * `storage` event (same-origin iframes share sessionStorage; the storage
 * event fires in every other same-origin window when one of them writes).
 *
 * Keep this file dependency-free.
 *
 * Authoritative spec: attached_assets/replit_logic_v2_*.md
 */

import { useSyncExternalStore } from "react";

import { findLiveOtherServiceRuleById } from "./liveOtherServices";
import { getLiveAdditionalIndoorCap } from "./liveAcServices";

// Mirror of `OTHER_AGENCY_ID` in `./accessMethodCatalog`. Kept as a local
// constant so this module remains dependency-free per the file header
// contract — the catalog is allowed to import from here, not the other
// way round. If the canonical id ever changes, update both files.
const OTHER_AGENCY_ID_INTERNAL = "agency-005";

// Fallback ceiling for "other" service quantities when the rule has no
// per-service cap (legacy / stale ids).
const OTHER_SERVICE_GLOBAL_MAX_QTY = 99;

// ─── Domain types ───────────────────────────────────────────────────────────

export type Role = "owner" | "agent";

export type PrimaryResidence = "live_in" | "leased_out" | "vacant";

export type AccessMethod =
  // Owner + live in
  | "owner_live_at_unit"
  | "owner_live_leave_key"
  | "owner_live_parcel_locker"
  | "owner_live_collect"
  // Owner + leased out
  | "owner_leased_be_there"
  | "owner_leased_tenant"
  | "owner_leased_agent"
  | "owner_leased_leave_key"
  | "owner_leased_parcel_locker"
  // Owner + vacant
  | "owner_vacant_be_there"
  | "owner_vacant_agent"
  | "owner_vacant_leave_key"
  | "owner_vacant_parcel_locker"
  | "owner_vacant_collect"
  // Agent
  | "agent_be_there"
  // "Tenants will provide access" card — splits into who coordinates the appointment.
  | "agent_tenant_self"   // Agent will arrange the appointment with the tenant directly
  | "agent_tenant_taylr"  // Taylr will contact the tenant on the agent's behalf (coordination)
  | "agent_tenant_pending" // Agent picked "Tenants will provide access" but hasn't chosen who coordinates yet (transient — invalid for Step 4)
  | "agent_trade_key";

export type ReturnMethod = "locker" | "hand_delivery";

/** How the key is left when the top-level access method is any
 *  `owner_*_leave_key` variant.  Sub-options are displayed after the
 *  customer selects the Leave Key card; the set that appears is driven
 *  by building feature flags (see `accessMethodCatalog`).
 *
 *  - `with_someone`          — always available; attended (key holder on-site)
 *  - `with_parcel_locker`    — only if building has a Taylr parcel locker; unattended
 *  - `with_taylr`            — always available; Taylr collects the key from the
 *                              owner before the service window; unattended
 *  - `with_building_manager` — only if building has a full-time building manager; unattended
 *  - `with_concierge`        — only if building has an on-site concierge; unattended
 */
export type LeaveKeySubMethod =
  | "with_someone"
  | "with_parcel_locker"
  | "with_taylr"
  | "with_building_manager"
  | "with_concierge";

export type Tenant = {
  first: string;
  last: string;
  email: string;
  phone: string;
};

/**
 * Snapshot of how the customer's AC selection on Step 2 differs from
 * what Taylr has on record for their unit. Captured purely so the admin
 * mockup can surface the discrepancy after the booking — the customer
 * is never blocked, prompted, or warned about it.
 *
 * `customer.type === "unsure"` is always treated as a discrepancy when
 * the unit has an AC record on file (the customer is essentially saying
 * "I don't know", which by definition doesn't match a known recorded
 * type). Numbers are omitted in that case because the customer never
 * commits to a count.
 */
export type AcDiscrepancyCustomer =
  | { type: "split" | "ducted"; systems: number; additional: number }
  | { type: "unsure" };

export type AcDiscrepancy = {
  recorded: { type: "split" | "ducted"; systems: number; additional: number };
  customer: AcDiscrepancyCustomer;
};

/** Step ids in canonical order — Step 4 may be skipped at runtime. */
export type StepId = 1 | 2 | 3 | 4 | 5;

/**
 * How the customer landed on Step 2 (AC). Today the only non-default
 * origin is `"slot_picker"`, set when they tap the "Update/Edit AC info"
 * affordance on the slot picker. The AC step reads this hint to decide
 * whether to show a contextual "you came back to confirm AC details"
 * banner; without the hint they're either entering Step 2 for the first
 * time or arriving via normal forward/back navigation, neither of which
 * needs the extra framing. Cleared by every other path into Step 2
 * (forward, back, step-dot click) via `goToStep`, so the banner can
 * never linger past the visit it was set for.
 */
export type AcStepOrigin = "slot_picker" | null;

export type BookingState = {
  /** Wrapper navigation. */
  current_step: StepId;
  /** Origin hint for the most recent entry into Step 2. See
   *  {@link AcStepOrigin}. */
  ac_step_origin: AcStepOrigin;

  // Step 1 — unit + role + (agency if agent) + contact details
  unit_id: string | null;
  role: Role | null;
  agency_id: string | null;
  /** Free-text company name when an agent picks the "Other / not listed"
   *  agency option. Empty string when the user has not provided one
   *  (treat as "not provided" for validation). */
  agency_other_name: string;
  contact_first_name: string;
  contact_last_name: string;
  contact_email: string;
  contact_phone: string;
  // Step 2 — AC
  num_systems: number;
  num_additional_indoor: number;
  /** Catalogue ids of "other" services (Task #186) the customer has
   *  picked in the AC step, mapped to the chosen quantity (Task #201).
   *  Each id refers to an `AdminService` with `acTypeKey === null`
   *  (e.g. "bathroom extraction") and the value is the number of units
   *  the customer wants — e.g. `{ "svc-bath": 2 }` for two bathroom
   *  extractions. A qty of 0 (or a missing key) means the service is
   *  not selected.
   *
   *  Duration / price math follows the AC indoor-unit pattern:
   *   - minutes per id = `baseMinutes × qty + addonMinutes × (qty − 1)`
   *   - price per id   = `priceAud × qty   + addonPriceAud × (qty − 1)`
   *  i.e. the first unit pays the base rate, every additional unit
   *  pays both base + add-on (consistent with the AC stepper math
   *  where `num_systems` is multiplied by `baseMinutes` and the
   *  smaller `addonMinutes` covers each extra component beyond the
   *  first system).
   *
   *  Iteration order is the JS object insertion order, which mirrors
   *  the order the customer added services so the price card lists
   *  them in tap order. Stale ids (catalogue entry removed) are
   *  silently ignored by the resolver. */
  other_service_quantities: Record<string, number>;
  /** Snapshot of how the customer's selection on Step 2 differs from
   *  Taylr's records. Null while it matches (or the unit has no AC
   *  record to compare against). Read by the admin mockup to surface
   *  the discrepancy after the booking. */
  ac_discrepancy: AcDiscrepancy | null;
  /** Whether the customer has explicitly chosen to override what's on
   *  file for their unit on Step 2. Drives the AC step's "mode":
   *  `false` = on-file (minimal summary + Agree button); `true` =
   *  overridden (full configuration UI with the acknowledgement
   *  checkbox). The flag has no effect for units with no record on
   *  file — those always show the full configuration UI. Cleared on
   *  unit change, "Use what's on file" reset, and `bookAnother` /
   *  `pickAnotherUnit` / `reset`. */
  ac_override_active: boolean;
  // Step 3 — primary residence + access method + follow-ups
  primary_residence: PrimaryResidence | null;
  access_method: AccessMethod | null;
  /** Set when `access_method` is any `owner_*_leave_key` variant.
   *  Cleared (→ null) whenever `access_method` changes. */
  leave_key_sub_method: LeaveKeySubMethod | null;
  key_holder_name: string;
  key_holder_phone: string;
  key_collection_location: string;
  return_method: ReturnMethod | null;
  managing_agency_id: string | null;
  /** Fields populated when the user selects "Other / not listed" for the
   *  managing agency. Cleared automatically when a real agency is chosen. */
  managing_other_company: string;
  managing_other_contact: string;
  managing_other_email: string;
  managing_other_phone: string;
  /** Optional override contact shown for any known agency selection.
   *  Cleared automatically when the agency changes. */
  managing_agent_contact: string;
  managing_agent_email: string;
  managing_agent_phone: string;
  tenants: Tenant[];
  signature_acknowledged: boolean;
  signature_name: string;
  access_notes: string;
  // Step 4 — schedule
  service_date: string | null;
  service_slot: string | null;
  // Step 5 — review & pay
  cancellation_acknowledged: boolean;
  /** Set to `true` when the customer confirmed checkout while no service
   *  dates were open for their building (noDatesYet state). Taylr will
   *  contact them to lock in a window once dates are released. Surfaced
   *  on the admin booking row as `datesUnavailableAtBooking`. */
  booked_without_dates: boolean;

  // Terminal — set by `submitBooking()` after the user clicks Pay on
  // Step 5. The wrapper renders the confirmation screen instead of the
  // step iframe whenever `submitted === true`. `reference` is the
  // human-friendly booking reference shown on that screen. Both are
  // wiped by `bookAnother()` (and by `reset()`) so a fresh booking
  // never inherits the previous booking's confirmation state.
  submitted: boolean;
  reference: string | null;

  /** Short-circuit hint for the booking flow wrapper.
   *
   *  When non-null, the wrapper takes the customer straight to this
   *  step the next time they tap "Continue" on the AC step (Step 2),
   *  bypassing the usual sequential walk. Set by the wrapper itself
   *  when the customer jumps back to the AC step from the slot picker
   *  via "Update AC info", so that confirming AC details takes them
   *  back to where they were in one tap instead of three.
   *
   *  Cleared automatically as soon as the customer lands on the
   *  hinted step (see `goToStep`) so it never leaks into normal
   *  forward navigation later in the flow.
   */
  return_to: StepId | null;

  // Terminal — set by `cancelPayment()` when the customer cancels (or
  // Stripe rejects) the checkout flow. Spec §9 row "Payment cancelled":
  // the customer is shown a dedicated screen with a "Try again" CTA
  // that returns them to Step 5 (Review & pay) with their answers
  // intact. `submitted`, `payment_cancelled` and `unit_unavailable`
  // are mutually exclusive — at most one terminal flag is true at any
  // time. All three are wiped by `bookAnother()` and by `reset()`.
  payment_cancelled: boolean;

  // Terminal — set by `markUnitUnavailable()` when the server-side
  // uniqueness check rejects the submission because another customer
  // already booked the same unit (a race condition between two
  // checkouts). Spec §9 row "Unit unavailable": the customer is shown
  // a dedicated screen explaining the unit is no longer available with
  // a "Pick another unit" CTA that returns them to Step 1 with the
  // unit selection wiped (everything else preserved so they don't
  // have to re-enter their identity, AC details, etc.). Mutually
  // exclusive with `submitted` and `payment_cancelled`.
  unit_unavailable: boolean;

  // Optional blocker context surfaced on the "Unit unavailable" screen
  // (Task #49 review feedback). When the uniqueness guard rejects a
  // submission because another paid booking already exists for the
  // same unit, it can hand back the booker's name + role + scheduled
  // window so the dead-end screen can show specific context ("Henrik
  // Olsen booked the morning window on 2026-04-29") and a "Contact us"
  // CTA the customer can use to ask for help. `null` means no blocker
  // info is available (e.g. the legacy `markUnitUnavailable()` path
  // used by isolated tests/canvas previews).
  unit_unavailable_blocker: UnitUnavailableBlocker | null;
};

/** Booker context shown on the "Unit unavailable" terminal screen so
 *  the customer knows *who* won the race and what window they took.
 *  Carried from the uniqueness guard into the booking session via
 *  `submitBooking()` / `markUnitUnavailable()`. */
export type UnitUnavailableBlocker = {
  /** Display name of the booker who won the race (e.g. "Henrik Olsen"
   *  for owners, "Eloise Tran" for agents). */
  name: string;
  /** Whether the winning booker is acting as the unit's owner or as
   *  a managing agent — drives the role-aware copy on the dead-end
   *  screen ("the owner" vs "the managing agent"). */
  role: "owner" | "agent";
  /** Date string from the winning booking (`YYYY-MM-DD`). `null` for
   *  coordination bookings where no date is set yet. */
  date: string | null;
  /** Window the winning booking took. `null` for coordination bookings
   *  with `to_be_coordinated`. */
  slot: "morning" | "afternoon" | "evening" | "to_be_coordinated" | null;
};

// ─── Uniqueness guard ──────────────────────────────────────────────────────
//
// `submitBooking()` enforces "one confirmed booking per unit per service
// rollout" by calling out to a registered guard before promoting the
// session to `submitted`. The guard is wired by the admin shell (see
// `AdminApp.tsx`) so it has access to seeded bookings + capacity
// mutators; the default no-op preserves the canvas-isolated sandbox.
//
// Verdict semantics (mirrored in the JSDoc on `submitBooking`):
//   - "paid"             → another customer already paid; submission is
//                          rejected (terminal `unit_unavailable` screen).
//                          Carries `blocker` context so the dead-end
//                          screen can show who won + when (Task #49).
//   - "invoice_pending"  → an admin-created invoice-pending booking
//                          exists and was just superseded by the guard
//                          (it's been cancelled + capacity freed); the
//                          new booking proceeds normally.
//   - "ok"               → no conflict; submit normally.
//
// String shorthands ("ok" / "paid" / "invoice_pending") are accepted
// for back-compat with isolated unit tests that don't have a real
// blocker to pass — the guard layer normalises them into the object
// form internally. New call sites should always return the object
// form so the dead-end screen has rich context.

export type UniquenessVerdict =
  | "ok"
  | "invoice_pending"
  | "paid"
  | { kind: "ok" }
  | { kind: "invoice_pending" }
  | { kind: "paid"; blocker: UnitUnavailableBlocker };
export type UniquenessGuard = (
  session: BookingState,
  newBookingReference: string,
) => UniquenessVerdict;

let uniquenessGuard: UniquenessGuard = () => "ok";

/** Normalise a raw guard verdict (string shorthand or object) into
 *  the canonical object form. Internal helper used by `submitBooking`
 *  so its branch logic can pattern-match on `.kind` cleanly. */
function normaliseVerdict(
  v: UniquenessVerdict,
): { kind: "ok" } | { kind: "invoice_pending" } | { kind: "paid"; blocker: UnitUnavailableBlocker | null } {
  if (typeof v === "string") {
    if (v === "paid") return { kind: "paid", blocker: null };
    return { kind: v } as { kind: "ok" } | { kind: "invoice_pending" };
  }
  if (v.kind === "paid") return { kind: "paid", blocker: v.blocker };
  return v;
}

/** Register a uniqueness guard called from `submitBooking()`. The admin
 *  shell wires this on mount; tests call it to inject a stub. Pass
 *  `null` to reset to the default no-op (used by tests in `afterEach`). */
export function setUniquenessGuard(fn: UniquenessGuard | null): void {
  uniquenessGuard = fn ?? (() => "ok");
}

// ─── Constants ──────────────────────────────────────────────────────────────

const STORAGE_KEY = "taylr.bookingSession.v2";

/** Access methods that skip Step 4 (Schedule).
 *
 * `agent_tenant_self` is intentionally NOT here — the agent is arranging
 * the slot directly with the tenant, so they still need to pick one.
 * Only `agent_tenant_taylr` (Taylr coordinates) skips scheduling.
 */
export const COORDINATION_ACCESS_METHODS: ReadonlySet<AccessMethod> = new Set([
  "owner_leased_tenant",
  "owner_leased_agent",
  "agent_tenant_taylr",
]);

const INITIAL_STATE: BookingState = {
  current_step: 1,
  ac_step_origin: null,
  unit_id: null,
  role: null,
  agency_id: null,
  agency_other_name: "",
  contact_first_name: "",
  contact_last_name: "",
  contact_email: "",
  contact_phone: "",
  num_systems: 1,
  num_additional_indoor: 0,
  other_service_quantities: {},
  ac_discrepancy: null,
  ac_override_active: false,
  primary_residence: null,
  access_method: null,
  leave_key_sub_method: null,
  key_holder_name: "",
  key_holder_phone: "",
  key_collection_location: "",
  return_method: null,
  managing_agency_id: null,
  managing_other_company: "",
  managing_other_contact: "",
  managing_other_email: "",
  managing_other_phone: "",
  managing_agent_contact: "",
  managing_agent_email: "",
  managing_agent_phone: "",
  tenants: [],
  signature_acknowledged: false,
  signature_name: "",
  access_notes: "",
  service_date: null,
  service_slot: null,
  cancellation_acknowledged: false,
  booked_without_dates: false,
  submitted: false,
  reference: null,
  return_to: null,
  payment_cancelled: false,
  unit_unavailable: false,
  unit_unavailable_blocker: null,
};

// ─── Persisted store ────────────────────────────────────────────────────────

const isBrowser = typeof window !== "undefined";

// ─── Agent prefill (localStorage) ───────────────────────────────────────────
//
// When an agent completes a booking we snapshot their identity (role, agency,
// contact details) to `localStorage` so that the *next* time they open the
// flow — even in a new tab or after closing the browser — their details are
// pre-populated on Step 1. The per-session `sessionStorage` blob already
// carries identity forward inside `bookAnother()` for same-tab flows; the
// `localStorage` prefill covers the cross-session / cross-tab case.
//
// Only agent identity is saved — owners don't benefit from this (their unit
// is the rare, personal thing, not their role / contact), and we never carry
// forward unit, AC details, access method, or any other booking-specific data.

const AGENT_PREFILL_KEY = "taylr.agentPrefill.v1";

type AgentPrefill = {
  role: "agent";
  agency_id: string | null;
  agency_other_name: string;
  contact_first_name: string;
  contact_last_name: string;
  contact_email: string;
  contact_phone: string;
};

function saveAgentPrefill(s: BookingState): void {
  if (!isBrowser || s.role !== "agent") return;
  try {
    const blob: AgentPrefill = {
      role: "agent",
      agency_id: s.agency_id,
      agency_other_name: s.agency_other_name,
      contact_first_name: s.contact_first_name,
      contact_last_name: s.contact_last_name,
      contact_email: s.contact_email,
      contact_phone: s.contact_phone,
    };
    window.localStorage.setItem(AGENT_PREFILL_KEY, JSON.stringify(blob));
  } catch {
    /* quota / private-browsing — ignore */
  }
}

function loadAgentPrefill(): Partial<BookingState> {
  if (!isBrowser) return {};
  try {
    const raw = window.localStorage.getItem(AGENT_PREFILL_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as Partial<AgentPrefill>;
    if (p.role !== "agent") return {};
    return {
      role: "agent" as Role,
      agency_id:
        p.agency_id === null || typeof p.agency_id === "string"
          ? (p.agency_id ?? null)
          : null,
      agency_other_name:
        typeof p.agency_other_name === "string" ? p.agency_other_name : "",
      contact_first_name:
        typeof p.contact_first_name === "string" ? p.contact_first_name : "",
      contact_last_name:
        typeof p.contact_last_name === "string" ? p.contact_last_name : "",
      contact_email:
        typeof p.contact_email === "string" ? p.contact_email : "",
      contact_phone:
        typeof p.contact_phone === "string" ? p.contact_phone : "",
    };
  } catch {
    return {};
  }
}

/**
 * Schema version stamped on every persisted blob this module writes.
 *
 * The migration in {@link migratePersistedSession} is split into two
 * independent rewrites, each gated on its own threshold so a single
 * version bump can't accidentally re-trigger an unrelated rewrite:
 *
 *  - **Step down-shift** (gated on `< 3`). The legacy 7-step flow had
 *    a standalone Booker step (old step 2) which has since been
 *    collapsed into Step 1 (Unit). For blobs older than 3 we shift
 *    `current_step > 2` down by one. This is lossy by design and must
 *    NEVER be re-applied — `getBookingSession()` re-reads storage on
 *    every call (for cross-iframe sync), so re-applying the shift
 *    would silently rewrite a Step-4 customer back to Step 3.
 *
 *  - **`other_service_quantities` field rename** (gated on `< 4`).
 *    Task #186 stored "other" service selections as
 *    `selected_other_service_ids: string[]`; Task #201 promoted that
 *    to a quantity map keyed by id. For blobs older than 4 we
 *    convert each id in the legacy array into `{ [id]: 1 }` and drop
 *    the old field. New shape is JSON-compatible (no class
 *    instances), so a blob written under the new schema round-trips
 *    untouched.
 *
 * Bumping this constant is how we tell each migrator "this blob has
 * already been rewritten in the current shape for the rewrite you
 * own — skip it."
 */
const SCHEMA_VERSION = 4;

/**
 * Migrate a raw persisted session blob (as stored in sessionStorage under
 * `STORAGE_KEY`) into the canonical {@link BookingState}.
 *
 * Pure function — no DOM access — so unit tests can drive it directly
 * without spinning up a browser environment.
 *
 * Migrates legacy persisted state into the current 5-step flow (only
 * when the persisted `__schema` is older than {@link SCHEMA_VERSION} —
 * current-schema blobs are passed through untouched):
 *  - Old Step 2 (standalone "Your details" / Booker) → new Step 1
 *    (contact + agency live on the Unit page)
 *  - Old Steps 3..6 shift down by one to new Steps 2..5
 * Anything outside the new 1..5 range gets clamped to a safe value
 * (Step 1). Older 7-step blobs run through the same down-shift and
 * naturally clamp anything past Step 5 back to Step 1.
 *
 * Invalid / missing input always returns {@link INITIAL_STATE}.
 *
 * @internal — exported for tests.
 */
export function migratePersistedSession(raw: string | null): BookingState {
  if (!raw) return INITIAL_STATE;
  try {
    const parsed = JSON.parse(raw) as Partial<BookingState> & {
      __schema?: unknown;
      current_step?: unknown;
      /** Legacy field replaced in schema 4 by `other_service_quantities`. */
      selected_other_service_ids?: unknown;
    };
    const rawStep = parsed.current_step;
    const schema =
      typeof parsed.__schema === "number" ? parsed.__schema : 0;
    // Drop the wrapper field so it doesn't leak into BookingState.
    const {
      __schema: _ignoredSchema,
      selected_other_service_ids: legacyOtherIds,
      ...rest
    } = parsed;
    void _ignoredSchema;

    let step: StepId = 1;
    if (typeof rawStep === "number" && Number.isInteger(rawStep)) {
      // Booker → Unit collapse (gated on `< 3`). Anything stamped at
      // 3+ trusts the persisted step verbatim — re-applying the
      // shift would silently rewrite a Step-4 customer back to
      // Step 3 (see SCHEMA_VERSION).
      const candidate =
        schema >= 3
          ? rawStep
          : rawStep === 2
            ? 1
            : rawStep > 2
              ? rawStep - 1
              : rawStep;
      if (candidate >= 1 && candidate <= 5) step = candidate as StepId;
    }

    // `other_service_quantities` rename (gated on `< 4`).
    // Legacy blobs carried `selected_other_service_ids: string[]`;
    // promote each id to qty 1 in the new map. Newer blobs already
    // have a map and we leave it alone (subject to the runtime guard
    // in {@link normaliseOtherServiceQuantities}).
    let otherQuantities: Record<string, number>;
    if (schema >= 4) {
      otherQuantities = normaliseOtherServiceQuantities(
        rest.other_service_quantities,
      );
    } else if (Array.isArray(legacyOtherIds)) {
      otherQuantities = {};
      for (const id of legacyOtherIds) {
        if (typeof id === "string" && id.length > 0 && !(id in otherQuantities)) {
          otherQuantities[id] = 1;
        }
      }
    } else {
      // Legacy blob without the field at all — start empty.
      otherQuantities = {};
    }

    return {
      ...INITIAL_STATE,
      ...rest,
      current_step: step,
      other_service_quantities: otherQuantities,
    };
  } catch {
    return INITIAL_STATE;
  }
}

/** Coerce a persisted `other_service_quantities` blob back into the
 *  canonical shape. Drops keys whose value isn't a positive integer
 *  (qty 0 means "not selected" and shouldn't sit in the map; floats /
 *  strings / negatives are corruption-recovery fallback). Pure helper
 *  used by both the persistence migration and the runtime setter. */
function normaliseOtherServiceQuantities(
  raw: unknown,
): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof id !== "string" || id.length === 0) continue;
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    const qty = Math.floor(value);
    if (qty >= 1) out[id] = qty;
  }
  return out;
}

/** Structural equality (key set + qty) for two quantity maps —
 *  intentionally order-independent so `{a:1,b:2}` and `{b:2,a:1}`
 *  are considered equal. Insertion order is preserved by callers
 *  separately (it drives display order, not equality). */
function otherServiceQuantitiesEqual(
  a: Record<string, number>,
  b: Record<string, number>,
): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

function readFromStorage(): BookingState {
  if (!isBrowser) return INITIAL_STATE;
  try {
    const persisted = migratePersistedSession(
      window.sessionStorage.getItem(STORAGE_KEY),
    );
    // If the session is completely fresh (no role picked yet), overlay any
    // saved agent prefill so returning agents see their identity pre-populated
    // on Step 1 — role, agency, and contact details all filled in — without
    // having to re-enter them for every new booking from a new tab/session.
    if (persisted.role === null) {
      const prefill = loadAgentPrefill();
      if (Object.keys(prefill).length > 0) {
        return { ...persisted, ...prefill };
      }
    }
    return persisted;
  } catch {
    // sessionStorage access can throw in some sandboxed contexts.
    return INITIAL_STATE;
  }
}

function writeToStorage(state: BookingState) {
  if (!isBrowser) return;
  try {
    // Stamp the current schema version so the next read can skip the
    // legacy down-shift. See {@link SCHEMA_VERSION}.
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ __schema: SCHEMA_VERSION, ...state }),
    );
  } catch {
    /* quota / private mode — ignore */
  }
}

let state: BookingState = readFromStorage();
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function setState(updater: (prev: BookingState) => BookingState) {
  const next = updater(state);
  if (next === state) return;
  state = next;
  writeToStorage(state);
  emit();
}

if (isBrowser) {
  // Cross-iframe sync — fires in every same-origin window EXCEPT the writer.
  window.addEventListener("storage", (e) => {
    if (e.key !== STORAGE_KEY) return;
    state = readFromStorage();
    emit();
  });
}

// ─── React subscription ────────────────────────────────────────────────────

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return state;
}

/** Subscribe a React component to the whole booking state. */
export function useBookingSession(): BookingState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Subscribe with a selector for fine-grained re-rendering. */
export function useBookingSelector<T>(selector: (s: BookingState) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(state),
    () => selector(INITIAL_STATE),
  );
}

/** Direct (non-hook) access for one-off reads, e.g. event handlers.
 *
 * Re-reads sessionStorage on every call so that cross-iframe writes
 * which haven't yet been observed via the async `storage` event are
 * still seen by the caller. The local `state` cache is refreshed too,
 * but no subscribers are notified — the storage event will do that
 * for us once it fires.
 */
export function getBookingSession(): BookingState {
  if (isBrowser) {
    state = readFromStorage();
  }
  return state;
}

// ─── Cascade-clearing helpers ──────────────────────────────────────────────

/** Clear all per-method follow-up fields for Step 3 (Access). */
function clearAccessFollowUps(s: BookingState): BookingState {
  return {
    ...s,
    leave_key_sub_method: null,
    key_holder_name: "",
    key_holder_phone: "",
    key_collection_location: "",
    return_method: null,
    managing_agency_id: null,
    managing_other_company: "",
    managing_other_contact: "",
    managing_other_email: "",
    managing_other_phone: "",
    managing_agent_contact: "",
    managing_agent_email: "",
    managing_agent_phone: "",
    tenants: [],
    signature_acknowledged: false,
    signature_name: "",
    // access_notes is cascade-cleared by `setAccessMethod` itself when
    // the new method is non-be-there (the textarea is hidden in that
    // case so any previously-typed note would be unreachable to edit).
  };
}

/** Be-there methods are the only ones that show the access-notes
 *  textarea — when the customer isn't on-site, technician notes have
 *  no destination. Mirrors the `isBeThereMethod` test in
 *  `accessMethodCatalog`. Inlined here so this module stays
 *  dependency-free. */
const BE_THERE_ACCESS_METHODS: ReadonlySet<AccessMethod> = new Set<AccessMethod>([
  "owner_live_at_unit",
  "owner_leased_be_there",
  "owner_vacant_be_there",
  "agent_be_there",
]);

/** Leave-key methods — require leave_key_sub_method + sub-specific follow-ups.
 *  Mirrored from `isLeaveKeyMethod` in accessMethodCatalog; inlined to keep
 *  this module dependency-free. */
const LEAVE_KEY_ACCESS_METHODS: ReadonlySet<AccessMethod> = new Set<AccessMethod>([
  "owner_live_leave_key",
  "owner_leased_leave_key",
  "owner_vacant_leave_key",
]);

/** Collect-and-return methods — require key_collection_location + return_method
 *  + signature acknowledgement.  Mirrored from `isCollectReturnMethod`. */
const COLLECT_RETURN_ACCESS_METHODS: ReadonlySet<AccessMethod> = new Set<AccessMethod>([
  "owner_live_collect",
  "owner_vacant_collect",
]);

/** Managing-agent methods — require managing_agency_id.
 *  Mirrored from `isManagingAgentMethod`. */
const MANAGING_AGENT_ACCESS_METHODS: ReadonlySet<AccessMethod> = new Set<AccessMethod>([
  "owner_leased_agent",
  "owner_vacant_agent",
]);

/** Agent-trade-key method — requires signature only.
 *  Mirrored from `isAgentTradeMethod`. */
const AGENT_TRADE_ACCESS_METHODS: ReadonlySet<AccessMethod> = new Set<AccessMethod>([
  "agent_trade_key",
]);

/** Tenant coordination methods that are already sub-resolved (not pending).
 *  Require tenants list + signature. */
const TENANT_COORD_ACCESS_METHODS: ReadonlySet<AccessMethod> = new Set<AccessMethod>([
  "agent_tenant_self",
  "agent_tenant_taylr",
]);

// ---------------------------------------------------------------------------
// Mockup auto-seed constants
// Must stay in sync with DEMO_MANAGING_AGENCIES[0] in accessMethodCatalog.ts.
// ---------------------------------------------------------------------------
const DEMO_FIRST_AGENCY_ID = "agency-001";
const DEMO_KEY_HOLDER_NAME = "John Smith";
const DEMO_KEY_HOLDER_PHONE = "0412 345 678";
const DEMO_KEY_COLLECTION_LOCATION = "Level 1 lobby, near mailboxes";
const DEMO_SIGNATURE_NAME = "Demo User";

/** Clear everything that depends on the role (spec §13.3 row "Role"). */
function clearRoleDownstream(s: BookingState): BookingState {
  return clearAccessFollowUps({
    ...s,
    agency_id: null,
    agency_other_name: "",
    primary_residence: null,
    access_method: null,
    service_date: null,
    service_slot: null,
  });
}

/** Structural equality for {@link AcDiscrepancy}; treats `null` as equal
 *  to `null`. Inlined so this module stays dependency-free. */
function acDiscrepancyEqual(
  a: AcDiscrepancy | null,
  b: AcDiscrepancy | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (
    a.recorded.type !== b.recorded.type ||
    a.recorded.systems !== b.recorded.systems ||
    a.recorded.additional !== b.recorded.additional
  ) {
    return false;
  }
  if (a.customer.type !== b.customer.type) return false;
  if (a.customer.type === "unsure") return true;
  // Both customers are "split"|"ducted" with numbers — narrowed by the
  // type-equality check above (b.customer.type === a.customer.type).
  const bc = b.customer as { systems: number; additional: number };
  return a.customer.systems === bc.systems && a.customer.additional === bc.additional;
}

// ─── Reference generation ──────────────────────────────────────────────────

/**
 * Generate a short, human-friendly booking reference shaped like
 * `TLR-AB23CD` — two letters, two digits, two letters. Intentionally
 * skips visually ambiguous characters (`I`, `O`, `0`, `1`) so a
 * customer reading the reference back over the phone is unlikely to
 * misread it.
 *
 * Inlined here (rather than living in `bookingHelpers.ts`) so this
 * module stays dependency-free per the file header contract.
 */
function genBookingReference(): string {
  const alpha = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const num = "23456789";
  const pick = (chars: string, n: number) =>
    Array.from({ length: n }, () =>
      chars[Math.floor(Math.random() * chars.length)],
    ).join("");
  return `TLR-${pick(alpha, 2)}${pick(num, 2)}${pick(alpha, 2)}`;
}

// ─── Public actions ─────────────────────────────────────────────────────────

export const bookingActions = {
  /** Navigate to a specific step. Always clears `ac_step_origin` because
   *  every entry path other than the slot picker's "Update/Edit AC info"
   *  affordance funnels through here (NAV_FORWARD, NAV_BACK, step-dot
   *  click). The slot-picker affordance uses the dedicated atomic
   *  {@link editAcFromSlotPicker} action, which sets the origin and the
   *  step in a single write so this clear can never race it. */
  goToStep(step: StepId) {
    setState((s) => {
      // The wrapper sets `return_to` when the customer jumps back to
      // the AC step from the slot picker so that confirming AC details
      // brings them straight back. The hint is consumed the moment
      // they actually arrive at the hinted step (typically Step 4 — Slots),
      // so it never lingers and influences normal forward navigation
      // on a subsequent pass through the flow.
      const nextReturnTo =
        s.return_to !== null && step === s.return_to ? null : s.return_to;
      // `ac_step_origin` is always cleared by `goToStep` because every
      // entry path into Step 2 other than the slot picker's dedicated
      // affordance funnels through here (NAV_FORWARD, NAV_BACK,
      // step-dot click). The slot-picker affordance bypasses
      // `goToStep` and uses {@link editAcFromSlotPicker}, which sets
      // current_step and ac_step_origin in a single write so this
      // clear can never race it.
      if (
        s.current_step === step &&
        s.return_to === nextReturnTo &&
        s.ac_step_origin === null
      ) {
        return s;
      }
      return {
        ...s,
        current_step: step,
        return_to: nextReturnTo,
        ac_step_origin: null,
      };
    });
  },

  /** Stash a "where the customer came from" hint so the wrapper can
   *  short-circuit the next Continue tap on the AC step. Pass `null`
   *  to clear an existing hint. */
  setReturnTo(step: StepId | null) {
    setState((s) => (s.return_to === step ? s : { ...s, return_to: step }));
  },

  /** Atomic action for the slot picker's "Update/Edit AC info" affordance.
   *  Jumps to Step 2 AND records that the customer arrived from the slot
   *  picker, so the AC step can render its contextual "you came back to
   *  confirm AC details" banner. Atomic so the banner can't briefly flicker
   *  on/off if a render reads state between two separate writes. Leaves
   *  `return_to` alone so the wrapper's separate "stash where the
   *  customer came from" hint (set by the same handler) survives the
   *  navigation. */
  editAcFromSlotPicker() {
    setState((s) =>
      s.current_step === 2 && s.ac_step_origin === "slot_picker"
        ? s
        : { ...s, current_step: 2, ac_step_origin: "slot_picker" },
    );
  },

  /** Manually clear the AC-step origin hint — used by the AC step's
   *  dismiss button on the slot-picker callout. */
  setAcStepOrigin(origin: AcStepOrigin) {
    setState((s) =>
      s.ac_step_origin === origin ? s : { ...s, ac_step_origin: origin },
    );
  },

  // Step 1 — unit
  setUnit(unit_id: string | null) {
    setState((s) =>
      s.unit_id === unit_id
        ? s
        : {
            ...s,
            unit_id,
            // Spec §13.3: changing unit re-loads AC pre-fill (handled by Step 2 — AC).
            // The discrepancy snapshot refers to the previous unit's record
            // and would be misleading once the unit changes — wipe it so the
            // AC step starts from a clean slate when the customer revisits it.
            ac_discrepancy: null,
            // The override flag is per-unit — once the unit changes, the
            // customer should land back on the new unit's on-file view
            // (or the no-record full UI if there are no records).
            ac_override_active: false,
          },
    );
  },

  // Step 1 — role
  setRole(role: Role | null) {
    setState((s) => (s.role === role ? s : clearRoleDownstream({ ...s, role })));
  },

  // Step 1 — agency + contact
  setAgency(agency_id: string | null) {
    setState((s) => {
      if (s.agency_id === agency_id) return s;
      // When the user moves OFF the "Other / not listed" option, also clear
      // any free-text company name so it can't silently linger in the booking.
      // Mirrors the OTHER_AGENCY_ID constant in accessMethodCatalog.ts —
      // duplicated here to keep this module dependency-free (see file header).
      const isOther = agency_id === OTHER_AGENCY_ID_INTERNAL;
      return {
        ...s,
        agency_id,
        agency_other_name: isOther ? s.agency_other_name : "",
      };
    });
  },
  setAgencyOtherName(value: string) {
    setState((s) =>
      s.agency_other_name === value ? s : { ...s, agency_other_name: value },
    );
  },
  setContact(
    fields: Partial<
      Pick<
        BookingState,
        | "contact_first_name"
        | "contact_last_name"
        | "contact_email"
        | "contact_phone"
      >
    >,
  ) {
    setState((s) => ({ ...s, ...fields }));
  },

  // Step 2 — AC
  setSystems(n: number) {
    const clamped = Math.max(1, Math.min(10, Math.round(n)));
    setState((s) => (s.num_systems === clamped ? s : { ...s, num_systems: clamped }));
  },
  /**
   * Set the per-system add-on count (Step 2 indoor-unit / return-air
   * grille stepper). When `acTypeKey` is `"split"` or `"ducted"`, the
   * value is strictly clamped to the per-AC-type catalogue cap from
   * `getLiveAdditionalIndoorCap` (Task #222 — mirrors the per-service
   * cap Task #212 added for "other" services so a customer can't
   * fat-finger "20 indoor heads"). The cap helper has a built-in
   * fallback (DEFAULT_AC_INDOOR_CAPS) so the limit applies even when
   * AdminApp hasn't published a projection (canvas-isolated previews,
   * fresh tabs). Unknown / legacy callers (no acTypeKey, "other"
   * services, on-file sync for unrecognised types) keep the
   * historical 0..29 ceiling so they don't accidentally inherit a
   * stricter customer-flow limit.
   */
  setAdditionalIndoor(
    n: number,
    opts?: { acTypeKey?: "split" | "ducted" | null },
  ) {
    const acTypeKey = opts?.acTypeKey ?? null;
    // Known split/ducted callers clamp strictly to the live (or
    // default) per-AC-type cap — Task #222. Unknown / legacy callers
    // (admin staff form, on-file sync for unrecognised types, older
    // tests) keep the historical 0..29 ceiling so they don't
    // accidentally inherit a stricter customer-flow limit.
    const ceiling =
      acTypeKey === "split" || acTypeKey === "ducted"
        ? getLiveAdditionalIndoorCap(acTypeKey)
        : 29;
    const clamped = Math.max(0, Math.min(ceiling, Math.round(n)));
    setState((s) =>
      s.num_additional_indoor === clamped ? s : { ...s, num_additional_indoor: clamped },
    );
  },
  /** Replace the customer's currently-selected "other" services
   *  (Task #186, Task #201). Accepts either a list of ids (each
   *  promoted to qty 1, dedupes input while preserving first-seen
   *  order — useful if a caller hands us [a, b, a] from a checkbox
   *  state shuffle) or a quantity map. No-op if the resulting map is
   *  structurally equal to what's already in state. */
  setOtherServices(input: readonly string[] | Record<string, number>) {
    setState((s) => {
      let next: Record<string, number>;
      if (Array.isArray(input)) {
        next = {};
        for (const id of input) {
          if (typeof id !== "string" || id.length === 0) continue;
          if (id in next) continue;
          next[id] = 1;
        }
      } else {
        next = normaliseOtherServiceQuantities(input);
      }
      if (otherServiceQuantitiesEqual(s.other_service_quantities, next)) {
        return s;
      }
      return { ...s, other_service_quantities: next };
    });
  },
  /** Set a single service id to a specific quantity. `qty <= 0`
   *  removes the entry. Quantities are clamped to the catalogue's
   *  per-service `maxQty`, falling back to the global ceiling for
   *  stale ids and rules with no cap. */
  setOtherServiceQuantity(id: string, qty: number) {
    if (!id) return;
    setState((s) => {
      const cur = s.other_service_quantities;
      const rule = findLiveOtherServiceRuleById(id);
      const ruleCap =
        rule?.maxQty != null && Number.isFinite(rule.maxQty) && rule.maxQty > 0
          ? Math.floor(rule.maxQty)
          : null;
      const ceiling =
        ruleCap != null
          ? Math.min(ruleCap, OTHER_SERVICE_GLOBAL_MAX_QTY)
          : OTHER_SERVICE_GLOBAL_MAX_QTY;
      const clamped = Math.min(ceiling, Math.max(0, Math.floor(qty)));
      if (clamped === 0) {
        if (!(id in cur)) return s;
        // Re-build the object so insertion order of the remaining
        // ids is preserved (delete-then-spread would leave a stale
        // hole in the iteration order on some engines).
        const next: Record<string, number> = {};
        for (const [k, v] of Object.entries(cur)) {
          if (k !== id) next[k] = v;
        }
        return { ...s, other_service_quantities: next };
      }
      if (cur[id] === clamped) return s;
      // Preserve insertion order: existing keys keep their slot,
      // a brand-new id is appended at the end so the price card
      // lists services in the order the customer picked them.
      if (id in cur) {
        const next: Record<string, number> = {};
        for (const [k, v] of Object.entries(cur)) {
          next[k] = k === id ? clamped : v;
        }
        return { ...s, other_service_quantities: next };
      }
      return {
        ...s,
        other_service_quantities: { ...cur, [id]: clamped },
      };
    });
  },
  /** Toggle a single "other" service id on/off. Appends new ids at
   *  the end so the price-card display reflects the order the
   *  customer ticked them. Idempotent for the no-op case (empty id
   *  string). When toggling on, the qty defaults to 1 — the customer
   *  can bump it up via the stepper. When toggling off, any
   *  previously-set qty is wiped. */
  toggleOtherService(id: string) {
    if (!id) return;
    setState((s) => {
      const cur = s.other_service_quantities;
      if (id in cur) {
        const next: Record<string, number> = {};
        for (const [k, v] of Object.entries(cur)) {
          if (k !== id) next[k] = v;
        }
        return { ...s, other_service_quantities: next };
      }
      return {
        ...s,
        other_service_quantities: { ...cur, [id]: 1 },
      };
    });
  },
  /** Persist the latest discrepancy snapshot from the AC step. Null when the
   *  customer's selection matches Taylr's records (or there's no record on
   *  file). The action skips writes when the new value is structurally equal
   *  to the current one so a render-driven effect can call it on every render
   *  without triggering subscriber storms. */
  setAcDiscrepancy(discrepancy: AcDiscrepancy | null) {
    setState((s) =>
      acDiscrepancyEqual(s.ac_discrepancy, discrepancy)
        ? s
        : { ...s, ac_discrepancy: discrepancy },
    );
  },
  /** Toggle the on-file vs overridden mode flag for the AC step.
   *  Set to `true` when the customer clicks "Update the details" on
   *  the on-file view; cleared by "Use what's on file", unit change,
   *  and `bookAnother`/`pickAnotherUnit`/`reset`. When clearing back
   *  to `false`, also wipes any captured discrepancy snapshot — the
   *  customer is reverting to the on-file record, so the prior
   *  override should not survive in the booking session. */
  setAcOverrideActive(active: boolean) {
    setState((s) => {
      if (s.ac_override_active === active) return s;
      if (!active) {
        // Reverting to "use what's on file" — also drop the captured
        // discrepancy so the booking is recorded as matching the
        // on-file record exactly.
        return { ...s, ac_override_active: false, ac_discrepancy: null };
      }
      return { ...s, ac_override_active: true };
    });
  },

  // Step 3 — access method + follow-ups
  setPrimaryResidence(residence: PrimaryResidence | null) {
    setState((s) =>
      s.primary_residence === residence
        ? s
        : clearAccessFollowUps({
            ...s,
            primary_residence: residence,
            access_method: null,
            service_date: null,
            service_slot: null,
          }),
    );
  },
  setAccessMethod(access_method: AccessMethod | null) {
    setState((s) => {
      if (s.access_method === access_method) return s;
      // If switching INTO a coordination flow, also clear any previously chosen slot.
      const wasCoordination = s.access_method
        ? COORDINATION_ACCESS_METHODS.has(s.access_method)
        : false;
      const isCoordination = access_method
        ? COORDINATION_ACCESS_METHODS.has(access_method)
        : false;
      const next = clearAccessFollowUps({ ...s, access_method });
      // Drop any previously-typed access notes when switching to a
      // method where the textarea is hidden — otherwise the note would
      // be silently carried into the booking with no UI to edit it.
      const newIsBeThere = access_method
        ? BE_THERE_ACCESS_METHODS.has(access_method)
        : false;
      if (!newIsBeThere) {
        next.access_notes = "";
      }
      if (wasCoordination !== isCoordination) {
        next.service_date = null;
        next.service_slot = null;
      }
      // If the user is currently sitting on Step 4 (Schedule) and the new
      // method makes Step 4 hidden, jump forward to Step 5 so the wrapper
      // never lingers on a hidden step.
      if (isCoordination && next.current_step === 4) {
        next.current_step = 5;
      }
      // Mockup auto-seed: pre-populate the required sub-fields for the
      // newly selected method so the Access step passes validation
      // immediately.  The user can still inspect and change every seeded
      // value in the UI — this only ensures the Continue button is
      // unblocked from the first card tap, matching the tenant section's
      // TENANT_SEED pattern.
      if (access_method) {
        if (LEAVE_KEY_ACCESS_METHODS.has(access_method)) {
          // No default sub-option — user must explicitly choose how
          // they'll leave the key.
        } else if (COLLECT_RETURN_ACCESS_METHODS.has(access_method)) {
          next.key_collection_location = DEMO_KEY_COLLECTION_LOCATION;
          next.return_method = "locker";
          next.signature_acknowledged = true;
          next.signature_name = DEMO_SIGNATURE_NAME;
        } else if (MANAGING_AGENT_ACCESS_METHODS.has(access_method)) {
          next.managing_agency_id = DEMO_FIRST_AGENCY_ID;
        } else if (AGENT_TRADE_ACCESS_METHODS.has(access_method)) {
          next.signature_acknowledged = true;
          next.signature_name = DEMO_SIGNATURE_NAME;
        } else if (TENANT_COORD_ACCESS_METHODS.has(access_method)) {
          next.signature_acknowledged = true;
          next.signature_name = DEMO_SIGNATURE_NAME;
        }
      }
      return next;
    });
  },
  setLeaveKeySubMethod(method: LeaveKeySubMethod | null) {
    setState((s) => {
      const next: BookingState = {
        ...s,
        leave_key_sub_method: method,
        // Switching sub-method clears key-holder details and signature so
        // stale data from a previous sub-selection doesn't carry over.
        key_holder_name: "",
        key_holder_phone: "",
        signature_acknowledged: false,
        signature_name: "",
      };
      // Mockup auto-seed: re-populate required fields for the newly chosen
      // sub-option so Continue stays unblocked after every card switch.
      if (method === "with_someone") {
        next.key_holder_name = DEMO_KEY_HOLDER_NAME;
        next.key_holder_phone = DEMO_KEY_HOLDER_PHONE;
      } else if (method !== null) {
        // All other sub-options (with_taylr, with_parcel_locker,
        // with_building_manager, with_concierge) are unattended and
        // require a signature acknowledgement.
        next.signature_acknowledged = true;
        next.signature_name = DEMO_SIGNATURE_NAME;
      }
      return next;
    });
  },
  setKeyHolder(fields: Partial<Pick<BookingState, "key_holder_name" | "key_holder_phone">>) {
    setState((s) => ({ ...s, ...fields }));
  },
  setKeyCollectionLocation(value: string) {
    setState((s) => ({ ...s, key_collection_location: value }));
  },
  setReturnMethod(method: ReturnMethod | null) {
    setState((s) => ({ ...s, return_method: method }));
  },
  setManagingAgency(agency_id: string | null) {
    const isOther = agency_id === OTHER_AGENCY_ID_INTERNAL;
    setState((s) => ({
      ...s,
      managing_agency_id: agency_id,
      // Clear the free-text "Other" details when the user picks a real agency.
      managing_other_company: isOther ? s.managing_other_company : "",
      managing_other_contact: isOther ? s.managing_other_contact : "",
      managing_other_email: isOther ? s.managing_other_email : "",
      managing_other_phone: isOther ? s.managing_other_phone : "",
      // Always clear the optional agent contact override when the agency changes.
      managing_agent_contact: "",
      managing_agent_email: "",
      managing_agent_phone: "",
    }));
  },
  setManagingOtherDetails(
    fields: Partial<
      Pick<BookingState, "managing_other_company" | "managing_other_contact" | "managing_other_email" | "managing_other_phone">
    >,
  ) {
    setState((s) => ({ ...s, ...fields }));
  },
  setManagingAgentContact(
    fields: Partial<Pick<BookingState, "managing_agent_contact" | "managing_agent_email" | "managing_agent_phone">>,
  ) {
    setState((s) => ({ ...s, ...fields }));
  },
  setTenants(tenants: Tenant[]) {
    setState((s) => ({ ...s, tenants }));
  },
  setSignature(fields: Partial<Pick<BookingState, "signature_acknowledged" | "signature_name">>) {
    setState((s) => ({ ...s, ...fields }));
  },
  setAccessNotes(value: string) {
    setState((s) => ({ ...s, access_notes: value }));
  },

  // Step 4 — schedule
  setSchedule(date: string | null, slot: string | null) {
    setState((s) => ({ ...s, service_date: date, service_slot: slot }));
  },

  // Step 5 — review & pay
  setCancellationAcknowledged(value: boolean) {
    setState((s) => ({ ...s, cancellation_acknowledged: value }));
  },

  setBookedWithoutDates(value: boolean) {
    setState((s) => ({ ...s, booked_without_dates: value }));
  },

  /** Spec §9: mark the booking as successfully submitted and assign a
   *  human-friendly reference. The wrapper renders the confirmation
   *  screen whenever `submitted === true`. Idempotent — once submitted,
   *  re-submitting keeps the same reference (so a stray double-click
   *  on the iframed Pay button doesn't change the reference the
   *  customer is already reading).
   *
   *  No-op when any other terminal flag is already set
   *  (`payment_cancelled` or `unit_unavailable`) so a stale Pay button
   *  click can't promote a terminal booking to confirmed. The user
   *  must explicitly recover (Try again / Pick another unit) first,
   *  which clears the flag.
   *
   *  Before promoting to `submitted`, runs the registered uniqueness
   *  guard ({@link setUniquenessGuard}) — the admin shell wires this
   *  to enforce "one confirmed booking per unit per service rollout":
   *
   *   - "paid"             → another customer already paid for this
   *                          unit; mark the session `unit_unavailable`
   *                          and DON'T submit.
   *   - "invoice_pending"  → an admin-created booking with a pending
   *                          invoice exists; the guard supersedes it
   *                          (cancel + free capacity), then we submit.
   *   - "ok"               → no conflict, submit normally.
   *
   *  The default guard is a no-op so the canvas-isolated mockup
   *  sandbox keeps working without an admin shell wired in. */
  submitBooking() {
    setState((s) => {
      if (s.submitted || s.payment_cancelled || s.unit_unavailable) return s;
      const reference = genBookingReference();
      const verdict = normaliseVerdict(uniquenessGuard(s, reference));
      if (verdict.kind === "paid") {
        return {
          ...s,
          unit_unavailable: true,
          unit_unavailable_blocker: verdict.blocker,
        };
      }
      // "invoice_pending" — guard already side-effected the prior
      // booking + freed capacity; carry on as a normal submission.
      // "ok" — same.
      return { ...s, submitted: true, reference };
    });
    // After a successful submission, persist agent identity to localStorage
    // so it pre-populates Step 1 the next time this agent opens the booking
    // flow in a new tab or browser session (cross-session prefill).
    // `state` is already updated by `setState` above, so we read it here.
    if (state.submitted && state.role === "agent") {
      saveAgentPrefill(state);
    }
  },

  /** Spec §9 row "Payment cancelled": flag the booking as cancelled at
   *  checkout. The wrapper renders the dedicated cancellation screen
   *  whenever `payment_cancelled === true`. All non-terminal answers
   *  are preserved so the customer can hit "Try again" and land back
   *  on Step 5 with their selections intact.
   *
   *  No-op when any other terminal flag is set — once a real payment
   *  has gone through, or the unit was already taken, a stray cancel
   *  signal must not flip the customer to a "cancelled" terminal
   *  screen. */
  cancelPayment() {
    setState((s) => {
      if (s.submitted || s.payment_cancelled || s.unit_unavailable) return s;
      return { ...s, payment_cancelled: true };
    });
  },

  /** Spec §9 row "Payment cancelled": the "Try again" CTA on the
   *  cancellation screen returns the customer to Step 5 (Review &
   *  pay). Clears the terminal flag without touching any of the
   *  customer's answers. */
  tryAgainAfterCancel() {
    setState((s) =>
      s.payment_cancelled
        ? { ...s, payment_cancelled: false, current_step: 5 }
        : s,
    );
  },

  /** Spec §9 row "Unit unavailable": flag the booking as rejected
   *  because the server-side uniqueness check found another customer
   *  already booked the same unit. The wrapper renders the dedicated
   *  unit-unavailable screen whenever `unit_unavailable === true`.
   *
   *  No-op when any other terminal flag is set — a stale signal must
   *  not flip a confirmed or already-cancelled booking onto the
   *  unit-unavailable screen. The customer recovers via
   *  {@link pickAnotherUnit}, which clears the flag and returns them
   *  to Step 1. */
  markUnitUnavailable(blocker?: UnitUnavailableBlocker) {
    setState((s) => {
      if (s.submitted || s.payment_cancelled || s.unit_unavailable) return s;
      return {
        ...s,
        unit_unavailable: true,
        unit_unavailable_blocker: blocker ?? null,
      };
    });
  },

  /** Spec §9 row "Unit unavailable": the "Pick another unit" CTA on
   *  the unit-unavailable screen returns the customer to Step 1 with
   *  the unit selection wiped, mirroring what `setUnit(null)` would
   *  do (also clears `ac_discrepancy`, which is computed against the
   *  previous unit's record and would be misleading otherwise). All
   *  other answers are preserved so the customer doesn't have to
   *  re-enter their identity, AC counts, access method, etc. just
   *  because someone else won the race for their first-choice unit. */
  pickAnotherUnit() {
    setState((s) =>
      s.unit_unavailable
        ? {
            ...s,
            unit_unavailable: false,
            unit_unavailable_blocker: null,
            unit_id: null,
            ac_discrepancy: null,
            ac_override_active: false,
            current_step: 1,
          }
        : s,
    );
  },

  /** Spec §12: keep role/agency/contact, reset everything else. */
  bookAnother() {
    setState((s) => ({
      ...INITIAL_STATE,
      role: s.role,
      agency_id: s.agency_id,
      // Carry the free-text company name forward IFF the retained agency
      // is still "Other / not listed" — otherwise it would point at a
      // different (real) agency from the previous booking.
      agency_other_name:
        s.agency_id === OTHER_AGENCY_ID_INTERNAL ? s.agency_other_name : "",
      contact_first_name: s.contact_first_name,
      contact_last_name: s.contact_last_name,
      contact_email: s.contact_email,
      contact_phone: s.contact_phone,
      current_step: 1,
    }));
  },

  /** Full wipe — useful for the demo "reset" affordance. */
  reset() {
    setState(() => ({ ...INITIAL_STATE }));
  },
};
