import { useMemo, useState } from "react";
import {
  ArrowRight,
  Sun,
  Moon,
  ChevronLeft,
  ChevronRight,
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

/** Seed data for the desktop layout — same believable mix as the mobile
 *  variant, just spread across more visible days. */
const ALL_DAYS: Day[] = [
  { date: "2026-04-27", weekday: "Mon", day: 27, month: "Apr",
    morning:   { id: "20260427-am", window: "morning",   windowMinutes: MORNING_WINDOW_MINUTES,   bookedMinutes: 75 },
    afternoon: { id: "20260427-pm", window: "afternoon", windowMinutes: AFTERNOON_WINDOW_MINUTES, bookedMinutes: 195 } },
  { date: "2026-04-28", weekday: "Tue", day: 28, month: "Apr",
    morning:   { id: "20260428-am", window: "morning",   windowMinutes: MORNING_WINDOW_MINUTES,   bookedMinutes: MORNING_WINDOW_MINUTES },
    afternoon: { id: "20260428-pm", window: "afternoon", windowMinutes: AFTERNOON_WINDOW_MINUTES, bookedMinutes: 60 } },
  { date: "2026-04-29", weekday: "Wed", day: 29, month: "Apr",
    morning:   { id: "20260429-am", window: "morning",   windowMinutes: MORNING_WINDOW_MINUTES,   bookedMinutes: 0 },
    afternoon: { id: "20260429-pm", window: "afternoon", windowMinutes: AFTERNOON_WINDOW_MINUTES, bookedMinutes: 105 } },
  { date: "2026-04-30", weekday: "Thu", day: 30, month: "Apr",
    morning:   { id: "20260430-am", window: "morning",   windowMinutes: MORNING_WINDOW_MINUTES,   bookedMinutes: 165 },
    afternoon: { id: "20260430-pm", window: "afternoon", windowMinutes: AFTERNOON_WINDOW_MINUTES, bookedMinutes: AFTERNOON_WINDOW_MINUTES } },
  { date: "2026-05-01", weekday: "Fri", day: 1, month: "May",
    morning:   { id: "20260501-am", window: "morning",   windowMinutes: MORNING_WINDOW_MINUTES,   bookedMinutes: 45 },
    afternoon: { id: "20260501-pm", window: "afternoon", windowMinutes: AFTERNOON_WINDOW_MINUTES, bookedMinutes: 90 } },
  { date: "2026-05-02", weekday: "Sat", day: 2, month: "May",
    morning:   { id: "20260502-am", window: "morning",   windowMinutes: MORNING_WINDOW_MINUTES,   bookedMinutes: 120 },
    afternoon: { id: "20260502-pm", window: "afternoon", windowMinutes: AFTERNOON_WINDOW_MINUTES, bookedMinutes: 0 } },
  { date: "2026-05-04", weekday: "Mon", day: 4, month: "May",
    morning:   { id: "20260504-am", window: "morning",   windowMinutes: MORNING_WINDOW_MINUTES,   bookedMinutes: 0 },
    afternoon: { id: "20260504-pm", window: "afternoon", windowMinutes: AFTERNOON_WINDOW_MINUTES, bookedMinutes: 60 } },
  { date: "2026-05-05", weekday: "Tue", day: 5, month: "May",
    morning:   { id: "20260505-am", window: "morning",   windowMinutes: MORNING_WINDOW_MINUTES,   bookedMinutes: MORNING_WINDOW_MINUTES },
    afternoon: { id: "20260505-pm", window: "afternoon", windowMinutes: AFTERNOON_WINDOW_MINUTES, bookedMinutes: 30 } },
  { date: "2026-05-06", weekday: "Wed", day: 6, month: "May",
    morning:   { id: "20260506-am", window: "morning",   windowMinutes: MORNING_WINDOW_MINUTES,   bookedMinutes: 105 },
    afternoon: { id: "20260506-pm", window: "afternoon", windowMinutes: AFTERNOON_WINDOW_MINUTES, bookedMinutes: 240 } },
  { date: "2026-05-07", weekday: "Thu", day: 7, month: "May",
    morning:   { id: "20260507-am", window: "morning",   windowMinutes: MORNING_WINDOW_MINUTES,   bookedMinutes: 0 },
    afternoon: { id: "20260507-pm", window: "afternoon", windowMinutes: AFTERNOON_WINDOW_MINUTES, bookedMinutes: AFTERNOON_WINDOW_MINUTES } },
  { date: "2026-05-08", weekday: "Fri", day: 8, month: "May",
    morning:   { id: "20260508-am", window: "morning",   windowMinutes: MORNING_WINDOW_MINUTES,   bookedMinutes: 60 },
    afternoon: { id: "20260508-pm", window: "afternoon", windowMinutes: AFTERNOON_WINDOW_MINUTES, bookedMinutes: 90 } },
  { date: "2026-05-09", weekday: "Sat", day: 9, month: "May",
    morning:   { id: "20260509-am", window: "morning",   windowMinutes: MORNING_WINDOW_MINUTES,   bookedMinutes: 150 },
    afternoon: { id: "20260509-pm", window: "afternoon", windowMinutes: AFTERNOON_WINDOW_MINUTES, bookedMinutes: AFTERNOON_WINDOW_MINUTES } },
];

export function SlotsDesktop() {
  const [selected, setSelected] = useState<string | null>(null);
  const [weekIdx, setWeekIdx] = useState(0);
  const session = useBookingSession();
  const jobMinutes = getBookingDurationMinutes(session);

  const weeks = useMemo(() => {
    const out: Day[][] = [];
    for (let i = 0; i < ALL_DAYS.length; i += 6) {
      out.push(ALL_DAYS.slice(i, i + 6));
    }
    return out;
  }, []);

  const week = weeks[weekIdx] ?? [];
  const selectedDay = ALL_DAYS.find((d) => d.morning.id === selected || d.afternoon.id === selected);
  const selectedSlot = ALL_DAYS.flatMap((d) => [d.morning, d.afternoon]).find((s) => s.id === selected);

  const monthLabel = useMemo(() => {
    if (!week.length) return "";
    const first = week[0].month;
    const last = week[week.length - 1].month;
    return first === last ? first : `${first} – ${last}`;
  }, [week]);

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-['Inter'] flex justify-center overflow-y-auto">
      <div className="w-full max-w-2xl">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-8 md:p-10 flex flex-col">
          
          <div className="mb-6 flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Schedule your service</h1>
              <p className="text-sm text-slate-500 mt-2">
                Slots fill by <span className="font-medium text-slate-700">time</span>, not by booking count —
                we'll show the windows that still have room.
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-200">
              <Clock className="h-3.5 w-3.5" />
              Sydney Time
            </div>
          </div>

          {/* "Your service" chip — anchors the disabled-slot reasoning */}
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold"
              style={{ backgroundColor: "#FFF1F8", color: "#9D174D" }}
              data-testid="chip-job-duration-desktop"
            >
              <Clock className="h-3.5 w-3.5" />
              Your service: ~{formatDurationMinutes(jobMinutes)}
            </span>
          </div>

          <div className="flex-1">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-900">{monthLabel} 2026</span>
                <span className="text-xs text-slate-400">· Week {weekIdx + 1} of {weeks.length}</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={weekIdx === 0}
                  onClick={() => setWeekIdx(Math.max(0, weekIdx - 1))}
                  className="grid h-8 w-8 place-items-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  disabled={weekIdx >= weeks.length - 1}
                  onClick={() => setWeekIdx(Math.min(weeks.length - 1, weekIdx + 1))}
                  className="grid h-8 w-8 place-items-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-6 gap-3 mb-8">
              {week.map((d, i) => {
                const isMonthBoundary = i > 0 && week[i - 1].month !== d.month;
                return (
                  <div key={d.date} className="flex flex-col items-center gap-2">
                    <div className={`flex h-[68px] w-full flex-col items-center justify-center rounded-xl border bg-slate-50 ${isMonthBoundary ? "border-pink-200 bg-pink-50/30" : "border-slate-200"}`}>
                      <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{d.weekday}</div>
                      <div className="text-xl font-bold leading-tight text-slate-900">{d.day}</div>
                      <div className={`text-[10px] font-medium uppercase tracking-wide ${isMonthBoundary ? "text-pink-600" : "text-slate-500"}`}>{d.month}</div>
                    </div>
                  </div>
                );
              })}
              {week.map((d) => (
                <DesktopSlotCard
                  key={`${d.date}-am`}
                  slot={d.morning}
                  jobMinutes={jobMinutes}
                  icon={<Sun className="h-4 w-4" />}
                  label="Morning"
                  hint="8am – 12pm"
                  selected={selected === d.morning.id}
                  onClick={() => setSelected(d.morning.id)}
                />
              ))}
              {week.map((d) => (
                <DesktopSlotCard
                  key={`${d.date}-pm`}
                  slot={d.afternoon}
                  jobMinutes={jobMinutes}
                  icon={<Moon className="h-4 w-4" />}
                  label="Afternoon"
                  hint="12pm – 5pm"
                  selected={selected === d.afternoon.id}
                  onClick={() => setSelected(d.afternoon.id)}
                />
              ))}
            </div>

            {selectedSlot && selectedDay && (
              <div
                className="rounded-xl border p-4 flex items-center justify-between"
                style={{
                  borderColor: "rgba(95,187,151,0.45)",
                  backgroundColor: "rgba(95,187,151,0.08)",
                }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="grid h-10 w-10 place-items-center rounded-full text-white"
                    style={{ backgroundColor: SELECTED_GREEN }}
                  >
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-0.5">Selected slot</div>
                    <div className="text-sm font-semibold text-slate-900">
                      {selectedDay.weekday} {selectedDay.day} {selectedDay.month} · <span className="capitalize">{selectedSlot.window} window</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="mt-12 pt-6 border-t border-slate-100 flex items-center justify-between">
            <button
              type="button"
              className="text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors"
              data-testid="button-back-desktop"
            >
              ← Back
            </button>
            <button
              type="button"
              disabled={!selected}
              data-testid="button-continue-desktop"
              className="flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white transition disabled:opacity-50 hover:opacity-90"
              style={{ backgroundColor: BRAND }}
            >
              Continue
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}

function DesktopSlotCard({
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
      data-testid={`desktop-slot-${slot.id}`}
      aria-pressed={isSelected}
      className={`relative flex flex-col items-start gap-1 rounded-xl border px-3 py-3 text-left transition ${
        disabled
          ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
          : isSelected
            ? "text-white shadow-sm"
            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:shadow-sm"
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
        {isSelected && <CheckCircle2 className="h-4 w-4 text-white" />}
      </div>
      <div className="text-[13px] font-semibold">{label}</div>
      <div className={`text-[10px] ${disabled ? "text-slate-400" : isSelected ? "text-white/85" : "text-slate-500"}`}>{hint}</div>
      <div className={`text-[10px] font-medium ${disabled ? "text-slate-400" : isSelected ? "text-white/85" : "text-slate-700"}`}>
        {disabled ? reason : availableLabel}
      </div>
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
