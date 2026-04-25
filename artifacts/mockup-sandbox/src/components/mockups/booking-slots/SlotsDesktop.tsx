import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Sun,
  Moon,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Wind,
  CalendarDays,
  Clock,
  Home as HomeIcon,
  CreditCard,
  Pencil,
} from "lucide-react";

const BRAND = "#ED017F";
const SELECTED_GREEN = "#5FBB97";

type Slot = { id: string; window: "morning" | "afternoon"; remaining: number };
type Day = { date: string; weekday: string; day: number; month: string; morning: Slot; afternoon: Slot };

const ALL_DAYS: Day[] = [
  // Week 1 — spans April → May
  { date: "2026-04-27", weekday: "Mon", day: 27, month: "Apr",
    morning:   { id: "20260427-am", window: "morning",   remaining: 2 },
    afternoon: { id: "20260427-pm", window: "afternoon", remaining: 1 } },
  { date: "2026-04-28", weekday: "Tue", day: 28, month: "Apr",
    morning:   { id: "20260428-am", window: "morning",   remaining: 0 },
    afternoon: { id: "20260428-pm", window: "afternoon", remaining: 3 } },
  { date: "2026-04-29", weekday: "Wed", day: 29, month: "Apr",
    morning:   { id: "20260429-am", window: "morning",   remaining: 4 },
    afternoon: { id: "20260429-pm", window: "afternoon", remaining: 2 } },
  { date: "2026-04-30", weekday: "Thu", day: 30, month: "Apr",
    morning:   { id: "20260430-am", window: "morning",   remaining: 1 },
    afternoon: { id: "20260430-pm", window: "afternoon", remaining: 0 } },
  { date: "2026-05-01", weekday: "Fri", day: 1, month: "May",
    morning:   { id: "20260501-am", window: "morning",   remaining: 3 },
    afternoon: { id: "20260501-pm", window: "afternoon", remaining: 2 } },
  { date: "2026-05-02", weekday: "Sat", day: 2, month: "May",
    morning:   { id: "20260502-am", window: "morning",   remaining: 2 },
    afternoon: { id: "20260502-pm", window: "afternoon", remaining: 4 } },

  // Week 2 — May only
  { date: "2026-05-04", weekday: "Mon", day: 4, month: "May",
    morning:   { id: "20260504-am", window: "morning",   remaining: 3 },
    afternoon: { id: "20260504-pm", window: "afternoon", remaining: 2 } },
  { date: "2026-05-05", weekday: "Tue", day: 5, month: "May",
    morning:   { id: "20260505-am", window: "morning",   remaining: 0 },
    afternoon: { id: "20260505-pm", window: "afternoon", remaining: 4 } },
  { date: "2026-05-06", weekday: "Wed", day: 6, month: "May",
    morning:   { id: "20260506-am", window: "morning",   remaining: 2 },
    afternoon: { id: "20260506-pm", window: "afternoon", remaining: 1 } },
  { date: "2026-05-07", weekday: "Thu", day: 7, month: "May",
    morning:   { id: "20260507-am", window: "morning",   remaining: 4 },
    afternoon: { id: "20260507-pm", window: "afternoon", remaining: 0 } },
  { date: "2026-05-08", weekday: "Fri", day: 8, month: "May",
    morning:   { id: "20260508-am", window: "morning",   remaining: 3 },
    afternoon: { id: "20260508-pm", window: "afternoon", remaining: 2 } },
  { date: "2026-05-09", weekday: "Sat", day: 9, month: "May",
    morning:   { id: "20260509-am", window: "morning",   remaining: 2 },
    afternoon: { id: "20260509-pm", window: "afternoon", remaining: 0 } },

  // Week 3 — July (demonstrates multi-month range)
  { date: "2026-07-06", weekday: "Mon", day: 6, month: "Jul",
    morning:   { id: "20260706-am", window: "morning",   remaining: 4 },
    afternoon: { id: "20260706-pm", window: "afternoon", remaining: 4 } },
  { date: "2026-07-07", weekday: "Tue", day: 7, month: "Jul",
    morning:   { id: "20260707-am", window: "morning",   remaining: 3 },
    afternoon: { id: "20260707-pm", window: "afternoon", remaining: 2 } },
  { date: "2026-07-08", weekday: "Wed", day: 8, month: "Jul",
    morning:   { id: "20260708-am", window: "morning",   remaining: 0 },
    afternoon: { id: "20260708-pm", window: "afternoon", remaining: 4 } },
  { date: "2026-07-09", weekday: "Thu", day: 9, month: "Jul",
    morning:   { id: "20260709-am", window: "morning",   remaining: 4 },
    afternoon: { id: "20260709-pm", window: "afternoon", remaining: 1 } },
  { date: "2026-07-10", weekday: "Fri", day: 10, month: "Jul",
    morning:   { id: "20260710-am", window: "morning",   remaining: 2 },
    afternoon: { id: "20260710-pm", window: "afternoon", remaining: 3 } },
  { date: "2026-07-11", weekday: "Sat", day: 11, month: "Jul",
    morning:   { id: "20260711-am", window: "morning",   remaining: 1 },
    afternoon: { id: "20260711-pm", window: "afternoon", remaining: 2 } },
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
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 font-['Inter']">
      {/* Brand sidebar */}
      <aside className="hidden w-[68px] shrink-0 flex-col items-center gap-2 bg-slate-900 py-5 text-white lg:flex">
        <div className="grid h-10 w-10 place-items-center rounded-lg" style={{ backgroundColor: BRAND }}>
          <Wind className="h-5 w-5" />
        </div>
        <div className="text-[11px] font-bold tracking-tight">
          tay<span style={{ color: "#ff3b6e" }}>lr</span>
          <span className="text-[#ff3b6e]">.</span>
        </div>
        <div className="mt-4 flex flex-col items-center gap-1.5 text-slate-400">
          <button className="rounded-md p-2 hover:bg-slate-800"><HomeIcon className="h-4 w-4" /></button>
          <button className="rounded-md bg-slate-800 p-2 text-white"><CalendarDays className="h-4 w-4" /></button>
          <button className="rounded-md p-2 hover:bg-slate-800"><CreditCard className="h-4 w-4" /></button>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-7 py-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Back"
              className="grid h-9 w-9 place-items-center rounded-full border-2 transition hover:bg-pink-50"
              style={{ borderColor: BRAND, color: BRAND }}
              data-testid="button-back-desktop"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500">Step 6 of 7</div>
              <h1 className="text-2xl font-semibold text-slate-900">Schedule your service</h1>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Clock className="h-4 w-4" />
            Service window times are local (Sydney)
          </div>
        </header>

        {/* Two-column body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Schedule grid */}
          <section className="flex flex-1 flex-col overflow-hidden bg-white">
            {/* Section header — pink label + week paginator, matching Figma feel */}
            <div className="flex flex-col gap-1.5 border-b border-slate-100 px-7 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold" style={{ color: BRAND }}>Available Slots</h2>
                  <span className="text-xs font-medium text-slate-500">{monthLabel} 2026</span>
                  <span className="text-xs text-slate-400">· Week {weekIdx + 1} of {weeks.length}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="Previous week"
                    disabled={weekIdx === 0}
                    onClick={() => setWeekIdx(Math.max(0, weekIdx - 1))}
                    className="grid h-8 w-8 place-items-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Next week"
                    disabled={weekIdx >= weeks.length - 1}
                    onClick={() => setWeekIdx(Math.min(weeks.length - 1, weekIdx + 1))}
                    className="grid h-8 w-8 place-items-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <p className="text-xs text-slate-500">
                Each slot is an arrival <span className="font-medium text-slate-700">window</span>, not a set time —
                we'll arrive sometime during the window you pick.
              </p>
            </div>

            <div className="flex-1 overflow-auto px-7 py-5">
              {/* Week grid: 6 day columns × 2 window rows */}
              <div className="grid grid-cols-6 gap-3">
                {week.map((d, i) => {
                  const isMonthBoundary = i > 0 && week[i - 1].month !== d.month;
                  return (
                    <div key={d.date} className="flex flex-col items-center gap-2">
                      <div
                        className={`flex h-[68px] w-full flex-col items-center justify-center rounded-xl border bg-white ${
                          isMonthBoundary ? "border-pink-200 ring-2 ring-pink-100" : "border-slate-200"
                        }`}
                      >
                        <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{d.weekday}</div>
                        <div className="text-xl font-bold leading-tight text-slate-900">{d.day}</div>
                        <div className={`text-[10px] font-medium uppercase tracking-wide ${isMonthBoundary ? "text-pink-600" : "text-slate-500"}`}>
                          {d.month}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {/* Morning row */}
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
                {/* Afternoon row */}
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

              <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-xs text-slate-500">
                Can't find a time that works? Call us on{" "}
                <span className="font-medium" style={{ color: BRAND }}>1300 TAYLR</span>{" "}
                — we'll squeeze you in.
              </div>
            </div>
          </section>

          {/* Booking summary rail */}
          <aside className="flex w-[340px] shrink-0 flex-col border-l border-slate-200 bg-slate-50">
            <div className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
              <h3 className="text-sm font-semibold" style={{ color: BRAND }}>Booking summary</h3>
              <button type="button" aria-label="Edit" className="rounded p-1 text-slate-500 hover:text-slate-900">
                <Pencil className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto px-5 py-5 text-sm">
              <SummaryRow label="Unit" value={<>3 / 4 Example Street<div className="text-xs text-slate-500">Lot 3 · Bondi NSW</div></>} />
              <SummaryRow label="Booker" value={<>Candice Miller<div className="text-xs text-slate-500">candice@taylr.com.au</div></>} />
              <SummaryRow label="AC" value="2 systems + 1 add-on" />
              <SummaryRow label="Access" value={<>Tenant arrange<div className="text-xs text-slate-500">2 tenants on file</div></>} />

              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="text-[11px] uppercase tracking-wide text-slate-500">Selected slot</div>
                {selectedSlot && selectedDay ? (
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="grid h-8 w-8 place-items-center rounded-full text-white" style={{ backgroundColor: SELECTED_GREEN }}>
                      <CheckCircle2 className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-900">
                        {selectedDay.weekday} {selectedDay.day} {selectedDay.month}
                      </div>
                      <div className="text-xs capitalize text-slate-500">{selectedSlot.window} window</div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-1.5 text-xs text-slate-400">No slot picked yet</div>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-baseline justify-between">
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">Total</div>
                    <div className="text-[11px] text-slate-500">incl. GST</div>
                  </div>
                  <div className="text-2xl font-bold text-slate-900">$397</div>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200 bg-white px-5 py-4">
              <button
                type="button"
                disabled={!selected}
                data-testid="button-continue-desktop"
                className="flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-white shadow-sm transition disabled:opacity-50"
                style={{ backgroundColor: BRAND }}
              >
                Continue to pay
                <ArrowRight className="h-4 w-4" />
              </button>
              <p className="mt-2 text-center text-[11px] text-slate-400">
                You can change the slot any time before payment.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function DesktopSlotCard({
  slot, icon, label, hint, selected, onClick,
}: { slot: Slot; icon: React.ReactNode; label: string; hint: string; selected: boolean; onClick: () => void }) {
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
            ? "text-slate-900"
            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:shadow-sm"
      }`}
      style={
        selected && !full
          ? {
              borderColor: "rgba(95,187,151,0.45)",
              backgroundColor: "rgba(95,187,151,0.08)",
            }
          : undefined
      }
    >
      <div className="flex w-full items-center justify-between">
        <div
          className={full ? "text-slate-400" : "text-slate-500"}
          style={selected && !full ? { color: SELECTED_GREEN } : undefined}
        >
          {icon}
        </div>
        {selected && !full && (
          <CheckCircle2 className="h-4 w-4" style={{ color: SELECTED_GREEN }} />
        )}
      </div>
      <div className="text-[13px] font-semibold">{label}</div>
      <div className={`text-[10px] ${full ? "text-slate-400" : "text-slate-500"}`}>{hint}</div>
      <div className={`text-[10px] font-medium ${full ? "text-slate-400" : "text-slate-500"}`}>
        {full ? "Full" : `${slot.remaining} left`}
      </div>
    </button>
  );
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-2.5 last:border-b-0 last:pb-0">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="flex-1 text-right text-sm text-slate-900">{value}</div>
    </div>
  );
}
