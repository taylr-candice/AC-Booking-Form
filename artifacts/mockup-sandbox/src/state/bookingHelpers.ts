/**
 * Display + pricing helpers for the booking flow.
 *
 * These are pure functions of state, used by Step 5 (Review & Pay) to
 * render its dynamic summary and by other surfaces that need the same
 * labels (e.g. Step 4's own summary block).
 *
 * Authoritative spec: attached_assets/replit_logic_v2_*.md
 */

import {
  type AccessMethod,
  type AcDiscrepancy,
  type AcDiscrepancyCustomer,
  type BookingState,
  type PrimaryResidence,
  type Role,
} from "./bookingSession";
import { isCoordinationFlow } from "./bookingDerived";
import { getLiveUnits } from "./adminMockData";

// ─── Pricing ───────────────────────────────────────────────────────────────

/** Per-system price (AUD, GST inclusive). Mirrors AcMobile / AcDesktop. */
export const SYSTEM_PRICE_AUD = 179;
/** Per-additional-indoor add-on price (AUD, GST inclusive). */
export const ADDON_PRICE_AUD = 39;

export function computeBookingTotal(
  s: Pick<BookingState, "num_systems" | "num_additional_indoor">,
): number {
  return (
    s.num_systems * SYSTEM_PRICE_AUD +
    s.num_additional_indoor * ADDON_PRICE_AUD
  );
}

// ─── Labels ────────────────────────────────────────────────────────────────

export function labelForRole(r: Role | null): string {
  if (r === "owner") return "Owner";
  if (r === "agent") return "Agent · Property Manager";
  return "—";
}

export function labelForResidence(r: PrimaryResidence | null): string {
  if (r === "live_in") return "I live in the property";
  if (r === "leased_out") return "Leased to a tenant";
  if (r === "vacant") return "Vacant property";
  return "—";
}

/**
 * Short, summary-friendly label for an access method.
 * Used by both the Step 4 (Slots) inline summary and the Step 5 (Review) summary.
 */
export function labelForAccessMethod(m: AccessMethod | null): string {
  switch (m) {
    case "owner_live_at_unit":         return "I'll be at the unit";
    case "owner_live_leave_key":       return "Leaving a key";
    case "owner_live_parcel_locker":   return "Key in parcel locker";
    case "owner_live_collect":         return "Collect & return";
    case "owner_leased_be_there":      return "I'll be there";
    case "owner_leased_tenant":        return "Coordinated with tenant";
    case "owner_leased_agent":         return "Coordinated with agent";
    case "owner_leased_leave_key":     return "Leaving a key";
    case "owner_leased_parcel_locker": return "Key in parcel locker";
    case "owner_vacant_be_there":      return "I'll be there (vacant)";
    case "owner_vacant_leave_key":     return "Leaving a key (vacant)";
    case "owner_vacant_parcel_locker": return "Key in parcel locker";
    case "owner_vacant_collect":       return "Collect & return (vacant)";
    case "agent_be_there":             return "I'll be there";
    case "agent_tenant_self":          return "Tenant access (you arrange)";
    case "agent_tenant_taylr":         return "Tenant access (Taylr arranges)";
    case "agent_tenant_pending":       return "Tenant access (choose option)";
    case "agent_trade_key":            return "Collect & return trade key";
    case null:                          return "—";
  }
}

/**
 * Tiny demo unit lookup. T006 will replace this with a real catalog
 * fed from Step 1; for now it just maps the prototype's seed unit_id
 * to its display label and falls back to the raw id.
 */
const DEMO_UNIT_LABELS: Readonly<Record<string, { line1: string; line2?: string }>> = {
  "unit-g01-335-aspen": { line1: "G01 / 335 Aspen Village", line2: "Lot 3 · Anketell Street" },
  u1: { line1: "G01 / 335 Aspen Village", line2: "Lot 3 · Greenway ACT 2900" },
  u2: { line1: "12 / 88 Marine Parade", line2: "Lot 12 · Coogee NSW 2034" },
  u3: { line1: "3 / 4 Example Street", line2: "Lot 3 · Bondi NSW 2026" },
  u4: { line1: "705 / 21 Bourke Street", line2: "Lot 705 · Surry Hills NSW 2010" },
  u5: { line1: "18 / 142 Anzac Parade", line2: "Lot 18 · Kensington NSW 2033" },
};

export function unitLabel(unit_id: string | null): { line1: string; line2?: string } {
  if (!unit_id) return { line1: "—" };
  return DEMO_UNIT_LABELS[unit_id] ?? { line1: unit_id };
}

/**
 * Australian state/territory → reference city used for the slot
 * picker's timezone pill. The pill historically showed "Sydney Time"
 * for every booking, which was misleading for buildings outside NSW.
 * Now the pill reflects the city the building is actually in (e.g.
 * Canberra for an ACT unit, Melbourne for a VIC unit) so customers
 * know the windows are in their own local time.
 *
 * Falls back to "Sydney" when the unit isn't known or the address
 * doesn't carry a recognised state code — preserves the previous
 * behaviour for the seed/demo unit and any future unit without an
 * address line yet.
 */
const STATE_TO_CITY: Readonly<Record<string, string>> = {
  ACT: "Canberra",
  NSW: "Sydney",
  VIC: "Melbourne",
  QLD: "Brisbane",
  WA: "Perth",
  SA: "Adelaide",
  TAS: "Hobart",
  NT: "Darwin",
};

export function unitCity(unit_id: string | null): string {
  const label = unitLabel(unit_id);
  const line2 = label.line2 ?? "";
  const match = line2.match(/\b(ACT|NSW|VIC|QLD|WA|SA|TAS|NT)\b/);
  if (match) return STATE_TO_CITY[match[1]] ?? "Sydney";
  return "Sydney";
}

// ─── AC type assignment (demo) ─────────────────────────────────────────────

/**
 * In production, AC type (split vs ducted) is assigned to a unit in the
 * Taylr backend — never selected by the booker. For the prototype we
 * hardcode the mapping per demo unit so Step 4 can render the correct
 * variant. Falls back to "split" for any unrecognised id.
 */
export type AcType = "split" | "ducted" | "unknown";

/** Full AC record on file for a unit — type + recorded counts. The AC
 *  step seeds its steppers from these values when the customer hasn't
 *  overridden the type. Undefined for units with no record (their type
 *  shows as `"unknown"` and the customer is asked to pick one). */
export type AcRecord = {
  type: "split" | "ducted";
  systems: number;
  additional: number;
};

type UnitAcCatalogEntry = AcRecord | { type: "unknown" };

/**
 * Legacy fallback table — used only when a unit id is NOT present in the
 * admin shell's live units list (`getLiveUnits()` from `adminMockData`).
 * The admin units list is the source of truth: when an admin edits a
 * unit's AC config (single editor or bulk CSV import) the customer's
 * Step 3 pre-fill should reflect that immediately. This fallback exists
 * to keep the legacy alias `unit-g01-335-aspen` working for old demo
 * deep-links and to keep tests of the customer flow green when the
 * admin shell isn't mounted.
 */
const UNIT_AC_CATALOG: Readonly<Record<string, UnitAcCatalogEntry>> = {
  // G01 / 335 Aspen Village (legacy alias for u1).
  "unit-g01-335-aspen": { type: "ducted", systems: 1, additional: 1 },
};

function lookupLiveUnitAc(unit_id: string): UnitAcCatalogEntry | null {
  const live = getLiveUnits().find((u) => u.id === unit_id);
  if (!live) return null;
  if (live.ac.type === "unknown") return { type: "unknown" };
  return {
    type: live.ac.type,
    systems: live.ac.systems,
    additional: live.ac.additional,
  };
}

export function getAcType(unit_id: string | null): AcType {
  if (!unit_id) return "split";
  const fromLive = lookupLiveUnitAc(unit_id);
  if (fromLive) return fromLive.type;
  return UNIT_AC_CATALOG[unit_id]?.type ?? "split";
}

/** Returns the recorded AC details for a unit, or `null` when there are
 *  no records on file (type === "unknown") or the unit isn't in the
 *  catalog. The Step 4 page uses this to (a) seed the steppers from the
 *  recorded counts, (b) render the "we have on record" panel content,
 *  and (c) compute the discrepancy snapshot. */
export function getAcRecord(unit_id: string | null): AcRecord | null {
  if (!unit_id) return null;
  const fromLive = lookupLiveUnitAc(unit_id);
  if (fromLive) return fromLive.type === "unknown" ? null : fromLive;
  const entry = UNIT_AC_CATALOG[unit_id];
  if (!entry || entry.type === "unknown") return null;
  return entry;
}

/**
 * Which "mode" the AC step (Step 2) renders in for the customer.
 *
 * - `"on-file"`     — we have a record on file for this unit and the
 *                     customer hasn't asked to override it. Renders a
 *                     minimal summary + price block + "Agree and
 *                     continue" button + "Update the details" link.
 * - `"overridden"`  — we have a record on file but the customer clicked
 *                     "Update the details" to amend it. Renders the
 *                     full configuration UI with the acknowledgement
 *                     checkbox and a "Use what's on file" reset link.
 * - `"no-record"`   — no record on file for this unit. Same full
 *                     configuration UI as overridden, but with no
 *                     reset link (there's nothing to reset to).
 *
 * The discrepancy snapshot (`ac_discrepancy` on the booking session)
 * is only ever captured in the `"overridden"` mode — on-file means the
 * customer accepted the record exactly, and no-record means there's
 * nothing to compare against.
 */
export type AcMode = "on-file" | "overridden" | "no-record";

export function getAcMode(
  unit_id: string | null,
  ac_override_active: boolean,
): AcMode {
  if (!getAcRecord(unit_id)) return "no-record";
  return ac_override_active ? "overridden" : "on-file";
}

/**
 * Pure comparator — returns `null` when the customer's selection on
 * Step 4 matches what Taylr has on record exactly. Otherwise returns
 * the snapshot to persist on the booking session so the admin mockup
 * can read it.
 *
 * "Unsure" is always treated as a discrepancy when there's a record on
 * file (the customer is opting out of confirming a known recorded
 * type). Numbers are intentionally absent from the customer side in
 * that case — they never committed to a count.
 */
export function computeAcDiscrepancy(
  recorded: AcRecord,
  customer: AcDiscrepancyCustomer,
): AcDiscrepancy | null {
  if (customer.type === "unsure") {
    return { recorded, customer };
  }
  if (
    customer.type === recorded.type &&
    customer.systems === recorded.systems &&
    customer.additional === recorded.additional
  ) {
    return null;
  }
  return { recorded, customer };
}

/** Compact AC summary, e.g. "2 systems + 1 add." */
export function acSummary(
  s: Pick<BookingState, "num_systems" | "num_additional_indoor">,
): string {
  const systems = `${s.num_systems} system${s.num_systems === 1 ? "" : "s"}`;
  const addons =
    s.num_additional_indoor > 0
      ? ` + ${s.num_additional_indoor} add.`
      : "";
  return `${systems}${addons}`;
}

/**
 * How the schedule should be displayed at Step 5 (Review & Pay).
 *
 * Coordination flows return `{ primary: "To be coordinated" }` regardless
 * of any service_date already in state — spec §8.1.
 */
export function scheduleDisplay(
  s: Pick<BookingState, "service_date" | "service_slot" | "access_method">,
): { primary: string; secondary?: string } {
  if (isCoordinationFlow(s)) {
    return { primary: "To be coordinated" };
  }
  if (!s.service_date) {
    return { primary: "—" };
  }
  const slot = s.service_slot ?? "";
  const slotLabel = slot
    ? `${slot.charAt(0).toUpperCase()}${slot.slice(1)} window`
    : undefined;
  return { primary: s.service_date, secondary: slotLabel };
}

// ─── Step 5 (Review & Pay) copy blocks ────────────────────────────────────

/**
 * Explainer note shown above (or beside) the summary on Step 5 when the
 * booking is in a coordination flow. Spec §8.1.
 */
export const COORDINATION_NOTE =
  "We'll contact your tenant(s) or managing agent after payment to arrange a " +
  "service time. You'll be emailed with the confirmed date once agreed.";

/**
 * Cancellation policy shown to all bookers on Step 5 above the acknowledgement
 * tickbox. Spec §8.2 + §10.
 */
export const CANCELLATION_POLICY_PARAGRAPHS: readonly string[] = [
  "If you need to cancel or reschedule, please give us at least 48 hours notice before your booked service window — we'll move you (subject to availability at the time) free of charge.",
  "Cancellations or reschedules within 48 hours of your booked window may incur a $125 fee per unit, which covers the technician's allocated time.",
  "Refunds for paid bookings are processed within 5 business days back to the original payment method.",
];

/**
 * Contact address shown below the cancellation paragraphs so customers know
 * where to send a change/cancellation request. Rendered as a `mailto:` link
 * by both Pay pages.
 */
export const CANCELLATION_CONTACT_EMAIL = "support@taylr.com.au";

/** Required tickbox label. Spec §8.2. */
export const CANCELLATION_ACK_LABEL =
  "I have read and accept the cancellation and rescheduling terms above.";

// ─── Pay step: payment method copy ────────────────────────────────────────
//
// Pay step offers two methods: "Pay now" (everyone) and "Invoice me"
// (agents only). The customer (non-agent) flow only ever sees Pay now.

/** Method tile labels. */
export const PAY_NOW_LABEL = "Pay now";
export const PAY_NOW_SUBLABEL = "Card or Apple Pay";
export const INVOICE_LABEL = "Invoice me";
export const INVOICE_SUBLABEL = "Pay before service";

/** Body copy shown when "Pay now" is selected — explains the Stripe handoff. */
export const STRIPE_REDIRECT_NOTE =
  "You'll be taken to our secure payment page (powered by Stripe), where you " +
  "can pay by card or Apple Pay. Your booking is confirmed as soon as payment succeeds.";

/** Headline for the invoice prepayment block (agent-only). */
export const INVOICE_PREPAYMENT_TITLE =
  "Invoice must be paid before your service";

/**
 * Body copy explaining WHY agents are prepaying. The pre-negotiated rates
 * are conditional on a minimum number of services per building per day, so
 * Taylr cannot extend post-service invoicing terms.
 */
export const INVOICE_PREPAYMENT_BODY =
  "We've pre-negotiated heavily discounted rates with our service provider, " +
  "subject to a minimum number of services being completed at the building each day. " +
  "To honour those rates, the invoice must be paid prior to your scheduled service — " +
  "we don't invoice agents after the work is completed.";

/**
 * Note shown under the billing email/PO inputs in the invoice block —
 * explains what happens on submission (order created with pending payment
 * status, tax invoice auto-emailed).
 */
export const INVOICE_REFERENCE_NOTE =
  "On submission we'll create your booking with a pending payment status and " +
  "email a tax invoice to your contact email — and to the billing email above " +
  "if it's different — for payment.";

/** Helper copy under the billing email field. */
export const BILLING_EMAIL_HELPER =
  "Leave blank to receive the invoice only at your contact email above.";

// ─── Step 5 (Review & Pay) validation ─────────────────────────────────────

/**
 * Spec §14: Pay is enabled only when the cancellation tickbox is ticked.
 * For non-coordination flows, a date + slot must also be set (Step 4 was
 * shown). For coordination flows, scheduling is irrelevant (Step 4 was
 * skipped).
 */
export function isPayStepEnabled(s: BookingState): boolean {
  if (!s.cancellation_acknowledged) return false;
  if (isCoordinationFlow(s)) return true;
  return Boolean(s.service_date && s.service_slot);
}

// ─── Past-date filtering ───────────────────────────────────────────────────

/**
 * True when an ISO `YYYY-MM-DD` date string falls strictly before today
 * in the local timezone. Used by the customer-facing slot picker to
 * hide dates that have already passed — a customer can never book a
 * service into the past, so leaving stale dates on the page is just
 * clutter that pushes the bookable dates further down.
 *
 * `now` is injectable so tests can pin the clock and not drift over
 * time (the slot-picker seed data is anchored to fixed dates in 2026).
 *
 * Pure / no DOM access.
 */
export function isPastDate(dateStr: string, now: Date = new Date()): boolean {
  const todayStr =
    `${now.getFullYear()}-` +
    `${String(now.getMonth() + 1).padStart(2, "0")}-` +
    `${String(now.getDate()).padStart(2, "0")}`;
  return dateStr < todayStr;
}
