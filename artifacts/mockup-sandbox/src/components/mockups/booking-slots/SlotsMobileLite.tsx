import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Sun,
  Moon,
  Gauge,
  CalendarCheck,
  MessageSquare,
  User,
  Pencil,
  CheckCircle2,
  CalendarClock,
} from "lucide-react";

const BRAND = "#ED017F";
const SELECTED_GREEN = "#5FBB97";

type Slot = { id: string; window: "morning" | "afternoon"; remaining: number };
type Day = { date: string; weekday: string; day: number; month: string; morning: Slot; afternoon: Slot };

const DAYS: Day[] = [
  {
    date: "2026-05-04", weekday: "Mon", day: 4, month: "May",
    morning:   { id: "20260504-am", window: "morning",   remaining: 2 },
    afternoon: { id: "20260504-pm", window: "afternoon", remaining: 3 },
  },
  {
    date: "2026-05-06", weekday: "Wed", day: 6, month: "May",
    morning:   { id: "20260506-am", window: "morning",   remaining: 1 },
    afternoon: { id: "20260506-pm", window: "afternoon", remaining: 2 },
  },
  {
    date: "2026-05-08", weekday: "Fri", day: 8, month: "May",
    morning:   { id: "20260508-am", window: "morning",   remaining: 3 },
    afternoon: { id: "20260508-pm", window: "afternoon", remaining: 2 },
  },
];

export function SlotsMobileLite() {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-white font-['Inter']">
      <div className="border-b border-slate-100 bg-slate-50/70 px-5 pb-1 pt-2 text-[11px] text-slate-400">
        Booking
      </div>

      <div className="flex items-start justify-between px-5 pb-4 pt-5">
        <div>
          <h1 className="text-[26px] font-semibold leading-tight text-slate-900">
            Schedule
          </h1>
          <div className="mt-0.5 text-xs text-slate-500">Step 6 of 7 · Pick a service slot</div>
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

      <div className="flex-1 overflow-y-auto px-5 pb-6">
        <div className="mb-2 mt-1 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold" style={{ color: BRAND }}>
            Available Slots
          </h2>
          <button type="button" aria-label="Edit" className="rounded p-1 text-slate-500 hover:text-slate-900">
            <Pencil className="h-4 w-4" />
          </button>
        </div>

        <div
          className="mb-4 flex items-start gap-2 rounded-xl border px-3 py-2.5 text-[11px] leading-relaxed"
          style={{ borderColor: "#FBCFE2", backgroundColor: "#FFF1F8", color: "#9D174D" }}
        >
          <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <span className="font-semibold">3 dates available</span> in your area over the next 2 weeks.
            Each slot is an arrival <span className="font-semibold">window</span>, not a set time.
          </div>
        </div>

        <div className="space-y-3">
          {DAYS.map((d) => (
            <DayBlock
              key={d.date}
              day={d}
              selected={selected}
              onSelect={(id) => setSelected(id)}
            />
          ))}
        </div>

        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-[11px] text-slate-500">
          None of these work? Call us on <span className="font-medium" style={{ color: BRAND }}>1300 TAYLR</span> and
          we'll look at options outside your area's regular run.
        </div>
      </div>

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

      <nav className="flex items-center justify-around bg-slate-900 px-4 py-3 text-white">
        <NavIcon icon={<Gauge className="h-5 w-5" />} label="Dash" />
        <NavIcon icon={<CalendarCheck className="h-5 w-5" />} label="Bookings" active />
        <div className="text-base font-bold tracking-tight">
          tay<span style={{ color: "#ff3b6e" }}>lr</span>
          <span className="text-[#ff3b6e]">.</span>
        </div>
        <NavIcon icon={<MessageSquare className="h-5 w-5" />} label="Chat" />
        <NavIcon icon={<User className="h-5 w-5" />} label="Me" />
      </nav>
    </div>
  );
}

function NavIcon({ icon, label, active }: { icon: React.ReactNode; label: string; active?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={`grid place-items-center rounded-full p-1.5 ${active ? "text-white" : "text-slate-300"}`}
    >
      {icon}
    </button>
  );
}

function DayBlock({
  day, selected, onSelect,
}: { day: Day; selected: string | null; onSelect: (id: string) => void }) {
  return (
    <div className="flex gap-3">
      <div className="flex w-14 shrink-0 flex-col items-center justify-center rounded-xl border border-slate-200 bg-white py-2">
        <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{day.weekday}</div>
        <div className="text-xl font-bold leading-tight text-slate-900">{day.day}</div>
        <div className="text-[10px] text-slate-500">{day.month}</div>
      </div>

      <div className="grid flex-1 grid-cols-2 gap-2">
        <SlotCard
          slot={day.morning}
          icon={<Sun className="h-4 w-4" />}
          label="Morning"
          hint="8am – 12pm"
          selected={selected === day.morning.id}
          onClick={() => onSelect(day.morning.id)}
        />
        <SlotCard
          slot={day.afternoon}
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
  slot, icon, label, hint, selected, onClick,
}: { slot: Slot; icon: React.ReactNode; label: string; hint: string; selected: boolean; onClick: () => void }) {
  const full = slot.remaining <= 0;
  return (
    <button
      type="button"
      disabled={full}
      onClick={onClick}
      data-testid={`mobile-slot-${slot.id}`}
      className={`relative flex flex-col items-start gap-1 rounded-xl border px-3 py-2.5 text-left transition ${
        full
          ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
          : selected
            ? "text-slate-900"
            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
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
          <CheckCircle2 className="h-3.5 w-3.5" style={{ color: SELECTED_GREEN }} />
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
