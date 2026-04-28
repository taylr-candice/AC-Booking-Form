/**
 * Slot calendar view — 14-day grid with morning/afternoon windows per
 * day. Admins can open/close days and click a window to open the
 * `SlotWindowEditor` modal. Calendar state is owned by the `AdminApp`
 * shell so other parts of the mockup could read from it later.
 */

import { useState } from "react";

import type { AdminCalendarDay, AdminSlot } from "@/state/adminMockData";
import { formatDurationMinutes } from "@/state/bookingDerived";

import { SlotWindowEditor } from "./SlotWindowEditor";
import { BRAND, modeColor } from "./theme";

export function CalendarView({
  calendar,
  setCalendar,
}: {
  calendar: AdminCalendarDay[];
  setCalendar: (next: AdminCalendarDay[]) => void;
}) {
  const [editingSlot, setEditingSlot] = useState<{
    dayIso: string;
    window: "morning" | "afternoon";
  } | null>(null);

  function toggleOpen(dayIso: string) {
    setCalendar(
      calendar.map((d) => (d.isoDate === dayIso ? { ...d, open: !d.open } : d)),
    );
  }

  function patchSlot(
    dayIso: string,
    window: "morning" | "afternoon",
    patch: Partial<AdminSlot>,
  ) {
    setCalendar(
      calendar.map((d) =>
        d.isoDate === dayIso
          ? { ...d, [window]: { ...d[window], ...patch } }
          : d,
      ),
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-[12px] text-slate-600">
        <div className="font-semibold text-slate-900">
          Two ways to run a window
        </div>
        <div className="mt-1.5 grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-slate-50 p-2.5">
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: BRAND }}
              />
              <strong className="text-slate-900">Time-based</strong>
            </div>
            <div className="mt-1 text-slate-600">
              Window has a wall-clock length (e.g. 8am–12pm). Each booking
              eats minutes based on how long the service takes. The window
              stays open for a customer until their job no longer fits.
            </div>
          </div>
          <div className="rounded-lg bg-slate-50 p-2.5">
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: "#3B82F6" }}
              />
              <strong className="text-slate-900">Count-based</strong>
            </div>
            <div className="mt-1 text-slate-600">
              Window has a fixed number of booking slots, regardless of
              how long each booking takes. One booking uses one slot.
              Window goes full when all slots are taken.
            </div>
          </div>
        </div>
        <div className="mt-2.5 text-slate-500">
          Customers only ever see "available" or "full" — the mode and the
          numbers below stay on this page.
        </div>
      </div>

      <div className="grid grid-cols-7 gap-3">
        {calendar.map((day) => (
          <div
            key={day.isoDate}
            className={`flex flex-col gap-2 rounded-xl border bg-white p-3 ${
              day.open ? "border-slate-200" : "border-slate-200 opacity-70"
            }`}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  {day.weekdayLabel} · {day.monthLabel}
                </div>
                <div className="text-[18px] font-semibold leading-tight text-slate-900">
                  {day.dayLabel}
                </div>
              </div>
              <button
                type="button"
                onClick={() => toggleOpen(day.isoDate)}
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  day.open ? "text-emerald-700" : "text-slate-500"
                }`}
                style={{ backgroundColor: day.open ? "#DCFCE7" : "#F1F5F9" }}
              >
                {day.open ? "Open" : "Closed"}
              </button>
            </div>
            <CalendarSlot
              slot={day.morning}
              label="Morning"
              onEdit={() =>
                setEditingSlot({ dayIso: day.isoDate, window: "morning" })
              }
              disabled={!day.open}
            />
            <CalendarSlot
              slot={day.afternoon}
              label="Afternoon"
              onEdit={() =>
                setEditingSlot({ dayIso: day.isoDate, window: "afternoon" })
              }
              disabled={!day.open}
            />
          </div>
        ))}
      </div>

      {editingSlot && (
        <SlotWindowEditor
          dayIso={editingSlot.dayIso}
          window={editingSlot.window}
          calendar={calendar}
          onPatch={(patch) =>
            patchSlot(editingSlot.dayIso, editingSlot.window, patch)
          }
          onClose={() => setEditingSlot(null)}
        />
      )}
    </div>
  );
}

function CalendarSlot({
  slot,
  label,
  onEdit,
  disabled,
}: {
  slot: AdminSlot;
  label: string;
  onEdit: () => void;
  disabled: boolean;
}) {
  const isCount = slot.mode === "count_based";
  const fillPct = isCount
    ? Math.min(100, Math.round((slot.bookedCount / Math.max(slot.slotCount, 1)) * 100))
    : Math.min(100, Math.round((slot.bookedMinutes / slot.windowMinutes) * 100));
  const accent = disabled ? "#cbd5e1" : modeColor(slot.mode);
  const headlineLabel = isCount
    ? `${slot.bookedCount} / ${slot.slotCount} booked`
    : `${formatDurationMinutes(slot.bookedMinutes)} / ${formatDurationMinutes(slot.windowMinutes)}`;
  const subLabel = isCount ? "Count-based" : "Time-based";
  return (
    <div
      className={`rounded-lg border p-2 ${
        disabled ? "border-slate-200 bg-slate-50" : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1 text-[11px] font-medium text-slate-700">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: accent }}
          />
          {label}
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="text-[10px] font-semibold text-slate-500 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={disabled}
        >
          Edit
        </button>
      </div>
      <div className="mt-1 text-[11px] font-semibold text-slate-900">
        {headlineLabel}
      </div>
      <div className="text-[10px] text-slate-500">{subLabel}</div>
      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full"
          style={{ width: `${fillPct}%`, backgroundColor: accent }}
        />
      </div>
    </div>
  );
}
