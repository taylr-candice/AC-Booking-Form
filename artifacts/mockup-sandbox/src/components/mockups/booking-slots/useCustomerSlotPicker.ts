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
  getLiveBookingsVersion,
  subscribeLiveBookings,
} from "../../../state/adminMockData";
import {
  alreadyScheduledByOther,
  resolveCustomerSlotData,
  type CustomerDay,
  type CustomerSlot,
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

function dayWindows(day: CustomerDay): CustomerSlot[] {
  const out: CustomerSlot[] = [day.morning, day.afternoon];
  if (day.evening) out.push(day.evening);
  return out;
}

export function useCustomerSlotPicker(
  unitId: string | null,
  jobMinutes: number,
): CustomerSlotPicker {
  const [selected, setSelected] = useState<string | null>(null);

  const slotData = useMemo(
    () => resolveCustomerSlotData(unitId, jobMinutes),
    [unitId, jobMinutes],
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

  const visibleDays = useMemo(
    () => slotData.days.filter((d) => !isPastDate(d.date)),
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

  return {
    rollout: slotData.rollout,
    visibleDays,
    lockedByOther,
    selected,
    setSelected,
  };
}
