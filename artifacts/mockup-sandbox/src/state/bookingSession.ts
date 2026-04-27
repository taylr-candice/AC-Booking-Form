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
  | "agent_tenant_pending" // Agent picked "Tenants will provide access" but hasn't chosen who coordinates yet (transient — invalid for Step 5)
  | "agent_trade_key";

export type ReturnMethod = "locker" | "hand_delivery";

export type Tenant = {
  first: string;
  last: string;
  email: string;
  phone: string;
};

/** Step ids in canonical order — Step 6 may be skipped at runtime. */
export type StepId = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type BookingState = {
  /** Wrapper navigation. */
  current_step: StepId;

  // Step 1
  unit_id: string | null;
  // Step 2
  role: Role | null;
  // Step 3
  agency_id: string | null;
  contact_first_name: string;
  contact_last_name: string;
  contact_email: string;
  contact_phone: string;
  // Step 4
  num_systems: number;
  num_additional_indoor: number;
  // Step 5 — primary residence + access method + follow-ups
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
  // Step 6
  service_date: string | null;
  service_slot: string | null;
  // Step 7
  cancellation_acknowledged: boolean;
};

// ─── Constants ──────────────────────────────────────────────────────────────

const STORAGE_KEY = "taylr.bookingSession.v2";

/** Access methods that skip Step 6 (Schedule).
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
  unit_id: null,
  role: null,
  agency_id: null,
  contact_first_name: "",
  contact_last_name: "",
  contact_email: "",
  contact_phone: "",
  num_systems: 1,
  num_additional_indoor: 0,
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
};

// ─── Persisted store ────────────────────────────────────────────────────────

const isBrowser = typeof window !== "undefined";

function readFromStorage(): BookingState {
  if (!isBrowser) return INITIAL_STATE;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return INITIAL_STATE;
    const parsed = JSON.parse(raw) as Partial<BookingState>;
    return { ...INITIAL_STATE, ...parsed };
  } catch {
    return INITIAL_STATE;
  }
}

function writeToStorage(state: BookingState) {
  if (!isBrowser) return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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

/** Clear all per-method follow-up fields for Step 5. */
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
    // access_notes is independent — always shown, always optional.
  };
}

/** Clear everything that depends on the role (spec §13.3 row "Role"). */
function clearRoleDownstream(s: BookingState): BookingState {
  return clearAccessFollowUps({
    ...s,
    agency_id: null,
    primary_residence: null,
    access_method: null,
    service_date: null,
    service_slot: null,
  });
}

// ─── Public actions ─────────────────────────────────────────────────────────

export const bookingActions = {
  goToStep(step: StepId) {
    setState((s) => ({ ...s, current_step: step }));
  },

  // Step 1
  setUnit(unit_id: string | null) {
    setState((s) =>
      s.unit_id === unit_id
        ? s
        : {
            ...s,
            unit_id,
            // Spec §13.3: changing unit re-loads AC pre-fill (handled by Step 4).
            // No other downstream clears required here.
          },
    );
  },

  // Step 2
  setRole(role: Role | null) {
    setState((s) => (s.role === role ? s : clearRoleDownstream({ ...s, role })));
  },

  // Step 3
  setAgency(agency_id: string | null) {
    setState((s) => ({ ...s, agency_id }));
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

  // Step 4
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

  // Step 5
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
      if (wasCoordination !== isCoordination) {
        next.service_date = null;
        next.service_slot = null;
      }
      // If the user is currently sitting on Step 6 (Schedule) and the new
      // method makes Step 6 hidden, jump forward to Step 7 so the wrapper
      // never lingers on a hidden step.
      if (isCoordination && next.current_step === 6) {
        next.current_step = 7;
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

  // Step 6
  setSchedule(date: string | null, slot: string | null) {
    setState((s) => ({ ...s, service_date: date, service_slot: slot }));
  },

  // Step 7
  setCancellationAcknowledged(value: boolean) {
    setState((s) => ({ ...s, cancellation_acknowledged: value }));
  },

  /** Spec §12: keep role/agency/contact, reset everything else. */
  bookAnother() {
    setState((s) => ({
      ...INITIAL_STATE,
      role: s.role,
      agency_id: s.agency_id,
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
