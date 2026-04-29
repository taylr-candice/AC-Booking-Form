/**
 * Admin "Reschedule booking" modal — Task #49.
 *
 * Reuses the same `resolveCustomerSlotData(unitId, jobMinutes)` the
 * customer slot picker uses, so the windows the admin sees as
 * available are exactly the windows the customer would see — single
 * source of truth.
 *
 * Behaviour notes:
 *   - The booking's CURRENT slot is NOT considered "available" by
 *     `rolloutSlotStatus` (it's contributing to its own bookedMinutes
 *     /bookedCount), so we whitelist it explicitly so the admin can
 *     see the row marked "Current" and isn't asked to pick a window
 *     that already belongs to this booking.
 *   - Note is OPTIONAL per spec T007 — only cancel (T006) requires a
 *     note. The audit-trail label appends the trimmed note when one
 *     is typed and omits the suffix entirely otherwise.
 *   - Past dates are filtered out via `isPastDate` to mirror the
 *     customer picker.
 *   - The slot id encodes "{date}__{window}", so the parent's
 *     `onConfirm(date, window, note)` signature stays clean.
 */

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, CheckCircle2, Sun, Sunrise, X } from "lucide-react";

import {
  bookingDurationMinutes,
  type AdminBooking,
} from "@/state/adminMockData";
import { isPastDate } from "@/state/bookingHelpers";
import { resolveCustomerSlotData } from "../booking-slots/customerSlotData";

import { BRAND, BRAND_DEEP, BRAND_SOFT } from "./theme";

export function RescheduleBookingModal({
  booking,
  onConfirm,
  onDismiss,
}: {
  booking: AdminBooking;
  onConfirm: (
    date: string,
    window: "morning" | "afternoon",
    note?: string,
  ) => void;
  onDismiss: () => void;
}) {
  const jobMinutes = bookingDurationMinutes(booking);
  const slotData = useMemo(
    () => resolveCustomerSlotData(booking.unitId, jobMinutes),
    [booking.unitId, jobMinutes],
  );
  const visibleDays = useMemo(
    () => slotData.days.filter((d) => !isPastDate(d.date)),
    [slotData.days],
  );

  const [picked, setPicked] = useState<string | null>(null);
  const [note, setNote] = useState("");

  // Esc-to-close — same pattern as CancelBookingModal. Listener on
  // document so the keypress is caught even before any control inside
  // the dialog is focused.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onDismiss();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  const currentKey =
    booking.serviceDate &&
    (booking.serviceSlot === "morning" || booking.serviceSlot === "afternoon")
      ? `${booking.serviceDate}__${booking.serviceSlot}`
      : null;

  function pickedToParts(): {
    date: string;
    window: "morning" | "afternoon";
  } | null {
    if (!picked) return null;
    const [date, window] = picked.split("__");
    if (window !== "morning" && window !== "afternoon") return null;
    return { date, window };
  }
  const parts = pickedToParts();
  const trimmedNote = note.trim();
  // Confirm gates on two things: a slot is picked AND it isn't the
  // booking's current slot. Note is OPTIONAL per spec T007 — only
  // cancel (T006) requires a note.
  const canConfirm = !!parts && picked !== currentKey;

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 p-6"
      data-testid="modal-reschedule-booking"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reschedule-booking-title"
    >
      <div className="flex max-h-[90vh] w-full max-w-xl flex-col rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-start gap-2.5">
            <div
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
              style={{ backgroundColor: BRAND_SOFT, color: BRAND_DEEP }}
            >
              <CalendarClock className="h-4 w-4" />
            </div>
            <div>
              <div
                id="reschedule-booking-title"
                className="text-[15px] font-semibold text-slate-900"
              >
                Reschedule booking
              </div>
              <div className="mt-0.5 text-[12px] text-slate-500">
                {booking.customerName} · {booking.id}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Close"
            className="grid h-7 w-7 place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-3 overflow-y-auto px-5 py-4">
          {!slotData.rollout ? (
            <div
              className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900"
              data-testid="reschedule-no-rollout"
            >
              <div className="text-[13px] font-semibold">
                No rollout linked to this unit.
              </div>
              <div className="mt-1 text-[12px] text-amber-800">
                Reschedule isn't available because the building has no
                open rollout. Open the Rollouts view to set one up first.
              </div>
            </div>
          ) : visibleDays.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-[13px] text-slate-600">
              No future days are open on this rollout.
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {visibleDays.map((d) => (
                <li
                  key={d.date}
                  className="flex items-stretch gap-2 rounded-xl border border-slate-200 bg-white p-2"
                >
                  <div className="flex w-14 shrink-0 flex-col items-center justify-center rounded-lg bg-slate-50 py-1">
                    <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                      {d.weekday}
                    </div>
                    <div className="text-lg font-bold leading-tight text-slate-900">
                      {d.day}
                    </div>
                    <div className="text-[10px] text-slate-500">{d.month}</div>
                  </div>
                  <div className="grid flex-1 grid-cols-2 gap-2">
                    <SlotButton
                      key={`${d.date}-am`}
                      icon={<Sunrise className="h-3.5 w-3.5" />}
                      label="Morning"
                      slotKey={`${d.date}__morning`}
                      currentKey={currentKey}
                      pickedKey={picked}
                      status={d.morning.status}
                      onPick={(k) => setPicked(k)}
                    />
                    <SlotButton
                      key={`${d.date}-pm`}
                      icon={<Sun className="h-3.5 w-3.5" />}
                      label="Afternoon"
                      slotKey={`${d.date}__afternoon`}
                      currentKey={currentKey}
                      pickedKey={picked}
                      status={d.afternoon.status}
                      onPick={(k) => setPicked(k)}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}

          <label className="mt-1 flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-slate-700">
              Note (optional)
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Why is this being rescheduled? Saved on the timeline."
              data-testid="textarea-reschedule-note"
              className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-[13px] text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
            />
            <span className="text-[11px] text-slate-500">
              Optional — leave blank if there's no extra context to
              record on the timeline.
            </span>
          </label>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-5 py-3">
          <div className="text-[11px] text-slate-500">
            {currentKey
              ? `Currently ${booking.serviceDate} · ${booking.serviceSlot}`
              : "No slot currently set"}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onDismiss}
              data-testid="button-reschedule-dismiss"
              className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!canConfirm}
              onClick={() => {
                if (!parts) return;
                onConfirm(
                  parts.date,
                  parts.window,
                  trimmedNote.length > 0 ? trimmedNote : undefined,
                );
              }}
              data-testid="button-reschedule-confirm"
              className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50 hover:brightness-110"
              style={{ backgroundColor: BRAND }}
            >
              Reschedule
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SlotButton({
  icon,
  label,
  slotKey,
  currentKey,
  pickedKey,
  status,
  onPick,
}: {
  icon: React.ReactNode;
  label: string;
  slotKey: string;
  currentKey: string | null;
  pickedKey: string | null;
  status: import("../booking-slots/customerSlotData").CustomerSlot["status"];
  onPick: (k: string) => void;
}) {
  const isCurrent = slotKey === currentKey;
  const isPicked = slotKey === pickedKey;
  // The booking's own slot is "full" only because it's contributing
  // to its own bookedMinutes — surface it explicitly as "Current"
  // (still disabled — admin can't pick the slot that's already set).
  const available = status === "available" || isCurrent;
  const disabled = !available || isCurrent;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onPick(slotKey)}
      data-testid={`reschedule-slot-${slotKey}`}
      className={`flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-left text-[12px] transition ${
        isPicked
          ? "border-transparent text-white shadow-sm"
          : isCurrent
            ? "border-slate-200 bg-slate-50 text-slate-500"
            : disabled
              ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
              : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
      }`}
      style={isPicked ? { backgroundColor: "#5FBB97" } : undefined}
    >
      <div className="flex items-center gap-1.5">
        <span className={isPicked ? "text-white" : "text-slate-500"}>
          {icon}
        </span>
        <span className="font-semibold">{label}</span>
      </div>
      {isPicked && <CheckCircle2 className="h-3.5 w-3.5 text-white" />}
      {!isPicked && isCurrent && (
        <span className="text-[10px] font-semibold uppercase tracking-wide">
          Current
        </span>
      )}
      {!isPicked && !isCurrent && disabled && (
        <span className="text-[10px] text-slate-400">Full</span>
      )}
    </button>
  );
}
