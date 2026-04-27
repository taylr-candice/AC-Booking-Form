import { useMemo, useState } from "react";
import { ArrowRight, Sun, Moon, ChevronLeft, ChevronRight, CheckCircle2, Clock } from "lucide-react";

const BRAND = "#ED017F";
const SELECTED_GREEN = "#5FBB97";

type Slot = { id: string; window: "morning" | "afternoon"; remaining: number };
type Day = { date: string; weekday: string; day: number; month: string; morning: Slot; afternoon: Slot };

const ALL_DAYS: Day[] = [
  { date: "2026-04-27", weekday: "Mon", day: 27, month: "Apr", morning: { id: "20260427-am", window: "morning", remaining: 2 }, afternoon: { id: "20260427-pm", window: "afternoon", remaining: 1 } },
  { date: "2026-04-28", weekday: "Tue", day: 28, month: "Apr", morning: { id: "20260428-am", window: "morning", remaining: 0 }, afternoon: { id: "20260428-pm", window: "afternoon", remaining: 3 } },
  { date: "2026-04-29", weekday: "Wed", day: 29, month: "Apr", morning: { id: "20260429-am", window: "morning", remaining: 4 }, afternoon: { id: "20260429-pm", window: "afternoon", remaining: 2 } },
  { date: "2026-04-30", weekday: "Thu", day: 30, month: "Apr", morning: { id: "20260430-am", window: "morning", remaining: 1 }, afternoon: { id: "20260430-pm", window: "afternoon", remaining: 0 } },
  { date: "2026-05-01", weekday: "Fri", day: 1, month: "May", morning: { id: "20260501-am", window: "morning", remaining: 3 }, afternoon: { id: "20260501-pm", window: "afternoon", remaining: 2 } },
  { date: "2026-05-02", weekday: "Sat", day: 2, month: "May", morning: { id: "20260502-am", window: "morning", remaining: 2 }, afternoon: { id: "20260502-pm", window: "afternoon", remaining: 4 } },
  { date: "2026-05-04", weekday: "Mon", day: 4, month: "May", morning: { id: "20260504-am", window: "morning", remaining: 3 }, afternoon: { id: "20260504-pm", window: "afternoon", remaining: 2 } },
  { date: "2026-05-05", weekday: "Tue", day: 5, month: "May", morning: { id: "20260505-am", window: "morning", remaining: 0 }, afternoon: { id: "20260505-pm", window: "afternoon", remaining: 4 } },
  { date: "2026-05-06", weekday: "Wed", day: 6, month: "May", morning: { id: "20260506-am", window: "morning", remaining: 2 }, afternoon: { id: "20260506-pm", window: "afternoon", remaining: 1 } },
  { date: "2026-05-07", weekday: "Thu", day: 7, month: "May", morning: { id: "20260507-am", window: "morning", remaining: 4 }, afternoon: { id: "20260507-pm", window: "afternoon", remaining: 0 } },
  { date: "2026-05-08", weekday: "Fri", day: 8, month: "May", morning: { id: "20260508-am", window: "morning", remaining: 3 }, afternoon: { id: "20260508-pm", window: "afternoon", remaining: 2 } },
  { date: "2026-05-09", weekday: "Sat", day: 9, month: "May", morning: { id: "20260509-am", window: "morning", remaining: 2 }, afternoon: { id: "20260509-pm", window: "afternoon", remaining: 0 } },
];

export function SlotsDesktop() {
  const [selected, setSelected] = useState<string | null>("20260506-pm");
  const [weekIdx, setWeekIdx] = useState(0);

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
          
          <div className="mb-8 flex items-start justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-2">Step 6 of 7</div>
              <h1 className="text-2xl font-semibold text-slate-900">Schedule your service</h1>
              <p className="text-sm text-slate-500 mt-2">Pick an arrival window for the technician.</p>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-200">
              <Clock className="h-3.5 w-3.5" />
              Sydney Time
            </div>
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
                  icon={<Moon className="h-4 w-4" />}
                  label="Afternoon"
                  hint="12pm – 5pm"
                  selected={selected === d.afternoon.id}
                  onClick={() => setSelected(d.afternoon.id)}
                />
              ))}
            </div>

            {selectedSlot && selectedDay && (
              <div className="rounded-xl p-4 flex items-center justify-between" style={{ backgroundColor: "#5FBB97" }}>
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-full bg-white/15 text-white">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-white/80 font-semibold mb-0.5">Selected slot</div>
                    <div className="text-sm font-semibold text-white">
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

function DesktopSlotCard({ slot, icon, label, hint, selected, onClick }: { slot: Slot; icon: React.ReactNode; label: string; hint: string; selected: boolean; onClick: () => void }) {
  const full = slot.remaining <= 0;
  return (
    <button
      type="button"
      disabled={full}
      onClick={onClick}
      data-testid={`desktop-slot-${slot.id}`}
      className={`relative flex flex-col items-start gap-1 rounded-xl border px-3 py-3 text-left transition ${
        full
          ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
          : selected
            ? "text-white"
            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:shadow-sm"
      }`}
      style={selected && !full ? { borderColor: "#5FBB97", backgroundColor: "#5FBB97" } : undefined}
    >
      <div className="flex w-full items-center justify-between">
        <div className={full ? "text-slate-400" : selected ? "text-white" : "text-slate-500"}>
          {icon}
        </div>
        {selected && !full && <CheckCircle2 className="h-4 w-4 text-white" />}
      </div>
      <div className="text-[13px] font-semibold">{label}</div>
      <div className={`text-[10px] ${full ? "text-slate-400" : selected ? "text-white/85" : "text-slate-500"}`}>{hint}</div>
      <div className={`text-[10px] font-medium ${full ? "text-slate-400" : selected ? "text-white/85" : "text-slate-500"}`}>
        {full ? "Full" : `${slot.remaining} left`}
      </div>
    </button>
  );
}
