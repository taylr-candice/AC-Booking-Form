/**
 * Catalog of the 10 access-method branches (spec §6.2 + §16) and their
 * follow-up requirements (spec §6.3) — shared between mobile and desktop
 * Step 5 implementations.
 */

import { useEffect, useRef } from "react";
import {
  bookingActions,
  useBookingSelector,
  type AccessMethod,
  type PrimaryResidence,
  type Role,
  type Tenant,
} from "./bookingSession";

export type AccessOption = {
  key: AccessMethod;
  label: string;
  subtitle: string;
};

export const OWNER_LIVE_OPTIONS: readonly AccessOption[] = [
  { key: "owner_live_at_unit",        label: "I'll be at the unit",                subtitle: "I'll meet the technician at the property" },
  { key: "owner_live_leave_key",      label: "I'll leave a key with someone",      subtitle: "Tell us who has the key" },
  { key: "owner_live_parcel_locker",  label: "Leave a key in the parcel locker",   subtitle: "We'll send a drop code before your service" },
  { key: "owner_live_collect",        label: "Please collect and return my key",   subtitle: "Taylr collects, services, then returns" },
];

export const OWNER_LEASED_OPTIONS: readonly AccessOption[] = [
  { key: "owner_leased_be_there",      label: "I'll be there to provide access",   subtitle: "I'll meet the technician at the property" },
  { key: "owner_leased_tenant",        label: "Arrange with tenant",               subtitle: "We'll contact your tenant to coordinate" },
  { key: "owner_leased_agent",         label: "Arrange with agent",                subtitle: "Your managing agent will coordinate access" },
  { key: "owner_leased_leave_key",     label: "I'll leave a key with someone",     subtitle: "Tell us who has the key" },
  { key: "owner_leased_parcel_locker", label: "Leave a key in the parcel locker",  subtitle: "We'll send a drop code before your service" },
];

export const OWNER_VACANT_OPTIONS: readonly AccessOption[] = [
  { key: "owner_vacant_be_there",      label: "I'll be there to provide access",   subtitle: "I'll meet the technician at the property" },
  { key: "owner_vacant_leave_key",     label: "I'll leave a key with someone",     subtitle: "e.g. concierge, neighbour, building manager" },
  { key: "owner_vacant_parcel_locker", label: "Leave a key in the parcel locker",  subtitle: "We'll send a drop code before your service" },
  { key: "owner_vacant_collect",       label: "Please collect and return my key",  subtitle: "Taylr collects, services, then returns" },
];

// For agents we present a single "Tenants will provide access" card. Once
// selected, a sub-question lets the agent choose who arranges the appointment
// (themselves vs. Taylr). The card maps to `agent_tenant_pending` first —
// neither sub-option is pre-selected, so the user must explicitly choose
// before Step 5 becomes valid.
export const AGENT_OPTIONS: readonly AccessOption[] = [
  { key: "agent_be_there",       label: "I'll be there to provide access",       subtitle: "I'll meet the technician at the property" },
  { key: "agent_tenant_pending", label: "Tenants will provide access",           subtitle: "The tenant will let the technician in" },
  { key: "agent_trade_key",      label: "Collect & return our trade key",        subtitle: "We pick up & return your office trade key" },
];

export function getAccessOptions(
  role: Role | null,
  residence: PrimaryResidence | null,
): readonly AccessOption[] {
  if (role === "agent") return AGENT_OPTIONS;
  if (role === "owner" && residence === "live_in")    return OWNER_LIVE_OPTIONS;
  if (role === "owner" && residence === "leased_out") return OWNER_LEASED_OPTIONS;
  if (role === "owner" && residence === "vacant")     return OWNER_VACANT_OPTIONS;
  return [];
}

// ─── Predicates ─────────────────────────────────────────────────────────────

export function isLeaveKeyMethod(m: AccessMethod | null): boolean {
  return (
    m === "owner_live_leave_key" ||
    m === "owner_leased_leave_key" ||
    m === "owner_vacant_leave_key"
  );
}

export function isParcelLockerMethod(m: AccessMethod | null): boolean {
  return (
    m === "owner_live_parcel_locker" ||
    m === "owner_leased_parcel_locker" ||
    m === "owner_vacant_parcel_locker"
  );
}

/** "I'll be there" / on-site owner-or-agent methods — the customer (or
 *  the booking agent themselves) physically meets the technician at the
 *  property. These are the only methods that get the "Change access
 *  method" nudge on the slot picker, since the alternative options
 *  (parcel locker, collect & return, agency trade key) let them skip
 *  waiting around for the entire arrival window. */
export function isBeThereMethod(m: AccessMethod | null): boolean {
  return (
    m === "owner_live_at_unit" ||
    m === "owner_leased_be_there" ||
    m === "owner_vacant_be_there" ||
    m === "agent_be_there"
  );
}

/** Methods where no one needs to be on-site during the service window —
 *  the customer authorises Taylr to access the unit unattended. Used by
 *  the slot picker to swap the "be available for the entire window"
 *  warning for the lighter "you're authorising us to access the unit"
 *  framing, and to suppress the "Change access method" nudge for
 *  customers who already picked a convenient option. */
export function isUnattendedAccessMethod(m: AccessMethod | null): boolean {
  return (
    isParcelLockerMethod(m) ||
    isCollectReturnMethod(m) ||
    isAgentTradeMethod(m)
  );
}

/** Which party has to be available for the entire arrival window for a
 *  given attended access method. Drives the slot-picker banner copy so
 *  the wording always references the right person:
 *
 *    - `"self"`        → the customer themselves (be-there options)
 *    - `"key_holder"`  → the nominated key holder (leave-key options)
 *    - `"tenant"`      → the tenant (only `agent_tenant_self`, where
 *                         the agent picks the slot and tells the tenant)
 *
 *  Returns `null` for unattended methods (parcel locker, collect &
 *  return, agency trade key) and for methods that never reach the
 *  slot picker at all (managing-agent + tenant coordination flows
 *  skip Step 5). */
export type AttendedParty = "self" | "key_holder" | "tenant";

export function attendedPartyFor(
  m: AccessMethod | null,
): AttendedParty | null {
  if (isBeThereMethod(m)) return "self";
  if (isLeaveKeyMethod(m)) return "key_holder";
  if (m === "agent_tenant_self") return "tenant";
  return null;
}

/** Methods that require a tenants list + tenant-contact authorisation. */
export function isTenantMethod(m: AccessMethod | null): boolean {
  return m === "owner_leased_tenant" || m === "agent_tenant_taylr";
}

/** Any state of the agent "Tenants will provide access" card group, including
 *  the transient `_pending` state where no sub-option has been chosen yet. */
export function isAgentTenantOption(m: AccessMethod | null): boolean {
  return (
    m === "agent_tenant_self" ||
    m === "agent_tenant_taylr" ||
    m === "agent_tenant_pending"
  );
}

export function isCollectReturnMethod(m: AccessMethod | null): boolean {
  return m === "owner_live_collect" || m === "owner_vacant_collect";
}

export function isAgentTradeMethod(m: AccessMethod | null): boolean {
  return m === "agent_trade_key";
}

export function isManagingAgentMethod(m: AccessMethod | null): boolean {
  return m === "owner_leased_agent";
}

/**
 * One-line plain-English summary of how access happens on the day, used
 * by the admin "Access on the day" / "Coordinating with" panels. Kept
 * deliberately short — the rest of the booking detail surfaces the
 * deeper context (key holder name, agency, signed authorisations etc.)
 * — so this just answers "in plain language, what's the plan?".
 *
 * Returns a fallback for the transient `agent_tenant_pending` state and
 * for `null` so the panel never has to special-case missing data.
 */
export function accessOnTheDayDescription(m: AccessMethod | null): string {
  switch (m) {
    case "owner_live_at_unit":
    case "owner_leased_be_there":
    case "owner_vacant_be_there":
    case "agent_be_there":
      return "Booker meets the technician at the unit";
    case "owner_live_leave_key":
    case "owner_leased_leave_key":
    case "owner_vacant_leave_key":
      return "Nominated key holder lets the technician in";
    case "owner_live_parcel_locker":
    case "owner_leased_parcel_locker":
    case "owner_vacant_parcel_locker":
      return "Parcel-locker drop code emailed 24 h before the window";
    case "owner_live_collect":
    case "owner_vacant_collect":
      return "Taylr collects the key, services the unit, returns the key";
    case "owner_leased_tenant":
    case "agent_tenant_taylr":
      return "Tenant lets the technician in — Taylr coordinates the time";
    case "owner_leased_agent":
      return "Managing agent coordinates access with the tenant";
    case "agent_tenant_self":
      return "Agent has briefed the tenant directly — tenant lets us in";
    case "agent_trade_key":
      return "Taylr collects & returns the agency trade key";
    case "agent_tenant_pending":
    case null:
      return "Access method not yet confirmed";
  }
}

// ─── Signature variants (spec §6.5 + §10.2) ─────────────────────────────────

export const SIG_COLLECT_RETURN = `By signing below I agree to Taylr's Collect & Return Key Service Terms & Conditions: Taylr will collect the nominated key from the address provided, transport it under chain-of-custody, perform the booked service at the unit, and return the key by the chosen method. I authorise Taylr to take temporary custody of this key for the duration of this service. I understand the standard cancellation terms apply once a technician has been dispatched to collect the key.`;

export const SIG_ACCESS_AUTH = `By signing below I authorise Taylr to collect our agency trade key from the office, use it to access the unit at the nominated address, perform the booked service, and return the key to my office. I confirm I am authorised by my agency to grant this access on behalf of the owner, and that the tenant (where applicable) has been made aware that essential air-conditioning maintenance access may occur unattended.`;

export const SIG_TENANT = `By signing below I authorise Taylr to contact the tenant(s) listed in this booking under the terms of the Residential Tenancies Act for the purpose of arranging essential maintenance access to the unit. I confirm I have authority (as owner or managing agent) to authorise this contact and that an authorisation letter will be sent to the tenant(s) prior to the technician's visit.`;

export const SIG_PARCEL_LOCKER = `By signing below I authorise Taylr to retrieve the key from the nominated parcel locker, use it to access the unit at the address provided, perform the booked service, and return the key to the parcel locker afterwards. I confirm I am authorised to grant this access and that the unit's occupants (where applicable) have been made aware that essential air-conditioning maintenance access may occur unattended during the booked service window.`;

export type SignatureVariant = {
  title: string;
  body: string;
};

export function signatureVariantFor(
  method: AccessMethod | null,
): SignatureVariant | null {
  switch (method) {
    case "owner_live_collect":
    case "owner_vacant_collect":
      return { title: "Collect & Return T&Cs", body: SIG_COLLECT_RETURN };
    case "agent_trade_key":
      return { title: "Access authorisation", body: SIG_ACCESS_AUTH };
    case "owner_leased_tenant":
    case "agent_tenant_taylr":
      return { title: "Tenant-contact authorisation", body: SIG_TENANT };
    case "owner_live_parcel_locker":
    case "owner_leased_parcel_locker":
    case "owner_vacant_parcel_locker":
      return { title: "Parcel-locker access authorisation", body: SIG_PARCEL_LOCKER };
    default:
      return null;
  }
}

// ─── Informational notes per method (spec §6.3 last column) ─────────────────

export type InfoNote = {
  title: string;
  body: string;
};

export function infoNoteFor(method: AccessMethod | null): InfoNote | null {
  switch (method) {
    case "owner_live_leave_key":
    case "owner_leased_leave_key":
    case "owner_vacant_leave_key":
      return {
        title: "Leaving a key",
        body: "Leave the key with someone reachable on the day. We'll text the key holder when the technician is on the way and again once we've left.",
      };
    case "owner_live_parcel_locker":
    case "owner_leased_parcel_locker":
    case "owner_vacant_parcel_locker":
      return {
        title: "You'll receive a drop code",
        body: "We'll email you a unique parcel-locker code 24 hours before your service window. Place the key in the locker before the technician arrives.",
      };
    case "owner_live_collect":
    case "owner_vacant_collect":
      return {
        title: "Collect & Return Key Service",
        body: "Taylr will collect the key from the address you provide, perform the service, and return the key by your chosen method. A chain-of-custody record is kept and shared with you on completion.",
      };
    case "owner_leased_tenant":
    case "agent_tenant_taylr":
      return {
        title: "Tenant details required",
        body: "We'll send each tenant an authorisation letter and arrange a suitable window directly with them. The booking moves to a coordination state — we'll confirm the appointment time once secured.",
      };
    case "agent_tenant_self":
      return {
        title: "You'll arrange directly with the tenant",
        body: "Pick a service window at the next step and let your tenant know — they'll meet the technician at the unit. We won't contact the tenant.",
      };
    case "agent_trade_key":
      return {
        title: "Collect & return your agency trade key",
        body: "Taylr collects the trade key from your agency office before the service window, performs the service, and returns the key to your office afterwards. A chain-of-custody record is kept and shared with you on completion — a super convenient option that doesn't require anyone to be on-site.",
      };
    default:
      return null;
  }
}

// ─── Demo agency list for the managing-agent dropdown ───────────────────────

export type AgencyOption = { id: string; name: string };

export const DEMO_MANAGING_AGENCIES: readonly AgencyOption[] = [
  { id: "agency-001", name: "Vantage Strata Management" },
  { id: "agency-002", name: "City Edge Property Group" },
  { id: "agency-003", name: "Capital Realty & Co." },
  { id: "agency-004", name: "Harbourline Residential" },
  { id: "agency-006", name: "Ray White Canberra" },
  { id: "agency-005", name: "Other / not listed" },
];

/** The single "Other / not listed" agency id — when this is selected the
 *  Step 1 page shows a free-text company-name input and the Continue
 *  gate requires it to be filled in. */
export const OTHER_AGENCY_ID = "agency-005";

export function isOtherAgency(id: string | null): boolean {
  return id === OTHER_AGENCY_ID;
}

// ─── Validation (spec §6.7) ─────────────────────────────────────────────────

import type { BookingState } from "./bookingSession";

export function isStep5Valid(s: BookingState): boolean {
  // Layer A
  if (!s.role) return false;
  if (s.role === "owner" && !s.primary_residence) return false;

  // The "Tenants will provide access" card starts in `agent_tenant_pending`
  // — the user must explicitly choose a coordination sub-option before
  // Step 5 can be completed.
  if (s.access_method === "agent_tenant_pending") return false;

  // Layer B — must be a method valid for the current (role, residence) pair.
  // For agents, `agent_tenant_self` and `agent_tenant_taylr` are valid
  // endpoints of the "Tenants will provide access" card even though only the
  // sentinel `agent_tenant_pending` appears in the agent option list.
  const opts = getAccessOptions(s.role, s.primary_residence);
  const inOptions = !!s.access_method && opts.some((o) => o.key === s.access_method);
  const inAgentTenantPair =
    s.role === "agent" &&
    (s.access_method === "agent_tenant_self" || s.access_method === "agent_tenant_taylr");
  if (!inOptions && !inAgentTenantPair) return false;

  // Layer C
  if (isLeaveKeyMethod(s.access_method)) {
    return (
      s.key_holder_name.trim().length > 0 &&
      s.key_holder_phone.trim().length > 0
    );
  }

  if (isParcelLockerMethod(s.access_method)) {
    // Parcel-locker methods are unattended — the customer authorises Taylr
    // to retrieve the key, access the unit, and return the key. The
    // signature lives on the access step so the slot picker doesn't need
    // to add a separate checkbox down the line.
    return s.signature_acknowledged && s.signature_name.trim().length > 0;
  }

  if (isCollectReturnMethod(s.access_method)) {
    return (
      s.key_collection_location.trim().length > 0 &&
      s.return_method !== null &&
      s.signature_acknowledged &&
      s.signature_name.trim().length > 0
    );
  }

  if (isTenantMethod(s.access_method)) {
    if (s.tenants.length < 1) return false;
    const allTenantsValid = s.tenants.every(
      (t) =>
        t.first.trim().length > 0 &&
        t.last.trim().length > 0 &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t.email.trim()) &&
        t.phone.trim().length > 0,
    );
    if (!allTenantsValid) return false;
    return s.signature_acknowledged && s.signature_name.trim().length > 0;
  }

  if (isManagingAgentMethod(s.access_method)) {
    return s.managing_agency_id !== null;
  }

  if (isAgentTradeMethod(s.access_method)) {
    return s.signature_acknowledged && s.signature_name.trim().length > 0;
  }

  // Be-there + at-unit + agent_tenant_self: no extra validation
  return true;
}

// ─── Tenants hook (store-backed with stable React keys) ─────────────────────
//
// The store owns the tenants array (so cascade clears on role/residence/method
// changes empty it correctly). This hook layers on stable React keys for the
// UI list and exposes index-based update/remove/add helpers. When a tenant
// method becomes active and the store is empty (e.g. after a cascade clear),
// it auto-seeds with two demo tenants for the mockup.

export type LocalTenant = Tenant & { id: string };

const TENANT_SEED: readonly Tenant[] = [
  { first: "Sarah",   last: "Lee",  email: "sarah.lee@example.com", phone: "0412 345 678" },
  { first: "Michael", last: "Wong", email: "m.wong@example.com",    phone: "0498 765 432" },
];

function makeTenantId() {
  return Math.random().toString(36).slice(2);
}

export function useTenants(active: boolean) {
  const storeTenants = useBookingSelector((s) => s.tenants);
  const idsRef = useRef<string[]>([]);

  // Auto-seed once when the user first enters a tenant flow with an empty store.
  useEffect(() => {
    if (active && storeTenants.length === 0) {
      bookingActions.setTenants(TENANT_SEED.map((t) => ({ ...t })));
    }
    // We intentionally only depend on `active` and the length: re-seeding
    // should only happen when the user newly enters the flow with zero tenants.
  }, [active, storeTenants.length]);

  // Keep ids array in lock-step with store length (refs do not trigger renders).
  while (idsRef.current.length < storeTenants.length) idsRef.current.push(makeTenantId());
  if (idsRef.current.length > storeTenants.length) {
    idsRef.current.length = storeTenants.length;
  }

  const tenants: LocalTenant[] = storeTenants.map((t, i) => ({
    ...t,
    id: idsRef.current[i],
  }));

  const update = (idx: number, patch: Partial<Tenant>) => {
    bookingActions.setTenants(
      storeTenants.map((t, i) => (i === idx ? { ...t, ...patch } : t)),
    );
  };

  const remove = (idx: number) => {
    if (storeTenants.length <= 1) return;
    idsRef.current.splice(idx, 1);
    bookingActions.setTenants(storeTenants.filter((_, i) => i !== idx));
  };

  const add = () => {
    idsRef.current.push(makeTenantId());
    bookingActions.setTenants([
      ...storeTenants,
      { first: "", last: "", email: "", phone: "" },
    ]);
  };

  return { tenants, update, remove, add };
}
