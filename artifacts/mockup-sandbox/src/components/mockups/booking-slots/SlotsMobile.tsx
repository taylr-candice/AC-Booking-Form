import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Sun,
  Moon,
  Pencil,
  CheckCircle2,
  Clock,
} from "lucide-react";

import {
  formatDurationMinutes,
  getBookingDurationMinutes,
} from "../../../state/bookingDerived";
import { useBookingSession } from "../../../state/bookingSession";

const BRAND = "#ED017F";
const SELECTED_GREEN = "#5FBB97";

const MORNING_WINDOW_MINUTES = 240; // 8am – 12pm
const AFTERNOON_WINDOW_MINUTES = 300; // 12pm – 5pm

type Slot = {
  id: string;
  window: "morning" | "afternoon";
  windowMinutes: number;
  bookedMinutes: number;
};
type Day = {
  date: string;
  weekday: string;
  day: number;
  month: string;
  morning: Slot;
  afternoon: Slot;
};

/** Seed data: a believable mix — empty, partly full, nearly full, full —
 *  so the time-budget concept reads at a glance without the user needing
 *  to play with multiple test bookings. */
const DAYS: Day[] = [
  { date: "2026-04-28", weekday: "Tue", day: 28, month: "Apr",
    morning:   { id: "20260428-am", window: "morning",   windowMinutes: MORNING_WINDOW_MINUTES,   bookedMinutes: 60 },
    afternoon: { id: "20260428-pm", window: "afternoon", windowMinutes: AFTERNOON_WINDOW_MINUTES, bookedMinutes: AFTERNOON_WINDOW_MINUTES } },
  { date: "2026-04-29", weekday: "Wed", day: 29, month: "Apr",
    morning:   { id: "20260429-am", window: "morning",   windowMinutes: MORNING_WINDOW_MINUTES,   bookedMinutes: 195 },
    afternoon: { id: "20260429-pm", window: "afternoon", windowMinutes: AFTERNOON_WINDOW_MINUTES, bookedMinutes: 0 } },
  { date: "2026-05-04", weekday: "Mon", day: 4, month: "May",
    morning:   { id: "20260504-am", window: "morning",   windowMinutes: MORNING_WINDOW_MINUTES,   bookedMinutes: 0 },
    afternoon: { id: "20260504-pm", window: "afternoon", windowMinutes: AFTERNOON_WINDOW_MINUTES, bookedMinutes: 105 } },
  { date: "2026-05-05", weekday: "Tue", day: 5, month: "May",
    morning:   { id: "20260505-am", window: "morning",   windowMinutes: MORNING_WINDOW_MINUTES,   bookedMinutes: MORNING_WINDOW_MINUTES },
    afternoon: { id: "20260505-pm", window: "afternoon", windowMinutes: AFTERNOON_WINDOW_MINUTES, bookedMinutes: 45 } },
  { date: "2026-05-06", weekday: "Wed", day: 6, month: "May",
    morning:   { id: "20260506-am", window: "morning",   windowMinutes: MORNING_WINDOW_MINUTES,   bookedMinutes: 120 },
    afternoon: { id: "20260506-pm", window: "afternoon", windowMinutes: AFTERNOON_WINDOW_MINUTES, bookedMinutes: 240 } },
  { date: "2026-05-07", weekday: "Thu", day: 7, month: "May",
    morning:   { id: "20260507-am", window: "morning",   windowMinutes: MORNING_WINDOW_MINUTES,   bookedMinutes: 0 },
    afternoon: { id: "20260507-pm", window: "afternoon", windowMinutes: AFTERNOON_WINDOW_MINUTES, bookedMinutes: AFTERNOON_WINDOW_MINUTES } },
  { date: "2026-07-06", weekday: "Mon", day: 6, month: "Jul",
    morning:   { id: "20260706-am", window: "morning",   windowMinutes: MORNING_WINDOW_MINUTES,   bookedMinutes: 0 },
    afternoon: { id: "20260706-pm", window: "afternoon", windowMinutes: AFTERNOON_WINDOW_MINUTES, bookedMinutes: 0 } },
  { date: "2026-07-07", weekday: "Tue", day: 7, month: "Jul",
    morning:   { id: "20260707-am", window: "morning",   windowMinutes: MORNING_WINDOW_MINUTES,   bookedMinutes: 75 },
    afternoon: { id: "20260707-pm", window: "afternoon", windowMinutes: AFTERNOON_WINDOW_MINUTES, bookedMinutes: 150 } },
];

export function SlotsMobile() {
  const [selected, setSelected] = useState<string | null>(null);
  const session = useBookingSession();
  const jobMinutes = getBookingDurationMinutes(session);

  // If the customer's job size grows (e.g. they edit the AC step in
  // another iframe via cross-iframe sessionStorage sync), an already-
  // selected slot might no longer fit. Drop it so the Continue button
  // can't carry a stale, now-invalid selection forward.
  const selectedSlotFits = useMemo(() => {
    if (!selected) return true;
    for (const d of DAYS) {
      for (const slot of [d.morning, d.afternoon]) {
        if (slot.id === selected) {
          return slot.windowMinutes - slot.bookedMinutes >= jobMinutes;
        }
      }
    }
    return false;
  }, [selected, jobMinutes]);
  useEffect(() => {
    if (selected && !selectedSlotFits) setSelected(null);
  }, [selected, selectedSlotFits]);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-white font-['Inter']">
      {/* Page header — "Check out" style */}
      <div className="flex items-start justify-between px-5 pb-4 pt-5">
        <div>
          <h1 className="text-[26px] font-semibold leading-tight text-slate-900">
            Schedule
          </h1>
          <div className="mt-0.5 text-xs text-slate-500">Pick a service slot</div>
        </div>
        <button
          type="button"
          aria-label="Back"
          className="grid h-9 w-9 place-items-center rounded-full border-2 transition hover:bg-pink-50"
          style={{ borderColor: BRAND, color: BRAND }}
          data-testid="button-back-mobile"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 pb-6">
        {/* Section header — pink label + edit, matching Figma */}
        <div className="mb-2 mt-1 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold" style={{ color: BRAND }}>
            Available Slots
          </h2>
          <button type="button" aria-label="Edit" className="rounded p-1 text-slate-500 hover:text-slate-900">
            <Pencil className="h-4 w-4" />
          </button>
        </div>

        {/* "Your service" chip — anchors the disabled-slot reasoning */}
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
            style={{ backgroundColor: "#FFF1F8", color: "#9D174D" }}
            data-testid="chip-job-duration-mobile"
          >
            <Clock className="h-3 w-3" />
            Your service: ~{formatDurationMinutes(jobMinutes)}
          </span>
        </div>
        <p className="mb-4 text-xs leading-relaxed text-slate-500">
          Slots fill by <span className="font-medium text-slate-700">time</span>, not by booking count —
          we'll show you the windows that still have room for your service.
        </p>

        <div className="space-y-3">
          {DAYS.map((d) => (
            <DayBlock
              key={d.date}
              day={d}
              jobMinutes={jobMinutes}
              selected={selected}
              onSelect={(id) => setSelected(id)}
            />
          ))}
        </div>

        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-[11px] text-slate-500">
          Need a different date? Call us on <span className="font-medium" style={{ color: BRAND }}>1300 TAYLR</span>.
        </div>
      </div>

      {/* Docked CTA above the bottom nav */}
      <div className="border-t border-slate-100 bg-white px-5 py-3">
        <button
          type="button"
          disabled={!selected}
          data-testid="button-continue-mobile"
          className="flex w-full items-center justify-center gap-2 rounded-full px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition disabled:opacity-50"
          style={{ backgroundColor: BRAND }}
        >
          Continue
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}


function DayBlock({
  day, jobMinutes, selected, onSelect,
}: { day: Day; jobMinutes: number; selected: string | null; onSelect: (id: string) => void }) {
  return (
    <div className="flex gap-3">
      {/* Date pill */}
      <div className="flex w-14 shrink-0 flex-col items-center justify-center rounded-xl border border-slate-200 bg-white py-2">
        <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{day.weekday}</div>
        <div className="text-xl font-bold leading-tight text-slate-900">{day.day}</div>
        <div className="text-[10px] text-slate-500">{day.month}</div>
      </div>

      {/* Slots */}
      <div className="grid flex-1 grid-cols-2 gap-2">
        <SlotCard
          slot={day.morning}
          jobMinutes={jobMinutes}
          icon={<Sun className="h-4 w-4" />}
          label="Morning"
          hint="8am – 12pm"
          selected={selected === day.morning.id}
          onClick={() => onSelect(day.morning.id)}
        />
        <SlotCard
          slot={day.afternoon}
          jobMinutes={jobMinutes}
          icon={<Moon className="h-4 w-4" />}
          label="Afternoon"
          hint="12pm – 5pm"
          selected={selected === day.afternoon.id}
          onClick={() => onSelect(day.afternoon.id)}
        />
      </div>
    </div>
  );
}

function SlotCard({
  slot, jobMinutes, icon, label, hint, selected, onClick,
}: {
  slot: Slot;
  jobMinutes: number;
  icon: React.ReactNode;
  label: string;
  hint: string;
  selected: boolean;
  onClick: () => void;
}) {
  const availableMinutes = Math.max(0, slot.windowMinutes - slot.bookedMinutes);
  const fits = availableMinutes >= jobMinutes;
  const full = availableMinutes <= 0;
  const disabled = !fits;
  const isSelected = selected && fits;
  const fillPct = Math.min(
    100,
    Math.round((slot.bookedMinutes / slot.windowMinutes) * 100),
  );

  const reason = full
    ? "Full"
    : `Won't fit your ${formatDurationMinutes(jobMinutes)} service`;
  const availableLabel = `${formatDurationMinutes(availableMinutes)} available`;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      data-testid={`mobile-slot-${slot.id}`}
      aria-pressed={isSelected}
      className={`relative flex flex-col items-start gap-1 rounded-xl border px-3 py-2.5 text-left transition ${
        disabled
          ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
          : isSelected
            ? "text-white shadow-sm"
            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
      }`}
      style={
        isSelected
          ? { borderColor: SELECTED_GREEN, backgroundColor: SELECTED_GREEN }
          : undefined
      }
    >
      <div className="flex w-full items-center justify-between">
        <div className={disabled ? "text-slate-400" : isSelected ? "text-white" : "text-slate-500"}>
          {icon}
        </div>
        {isSelected && <CheckCircle2 className="h-3.5 w-3.5 text-white" />}
      </div>
      <div className="text-[13px] font-semibold">{label}</div>
      <div className={`text-[10px] ${disabled ? "text-slate-400" : isSelected ? "text-white/85" : "text-slate-500"}`}>{hint}</div>
      <div className={`text-[10px] font-medium ${disabled ? "text-slate-400" : isSelected ? "text-white/85" : "text-slate-700"}`}>
        {disabled ? reason : availableLabel}
      </div>
      {/* Capacity bar — sits flush below the text, hidden on full/disabled
          slots where the reason text already does the work. */}
      {!disabled && (
        <div
          className={`mt-1 h-1 w-full overflow-hidden rounded-full ${
            isSelected ? "bg-white/30" : "bg-slate-100"
          }`}
          aria-hidden
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${fillPct}%`,
              backgroundColor: isSelected ? "#ffffff" : BRAND,
            }}
          />
        </div>
      )}
    </button>
  );
}
