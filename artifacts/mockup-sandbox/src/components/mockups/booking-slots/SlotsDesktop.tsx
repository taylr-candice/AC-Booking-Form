import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Sun,
  Moon,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock,
  Info,
  AlertTriangle,
} from "lucide-react";

import { getBookingDurationMinutes, slotFitStatus } from "../../../state/bookingDerived";
import { useBookingSession } from "../../../state/bookingSession";
import { unitCity } from "../../../state/bookingHelpers";

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
 *  variant, just spread across more visible days. The customer never
 *  sees the minute counts; they just see which windows are still
 *  selectable. */
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
    // Almost-full afternoon: 20 min left of a 300-min window. For the
    // default 45-min job, this triggers the "Not enough time left" state
    // — visible without the user having to fiddle with the AC step.
    afternoon: { id: "20260430-pm", window: "afternoon", windowMinutes: AFTERNOON_WINDOW_MINUTES, bookedMinutes: 280 } },
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
  const isUnsure = session.ac_discrepancy?.customer.type === "unsure";
  // Role-conditional accountability nudge inside the "Not sure" callout.
  // Owners and managing agents have very different burdens when a second
  // visit is needed — owners have to physically open up again, agents
  // have to re-coordinate tenant access. The copy below is short on
  // purpose so the distinct keywords ("be home for" / "coordinate with
  // the tenant") double as test anchors. Falls back to the owner
  // phrasing when role is unset (the customer hasn't reached Step 1 yet).
  const accountabilityNudge =
    session.role === "agent"
      ? "you'll need to coordinate a second visit with the tenant"
      : "you'll need to be home for a second visit";
  // Timezone pill mirrors the city the building is in — a Canberra unit
  // shows "Canberra time", a Melbourne unit shows "Melbourne time", and
  // so on. Falls back to "Sydney" when no unit is known. See
  // `unitCity` in bookingHelpers.ts for the full state→city map.
  const cityLabel = unitCity(session.unit_id);

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

  // If the customer's job size grows (e.g. they edit the AC step in
  // another iframe via cross-iframe sessionStorage sync), an already-
  // selected slot might no longer fit. Drop it so the Continue button
  // and the "Selected slot" panel can't carry a stale, now-invalid
  // selection forward. Same `slotFitStatus` source of truth used by
  // the slot tile so the two can never disagree.
  const selectedSlotFits = selectedSlot
    ? slotFitStatus(selectedSlot, jobMinutes) === "available"
    : true;
  useEffect(() => {
    if (selected && !selectedSlotFits) setSelected(null);
  }, [selected, selectedSlotFits]);

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
                Pick an arrival window that works for you.
              </p>
            </div>
            <div
              className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-200"
              data-testid="pill-timezone-desktop"
            >
              <Clock className="h-3.5 w-3.5" />
              {cityLabel} time
            </div>
          </div>

          {/* Access-window commitment — prominent, always shown. */}
          <div
            className="mb-6 rounded-xl border px-4 py-3 text-sm leading-relaxed"
            style={{ borderColor: "#FBCFE2", backgroundColor: "#FFF1F8", color: "#9D174D" }}
            data-testid="banner-access-commitment-desktop"
          >
            <div className="flex items-start gap-2.5">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <span className="font-semibold">Heads up:</span> we can't guarantee an
                exact arrival or finish time within the window you pick, so please make
                sure we have access to the unit for the{" "}
                <span className="font-semibold">entire window</span>.
                {" "}
                <span>
                  Don't want to wait around? Pick an access option that doesn't need you on-site —
                  leave a key, use a parcel locker, or coordinate with a tenant.
                </span>
              </div>
            </div>
            {/* Quieter, always-available shortcut — opens Step 4 so the
                customer can swap to a hands-off access option (parcel
                locker, leave a key, coordinate with tenant) and not have
                to be home for the whole window. */}
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                data-testid="button-edit-access"
                className="text-xs font-semibold underline underline-offset-2 hover:opacity-80"
                style={{ color: "#9D174D" }}
              >
                Change access option
              </button>
            </div>
          </div>

          {/* "Not sure" callout — only when AC step was answered "unsure". */}
          {isUnsure && (
            <div
              className="mb-6 rounded-xl border px-4 py-3 text-sm leading-relaxed"
              style={{ borderColor: "#FCD34D", backgroundColor: "#FFFBEB", color: "#92400E" }}
              data-testid="callout-unsure-desktop"
            >
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  You picked <span className="font-semibold">"Not sure"</span> on the AC
                  step, so we've sized your slot for one indoor unit. If we find more
                  on-site, the technician may not finish in one visit and Taylr will
                  book a second slot — which means{" "}
                  <span className="font-semibold" data-testid="nudge-accountability-desktop">
                    {accountabilityNudge}
                  </span>.{" "}
                  <span className="font-semibold">If you can confirm the AC details
                  now, you'll likely avoid that.</span>
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  data-testid="button-edit-ac"
                  className="rounded-full px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:opacity-90"
                  style={{ backgroundColor: "#B45309" }}
                >
                  Update AC info
                </button>
              </div>
            </div>
          )}

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
  // Fit logic stays intact from #27 — only the rendering changes:
  // customers see slots as plain selectable windows, never minute math.
  const status = slotFitStatus(slot, jobMinutes);
  const fits = status === "available";
  const disabled = !fits;
  const isSelected = selected && fits;

  // Two distinct reasons so the customer can tell whether the window is
  // sold out for everyone ("Full") or just too short for THIS particular
  // booking — the latter hints they could shrink an add-on and try again.
  const reason =
    status === "full" ? "Full" : "Not enough time left for this service";

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
      {disabled && (
        <div className="text-[10px] font-medium text-slate-400">{reason}</div>
      )}
    </button>
  );
}
