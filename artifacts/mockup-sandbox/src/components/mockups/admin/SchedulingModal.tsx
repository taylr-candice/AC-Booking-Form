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
import { ArrowLeft, ArrowRight, Clock, Hash, X } from "lucide-react";

import {
  bookingDurationMinutes,
  formatBookingShortDate,
  getBuildingForUnit,
  getRolloutById,
  type AdminBooking,
  type AdminRollout,
  type AdminUnit,
} from "@/state/adminMockData";
import { formatDurationMinutes } from "@/state/bookingDerived";

import { capacityModelColor, RolloutDayCell } from "./rolloutSlotPicker";
import { BRAND, BRAND_DEEP } from "./theme";

/** Hard cap on the optional reschedule note so the timeline label
 *  stays scannable. Matches the typical short ops note length. */
const RESCHEDULE_NOTE_MAX_LENGTH = 120;

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
    note?: string,
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

  // Reschedule has a two-step flow: pick → confirm. Step state lives
  // inside the modal so the parent doesn't need to know about it. The
  // schedule + undo modes stay one-step (pick → apply) — there's no
  // existing slot to compare against, so a summary screen would just
  // be an extra click.
  const [step, setStep] = useState<"pick" | "confirm">("pick");
  const [note, setNote] = useState<string>("");

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
  const canAdvance =
    pickedDate !== null && pickedWindow !== null && !isSameAsCurrent;

  const isUndo = mode === "undo";
  const onConfirmStep = isReschedule && step === "confirm";
  const heading = onConfirmStep
    ? "Confirm reschedule"
    : isReschedule
      ? "Reschedule appointment"
      : isUndo
        ? "Restore booking — pick a new slot"
        : "Schedule appointment";
  // On the reschedule pick step the primary action advances to the
  // summary; only the summary step actually applies the swap. The
  // schedule + undo modes apply on the single primary click.
  const primaryLabel = onConfirmStep
    ? "Confirm reschedule"
    : isReschedule
      ? "Review reschedule"
      : isUndo
        ? "Restore here"
        : "Confirm appointment";
  const dialogLabel = isReschedule
    ? "Reschedule booking"
    : isUndo
      ? "Restore booking"
      : "Schedule coordination booking";

  const trimmedNote = note.trim();
  const noteOverLimit = trimmedNote.length > RESCHEDULE_NOTE_MAX_LENGTH;
  const canConfirm = onConfirmStep
    ? canAdvance && !noteOverLimit
    : canAdvance;

  const oldSlotLabel =
    initialDate && initialWindow
      ? `${formatBookingShortDate(initialDate)} · ${windowDisplayLabel(initialWindow)}`
      : null;
  const newSlotLabel =
    pickedDate && pickedWindow
      ? `${formatBookingShortDate(pickedDate)} · ${windowDisplayLabel(pickedWindow)}`
      : null;
  const unitLabel = unit
    ? [unit.addressLine1, unit.addressLine2].filter(Boolean).join(" · ") ||
      booking.unitId
    : booking.unitId;

  function primary() {
    if (!canConfirm || !pickedDate || !pickedWindow) return;
    if (isReschedule && step === "pick") {
      setStep("confirm");
      return;
    }
    const noteToSend =
      isReschedule && trimmedNote.length > 0 ? trimmedNote : undefined;
    onConfirm(booking.id, pickedDate, pickedWindow, noteToSend);
  }

  function back() {
    setStep("pick");
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
          {onConfirmStep && oldSlotLabel && newSlotLabel ? (
            <ConfirmRescheduleStep
              bookingId={booking.id}
              unitLabel={unitLabel}
              buildingName={building?.name ?? null}
              oldSlotLabel={oldSlotLabel}
              newSlotLabel={newSlotLabel}
              note={note}
              onNoteChange={setNote}
              noteOverLimit={noteOverLimit}
              maxLength={RESCHEDULE_NOTE_MAX_LENGTH}
            />
          ) : (
            <>
              {isUndo ? (
                <div
                  data-testid="undo-reschedule-explainer"
                  className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] leading-relaxed text-amber-900"
                >
                  The original slot was given to another booking. Pick a new
                  date and window to restore this booking into.
                </div>
              ) : null}
              <div className="mb-4 grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[12px]">
                <SummaryItem
                  label="Customer"
                  value={booking.customerName}
                  hint={
                    booking.bookerRole === "agent"
                      ? "Agent booking"
                      : "Owner booking"
                  }
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
                      <ModeIcon
                        className="h-3 w-3"
                        style={{ color: accent }}
                      />
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
                  No rollout has been set up for this unit yet. Create or
                  assign a rollout from the Rollouts view before{" "}
                  {isReschedule
                    ? "rescheduling"
                    : isUndo
                      ? "restoring"
                      : "scheduling"}
                  .
                </div>
              )}
            </>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-3">
          <div className="text-[11px] text-slate-500">
            {onConfirmStep
              ? "Cancelling here won't change the appointment or capacity."
              : isReschedule && oldSlotLabel
                ? `Currently ${oldSlotLabel}`
                : ""}
          </div>
          <div className="flex items-center gap-2">
            {onConfirmStep ? (
              <button
                type="button"
                onClick={back}
                data-testid="button-back-reschedule"
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium text-slate-700 transition hover:bg-slate-200"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back
              </button>
            ) : null}
            <button
              type="button"
              onClick={onCancel}
              data-testid={
                onConfirmStep
                  ? "button-cancel-reschedule-confirm"
                  : isReschedule
                    ? "button-cancel-reschedule"
                    : isUndo
                      ? "button-cancel-undo-reschedule"
                      : "button-cancel-schedule"
              }
              className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-slate-700 transition hover:bg-slate-200"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={primary}
              disabled={!canConfirm}
              data-testid={
                onConfirmStep
                  ? "button-confirm-reschedule"
                  : isReschedule
                    ? "button-review-reschedule"
                    : isUndo
                      ? "button-confirm-undo-reschedule"
                      : "button-confirm-schedule"
              }
              className="inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-[13px] font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50"
              style={{ backgroundColor: canConfirm ? BRAND : BRAND_DEEP }}
              title={
                isSameAsCurrent
                  ? "Pick a different date or window to reschedule"
                  : noteOverLimit
                    ? `Keep the note under ${RESCHEDULE_NOTE_MAX_LENGTH} characters`
                    : ""
              }
            >
              {primaryLabel}
              {isReschedule && step === "pick" ? (
                <ArrowRight className="h-3.5 w-3.5" />
              ) : null}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function windowDisplayLabel(window: "morning" | "afternoon"): string {
  return window === "morning" ? "Morning" : "Afternoon";
}

function ConfirmRescheduleStep({
  bookingId,
  unitLabel,
  buildingName,
  oldSlotLabel,
  newSlotLabel,
  note,
  onNoteChange,
  noteOverLimit,
  maxLength,
}: {
  bookingId: string;
  unitLabel: string;
  buildingName: string | null;
  oldSlotLabel: string;
  newSlotLabel: string;
  note: string;
  onNoteChange: (next: string) => void;
  noteOverLimit: boolean;
  maxLength: number;
}) {
  const trimmedLength = note.trim().length;
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-[13px] text-slate-700">
        You're moving{" "}
        <span className="font-semibold text-slate-900">{unitLabel}</span>
        {buildingName ? (
          <>
            {" "}
            <span className="text-slate-500">at {buildingName}</span>
          </>
        ) : null}{" "}
        (booking{" "}
        <span className="font-mono text-[12px] text-slate-700">
          {bookingId}
        </span>
        ) to a new slot. Review the change before it lands on the rollout
        and timeline.
      </div>

      <div
        className="grid items-stretch gap-3 sm:grid-cols-[1fr_auto_1fr]"
        data-testid="reschedule-summary"
      >
        <SlotPanel
          label="From"
          value={oldSlotLabel}
          hint="Current slot — capacity will be released."
          tone="muted"
        />
        <div
          className="hidden items-center justify-center text-slate-400 sm:flex"
          aria-hidden="true"
        >
          <ArrowRight className="h-4 w-4" />
        </div>
        <SlotPanel
          label="To"
          value={newSlotLabel}
          hint="New slot — capacity will be consumed."
          tone="active"
          testId="reschedule-summary-new"
        />
      </div>

      <div>
        <label
          htmlFor="reschedule-note"
          className="mb-1.5 flex items-center justify-between text-[12px] font-semibold text-slate-700"
        >
          <span>Reason (optional)</span>
          <span
            className={`text-[11px] font-normal ${
              noteOverLimit ? "text-rose-600" : "text-slate-500"
            }`}
          >
            {trimmedLength}/{maxLength}
          </span>
        </label>
        <textarea
          id="reschedule-note"
          data-testid="input-reschedule-note"
          value={note}
          onChange={(event) => onNoteChange(event.target.value)}
          rows={2}
          maxLength={maxLength + 50}
          placeholder="e.g. tenant called back"
          className={`w-full resize-none rounded-lg border bg-white px-3 py-2 text-[13px] text-slate-900 shadow-sm outline-none transition focus:ring-2 focus:ring-offset-0 ${
            noteOverLimit
              ? "border-rose-300 focus:border-rose-400 focus:ring-rose-200"
              : "border-slate-200 focus:border-slate-300 focus:ring-slate-200"
          }`}
        />
        <p className="mt-1 text-[11px] text-slate-500">
          Appended to the new "Rescheduled" entry on the service timeline.
          Leave blank to skip.
        </p>
      </div>
    </div>
  );
}

function SlotPanel({
  label,
  value,
  hint,
  tone,
  testId,
}: {
  label: string;
  value: string;
  hint: string;
  tone: "muted" | "active";
  testId?: string;
}) {
  const isActive = tone === "active";
  return (
    <div
      data-testid={testId}
      className={`rounded-xl border px-4 py-3 ${
        isActive
          ? "border-slate-300 bg-white shadow-sm"
          : "border-slate-200 bg-slate-50"
      }`}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div
        className={`mt-0.5 text-[15px] font-semibold ${
          isActive ? "text-slate-900" : "text-slate-700"
        }`}
      >
        {value}
      </div>
      <div className="mt-1 text-[11px] text-slate-500">{hint}</div>
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
