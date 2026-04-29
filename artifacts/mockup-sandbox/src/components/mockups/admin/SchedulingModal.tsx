/**
 * Shared Schedule / Reschedule modal — pick a date + window from the
 * booking's rollout and confirm.
 *
 * Two modes:
 *
 *   - "schedule"   — converts a coordination booking
 *                    (`serviceSlot === "to_be_coordinated"`) into a
 *                    real scheduled appointment. Surfaced from the
 *                    awaiting-coordination row's "Schedule" action and
 *                    from the BookingDetail Schedule card.
 *
 *   - "reschedule" — moves an already-scheduled booking
 *                    (`serviceSlot in {"morning","afternoon"}`) to a
 *                    different date/window. Surfaced from the
 *                    BookingDetail Schedule card's "Reschedule" action
 *                    so ops can move a booking when the tenant calls
 *                    back. Pre-selects the booking's current slot and
 *                    virtually subtracts its own footprint from that
 *                    slot so the current window shows as available
 *                    (the booking is contributing to its own
 *                    bookedMinutes/bookedCount until the swap lands).
 *
 * Visuals match the Step 3 picker in the New Booking flow — same
 * RolloutDayCell grid + capacity-model accent — so admins see one
 * picker no matter which entry point they came from.
 */

import { useMemo, useState } from "react";
import { Clock, Hash, X } from "lucide-react";

import {
  bookingDurationMinutes,
  getBuildingForUnit,
  getRolloutById,
  type AdminBooking,
  type AdminRollout,
  type AdminUnit,
} from "@/state/adminMockData";
import { formatDurationMinutes } from "@/state/bookingDerived";

import { capacityModelColor, RolloutDayCell } from "./rolloutSlotPicker";
import { BRAND, BRAND_DEEP } from "./theme";

export type SchedulingMode = "schedule" | "reschedule" | "undo";

export function SchedulingModal({
  booking,
  units,
  mode,
  onCancel,
  onConfirm,
}: {
  booking: AdminBooking;
  units: AdminUnit[];
  mode: SchedulingMode;
  onCancel: () => void;
  onConfirm: (
    bookingId: string,
    date: string,
    window: "morning" | "afternoon",
  ) => void;
}) {
  const baseRollout = getRolloutById(booking.rolloutId);
  const unit = units.find((u) => u.id === booking.unitId) ?? null;
  const building = getBuildingForUnit(unit ?? null);
  const jobMinutes = bookingDurationMinutes(booking);

  // In reschedule mode the booking is contributing to its own slot's
  // booked capacity, which would render that window as "full" in the
  // picker. Subtract the booking's footprint from its current slot so
  // the current window appears available again. Pure / local — no
  // state mutation, the actual swap happens on confirm.
  const rollout = useMemo<AdminRollout | null>(() => {
    if (!baseRollout) return null;
    if (mode !== "reschedule") return baseRollout;
    if (!booking.serviceDate) return baseRollout;
    const currentWindow = booking.serviceSlot;
    if (currentWindow !== "morning" && currentWindow !== "afternoon") {
      return baseRollout;
    }
    return {
      ...baseRollout,
      days: baseRollout.days.map((d) => {
        if (d.isoDate !== booking.serviceDate) return d;
        const slot = d[currentWindow];
        const adjusted =
          baseRollout.capacityModel === "slots_per_window"
            ? {
                ...slot,
                bookedCount: Math.max(0, (slot.bookedCount ?? 0) - 1),
              }
            : {
                ...slot,
                bookedMinutes: Math.max(0, slot.bookedMinutes - jobMinutes),
              };
        return { ...d, [currentWindow]: adjusted };
      }),
    };
  }, [baseRollout, mode, booking.serviceDate, booking.serviceSlot, jobMinutes]);

  const isReschedule = mode === "reschedule";
  const initialDate = isReschedule ? booking.serviceDate ?? null : null;
  const initialWindow =
    isReschedule &&
    (booking.serviceSlot === "morning" || booking.serviceSlot === "afternoon")
      ? booking.serviceSlot
      : null;
  const [pickedDate, setPickedDate] = useState<string | null>(initialDate);
  const [pickedWindow, setPickedWindow] = useState<
    "morning" | "afternoon" | null
  >(initialWindow);

  const accent = rollout ? capacityModelColor(rollout.capacityModel) : BRAND;
  const ModeIcon = rollout?.capacityModel === "slots_per_window" ? Hash : Clock;
  const modeLabel =
    rollout?.capacityModel === "slots_per_window"
      ? "Slots per window"
      : "Time budget per window";

  const isSameAsCurrent =
    isReschedule &&
    pickedDate === initialDate &&
    pickedWindow === initialWindow;
  const canConfirm =
    pickedDate !== null && pickedWindow !== null && !isSameAsCurrent;

  const isUndo = mode === "undo";
  const heading = isReschedule
    ? "Reschedule appointment"
    : isUndo
      ? "Restore booking — pick a new slot"
      : "Schedule appointment";
  const confirmLabel = isReschedule
    ? "Confirm reschedule"
    : isUndo
      ? "Restore here"
      : "Confirm appointment";
  const dialogLabel = isReschedule
    ? "Reschedule booking"
    : isUndo
      ? "Restore booking"
      : "Schedule coordination booking";

  function confirm() {
    if (!canConfirm || !pickedDate || !pickedWindow) return;
    onConfirm(booking.id, pickedDate, pickedWindow);
  }

  return (
    <div
      className="fixed inset-0 z-30 flex items-stretch justify-center bg-slate-900/40 p-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={dialogLabel}
      data-testid={
        isReschedule
          ? "modal-reschedule-booking"
          : isUndo
            ? "modal-reschedule-booking"
            : "modal-schedule-booking"
      }
    >
      <div className="flex h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex shrink-0 items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              {heading}
            </div>
            <div className="text-[18px] font-semibold leading-tight text-slate-900">
              {booking.id} · {booking.customerName}
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label={
              isReschedule
                ? "Cancel reschedule"
                : isUndo
                  ? "Cancel restore"
                  : "Cancel schedule"
            }
            className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {isUndo ? (
            <div
              data-testid="undo-reschedule-explainer"
              className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] leading-relaxed text-amber-900"
            >
              The original slot was given to another booking. Pick a new date
              and window to restore this booking into.
            </div>
          ) : null}
          <div className="mb-4 grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[12px]">
            <SummaryItem
              label="Customer"
              value={booking.customerName}
              hint={booking.bookerRole === "agent" ? "Agent booking" : "Owner booking"}
            />
            <SummaryItem
              label="Unit"
              value={unit?.addressLine1 ?? booking.unitId}
              hint={[unit?.addressLine2, building?.name]
                .filter(Boolean)
                .join(" · ")}
            />
            <SummaryItem
              label="AC"
              value={`${booking.acType} · ${booking.systems} system${
                booking.systems === 1 ? "" : "s"
              }${booking.additional > 0 ? ` + ${booking.additional}` : ""}`}
            />
            <SummaryItem
              label="Estimated job"
              value={formatDurationMinutes(jobMinutes)}
            />
          </div>

          {rollout ? (
            <>
              <div className="mb-3 flex items-center justify-between">
                <div className="text-[13px] font-semibold text-slate-900">
                  {isReschedule
                    ? "Pick a new date and window"
                    : isUndo
                      ? "Pick a new date and window to restore into"
                      : "Pick a date and window"}
                </div>
                <div
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                  style={{ backgroundColor: "#F1F5F9", color: "#334155" }}
                >
                  <ModeIcon className="h-3 w-3" style={{ color: accent }} />
                  {rollout.name} · {modeLabel}
                </div>
              </div>
              <div className="grid grid-cols-7 gap-2">
                {rollout.days.map((day) => (
                  <RolloutDayCell
                    key={day.isoDate}
                    day={day}
                    capacityModel={rollout.capacityModel}
                    jobMinutes={jobMinutes}
                    pickedDate={pickedDate}
                    pickedWindow={pickedWindow}
                    onPick={(date, window) => {
                      setPickedDate(date);
                      setPickedWindow(window);
                    }}
                  />
                ))}
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-[13px] text-slate-700">
              No rollout has been set up for this unit yet. Create or assign a
              rollout from the Rollouts view before{" "}
              {isReschedule
                ? "rescheduling"
                : isUndo
                  ? "restoring"
                  : "scheduling"}
              .
            </div>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-3">
          <div className="text-[11px] text-slate-500">
            {isReschedule && initialDate && initialWindow
              ? `Currently ${initialDate} · ${initialWindow}`
              : ""}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-slate-700 transition hover:bg-slate-200"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={!canConfirm}
              data-testid={
                isReschedule
                  ? "button-confirm-reschedule"
                  : isUndo
                    ? "button-confirm-undo-reschedule"
                    : "button-confirm-schedule"
              }
              className="rounded-lg px-4 py-1.5 text-[13px] font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50"
              style={{ backgroundColor: canConfirm ? BRAND : BRAND_DEEP }}
              title={
                isSameAsCurrent
                  ? "Pick a different date or window to reschedule"
                  : ""
              }
            >
              {confirmLabel}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function SummaryItem({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string | null;
}) {
  return (
    <div className="flex flex-col">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className="text-[13px] font-medium text-slate-900 capitalize">
        {value}
      </div>
      {hint ? (
        <div className="text-[11px] text-slate-500">{hint}</div>
      ) : null}
    </div>
  );
}
