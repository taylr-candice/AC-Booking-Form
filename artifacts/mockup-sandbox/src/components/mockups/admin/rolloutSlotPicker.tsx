/**
 * Shared rollout-day / slot-window picker.
 *
 * Extracted from {@link NewBookingFlow} so the admin "convert
 * coordination booking" modal can render the same per-day grid the
 * phone-booking flow uses, and the two stay in lockstep when we tweak
 * disabled-state copy or capacity hints.
 *
 * Pure presentational components — they receive the rollout day +
 * picked state and emit clicks back to the parent. Capacity bumping,
 * job-fit rules, and seed data live elsewhere.
 */

import { Check, Clock, Hash } from "lucide-react";

import {
  rolloutSlotStatus,
  type RolloutDay,
  type RolloutSlot,
  type ServiceCapacityModel,
} from "@/state/adminMockData";
import { formatDurationMinutes } from "@/state/bookingDerived";

import { BRAND, BRAND_DEEP, BRAND_SOFT } from "./theme";

/** Accent color for a rollout's capacity-model pill. Slots-per-window
 *  rollouts get a blue accent ("count-y"), time-budget rollouts get
 *  the brand pink ("time-y") — same convention the customer-side
 *  picker uses. */
export function capacityModelColor(model: ServiceCapacityModel): string {
  return model === "slots_per_window" ? "#3B82F6" : BRAND;
}

export function RolloutDayCell({
  day,
  capacityModel,
  jobMinutes,
  pickedDate,
  pickedWindow,
  onPick,
}: {
  day: RolloutDay;
  capacityModel: ServiceCapacityModel;
  jobMinutes: number;
  pickedDate: string | null;
  pickedWindow: "morning" | "afternoon" | null;
  onPick: (date: string, window: "morning" | "afternoon") => void;
}) {
  return (
    <div
      className={`flex flex-col gap-1.5 rounded-lg border p-2 ${
        day.open
          ? "border-slate-200 bg-white"
          : "border-slate-200 bg-slate-50 opacity-70"
      }`}
    >
      <div className="flex items-baseline justify-between">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          {day.weekdayLabel}
        </div>
        <div className="text-[14px] font-semibold leading-none text-slate-900">
          {day.dayLabel}
        </div>
      </div>
      {day.open ? (
        <>
          <RolloutSlotChoice
            label="Morning"
            day={day}
            slot={day.morning}
            capacityModel={capacityModel}
            jobMinutes={jobMinutes}
            picked={pickedDate === day.isoDate && pickedWindow === "morning"}
            onPick={() => onPick(day.isoDate, "morning")}
          />
          <RolloutSlotChoice
            label="Afternoon"
            day={day}
            slot={day.afternoon}
            capacityModel={capacityModel}
            jobMinutes={jobMinutes}
            picked={pickedDate === day.isoDate && pickedWindow === "afternoon"}
            onPick={() => onPick(day.isoDate, "afternoon")}
          />
        </>
      ) : (
        <div className="rounded bg-slate-100 px-1.5 py-1 text-center text-[10px] font-medium text-slate-500">
          Closed
        </div>
      )}
    </div>
  );
}

function RolloutSlotChoice({
  label,
  day,
  slot,
  capacityModel,
  jobMinutes,
  picked,
  onPick,
}: {
  label: string;
  day: RolloutDay;
  slot: RolloutSlot;
  capacityModel: ServiceCapacityModel;
  jobMinutes: number;
  picked: boolean;
  onPick: () => void;
}) {
  const status = rolloutSlotStatus(day, slot, capacityModel, jobMinutes);
  const available = status === "available";
  const accent = capacityModelColor(capacityModel);
  const ModeIcon = capacityModel === "slots_per_window" ? Hash : Clock;

  // Reason text for unbookable windows. Mirrors the customer-side
  // picker copy so admins and customers see the same justifications.
  let reason = "";
  if (!available) {
    if (status === "not_yet_open") {
      reason = `${label} not yet open for booking`;
    } else if (capacityModel === "slots_per_window") {
      const total = slot.slotCount ?? 0;
      const booked = slot.bookedCount ?? 0;
      reason =
        booked >= total
          ? `${label} is full (${total}/${total})`
          : "Not bookable";
    } else {
      const remaining = Math.max(0, slot.windowMinutes - slot.bookedMinutes);
      reason =
        remaining <= 0
          ? `${label} is full`
          : `Only ${formatDurationMinutes(remaining)} left — needs ${formatDurationMinutes(jobMinutes)}`;
    }
  }

  // Capacity hint shown alongside available windows so the admin can
  // see how tight things are at a glance.
  const capacityHint =
    capacityModel === "slots_per_window"
      ? `${slot.bookedCount ?? 0} / ${slot.slotCount ?? 0}`
      : `${formatDurationMinutes(
          Math.max(0, slot.windowMinutes - slot.bookedMinutes),
        )} left`;

  return (
    <button
      type="button"
      onClick={onPick}
      disabled={!available}
      title={!available ? reason : capacityHint}
      className={`flex w-full flex-col gap-0.5 rounded border px-1.5 py-1 text-left transition ${
        picked
          ? "ring-2"
          : available
            ? "hover:bg-slate-50"
            : "cursor-not-allowed opacity-60"
      }`}
      style={
        picked
          ? {
              borderColor: BRAND,
              backgroundColor: BRAND_SOFT,
              boxShadow: `0 0 0 2px ${BRAND_SOFT}`,
            }
          : { borderColor: "#E2E8F0" }
      }
    >
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1 text-[10px] font-semibold text-slate-700">
          <ModeIcon className="h-2.5 w-2.5" style={{ color: accent }} />
          {label}
        </div>
        {picked && (
          <Check className="h-3 w-3" style={{ color: BRAND_DEEP }} />
        )}
      </div>
      <div className="text-[10px] text-slate-500">
        {available ? capacityHint : reason}
      </div>
    </button>
  );
}
