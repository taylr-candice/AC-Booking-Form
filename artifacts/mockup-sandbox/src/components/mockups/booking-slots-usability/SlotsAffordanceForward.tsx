import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Sunrise,
  Sun,
  Moon,
  Pencil,
  CheckCircle2,
  Info,
  AlertTriangle,
  Lock,
  Settings,
  Key,
} from "lucide-react";

import { getBookingDurationMinutes } from "../../../state/bookingDerived";
import { isPastDate } from "../../../state/bookingHelpers";
import { useBookingSession } from "../../../state/bookingSession";
import {
  isBeThereMethod,
  isUnattendedAccessMethod,
} from "../../../state/accessMethodCatalog";
import {
  getLiveBookingsVersion,
  subscribeLiveBookings,
} from "../../../state/adminMockData";
import {
  alreadyScheduledByOther,
  resolveCustomerSlotData,
  type CustomerDay,
  type CustomerSlot,
  WINDOW_TIME_RANGE,
} from "../booking-slots/customerSlotData";

const BRAND = "#ED017F";
const SELECTED_GREEN = "#5FBB97";

type Slot = CustomerSlot;
type Day = CustomerDay;

function dayWindows(day: Day): Slot[] {
  const out: Slot[] = [day.morning, day.afternoon];
  if (day.evening) out.push(day.evening);
  return out;
}

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

  // Resolve the per-(service, building) rollout (Task #59) and pull
  // its day rows, matching how `SlotsMobile` is wired. Past dates are
  // filtered out so customers never see rows that have rolled by.
  const slotData = useMemo(
    () => resolveCustomerSlotData(session.unit_id, jobMinutes),
    [session.unit_id, jobMinutes],
  );
  const rollout = slotData.rollout;
  const liveBookingsVersion = useSyncExternalStore(
    subscribeLiveBookings,
    getLiveBookingsVersion,
    getLiveBookingsVersion,
  );
  const lockedByOther = useMemo(
    () => {
      void liveBookingsVersion;
      return alreadyScheduledByOther(session.unit_id);
    },
    [session.unit_id, liveBookingsVersion],
  );
  const visibleDays = useMemo(
    () => slotData.days.filter((d) => !isPastDate(d.date)),
    [slotData.days],
  );

  // Earliest bookable slot across the visible days — first day with at
  // least one `available` window, picking morning before afternoon
  // before evening. Purely visual: doesn't pre-select, doesn't change
  // Continue logic.
  const nextAvailableSlotId = useMemo<string | null>(() => {
    for (const d of visibleDays) {
      for (const slot of dayWindows(d)) {
        if (slot.status === "available") return slot.id;
      }
    }
    return null;
  }, [visibleDays]);

  // If the customer's job size grows or the rollout shifts, an
  // already-selected slot might no longer fit. Drop it so Continue
  // can't carry stale, now-invalid state forward.
  useEffect(() => {
    if (!selected) return;
    const stillValid = visibleDays
      .flatMap(dayWindows)
      .some((s) => s.id === selected && s.status === "available");
    if (!stillValid) setSelected(null);
  }, [selected, visibleDays]);

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

        {!rollout ? (
          <div
            className="rounded-2xl border-2 px-4 py-4 shadow-sm"
            style={{ borderColor: "#FCD34D", backgroundColor: "#FFFBEB", color: "#92400E" }}
            data-testid="empty-no-rollout-mobile"
          >
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-amber-100 p-1.5 mt-0.5 shrink-0">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              <div className="text-[13px] leading-relaxed">
                <div className="font-bold text-amber-900">
                  AC services aren't open for booking at this address yet.
                </div>
                <div className="mt-1.5">
                  We're rolling this out building by building. Call{" "}
                  <span className="font-bold" style={{ color: BRAND }}>
                    1300 TAYLR
                  </span>{" "}
                  and we'll add you to the waitlist.
                </div>
              </div>
            </div>
          </div>
        ) : lockedByOther ? (
          <div
            className="rounded-2xl border-2 border-slate-200 bg-white px-4 py-4 shadow-sm"
            data-testid="banner-locked-by-other-mobile"
            data-locked-kind={lockedByOther.kind}
          >
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-slate-100 p-1.5 mt-0.5 shrink-0">
                <Lock className="h-5 w-5 text-slate-500" />
              </div>
              <div className="flex-1 text-[13px] leading-relaxed text-slate-700">
                <div className="font-bold text-slate-900">
                  Already scheduled for this address
                </div>
                <div className="mt-1.5">
                  There's already a confirmed service booked at this
                  property, so it can't be booked again right now. Only
                  one confirmed booking is allowed per service run.
                </div>
                <div className="mt-2">
                  If you have any questions or believe this is a mistake,
                  contact Taylr at{" "}
                  <a
                    href="mailto:support@taylr.com.au"
                    className="font-bold underline"
                    style={{ color: BRAND }}
                    data-testid="link-locked-support-email-mobile"
                  >
                    support@taylr.com.au
                  </a>{" "}
                  or call{" "}
                  <span className="font-bold" style={{ color: BRAND }}>
                    1300 TAYLR
                  </span>
                  .
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {visibleDays.map((d) => (
              <DayBlock
                key={d.date}
                day={d}
                selected={selected}
                onSelect={(id) => setSelected(id)}
                nextAvailableSlotId={nextAvailableSlotId}
              />
            ))}
          </div>
        )}

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
          disabled={!selected || !!lockedByOther}
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
  day, selected, onSelect, nextAvailableSlotId,
}: {
  day: Day;
  selected: string | null;
  onSelect: (id: string) => void;
  nextAvailableSlotId: string | null;
}) {
  const hasEvening = !!day.evening;
  return (
    <div className="flex items-stretch gap-2 relative">
      {/* Compact date pill */}
      <div className="flex w-[44px] shrink-0 flex-col items-center justify-center rounded-xl border border-slate-200 bg-white py-1.5 shadow-sm">
        <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400 leading-none">{day.weekday}</div>
        <div className="mt-0.5 text-[20px] font-black leading-none text-slate-900 tracking-tight">{day.day}</div>
        <div className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-400 leading-none">{day.month}</div>
      </div>

      {/* Window grid — 2 columns by default, 3 when an evening
          window is opened so all three windows fit on one row. */}
      <div className={`grid flex-1 gap-2 ${hasEvening ? "grid-cols-3" : "grid-cols-2"}`}>
        <SlotCard
          slot={day.morning}
          icon={<Sunrise className="h-4 w-4" />}
          label="Morning"
          hint={WINDOW_TIME_RANGE.morning}
          selected={selected === day.morning.id}
          onClick={() => onSelect(day.morning.id)}
          isNextAvailable={day.morning.id === nextAvailableSlotId}
          compact={hasEvening}
        />
        <SlotCard
          slot={day.afternoon}
          icon={<Sun className="h-4 w-4" />}
          label="Afternoon"
          hint={WINDOW_TIME_RANGE.afternoon}
          selected={selected === day.afternoon.id}
          onClick={() => onSelect(day.afternoon.id)}
          isNextAvailable={day.afternoon.id === nextAvailableSlotId}
          compact={hasEvening}
        />
        {day.evening && (
          <SlotCard
            slot={day.evening}
            icon={<Moon className="h-4 w-4" />}
            label="Evening"
            hint={WINDOW_TIME_RANGE.evening}
            selected={selected === day.evening.id}
            onClick={() => onSelect(day.evening!.id)}
            isNextAvailable={day.evening.id === nextAvailableSlotId}
            compact={hasEvening}
          />
        )}
      </div>
    </div>
  );
}

function SlotCard({
  slot, icon, label, hint, selected, onClick, isNextAvailable, compact,
}: {
  slot: Slot;
  icon: React.ReactNode;
  label: string;
  hint: string;
  selected: boolean;
  onClick: () => void;
  isNextAvailable: boolean;
  compact: boolean;
}) {
  const fits = slot.status === "available";
  const disabled = !fits;
  const isSelected = selected && fits;
  // Visual accent only — once the customer picks any slot the
  // selected-green state should win, so we hide the badge while this
  // tile is the chosen one.
  const showNextBadge = isNextAvailable && !disabled && !isSelected;

  const reason =
    slot.status === "full"
      ? "Full"
      : slot.status === "not_yet_open"
        ? "Not yet open"
        : "Not enough time";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      data-testid={`mobile-slot-${slot.id}`}
      aria-pressed={isSelected}
      data-next-available={showNextBadge ? "true" : undefined}
      data-slot-status={slot.status}
      className={`relative w-full rounded-xl text-left transition-all duration-150 outline-none select-none flex flex-col justify-center ${compact ? "px-2 py-2" : "px-2.5 py-2"} min-h-[64px]
        ${disabled
          ? "cursor-not-allowed border-2 border-slate-200"
          : isSelected
            ? "shadow-md scale-[1.02] border-2"
            : showNextBadge
              ? "border-2 shadow-sm hover:shadow-md active:scale-[0.98]"
              : "bg-white border-2 border-slate-200 hover:border-slate-300 hover:shadow-sm active:scale-[0.98] shadow-sm"
        }
      `}
      style={{
        ...(isSelected ? {
          backgroundColor: SELECTED_GREEN,
          borderColor: SELECTED_GREEN,
          boxShadow: `0 6px 16px -6px ${SELECTED_GREEN}80`,
        } : {}),
        ...(showNextBadge ? {
          backgroundColor: "#FFF1F8",
          borderColor: "#F9A8D4",
        } : {}),
        ...(disabled ? {
          backgroundImage: 'repeating-linear-gradient(45deg, #f8fafc, #f8fafc 10px, #f1f5f9 10px, #f1f5f9 20px)',
          borderColor: '#e2e8f0',
        } : {}),
      }}
    >
      {showNextBadge && (
        <div
          className="absolute -top-2 left-2 rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-white shadow-sm"
          style={{ backgroundColor: BRAND }}
          data-testid={`next-available-badge-${slot.id}`}
        >
          Next available
        </div>
      )}

      <div className="flex w-full items-center justify-between gap-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <div className={`shrink-0 ${
            disabled ? "text-slate-300" :
            isSelected ? "text-white" :
            showNextBadge ? "text-pink-600" :
            "text-slate-700"
          }`}>
            {icon}
          </div>
          <div className="min-w-0">
            <div className={`${compact ? "text-[12px]" : "text-[13px]"} font-bold leading-tight ${
              disabled ? "text-slate-400" : isSelected ? "text-white" : showNextBadge ? "text-pink-900" : "text-slate-900"
            }`}>
              {label}
            </div>
            <div className={`mt-0.5 ${compact ? "text-[9px]" : "text-[10px]"} font-medium leading-tight ${
              disabled ? "text-slate-400" : isSelected ? "text-white/90" : showNextBadge ? "text-pink-700/80" : "text-slate-500"
            }`}>
              {hint}
            </div>
          </div>
        </div>

        <div className="shrink-0">
          {isSelected ? (
            <CheckCircle2 className="h-4 w-4 text-white" />
          ) : disabled ? (
            <Lock className="h-3.5 w-3.5 text-slate-400" />
          ) : null}
        </div>
      </div>

      {/* Disabled reason pill */}
      {disabled && (
        <div className="mt-1.5">
          <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-500 shadow-sm">
            {reason}
          </span>
        </div>
      )}
    </button>
  );
}
