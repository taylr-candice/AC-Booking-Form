import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Sun,
  Moon,
  Pencil,
  CheckCircle2,
  Info,
  AlertTriangle,
} from "lucide-react";

import { getBookingDurationMinutes, slotFitStatus } from "../../../state/bookingDerived";
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

/** Lite layout has only 3 visible dates — seed each one differently so the
 *  mix of empty / partly-full / nearly-full reads at a glance. */
const DAYS: Day[] = [
  {
    date: "2026-05-04", weekday: "Mon", day: 4, month: "May",
    morning:   { id: "20260504-am", window: "morning",   windowMinutes: MORNING_WINDOW_MINUTES,   bookedMinutes: 60 },
    afternoon: { id: "20260504-pm", window: "afternoon", windowMinutes: AFTERNOON_WINDOW_MINUTES, bookedMinutes: 0 },
  },
  {
    date: "2026-05-06", weekday: "Wed", day: 6, month: "May",
    // Almost-full morning: 20 min left. For the default 45-min job this
    // shows the "Not enough time left" state side-by-side with the
    // fully-booked afternoon on Friday.
    morning:   { id: "20260506-am", window: "morning",   windowMinutes: MORNING_WINDOW_MINUTES,   bookedMinutes: 220 },
    afternoon: { id: "20260506-pm", window: "afternoon", windowMinutes: AFTERNOON_WINDOW_MINUTES, bookedMinutes: 105 },
  },
  {
    date: "2026-05-08", weekday: "Fri", day: 8, month: "May",
    morning:   { id: "20260508-am", window: "morning",   windowMinutes: MORNING_WINDOW_MINUTES,   bookedMinutes: 0 },
    afternoon: { id: "20260508-pm", window: "afternoon", windowMinutes: AFTERNOON_WINDOW_MINUTES, bookedMinutes: AFTERNOON_WINDOW_MINUTES },
  },
];

export function SlotsMobileLite() {
  const [selected, setSelected] = useState<string | null>(null);
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

  // If the customer's job size grows (e.g. they edit the AC step in
  // another iframe via cross-iframe sessionStorage sync), an already-
  // selected slot might no longer fit. Drop it so the Continue button
  // can't carry a stale, now-invalid selection forward. Same
  // `slotFitStatus` source of truth used by the slot tile so the two
  // can never disagree.
  const selectedSlotFits = useMemo(() => {
    if (!selected) return true;
    for (const d of DAYS) {
      for (const slot of [d.morning, d.afternoon]) {
        if (slot.id === selected) {
          return slotFitStatus(slot, jobMinutes) === "available";
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

      <div className="flex-1 overflow-y-auto px-5 pb-6">
        <div className="mb-2 mt-1 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold" style={{ color: BRAND }}>
            Available Slots
          </h2>
          <button type="button" aria-label="Edit" className="rounded p-1 text-slate-500 hover:text-slate-900">
            <Pencil className="h-4 w-4" />
          </button>
        </div>

        {/* Access-window commitment — prominent, always shown. */}
        <div
          className="mb-4 rounded-xl border px-3 py-2.5 text-[12px] leading-relaxed"
          style={{ borderColor: "#FBCFE2", backgroundColor: "#FFF1F8", color: "#9D174D" }}
          data-testid="banner-access-commitment-mobile"
        >
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <span className="font-semibold">Heads up:</span> we can't guarantee an
              exact arrival or finish time within the window you pick, so please make
              sure we have access to the unit for the{" "}
              <span className="font-semibold">entire window</span>.
            </div>
          </div>
          {/* Quieter, always-available shortcut — gives non-unsure customers
              a one-tap way to fix AC details without burying the affordance
              in a step they may have already passed. */}
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              data-testid="button-edit-ac"
              className="text-[11px] font-semibold underline underline-offset-2 hover:opacity-80"
              style={{ color: "#9D174D" }}
            >
              Edit AC info
            </button>
          </div>
        </div>

        {/* "Not sure" callout — only when AC step was answered "unsure". */}
        {isUnsure && (
          <div
            className="mb-4 rounded-xl border px-3 py-2.5 text-[12px] leading-relaxed"
            style={{ borderColor: "#FCD34D", backgroundColor: "#FFFBEB", color: "#92400E" }}
            data-testid="callout-unsure-mobile"
          >
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                You picked <span className="font-semibold">"Not sure"</span> on the AC step,
                so we've sized your slot for one indoor unit. If we find more on-site,
                the technician may not finish in one visit and Taylr will book a
                second slot — which means{" "}
                <span className="font-semibold" data-testid="nudge-accountability-mobile">
                  {accountabilityNudge}
                </span>.{" "}
                <span className="font-semibold">If you can confirm the AC details now,
                you'll likely avoid that.</span>
              </div>
            </div>
            <div className="mt-2.5 flex justify-end">
              <button
                type="button"
                data-testid="button-edit-ac"
                className="rounded-full px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm transition hover:opacity-90"
                style={{ backgroundColor: "#B45309" }}
              >
                Update AC info
              </button>
            </div>
          </div>
        )}

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
    </div>
  );
}


function DayBlock({
  day, jobMinutes, selected, onSelect,
}: { day: Day; jobMinutes: number; selected: string | null; onSelect: (id: string) => void }) {
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
      {disabled && (
        <div className="text-[10px] font-medium text-slate-400">{reason}</div>
      )}
    </button>
  );
}
