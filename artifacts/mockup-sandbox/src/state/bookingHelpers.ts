/**
 * Display + pricing helpers for the booking flow.
 *
 * These are pure functions of state, used by Step 7 (Review & Pay) to
 * render its dynamic summary and by other surfaces that need the same
 * labels (e.g. Step 5's own summary block).
 *
 * Authoritative spec: attached_assets/replit_logic_v2_*.md
 */

import {
  type AccessMethod,
  type BookingState,
  type PrimaryResidence,
  type Role,
} from "./bookingSession";
import { isCoordinationFlow } from "./bookingDerived";

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
 * Used by both the Step 5 inline summary and the Step 7 review summary.
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

// ─── AC type assignment (demo) ─────────────────────────────────────────────

/**
 * In production, AC type (split vs ducted) is assigned to a unit in the
 * Taylr backend — never selected by the booker. For the prototype we
 * hardcode the mapping per demo unit so Step 4 can render the correct
 * variant. Falls back to "split" for any unrecognised id.
 */
export type AcType = "split" | "ducted" | "unknown";

const UNIT_AC_TYPE: Readonly<Record<string, AcType>> = {
  u1: "ducted",  // G01 / 335 Aspen Village
  "unit-g01-335-aspen": "ducted",
  u2: "split",   // 12 / 88 Marine Parade
  u3: "unknown", // 3 / 4 Example Street — no records on file
  u4: "unknown", // 705 / 21 Bourke Street — no records on file
  u5: "ducted",  // 18 / 142 Anzac Parade
};

export function getAcType(unit_id: string | null): AcType {
  if (!unit_id) return "split";
  return UNIT_AC_TYPE[unit_id] ?? "split";
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
 * How the schedule should be displayed at Step 7.
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

// ─── Step 7 copy blocks ────────────────────────────────────────────────────

/**
 * Explainer note shown above (or beside) the summary on Step 7 when the
 * booking is in a coordination flow. Spec §8.1.
 */
export const COORDINATION_NOTE =
  "We'll contact your tenant(s) or managing agent after payment to arrange a " +
  "service time. You'll be emailed with the confirmed date once agreed.";

/**
 * Cancellation policy shown to all bookers on Step 7 above the acknowledgement
 * tickbox. Spec §8.2 + §10.
 */
export const CANCELLATION_POLICY_PARAGRAPHS: readonly string[] = [
  "If you need to cancel or reschedule, please give us at least 48 hours notice before your booked service window — we'll move you free of charge.",
  "Cancellations or reschedules within 48 hours of your booked window may incur a $125 fee per unit, which covers the technician's allocated time.",
  "Refunds for paid bookings are processed within 5 business days back to the original payment method.",
];

/** Required tickbox label. Spec §8.2. */
export const CANCELLATION_ACK_LABEL =
  "I have read and accept the cancellation and rescheduling terms above.";

// ─── Step 7 validation ─────────────────────────────────────────────────────

/**
 * Spec §14: Pay is enabled only when the cancellation tickbox is ticked.
 * For non-coordination flows, a date + slot must also be set (Step 6 was
 * shown). For coordination flows, scheduling is irrelevant (Step 6 was
 * skipped).
 */
export function isStep7PayEnabled(s: BookingState): boolean {
  if (!s.cancellation_acknowledged) return false;
  if (isCoordinationFlow(s)) return true;
  return Boolean(s.service_date && s.service_slot);
}
