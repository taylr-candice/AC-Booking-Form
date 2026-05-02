/**
 * Shared customer-side slot-picker wiring (Task #214).
 *
 * The customer slot picker is rendered in many flavours — production
 * (`SlotsDesktop`, `SlotsMobile`, `SlotsMobileLite`) plus the three
 * usability variants in `booking-slots-usability/` — and they all
 * stitch together the exact same primitives:
 *
 *  1. Resolve the per-(service, building) rollout + day rows for the
 *     current unit via {@link resolveCustomerSlotData}.
 *  2. Subscribe to the live-bookings store via
 *     {@link subscribeLiveBookings} so that
 *     {@link alreadyScheduledByOther} re-runs when an admin
 *     cancels / reschedules / supersedes a blocking booking.
 *  3. Filter out past days via {@link isPastDate} so customers never
 *     see rows that have already rolled by.
 *  4. Keep a `selected` slot id in component state, and drop it the
 *     moment it is no longer present + `available` in `visibleDays`
 *     (rollout shifted, job grew, etc.) so Continue can't carry
 *     stale, now-invalid state forward.
 *
 * Tasks #168 and #178 had to plug live data into all three usability
 * variants the same way; Task #191 had to add tests parameterised
 * across all three for the same reason. Centralising the wiring here
 * means the next live-data tweak only has one place to land.
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { isPastDate } from "../../../state/bookingHelpers";
import {
  bookingActions,
  useBookingSelector,
} from "../../../state/bookingSession";
import {
  getLiveBookingsVersion,
  getRolloutsVersion,
  subscribeLiveBookings,
  subscribeRollouts,
} from "../../../state/adminMockData";
import {
  alreadyScheduledByOther,
  dayWindows,
  getVisibleServiceDays,
  resolveCustomerSlotData,
  type CustomerDay,
  type CustomerSlotData,
} from "./customerSlotData";

export type LockedByOther = ReturnType<typeof alreadyScheduledByOther>;

export type CustomerSlotPicker = {
  /** The resolved rollout, or `null` when the unit's building has no
   *  open svc-ac rollout — drives the no-rollout empty state. */
  rollout: CustomerSlotData["rollout"];
  /** Rollout days with past dates filtered out. */
  visibleDays: CustomerDay[];
  /** `null` when the unit is bookable, or `{ booking, kind }` when an
   *  active confirmed/invoice-pending booking on this unit makes the
   *  picker read-only (handled by the locked-by-other panel). */
  lockedByOther: LockedByOther;
  /** Currently-picked slot id, or `null`. */
  selected: string | null;
  /** Setter for the picked slot id. */
  setSelected: (id: string | null) => void;
};

export function useCustomerSlotPicker(
  unitId: string | null,
  jobMinutes: number,
): CustomerSlotPicker {
  // Hydrate local state from the session so navigating back to the
  // slot picker (component remount) preserves the customer's pick
  // instead of clobbering the schedule via the mirror-effect below.
  // Only read on first render; after mount the local state owns the
  // selection. The validity-check effect below will prune the
  // hydrated id if it no longer fits the current rollout.
  const initialSlot = useBookingSelector((s) => s.service_slot);
  const [selected, setSelected] = useState<string | null>(() => initialSlot);

  // Re-run `resolveCustomerSlotData` whenever an admin opens / closes a
  // day in RolloutScheduleEditor (same iframe) or when protoStore applies
  // a cross-iframe rollout update from BroadcastChannel.  Must be
  // declared before `slotData` so the dep array reference is live.
  const rolloutsVersion = useSyncExternalStore(
    subscribeRollouts,
    getRolloutsVersion,
    getRolloutsVersion,
  );

  const slotData = useMemo(
    () => resolveCustomerSlotData(unitId, jobMinutes),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [unitId, jobMinutes, rolloutsVersion],
  );

  // Bump on any cancel / reschedule / supersede in the admin shell so
  // `alreadyScheduledByOther` re-evaluates against the live bookings.
  const liveBookingsVersion = useSyncExternalStore(
    subscribeLiveBookings,
    getLiveBookingsVersion,
    getLiveBookingsVersion,
  );

  const lockedByOther = useMemo<LockedByOther>(() => {
    void liveBookingsVersion;
    return alreadyScheduledByOther(unitId);
  }, [unitId, liveBookingsVersion]);

  // Filter out past dates first, then drop any remaining days that
  // have no available windows — so the picker only ever surfaces dates
  // and windows the customer can actually act on.
  const visibleDays = useMemo(
    () => getVisibleServiceDays(slotData.days.filter((d) => !isPastDate(d.date))),
    [slotData.days],
  );

  // If the customer's job size grows or the rollout shifts, an
  // already-selected slot might no longer fit. Drop it so Continue
  // can't carry stale, now-invalid state forward.
  useEffect(() => {
    if (!selected) return;
    const stillValid = visibleDays
      .flatMap(dayWindows)
      .some((s) => s.id === selected && s.status === "available");
    if (!stillValid) setSelected(null);
  }, [selected, visibleDays]);

  // Resolve the date that owns the currently-selected slot id. Needed
  // both for the consumer (UI summary lines) and to push the schedule
  // tuple back into the booking session so downstream gating
  // (`isPayStepEnabled`) can see it.
  const selectedDate = useMemo<string | null>(() => {
    if (!selected) return null;
    const day = visibleDays.find((d) =>
      dayWindows(d).some((w) => w.id === selected),
    );
    return day?.date ?? null;
  }, [selected, visibleDays]);

  // Mirror the local pick into the booking session so Step 5 / Pay
  // can light up the Continue button. The local state inside this
  // hook is the source of truth while the customer is on the slot
  // picker; the session copy is what every other step reads.
  useEffect(() => {
    bookingActions.setSchedule(selectedDate, selected ?? null);
  }, [selectedDate, selected]);

  return {
    rollout: slotData.rollout,
    visibleDays,
    lockedByOther,
    selected,
    setSelected,
  };
}
