/**
 * Customer-side slot resolver.
 *
 * The three slot pickers (`SlotsDesktop`, `SlotsMobile`,
 * `SlotsMobileLite`) used to embed their own hand-rolled `DAYS` /
 * `ALL_DAYS` arrays. After Task #59 the source of truth for capacity
 * lives on a per-(service, building) {@link AdminRollout} — so each
 * picker now resolves the rollout for the customer's `(svc-ac, unit)`
 * pair and renders against its `days`.
 *
 * This module hides the rollout shape behind a thin `CustomerDay` /
 * `CustomerSlot` view-model so the picker components don't have to
 * import admin types directly. The status field (`available` / `full`
 * / `not_enough_time` / `not_yet_open`) is pre-computed via
 * {@link rolloutSlotStatus} so each picker variant agrees on the
 * exact same selectability decision — the customer-facing tile is
 * intentionally binary (selectable or greyed out) and never surfaces
 * a reason text (Task #61); the four-state status is still kept so
 * admin-side displays and tests can distinguish the cases.
 *
 * The slot pickers are also reachable from the canvas in isolation
 * (no booking session yet → `unit_id === null`). To keep the
 * standalone preview rich, we fall back to the seeded Aspen unit so
 * the picker shows the flagship rollout instead of an empty state.
 */

import {
  findRolloutForBooking,
  formatWindowTimeRange,
  getActiveBookingForUnit,
  getLiveBookings,
  resolveSlotTimes,
  rolloutSlotStatus,
  type AdminBooking,
  type AdminRollout,
  type RolloutDay,
  type RolloutSlot,
  type RolloutSlotStatus,
} from "../../../state/adminMockData";

/** View-model used by the customer-side pickers. Keeps the same
 *  field names the legacy hard-coded seed used so the JSX rendering
 *  in each picker barely changes.
 *
 *  `startTime` / `endTime` are the resolved 24h `HH:MM` ranges (per-
 *  slot override winning over rollout defaults), and `timeLabel` is
 *  the customer-facing string ("8am – 12:30pm") so the picker tiles
 *  render the same source-of-truth value the admin schedule editor
 *  reads.
 */
export type CustomerSlot = {
  id: string;
  window: "morning" | "afternoon" | "evening";
  windowMinutes: number;
  bookedMinutes: number;
  status: RolloutSlotStatus;
  startTime: string;
  endTime: string;
  timeLabel: string;
};

export type CustomerDay = {
  date: string;
  weekday: string;
  day: number;
  month: string;
  morning: CustomerSlot;
  afternoon: CustomerSlot;
  /** Present only when the rollout day has an evening window opened. */
  evening?: CustomerSlot;
};

export type CustomerSlotData = {
  rollout: AdminRollout | null;
  days: CustomerDay[];
};

/**
 * When a customer reaches the slot picker via the canvas mockup
 * (no booking session → `unit_id === null`) we fall back to the
 * Aspen flagship unit so the standalone preview shows the same
 * rich, opened rollout it always has. Production will never have
 * a null `unit_id` at this step.
 */
const FALLBACK_UNIT_ID = "u1";

export function resolveCustomerSlotData(
  unitId: string | null,
  jobMinutes: number,
): CustomerSlotData {
  const effectiveUnitId = unitId ?? FALLBACK_UNIT_ID;
  const rollout = findRolloutForBooking("svc-ac", effectiveUnitId);
  if (!rollout) {
    return { rollout: null, days: [] };
  }

  const toCustomerSlot = (
    r: AdminRollout,
    d: RolloutDay,
    slot: RolloutSlot,
  ): CustomerSlot => {
    const range = resolveSlotTimes(r, slot);
    return {
      id: slot.id,
      window: slot.window,
      windowMinutes: slot.windowMinutes,
      bookedMinutes: slot.bookedMinutes,
      status: rolloutSlotStatus(d, slot, r.capacityModel, jobMinutes),
      startTime: range.start,
      endTime: range.end,
      timeLabel: formatWindowTimeRange(range),
    };
  };

  const days: CustomerDay[] = rollout.days.map((d) => {
    const day: CustomerDay = {
      date: d.isoDate,
      weekday: d.weekdayLabel,
      day: parseInt(d.dayLabel, 10),
      month: d.monthLabel,
      morning: toCustomerSlot(rollout, d, d.morning),
      afternoon: toCustomerSlot(rollout, d, d.afternoon),
    };
    if (d.evening) {
      day.evening = toCustomerSlot(rollout, d, d.evening);
    }
    return day;
  });

  return { rollout, days };
}

/**
 * Returns the active confirmed booking on `unitId` made by another
 * party — the customer-side equivalent of {@link getActiveBookingForUnit}.
 *
 * Used by the slot pickers to render a read-only "Already scheduled"
 * panel when the customer's chosen unit is *already taken* by someone
 * else (paid OR invoice-pending — both block the second tenant from
 * picking a slot). The panel includes the booker's contact details so
 * a co-tenant or co-owner can reach out directly instead of being
 * stuck.
 *
 * The customer's own in-progress booking (the live-demo session row)
 * never appears in the live bookings list, so we don't need to filter
 * it out by id — the list is naturally "everyone but me".
 *
 * Reads the *live* bookings via {@link getLiveBookings} so cancellation
 * / reschedule / supersede mutations made in the admin shell are
 * reflected immediately. In canvas-isolated mode (no admin shell
 * mounted) the source falls back to `SEEDED_BOOKINGS`.
 *
 * Task #49 review: previously this only returned paid bookings, which
 * meant the second tenant could still walk the picker even though the
 * unit was already invoice-pending — surfacing the lock for both
 * states matches the requirement that any active booking on the unit
 * makes the second tenant view read-only.
 *
 * Returns `{ booking, kind }` where `kind` is `"paid"` or
 * `"invoice_pending"` so the picker can tune the copy slightly per
 * status, or `null` when no unit is selected / no rollout exists.
 */
export function alreadyScheduledByOther(
  unitId: string | null,
): { booking: AdminBooking; kind: "paid" | "invoice_pending" } | null {
  if (!unitId) return null;
  const rollout = findRolloutForBooking("svc-ac", unitId);
  if (!rollout) return null;
  const verdict = getActiveBookingForUnit(unitId, getLiveBookings(), rollout.id);
  if (verdict.kind === "paid")
    return { booking: verdict.booking, kind: "paid" };
  if (verdict.kind === "invoice_pending")
    return { booking: verdict.booking, kind: "invoice_pending" };
  return null;
}

/**
 * Returns the booking windows on a customer day in render order
 * (morning, afternoon, and evening when the rollout has opened the
 * evening window).
 *
 * Hoisted here so every slot picker variant — production
 * (`SlotsDesktop`, `SlotsMobile`, `SlotsMobileLite`), usability
 * (`SlotsAccessibleReadable`, `SlotsAffordanceForward`,
 * `SlotsHierarchyFirst`) and the shared {@link useCustomerSlotPicker}
 * hook — agrees on what counts as "the windows for a day". Before
 * Task #233 each picker carried its own copy of this trivial helper,
 * which made any tweak to "what counts as a window" a six-file
 * change.
 */
export function dayWindows(day: CustomerDay): CustomerSlot[] {
  const out: CustomerSlot[] = [day.morning, day.afternoon];
  if (day.evening) out.push(day.evening);
  return out;
}

/**
 * Convenience predicate — does the day have any window the customer
 * could actually pick? Used by the day-row UI to grey out a date
 * when every window is full / closed / not-enough-time.
 */
export function dayHasAvailable(day: CustomerDay): boolean {
  return dayWindows(day).some((s) => s.status === "available");
}

/** Soonest `(day, slot)` pair with `status === "available"`, or null. */
export function findNextAvailable(
  days: ReadonlyArray<CustomerDay>,
): { day: CustomerDay; slot: CustomerSlot } | null {
  for (const day of days) {
    const slot = dayWindows(day).find((s) => s.status === "available");
    if (slot) return { day, slot };
  }
  return null;
}

export function windowDisplayLabel(window: CustomerSlot["window"]): string {
  if (window === "morning") return "Morning";
  if (window === "afternoon") return "Afternoon";
  return "Evening";
}

/** Short, human-friendly label for an access method, used by the
 *  slot picker's "Access: <label> · Change" recap line. Returns a
 *  generic "I'll be there" when access hasn't been picked yet so the
 *  recap reads sensibly in canvas-isolated mockups. */
export function accessRecapLabel(method: string | null): string {
  switch (method) {
    case "owner_live_at_unit":
    case "owner_leased_be_there":
    case "owner_vacant_be_there":
    case "agent_be_there":
      return "I'll be there";
    case "owner_live_leave_key":
    case "owner_vacant_leave_key":
      return "Leave a key";
    case "owner_live_parcel_locker":
    case "owner_vacant_parcel_locker":
      return "Parcel locker";
    case "owner_live_collect":
    case "owner_vacant_collect":
      return "Collect & return";
    case "owner_leased_agent":
    case "agent_trade_key":
      return "Managing agent / trade key";
    case "owner_leased_tenant":
    case "agent_tenant_pending":
    case "agent_tenant_self":
    case "agent_tenant_taylr":
      return "Tenant arranges";
    default:
      return "I'll be there";
  }
}
