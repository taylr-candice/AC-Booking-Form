/**
 * Modal for converting a coordination booking
 * (`serviceSlot === "to_be_coordinated"`) into a real scheduled
 * appointment.
 *
 * Surfaced from the awaiting-coordination row's "Schedule" action and
 * from the BookingDetail Schedule card. Ops picks a date + window
 * from the booking's rollout, confirms, and the booking flips to
 * scheduled (the parent applies the patch and bumps rollout
 * capacity).
 *
 * Visuals match the Step 3 picker in the New Booking flow — same
 * RolloutDayCell grid + capacity-model accent — so admins see one
 * picker no matter which entry point they came from.
 */

import { useState } from "react";
import { Clock, Hash, X } from "lucide-react";

import {
  bookingDurationMinutes,
  getBuildingForUnit,
  getRolloutById,
  type AdminBooking,
  type AdminUnit,
} from "@/state/adminMockData";
import { formatDurationMinutes } from "@/state/bookingDerived";

import { capacityModelColor, RolloutDayCell } from "./rolloutSlotPicker";
import { BRAND, BRAND_DEEP } from "./theme";

export function ScheduleCoordinationModal({
  booking,
  units,
  onCancel,
  onConfirm,
}: {
  booking: AdminBooking;
  units: AdminUnit[];
  onCancel: () => void;
  onConfirm: (
    bookingId: string,
    date: string,
    window: "morning" | "afternoon",
  ) => void;
}) {
  const rollout = getRolloutById(booking.rolloutId);
  const unit = units.find((u) => u.id === booking.unitId) ?? null;
  const building = getBuildingForUnit(unit ?? null);
  const jobMinutes = bookingDurationMinutes(booking);

  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const [pickedWindow, setPickedWindow] = useState<
    "morning" | "afternoon" | null
  >(null);

  const accent = rollout ? capacityModelColor(rollout.capacityModel) : BRAND;
  const ModeIcon = rollout?.capacityModel === "slots_per_window" ? Hash : Clock;
  const modeLabel =
    rollout?.capacityModel === "slots_per_window"
      ? "Slots per window"
      : "Time budget per window";

  const canConfirm = pickedDate !== null && pickedWindow !== null;

  function confirm() {
    if (!canConfirm || !pickedDate || !pickedWindow) return;
    onConfirm(booking.id, pickedDate, pickedWindow);
  }

  return (
    <div
      className="fixed inset-0 z-30 flex items-stretch justify-center bg-slate-900/40 p-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Schedule coordination booking"
    >
      <div className="flex h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex shrink-0 items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Schedule appointment
            </div>
            <div className="text-[18px] font-semibold leading-tight text-slate-900">
              {booking.id} · {booking.customerName}
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel schedule"
            className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5">
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
                  Pick a date and window
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
              rollout from the Rollouts view before scheduling.
            </div>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-3">
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
            className="rounded-lg px-4 py-1.5 text-[13px] font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50"
            style={{ backgroundColor: canConfirm ? BRAND : BRAND_DEEP }}
          >
            Confirm appointment
          </button>
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
