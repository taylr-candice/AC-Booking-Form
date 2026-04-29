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
 * {@link rolloutSlotStatus} so each picker variant renders the exact
 * same disabled-reason for the exact same input — no duplicated rule.
 *
 * The slot pickers are also reachable from the canvas in isolation
 * (no booking session yet → `unit_id === null`). To keep the
 * standalone preview rich, we fall back to the seeded Aspen unit so
 * the picker shows the flagship rollout instead of an empty state.
 */

import {
  findRolloutForBooking,
  rolloutSlotStatus,
  type AdminRollout,
  type RolloutSlotStatus,
} from "../../../state/adminMockData";

/** View-model used by the customer-side pickers. Keeps the same
 *  field names the legacy hard-coded seed used so the JSX rendering
 *  in each picker barely changes. */
export type CustomerSlot = {
  id: string;
  window: "morning" | "afternoon";
  windowMinutes: number;
  bookedMinutes: number;
  status: RolloutSlotStatus;
};

export type CustomerDay = {
  date: string;
  weekday: string;
  day: number;
  month: string;
  morning: CustomerSlot;
  afternoon: CustomerSlot;
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

  const days: CustomerDay[] = rollout.days.map((d) => ({
    date: d.isoDate,
    weekday: d.weekdayLabel,
    day: parseInt(d.dayLabel, 10),
    month: d.monthLabel,
    morning: {
      id: d.morning.id,
      window: d.morning.window,
      windowMinutes: d.morning.windowMinutes,
      bookedMinutes: d.morning.bookedMinutes,
      status: rolloutSlotStatus(d, d.morning, rollout.capacityModel, jobMinutes),
    },
    afternoon: {
      id: d.afternoon.id,
      window: d.afternoon.window,
      windowMinutes: d.afternoon.windowMinutes,
      bookedMinutes: d.afternoon.bookedMinutes,
      status: rolloutSlotStatus(
        d,
        d.afternoon,
        rollout.capacityModel,
        jobMinutes,
      ),
    },
  }));

  return { rollout, days };
}

/**
 * Map the four-state {@link RolloutSlotStatus} to the user-facing
 * disabled-reason copy that the slot tile renders below the window
 * label. Returns `null` for `available` (the tile is enabled and
 * shows no reason at all).
 *
 * The customer view is intentionally binary: a window is either
 * available to select, or it shows "Full". The internal nuance
 * between "the day is fully booked", "your job won't fit in what's
 * left", and "the admin hasn't released this window yet" is not
 * surfaced to the customer — practically, none of those windows
 * are bookable, so we just say "Full". Centralised here so all
 * three picker variants render identical copy.
 */
export function disabledReasonForStatus(
  status: RolloutSlotStatus,
): string | null {
  if (status === "available") return null;
  return "Full";
}

/**
 * Customer-facing time range for each booking window. Hoisted so
 * the slot tiles and the "Selected window" summary panel can
 * render the same string (single source of truth — change here
 * and every picker variant updates).
 */
export const WINDOW_TIME_RANGE: Record<"morning" | "afternoon", string> = {
  morning: "8am – 12pm",
  afternoon: "12pm – 5pm",
};
