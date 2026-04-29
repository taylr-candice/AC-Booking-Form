import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Sunrise,
  Sun,
  Pencil,
  CheckCircle2,
  Info,
  AlertTriangle,
  Lock,
  Settings,
  Key,
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

const MORNING_WINDOW_MINUTES = 240;
const AFTERNOON_WINDOW_MINUTES = 300;

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

export function SlotsAffordanceForward() {
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

  // Handle scroll for sticky header compression
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const mainEl = document.getElementById("scroll-container");
    if (!mainEl) return;
    const onScroll = () => {
      setScrolled(mainEl.scrollTop > 20);
    };
    mainEl.addEventListener("scroll", onScroll);
    return () => mainEl.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="flex h-[844px] w-[390px] flex-col overflow-hidden bg-slate-50 font-['Inter'] shadow-2xl ring-1 ring-slate-200 mx-auto relative">
      
      {/* Sticky Header */}
      <div 
        className={`flex items-center justify-between px-5 pt-12 pb-4 transition-all duration-200 z-20 ${
          scrolled ? "bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm py-3 pt-10" : "bg-transparent pt-12"
        }`}
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Back"
            className="grid h-11 w-11 place-items-center rounded-full bg-white border border-slate-200 shadow-sm transition hover:bg-slate-50 active:scale-95 text-slate-700"
            data-testid="button-back-mobile"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className={`transition-all duration-200 ${scrolled ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-4 pointer-events-none"}`}>
            <h1 className="text-lg font-bold text-slate-900">Schedule</h1>
          </div>
        </div>
      </div>

      {/* Scrollable Body */}
      <div id="scroll-container" className="flex-1 overflow-y-auto px-5 pb-8 relative z-10 -mt-14 pt-14">
        
        <div className={`transition-all duration-200 mb-6 ${scrolled ? "opacity-0 scale-95 h-0 overflow-hidden mb-0" : "opacity-100"}`}>
          <h1 className="text-[32px] font-extrabold leading-tight text-slate-900 tracking-tight">
            Schedule
          </h1>
          <div className="mt-1 text-sm font-medium text-slate-500">Pick a service slot</div>
        </div>

        {/* Access Banner */}
        <div
          className="mb-5 rounded-2xl border-2 px-4 py-4 shadow-sm"
          style={{ borderColor: "#FBCFE2", backgroundColor: "#FFF1F8", color: "#9D174D" }}
          data-testid="banner-access-commitment-mobile"
          data-access-mode={accessMode}
        >
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-pink-100 p-1.5 mt-0.5 shrink-0">
              <Info className="h-5 w-5" />
            </div>
            <div className="text-[13px] leading-relaxed">
              {unattended ? (
                <div>
                  <span className="font-bold text-pink-900">You're authorising us</span>{" "}
                  to access the unit during the window you pick to carry out
                  the service — no one needs to be there.
                </div>
              ) : selfAttended ? (
                <div>
                  <span className="font-bold text-pink-900">Heads up:</span> we can't
                  guarantee an exact arrival or finish time within the window
                  you pick, so please make sure{" "}
                  <span className="font-bold text-pink-900">you are</span> available for
                  the <span className="font-bold text-pink-900">entire window</span>.
                </div>
              ) : (
                <div>
                  The service will be carried out{" "}
                  <span className="font-bold text-pink-900">sometime within the window</span>{" "}
                  you pick — there's no set arrival time.
                </div>
              )}
            </div>
          </div>
          
          <div className="mt-4 flex flex-col gap-2">
            {showChangeAccess && (
              <button
                type="button"
                data-testid="button-change-access"
                className="flex items-center justify-center gap-2 w-full rounded-xl bg-white border border-pink-200 py-3 px-4 text-sm font-bold shadow-sm active:scale-[0.98] transition-transform"
                style={{ color: "#9D174D" }}
              >
                <Key className="h-4 w-4 opacity-70" />
                Change access method
              </button>
            )}
            <button
              type="button"
              data-testid="button-edit-ac"
              className="flex items-center justify-center gap-2 w-full rounded-xl bg-white border border-pink-200 py-3 px-4 text-sm font-bold shadow-sm active:scale-[0.98] transition-transform"
              style={{ color: "#9D174D" }}
            >
              <Settings className="h-4 w-4 opacity-70" />
              Update AC info
            </button>
          </div>
        </div>

        {/* Unsure Callout */}
        {isUnsure && (
          <div
            className="mb-6 rounded-2xl border-2 px-4 py-4 shadow-sm"
            style={{ borderColor: "#FCD34D", backgroundColor: "#FFFBEB", color: "#92400E" }}
            data-testid="callout-unsure-mobile"
          >
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-amber-100 p-1.5 mt-0.5 shrink-0">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              <div className="text-[13px] leading-relaxed">
                You picked <span className="font-bold text-amber-900">"Not sure"</span> on the AC step,
                so we've sized your slot for one indoor unit. If we find more on-site,
                the technician may not finish in one visit and Taylr will book a
                second slot — which means{" "}
                <span className="font-bold text-amber-900" data-testid="nudge-accountability-mobile">
                  {accountabilityNudge}
                </span>.{" "}
                <span className="font-bold text-amber-900">If you can confirm the AC details now,
                you'll likely avoid that.</span>
              </div>
            </div>
            <div className="mt-4">
              <button
                type="button"
                data-testid="button-edit-ac"
                className="flex w-full items-center justify-center gap-2 rounded-xl py-3 px-4 text-sm font-bold text-white shadow-sm active:scale-[0.98] transition-transform"
                style={{ backgroundColor: "#B45309" }}
              >
                <Settings className="h-4 w-4 opacity-80" />
                Update AC info
              </button>
            </div>
          </div>
        )}

        <div className="mb-3 mt-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">
            Available Slots
          </h2>
        </div>

        <div className="space-y-4">
          {visibleDays.map((d) => (
            <DayBlock
              key={d.date}
              day={d}
              jobMinutes={jobMinutes}
              selected={selected}
              onSelect={(id) => setSelected(id)}
            />
          ))}
        </div>

        <div className="mt-8 mb-4 rounded-2xl border border-slate-200 bg-white p-4 text-center text-sm font-medium text-slate-600 shadow-sm">
          Need a different date? <br/>
          Call us on <span className="font-bold" style={{ color: BRAND }}>1300 TAYLR</span>
        </div>
      </div>

      {/* Docked CTA */}
      <div className="border-t border-slate-200 bg-white px-5 py-4 shadow-[0_-8px_30px_rgba(0,0,0,0.04)] relative z-20 pb-8">
        <div className="h-6 flex items-end justify-center mb-1">
          <span className={`text-xs font-bold text-slate-500 transition-all duration-300 ${selected ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`}>
            Tap Continue to confirm
          </span>
        </div>
        <button
          type="button"
          disabled={!selected}
          data-testid="button-continue-mobile"
          className={`flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-4 text-[17px] font-bold text-white shadow-md transition-all duration-300 disabled:opacity-40 disabled:shadow-none active:scale-[0.98] ${
            selected ? "hover:opacity-95" : ""
          }`}
          style={selected ? { backgroundColor: BRAND, boxShadow: `0 8px 20px -8px ${BRAND}` } : { backgroundColor: "#CBD5E1" }}
        >
          Continue
          <ArrowRight className="h-5 w-5" />
        </button>
      </div>

      {/* Add subtle pulse animation for the CTA when enabled */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes subtle-pulse {
          0% { box-shadow: 0 0 0 0 rgba(237, 1, 127, 0.4); }
          70% { box-shadow: 0 0 0 10px rgba(237, 1, 127, 0); }
          100% { box-shadow: 0 0 0 0 rgba(237, 1, 127, 0); }
        }
      `}} />
    </div>
  );
}

function DayBlock({
  day, jobMinutes, selected, onSelect,
}: { day: Day; jobMinutes: number; selected: string | null; onSelect: (id: string) => void }) {
  return (
    <div className="flex gap-3 relative">
      {/* Date Column */}
      <div className="flex w-[68px] shrink-0 flex-col items-center justify-start pt-1 pb-4">
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">{day.weekday}</div>
        <div className="text-[28px] font-black leading-none text-slate-900 tracking-tight">{day.day}</div>
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mt-1">{day.month}</div>
      </div>

      {/* Slots Column */}
      <div className="flex flex-1 flex-col gap-3">
        <SlotCard
          slot={day.morning}
          jobMinutes={jobMinutes}
          icon={<Sunrise className="h-6 w-6" />}
          label="Morning"
          hint="8am – 12pm"
          selected={selected === day.morning.id}
          onClick={() => onSelect(day.morning.id)}
        />
        <SlotCard
          slot={day.afternoon}
          jobMinutes={jobMinutes}
          icon={<Sun className="h-6 w-6" />}
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
      className={`relative w-full rounded-2xl text-left transition-all duration-200 outline-none select-none min-h-[88px] flex flex-col justify-center
        ${disabled
          ? "bg-slate-100/50 cursor-not-allowed"
          : isSelected
            ? "shadow-lg scale-[1.02] ring-[3px]"
            : "bg-white border-2 border-slate-200 hover:border-slate-300 hover:shadow-md active:scale-[0.98] shadow-sm"
        }
      `}
      style={{
        ...(isSelected ? {
          backgroundColor: SELECTED_GREEN,
          borderColor: SELECTED_GREEN,
          ringColor: SELECTED_GREEN,
          boxShadow: `0 10px 25px -5px ${SELECTED_GREEN}60, 0 4px 10px -5px ${SELECTED_GREEN}60`
        } : {}),
        // Add diagonal stripe pattern for disabled slots
        ...(disabled ? {
          backgroundImage: 'repeating-linear-gradient(45deg, #f8fafc, #f8fafc 10px, #f1f5f9 10px, #f1f5f9 20px)',
          borderColor: '#e2e8f0',
          borderWidth: '2px'
        } : {})
      }}
    >
      <div className="flex w-full items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <div className={`flex items-center justify-center p-2 rounded-xl transition-colors ${
            disabled ? "bg-white text-slate-300 shadow-sm" : 
            isSelected ? "bg-white/20 text-white" : 
            "bg-slate-50 border border-slate-100 text-slate-700 shadow-sm"
          }`}>
            {icon}
          </div>
          <div>
            <div className={`text-[17px] font-bold leading-tight ${
              disabled ? "text-slate-400" : isSelected ? "text-white" : "text-slate-900"
            }`}>
              {label}
            </div>
            <div className={`text-[12px] font-medium mt-0.5 ${
              disabled ? "text-slate-400" : isSelected ? "text-white/90" : "text-slate-500"
            }`}>
              {hint}
            </div>
          </div>
        </div>

        <div className="shrink-0 ml-2">
          {isSelected ? (
            <div className="bg-white rounded-full p-1 shadow-sm">
              <CheckCircle2 className="h-6 w-6" style={{ color: SELECTED_GREEN }} />
            </div>
          ) : disabled ? (
            <div className="bg-white/80 p-2 rounded-full shadow-sm border border-slate-200">
              <Lock className="h-4 w-4 text-slate-400" />
            </div>
          ) : (
            <div className="h-8 w-8 rounded-full border-2 border-slate-200" />
          )}
        </div>
      </div>
      
      {/* Explicit disabled reason pill */}
      {disabled && (
        <div className="px-4 pb-3 pt-0">
          <div className="inline-flex items-center bg-white border border-slate-200 rounded-full px-3 py-1 shadow-sm">
            <span className="text-[11px] font-bold text-slate-500">{reason}</span>
          </div>
        </div>
      )}
    </button>
  );
}
