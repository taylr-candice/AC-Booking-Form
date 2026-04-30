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

// Mirror of `OTHER_AGENCY_ID` in `./accessMethodCatalog`. Kept as a local
// constant so this module remains dependency-free per the file header
// contract — the catalog is allowed to import from here, not the other
// way round. If the canonical id ever changes, update both files.
const OTHER_AGENCY_ID_INTERNAL = "agency-005";

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
   *  toggled on in the AC step. Each id refers to an `AdminService`
   *  with `acTypeKey === null` (e.g. "bathroom extraction"). The
   *  catalogue's `baseMinutes` + `addonMinutes` for each selected id
   *  contribute to the slot picker's duration math, and the `priceAud`
   *  + `addonPriceAud` contribute to the customer pricing card and
   *  the Pay step total. Order is preserved so the price card lists
   *  services in the order the customer toggled them. Stale ids
   *  (catalogue entry removed) are silently ignored by the resolver. */
  selected_other_service_ids: string[];
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
  key_holder_name: string;
  key_holder_phone: string;
  key_collection_location: string;
  return_method: ReturnMethod | null;
  managing_agency_id: string | null;
  tenants: Tenant[];
  signature_acknowledged: boolean;
  signature_name: string;
  access_notes: string;
  // Step 4 — schedule
  service_date: string | null;
  service_slot: string | null;
  // Step 5 — review & pay
  cancellation_acknowledged: boolean;

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
  selected_other_service_ids: [],
  ac_discrepancy: null,
  ac_override_active: false,
  primary_residence: null,
  access_method: null,
  key_holder_name: "",
  key_holder_phone: "",
  key_collection_location: "",
  return_method: null,
  managing_agency_id: null,
  tenants: [],
  signature_acknowledged: false,
  signature_name: "",
  access_notes: "",
  service_date: null,
  service_slot: null,
  cancellation_acknowledged: false,
  submitted: false,
  reference: null,
  return_to: null,
  payment_cancelled: false,
  unit_unavailable: false,
  unit_unavailable_blocker: null,
};

// ─── Persisted store ────────────────────────────────────────────────────────

const isBrowser = typeof window !== "undefined";

/**
 * Schema version stamped on every persisted blob this module writes.
 *
 * The legacy → current migration in {@link migratePersistedSession} is
 * lossy by design: it shifts any persisted `current_step > 2` down by
 * one (collapsing the old Booker step into the Unit page). That's
 * correct for legacy blobs but catastrophic to apply to a freshly-
 * written current-schema blob — `getBookingSession()` re-reads storage
 * on every call (for cross-iframe sync), so a customer who reaches
 * Step 4 would have their step silently rewritten to 3 the next time
 * any handler peeked at the session.
 *
 * Bumping this constant is how we tell the migrator "this blob has
 * already been rewritten in current-schema shape — leave the step
 * alone." Legacy blobs (older `__schema`, or missing entirely) keep
 * getting the down-shift treatment exactly once.
 */
const SCHEMA_VERSION = 3;

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
    };
    const rawStep = parsed.current_step;
    const schema =
      typeof parsed.__schema === "number" ? parsed.__schema : 0;
    // Drop the wrapper field so it doesn't leak into BookingState.
    const { __schema: _ignored, ...rest } = parsed;
    void _ignored;

    let step: StepId = 1;
    if (typeof rawStep === "number" && Number.isInteger(rawStep)) {
      // Current-schema blobs trust the persisted step verbatim (subject
      // to the 1..5 range clamp). Legacy blobs get the down-shift:
      // step 2 (Booker) collapses into step 1 (Unit), and any step > 2
      // shifts down by one.
      const candidate =
        schema >= SCHEMA_VERSION
          ? rawStep
          : rawStep === 2
            ? 1
            : rawStep > 2
              ? rawStep - 1
              : rawStep;
      if (candidate >= 1 && candidate <= 5) step = candidate as StepId;
    }
    return { ...INITIAL_STATE, ...rest, current_step: step };
  } catch {
    return INITIAL_STATE;
  }
}

function readFromStorage(): BookingState {
  if (!isBrowser) return INITIAL_STATE;
  try {
    return migratePersistedSession(window.sessionStorage.getItem(STORAGE_KEY));
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
    key_holder_name: "",
    key_holder_phone: "",
    key_collection_location: "",
    return_method: null,
    managing_agency_id: null,
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
  setAdditionalIndoor(n: number) {
    const clamped = Math.max(0, Math.min(29, Math.round(n)));
    setState((s) =>
      s.num_additional_indoor === clamped ? s : { ...s, num_additional_indoor: clamped },
    );
  },
  /** Replace the customer's currently-selected "other" services
   *  (Task #186). Dedupes input order while preserving first-seen
   *  order — useful if a caller hands us [a, b, a] from a checkbox
   *  state shuffle. No-op if the resulting array is structurally
   *  equal to what's already in state. */
  setOtherServices(ids: readonly string[]) {
    setState((s) => {
      const seen = new Set<string>();
      const next: string[] = [];
      for (const id of ids) {
        if (seen.has(id)) continue;
        seen.add(id);
        next.push(id);
      }
      const cur = s.selected_other_service_ids;
      if (cur.length === next.length && cur.every((v, i) => v === next[i])) {
        return s;
      }
      return { ...s, selected_other_service_ids: next };
    });
  },
  /** Toggle a single "other" service id on/off. Appends new ids at
   *  the end so the price-card display reflects the order the
   *  customer ticked them. Idempotent for the no-op case (empty id
   *  string). */
  toggleOtherService(id: string) {
    if (!id) return;
    setState((s) => {
      const cur = s.selected_other_service_ids;
      const idx = cur.indexOf(id);
      const next =
        idx === -1 ? [...cur, id] : cur.filter((v) => v !== id);
      return { ...s, selected_other_service_ids: next };
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
    setState((s) => ({ ...s, managing_agency_id: agency_id }));
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
