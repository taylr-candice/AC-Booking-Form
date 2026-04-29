import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Sunrise,
  Sun,
  CheckCircle2,
  Info,
  AlertTriangle,
} from "lucide-react";

import { getBookingDurationMinutes, slotFitStatus } from "../../../state/bookingDerived";
import { isPastDate } from "../../../state/bookingHelpers";
import { useBookingSession } from "../../../state/bookingSession";
import {
  isBeThereMethod,
  isUnattendedAccessMethod,
} from "../../../state/accessMethodCatalog";

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
    morning:   { id: "20260505-am", window: "morning",   windowMinutes: MORNING_WINDOW_MINUTES,   bookedMinutes: 220 },
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

export function SlotsHierarchyFirst() {
  const [selected, setSelected] = useState<string | null>(null);
  const session = useBookingSession();
  const jobMinutes = getBookingDurationMinutes(session);
  const isUnsure = session.ac_discrepancy?.customer.type === "unsure";
  
  const accessMethod = session.access_method;
  const unattended = isUnattendedAccessMethod(accessMethod);
  const selfAttended = isBeThereMethod(accessMethod);
  const accessMode = unattended
    ? "unattended"
    : selfAttended
      ? "self-attended"
      : "coordinated";
  const showChangeAccess = selfAttended;

  const accountabilityNudge =
    session.role === "agent"
      ? "you'll need to coordinate a second visit with the tenant"
      : "you'll need to be home for a second visit";

  const visibleDays = useMemo(
    () => DAYS.filter((d) => !isPastDate(d.date)),
    [],
  );

  const selectedSlotFits = useMemo(() => {
    if (!selected) return true;
    for (const d of visibleDays) {
      for (const slot of [d.morning, d.afternoon]) {
        if (slot.id === selected) {
          return slotFitStatus(slot, jobMinutes) === "available";
        }
      }
    }
    return false;
  }, [selected, jobMinutes, visibleDays]);

  useEffect(() => {
    if (selected && !selectedSlotFits) setSelected(null);
  }, [selected, selectedSlotFits]);

  const flatSlots = useMemo(() => {
    const slots: { day: Day; slot: Slot }[] = [];
    for (const d of visibleDays) {
      slots.push({ day: d, slot: d.morning });
      slots.push({ day: d, slot: d.afternoon });
    }
    return slots;
  }, [visibleDays]);

  const firstAvailableIdx = useMemo(() => {
    return flatSlots.findIndex(s => slotFitStatus(s.slot, jobMinutes) === "available");
  }, [flatSlots, jobMinutes]);

  const heroSlotObj = firstAvailableIdx !== -1 ? flatSlots[firstAvailableIdx] : null;
  
  // Exclude the hero slot from the remaining list if we have one
  const remainingDays = useMemo<Array<{ day: Day; morning: Slot | null; afternoon: Slot | null }>>(() => {
    if (!heroSlotObj) {
      return visibleDays.map((d) => ({ day: d, morning: d.morning, afternoon: d.afternoon }));
    }

    const out: Array<{ day: Day; morning: Slot | null; afternoon: Slot | null }> = [];
    for (const d of visibleDays) {
      const isMorningHero = d.morning.id === heroSlotObj.slot.id;
      const isAfternoonHero = d.afternoon.id === heroSlotObj.slot.id;
      
      if (isMorningHero && isAfternoonHero) {
        continue; // Should not happen but typescript 
      }
      
      if (!isMorningHero && !isAfternoonHero) {
        out.push({ day: d, morning: d.morning, afternoon: d.afternoon });
      } else {
        const morning = isMorningHero ? null : d.morning;
        const afternoon = isAfternoonHero ? null : d.afternoon;
        if (morning || afternoon) {
          out.push({ day: d, morning, afternoon });
        }
      }
    }
    return out;
  }, [visibleDays, heroSlotObj]);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-white font-['Inter']">
      <div className="flex items-center px-5 pt-6 pb-2">
        <button
          type="button"
          aria-label="Back"
          className="mr-4 -ml-1 flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-slate-50 text-slate-900"
          data-testid="button-back-mobile"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Schedule
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-6 pt-2">
        
        {/* Banner: Reduced visual weight */}
        <div className="mb-6 flex items-start gap-3 rounded-lg bg-slate-50 border border-slate-100 px-4 py-3 text-slate-600">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <div className="flex-1">
            <div
              className="text-sm leading-relaxed"
              data-testid="banner-access-commitment-mobile"
              data-access-mode={accessMode}
            >
              {unattended ? (
                <>
                  <span className="font-semibold text-slate-800">You're authorising us</span>{" "}
                  to access the unit during the window you pick to carry out
                  the service — no one needs to be there.
                </>
              ) : selfAttended ? (
                <>
                  <span className="font-semibold text-slate-800">Heads up:</span> we can't
                  guarantee an exact arrival or finish time within the window
                  you pick, so please make sure{" "}
                  <span className="font-semibold text-slate-800">you are</span> available for
                  the <span className="font-semibold text-slate-800">entire window</span>.
                </>
              ) : (
                <>
                  The service will be carried out{" "}
                  <span className="font-semibold text-slate-800">sometime within the window</span>{" "}
                  you pick — there's no set arrival time.
                </>
              )}
            </div>
            
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
              {showChangeAccess && (
                <button
                  type="button"
                  data-testid="button-change-access"
                  className="text-xs font-medium text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline"
                >
                  Change access method
                </button>
              )}
              <button
                type="button"
                data-testid="button-edit-ac"
                className="text-xs font-medium text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline"
              >
                Update AC info
              </button>
            </div>
          </div>
        </div>

        {/* Unsure Callout */}
        {isUnsure && (
          <div
            className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-sm leading-relaxed text-amber-900"
            data-testid="callout-unsure-mobile"
          >
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
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
            {/* Provide the required edit button inside the DOM, though hidden visually if needed, but the spec says it must render and be clickable, so keep it visible but subtle. */}
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                data-testid="button-edit-ac"
                className="text-xs font-semibold text-amber-700 underline underline-offset-2 hover:text-amber-900"
              >
                Update AC info
              </button>
            </div>
          </div>
        )}

        {/* Hero: Next Available */}
        {heroSlotObj && (
          <div className="mb-8">
            <h2 className="mb-4 text-lg font-bold text-slate-900">Next available</h2>
            <HeroSlotCard
              day={heroSlotObj.day}
              slot={heroSlotObj.slot}
              jobMinutes={jobMinutes}
              selected={selected === heroSlotObj.slot.id}
              onClick={() => setSelected(heroSlotObj.slot.id)}
            />
          </div>
        )}

        {/* Remaining list */}
        {remainingDays.length > 0 && (
          <div>
            <h2 className="mb-4 text-lg font-bold text-slate-900">More options</h2>
            <div className="flex flex-col gap-3">
              {remainingDays.map(({ day, morning, afternoon }) => (
                <div key={day.date} className="flex flex-col gap-2">
                  <div className="text-sm font-bold text-slate-800">
                    {day.weekday}, {day.month} {day.day}
                  </div>
                  <div className="flex flex-col gap-2">
                    {morning && (
                      <CompactSlotCard
                        slot={morning}
                        jobMinutes={jobMinutes}
                        icon={<Sunrise className="h-4 w-4" />}
                        label="Morning (8am – 12pm)"
                        selected={selected === morning.id}
                        onClick={() => setSelected(morning.id)}
                      />
                    )}
                    {afternoon && (
                      <CompactSlotCard
                        slot={afternoon}
                        jobMinutes={jobMinutes}
                        icon={<Sun className="h-4 w-4" />}
                        label="Afternoon (12pm – 5pm)"
                        selected={selected === afternoon.id}
                        onClick={() => setSelected(afternoon.id)}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-8 border-t border-slate-100 pt-6 text-center text-sm text-slate-500">
          Need a different date?<br />Call us on <span className="font-semibold" style={{ color: BRAND }}>1300 TAYLR</span>.
        </div>
      </div>

      <div className="border-t border-slate-100 bg-white px-5 py-4">
        <button
          type="button"
          disabled={!selected}
          data-testid="button-continue-mobile"
          className="flex w-full items-center justify-center gap-2 rounded-full px-5 py-4 text-[15px] font-semibold text-white transition disabled:opacity-30"
          style={{ backgroundColor: BRAND }}
        >
          Continue
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function HeroSlotCard({
  day,
  slot,
  jobMinutes,
  selected,
  onClick,
}: {
  day: Day;
  slot: Slot;
  jobMinutes: number;
  selected: boolean;
  onClick: () => void;
}) {
  const isMorning = slot.window === "morning";
  const Icon = isMorning ? Sunrise : Sun;
  const label = isMorning ? "Morning window" : "Afternoon window";
  const hint = isMorning ? "8am – 12pm" : "12pm – 5pm";
  
  const status = slotFitStatus(slot, jobMinutes);
  const fits = status === "available";
  const disabled = !fits;
  const isSelected = selected && fits;
  
  const reason = status === "full" ? "Full" : "Not enough time left for this service";

  const fullDateStr = new Date(day.date).toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  });

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      data-testid={`mobile-slot-${slot.id}`}
      aria-pressed={isSelected}
      className={`relative flex w-full flex-col items-start rounded-2xl border-2 p-5 text-left transition ${
        disabled
          ? "cursor-not-allowed border-slate-100 bg-slate-50 opacity-60"
          : isSelected
            ? "bg-white shadow-sm"
            : "border-slate-200 bg-white hover:border-slate-300"
      }`}
      style={
        isSelected
          ? { borderColor: SELECTED_GREEN }
          : undefined
      }
    >
      {isSelected && (
        <div className="absolute right-4 top-4">
          <CheckCircle2 className="h-6 w-6" style={{ color: SELECTED_GREEN }} />
        </div>
      )}
      <div className={`mb-1 text-sm font-semibold uppercase tracking-wide ${isSelected ? "text-slate-900" : "text-slate-500"}`}>
        {fullDateStr}
      </div>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`h-5 w-5 ${isSelected ? "text-slate-900" : "text-slate-600"}`} />
        <span className={`text-xl font-bold ${isSelected ? "text-slate-900" : "text-slate-800"}`}>
          {label}
        </span>
      </div>
      <div className={`text-sm ${isSelected ? "text-slate-700 font-medium" : "text-slate-500"}`}>
        {hint}
      </div>
      {disabled && (
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-slate-200 px-2 py-1 text-xs font-semibold text-slate-600">
          {reason}
        </div>
      )}
    </button>
  );
}

function CompactSlotCard({
  slot,
  jobMinutes,
  icon,
  label,
  selected,
  onClick,
}: {
  slot: Slot;
  jobMinutes: number;
  icon: React.ReactNode;
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  const status = slotFitStatus(slot, jobMinutes);
  const fits = status === "available";
  const disabled = !fits;
  const isSelected = selected && fits;

  const reason = status === "full" ? "Full" : "Not enough time left for this service";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      data-testid={`mobile-slot-${slot.id}`}
      aria-pressed={isSelected}
      className={`relative flex w-full items-center justify-between rounded-xl border p-3 text-left transition ${
        disabled
          ? "cursor-not-allowed border-transparent bg-slate-50 text-slate-400"
          : isSelected
            ? "shadow-sm"
            : "border-slate-200 bg-white hover:bg-slate-50"
      }`}
      style={
        isSelected
          ? { borderColor: SELECTED_GREEN, backgroundColor: "#F2FBF7" }
          : undefined
      }
    >
      <div className="flex items-center gap-3">
        <div className={disabled ? "text-slate-400" : isSelected ? "text-slate-800" : "text-slate-500"}>
          {icon}
        </div>
        <div className="flex flex-col">
          <span className={`text-[15px] font-medium ${disabled ? "text-slate-400" : isSelected ? "text-slate-900 font-bold" : "text-slate-700"}`}>
            {label}
          </span>
          {disabled && (
            <span className="text-xs font-medium text-slate-400">{reason}</span>
          )}
        </div>
      </div>
      {isSelected && (
        <CheckCircle2 className="h-5 w-5 shrink-0" style={{ color: SELECTED_GREEN }} />
      )}
    </button>
  );
}
