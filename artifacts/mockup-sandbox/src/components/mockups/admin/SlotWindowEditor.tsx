/**
 * Modal editor for one half-day slot window (morning / afternoon).
 * Lets the admin pick a fill mode (time-based vs count-based), tweak
 * the window length / slot count, and reset usage.
 *
 * The editor is a controlled-style component: its parent (the calendar
 * view) owns the calendar state and feeds patches back in via
 * `onPatch`, so changes round-trip as new props.
 */

import { TriangleAlert, X } from "lucide-react";
import { useState } from "react";

import type { AdminCalendarDay, AdminSlot } from "@/state/adminMockData";
import { formatDurationMinutes } from "@/state/bookingDerived";

import { BRAND, modeColor } from "./theme";

export function SlotWindowEditor({
  dayIso,
  window: win,
  calendar,
  onPatch,
  onClose,
}: {
  dayIso: string;
  window: "morning" | "afternoon";
  calendar: AdminCalendarDay[];
  onPatch: (patch: Partial<AdminSlot>) => void;
  onClose: () => void;
}) {
  const day = calendar.find((d) => d.isoDate === dayIso);
  // Snapshot of the mode the slot was in when this editor opened, so we
  // can tell whether the admin has flipped modes during this session and
  // surface a "the now-active value was inferred — reset to 0?" prompt.
  // Hooks must run unconditionally before any early return.
  const initialMode = day ? day[win].mode : "time_based";
  const [sessionStartMode] = useState<"time_based" | "count_based">(initialMode);
  // Two-step confirmation state for the destructive reset actions. We keep
  // these as local UI state — once the prompt is dismissed (or the user
  // confirms) we fall back to the normal button view.
  const [confirmingResetAll, setConfirmingResetAll] = useState(false);
  const [confirmingResetActive, setConfirmingResetActive] = useState(false);
  if (!day) return null;
  const slot = day[win];

  const modeJustChanged = slot.mode !== sessionStartMode;
  const nowActiveValueIsNonZero =
    slot.mode === "count_based" ? slot.bookedCount > 0 : slot.bookedMinutes > 0;
  const showSwitchResetPrompt = modeJustChanged && nowActiveValueIsNonZero;
  const usageIsNonZero = slot.bookedMinutes > 0 || slot.bookedCount > 0;

  function setMode(nextMode: "time_based" | "count_based") {
    if (nextMode === slot.mode) return;
    onPatch({ mode: nextMode });
  }

  function setWindowMinutes(next: number) {
    const clamped = Math.max(60, Math.min(540, next));
    onPatch({
      windowMinutes: clamped,
      bookedMinutes: Math.min(slot.bookedMinutes, clamped),
    });
  }

  function setSlotCount(next: number) {
    const clamped = Math.max(1, Math.min(20, Math.round(next)));
    onPatch({
      slotCount: clamped,
      bookedCount: Math.min(slot.bookedCount, clamped),
    });
  }

  /** Zeros the value of the *now-active* track. Used by the contextual
   *  reset prompt that appears after the admin flips modes — typically
   *  to discard the value inferred from the previous mode. */
  function resetActiveTrack() {
    if (slot.mode === "count_based") {
      onPatch({ bookedCount: 0 });
    } else {
      onPatch({ bookedMinutes: 0 });
    }
    setConfirmingResetActive(false);
  }

  /** Zeros both the minute count and the slot count, so the window is
   *  reported as completely empty regardless of which mode it's in. */
  function resetAllUsage() {
    onPatch({ bookedMinutes: 0, bookedCount: 0 });
    setConfirmingResetAll(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-500">
              {day.weekdayLabel} {day.dayLabel} {day.monthLabel}
            </div>
            <div className="text-[16px] font-semibold capitalize text-slate-900">
              {win} window
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Mode toggle */}
        <div className="mt-4">
          <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
            How this window fills up
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <ModePill
              active={slot.mode === "time_based"}
              accent={modeColor("time_based")}
              title="Time-based"
              subtitle="Bookings eat minutes"
              onClick={() => setMode("time_based")}
            />
            <ModePill
              active={slot.mode === "count_based"}
              accent={modeColor("count_based")}
              title="Count-based"
              subtitle="Bookings eat slots"
              onClick={() => setMode("count_based")}
            />
          </div>
          {showSwitchResetPrompt && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[12px] text-amber-900">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <div className="flex-1">
                <div className="font-semibold">
                  Just switched to{" "}
                  {slot.mode === "count_based" ? "count-based" : "time-based"}.
                </div>
                <div className="mt-0.5">
                  {slot.mode === "count_based"
                    ? `The count of ${slot.bookedCount} booked was inferred from the previous mode.`
                    : `The ${formatDurationMinutes(slot.bookedMinutes)} booked was inferred from the previous mode.`}
                </div>
                {confirmingResetActive ? (
                  <div className="mt-1.5 rounded-md bg-white p-2 ring-1 ring-amber-300">
                    <div className="font-semibold">
                      Reset {slot.mode === "count_based" ? "count" : "minutes"} to 0?
                    </div>
                    <div className="mt-0.5 text-[11px]">
                      This will zero the{" "}
                      {slot.mode === "count_based"
                        ? `${slot.bookedCount} booked slot${slot.bookedCount === 1 ? "" : "s"}`
                        : `${formatDurationMinutes(slot.bookedMinutes)} booked`}
                      .
                    </div>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={resetActiveTrack}
                        className="rounded-md bg-amber-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-amber-700"
                      >
                        Yes, reset
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingResetActive(false)}
                        className="rounded-md bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-900 ring-1 ring-amber-300 hover:bg-amber-100"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmingResetActive(true)}
                    className="mt-1.5 rounded-md bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-900 ring-1 ring-amber-300 hover:bg-amber-100"
                  >
                    Reset {slot.mode === "count_based" ? "count" : "minutes"} to 0
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {slot.mode === "time_based" ? (
          <div className="mt-4">
            <label className="text-[12px] font-medium text-slate-700">
              Window length
            </label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="range"
                min={60}
                max={540}
                step={15}
                value={slot.windowMinutes}
                onChange={(e) => setWindowMinutes(Number(e.target.value))}
                className="flex-1"
                style={{ accentColor: BRAND }}
              />
              <div className="w-20 text-right text-[13px] font-semibold text-slate-900">
                {formatDurationMinutes(slot.windowMinutes)}
              </div>
            </div>
            <div className="mt-3 rounded-lg bg-slate-50 p-3 text-[12px] text-slate-600">
              Already booked:{" "}
              <strong>{formatDurationMinutes(slot.bookedMinutes)}</strong> (will
              be capped if you shrink the window).
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <label className="text-[12px] font-medium text-slate-700">
              Number of booking slots
            </label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="range"
                min={1}
                max={20}
                step={1}
                value={slot.slotCount}
                onChange={(e) => setSlotCount(Number(e.target.value))}
                className="flex-1"
                style={{ accentColor: "#3B82F6" }}
              />
              <input
                type="number"
                min={1}
                max={20}
                value={slot.slotCount}
                onChange={(e) => setSlotCount(Number(e.target.value))}
                className="w-16 rounded-md border border-slate-200 px-2 py-1 text-right text-[13px] font-semibold text-slate-900 focus:border-slate-400 focus:outline-none"
              />
            </div>
            <div className="mt-3 rounded-lg bg-slate-50 p-3 text-[12px] text-slate-600">
              Already booked: <strong>{slot.bookedCount}</strong> of{" "}
              <strong>{slot.slotCount}</strong> (will be capped if you shrink
              the count).
            </div>
            <div className="mt-2 text-[11px] text-slate-500">
              The wall-clock window is still {formatDurationMinutes(slot.windowMinutes)}{" "}
              — bookings just don't have to add up to it.
            </div>
          </div>
        )}

        {confirmingResetAll && (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-[12px] text-rose-900">
            <div className="font-semibold">Reset usage for this window?</div>
            <div className="mt-1">
              This will zero{" "}
              <strong>{formatDurationMinutes(slot.bookedMinutes)}</strong>{" "}
              booked and{" "}
              <strong>
                {slot.bookedCount} booked slot{slot.bookedCount === 1 ? "" : "s"}
              </strong>
              .
            </div>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={resetAllUsage}
                className="rounded-md bg-rose-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-rose-700"
              >
                Yes, reset
              </button>
              <button
                type="button"
                onClick={() => setConfirmingResetAll(false)}
                className="rounded-md bg-white px-3 py-1.5 text-[12px] font-semibold text-rose-900 ring-1 ring-rose-300 hover:bg-rose-100"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setConfirmingResetAll(true)}
            disabled={!usageIsNonZero || confirmingResetAll}
            className="text-[12px] font-semibold text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline disabled:cursor-not-allowed disabled:text-slate-300 disabled:no-underline"
          >
            Reset usage
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-[13px] font-semibold text-white"
            style={{ backgroundColor: BRAND }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function ModePill({
  active,
  accent,
  title,
  subtitle,
  onClick,
}: {
  active: boolean;
  accent: string;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-lg border p-2.5 text-left transition ${
        active ? "border-transparent text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      }`}
      style={active ? { backgroundColor: accent } : undefined}
    >
      <div className="text-[12px] font-semibold leading-tight">{title}</div>
      <div className={`mt-0.5 text-[10px] ${active ? "opacity-90" : "text-slate-500"}`}>
        {subtitle}
      </div>
    </button>
  );
}
