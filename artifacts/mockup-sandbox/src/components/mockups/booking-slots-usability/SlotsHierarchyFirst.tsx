import { useMemo } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Sunrise,
  Sun,
  Moon,
  CheckCircle2,
  Info,
  AlertTriangle,
  Lock,
} from "lucide-react";

import { getBookingDurationMinutes } from "../../../state/bookingDerived";
import { useBookingSession } from "../../../state/bookingSession";
import {
  isBeThereMethod,
  isUnattendedAccessMethod,
} from "../../../state/accessMethodCatalog";
import {
  dayWindows,
  type CustomerDay,
  type CustomerSlot,
} from "../booking-slots/customerSlotData";
import { useCustomerSlotPicker } from "../booking-slots/useCustomerSlotPicker";

const BRAND = "#ED017F";
const SELECTED_GREEN = "#5FBB97";

type Slot = CustomerSlot;
type Day = CustomerDay;

const WINDOW_LONG_LABEL: Record<Slot["window"], string> = {
  morning: "Morning window",
  afternoon: "Afternoon window",
  evening: "Evening window",
};

/** "Morning (8am – 12:30pm)" — built per-slot now that times come
 *  from the rollout. Each slot has a `timeLabel` already resolved by
 *  {@link resolveCustomerSlotData}. */
const WINDOW_SHORT_NAME: Record<Slot["window"], string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
};
function compactWindowLabel(slot: Slot): string {
  return `${WINDOW_SHORT_NAME[slot.window]} (${slot.timeLabel})`;
}

function windowIcon(window: Slot["window"], className: string) {
  if (window === "morning") return <Sunrise className={className} />;
  if (window === "evening") return <Moon className={className} />;
  return <Sun className={className} />;
}

export function SlotsHierarchyFirst() {
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

  // Shared customer slot-picker wiring (Task #214): rollout
  // resolution, live-bookings subscription, past-date filtering, and
  // the selected-slot invalidation effect all live in one place so
  // every variant stays in sync.
  const { rollout, visibleDays, lockedByOther, selected, setSelected } =
    useCustomerSlotPicker(session.unit_id, jobMinutes);

  // Flat list of every visible {day, slot} pair so we can find the
  // earliest available slot (morning before afternoon before evening,
  // earliest day first) and feature it as the hero card.
  const flatSlots = useMemo(() => {
    const slots: { day: Day; slot: Slot }[] = [];
    for (const d of visibleDays) {
      for (const slot of dayWindows(d)) {
        slots.push({ day: d, slot });
      }
    }
    return slots;
  }, [visibleDays]);

  const heroSlotObj = useMemo(
    () => flatSlots.find((s) => s.slot.status === "available") ?? null,
    [flatSlots],
  );

  // Exclude the hero slot from the remaining list if we have one.
  // Keeps the same shape the JSX below expects so adding evening
  // windows in mid-cohort doesn't ripple through every render path.
  const remainingDays = useMemo<
    Array<{
      day: Day;
      morning: Slot | null;
      afternoon: Slot | null;
      evening: Slot | null;
    }>
  >(() => {
    const heroId = heroSlotObj?.slot.id ?? null;
    const out: Array<{
      day: Day;
      morning: Slot | null;
      afternoon: Slot | null;
      evening: Slot | null;
    }> = [];
    for (const d of visibleDays) {
      const morning = d.morning.id === heroId ? null : d.morning;
      const afternoon = d.afternoon.id === heroId ? null : d.afternoon;
      const evening = d.evening
        ? d.evening.id === heroId
          ? null
          : d.evening
        : null;
      if (morning || afternoon || evening) {
        out.push({ day: d, morning, afternoon, evening });
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

        {!rollout ? (
          <div
            className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-relaxed text-amber-900"
            data-testid="empty-no-rollout-mobile"
          >
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div>
                <div className="font-bold text-base text-amber-900">
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
            className="mb-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-relaxed text-slate-700"
            data-testid="banner-locked-by-other-mobile"
            data-locked-kind={lockedByOther.kind}
          >
            <div className="flex items-start gap-2.5">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
              <div className="flex-1">
                <div className="font-bold text-base text-slate-900">
                  Already scheduled for this address
                </div>
                <div className="mt-1.5">
                  There's already a confirmed service booked at this property,
                  so it can't be booked again right now. Only one confirmed
                  booking is allowed per service run.
                </div>
                <div className="mt-2">
                  If you have any questions or believe this is a mistake,
                  contact Taylr at{" "}
                  <a
                    href="mailto:support@taylr.com.au"
                    className="font-semibold underline underline-offset-2"
                    style={{ color: BRAND }}
                    data-testid="link-locked-support-email-mobile"
                  >
                    support@taylr.com.au
                  </a>{" "}
                  or call{" "}
                  <span className="font-semibold" style={{ color: BRAND }}>
                    1300 TAYLR
                  </span>
                  .
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Hero: Next Available */}
            {heroSlotObj && (
              <div className="mb-8">
                <div className="mb-4 flex items-center gap-2">
                  <h2 className="text-lg font-bold text-slate-900">Next available</h2>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white"
                    style={{ backgroundColor: BRAND }}
                  >
                    Earliest
                  </span>
                </div>
                <HeroSlotCard
                  day={heroSlotObj.day}
                  slot={heroSlotObj.slot}
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
                  {remainingDays.map(({ day, morning, afternoon, evening }) => (
                    <div key={day.date} className="flex flex-col gap-2">
                      <div className="text-sm font-bold text-slate-800">
                        {day.weekday}, {day.month} {day.day}
                      </div>
                      <div className="flex flex-col gap-2">
                        {morning && (
                          <CompactSlotCard
                            slot={morning}
                            icon={windowIcon("morning", "h-4 w-4")}
                            label={compactWindowLabel(morning)}
                            selected={selected === morning.id}
                            onClick={() => setSelected(morning.id)}
                          />
                        )}
                        {afternoon && (
                          <CompactSlotCard
                            slot={afternoon}
                            icon={windowIcon("afternoon", "h-4 w-4")}
                            label={compactWindowLabel(afternoon)}
                            selected={selected === afternoon.id}
                            onClick={() => setSelected(afternoon.id)}
                          />
                        )}
                        {evening && (
                          <CompactSlotCard
                            slot={evening}
                            icon={windowIcon("evening", "h-4 w-4")}
                            label={compactWindowLabel(evening)}
                            selected={selected === evening.id}
                            onClick={() => setSelected(evening.id)}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <div className="mt-8 border-t border-slate-100 pt-6 text-center text-sm text-slate-500">
          Need a different date?<br />Call us on <span className="font-semibold" style={{ color: BRAND }}>1300 TAYLR</span>.
        </div>
      </div>

      <div className="border-t border-slate-100 bg-white px-5 py-4">
        <button
          type="button"
          disabled={!selected || !!lockedByOther}
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
  selected,
  onClick,
}: {
  day: Day;
  slot: Slot;
  selected: boolean;
  onClick: () => void;
}) {
  const label = WINDOW_LONG_LABEL[slot.window];
  const hint = slot.timeLabel;

  const fits = slot.status === "available";
  const disabled = !fits;
  const isSelected = selected && fits;
  
  const reason =
    slot.status === "full"
      ? "Full"
      : slot.status === "not_yet_open"
        ? "Not yet open for booking"
        : "Not enough time left for this service";

  const fullDateStr = new Date(day.date).toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  });

  // When the hero slot is bookable but not yet selected, give it a soft
  // brand accent so it reads as the recommended/highlighted slot rather
  // than a generic card.
  const showHeroAccent = !disabled && !isSelected;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      data-testid={`mobile-slot-${slot.id}`}
      data-next-available={showHeroAccent ? "true" : undefined}
      data-slot-status={slot.status}
      aria-pressed={isSelected}
      className={`relative flex w-full flex-col items-start rounded-2xl border-2 p-5 text-left transition ${
        disabled
          ? "cursor-not-allowed border-slate-100 bg-slate-50 opacity-60"
          : isSelected
            ? "bg-white shadow-sm"
            : showHeroAccent
              ? "shadow-sm hover:shadow-md"
              : "border-slate-200 bg-white hover:border-slate-300"
      }`}
      style={
        isSelected
          ? { borderColor: SELECTED_GREEN }
          : showHeroAccent
            ? { borderColor: "#F9A8D4", backgroundColor: "#FFF1F8" }
            : undefined
      }
    >
      {isSelected && (
        <div className="absolute right-4 top-4">
          <CheckCircle2 className="h-6 w-6" style={{ color: SELECTED_GREEN }} />
        </div>
      )}
      <div
        className={`mb-1 text-sm font-semibold uppercase tracking-wide ${
          isSelected
            ? "text-slate-900"
            : showHeroAccent
              ? "text-pink-700"
              : "text-slate-500"
        }`}
      >
        {fullDateStr}
      </div>
      <div className="flex items-center gap-2 mb-2">
        {windowIcon(
          slot.window,
          `h-5 w-5 ${
            isSelected
              ? "text-slate-900"
              : showHeroAccent
                ? "text-pink-700"
                : "text-slate-600"
          }`,
        )}
        <span
          className={`text-xl font-bold ${
            isSelected
              ? "text-slate-900"
              : showHeroAccent
                ? "text-pink-900"
                : "text-slate-800"
          }`}
        >
          {label}
        </span>
      </div>
      <div
        className={`text-sm ${
          isSelected
            ? "text-slate-700 font-medium"
            : showHeroAccent
              ? "text-pink-700/80"
              : "text-slate-500"
        }`}
      >
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
  icon,
  label,
  selected,
  onClick,
}: {
  slot: Slot;
  icon: React.ReactNode;
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  const fits = slot.status === "available";
  const disabled = !fits;
  const isSelected = selected && fits;

  const reason =
    slot.status === "full"
      ? "Full"
      : slot.status === "not_yet_open"
        ? "Not yet open for booking"
        : "Not enough time left for this service";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      data-testid={`mobile-slot-${slot.id}`}
      aria-pressed={isSelected}
      data-slot-status={slot.status}
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
