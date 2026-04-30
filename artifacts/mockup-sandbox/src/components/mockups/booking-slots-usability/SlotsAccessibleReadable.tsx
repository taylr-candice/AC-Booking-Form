import { useMemo } from "react";
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
  XCircle,
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
  WINDOW_TIME_RANGE,
} from "../booking-slots/customerSlotData";
import { useCustomerSlotPicker } from "../booking-slots/useCustomerSlotPicker";

const BRAND = "#ED017F";
const BRAND_DARK = "#B8005F"; // Darkened for AAA contrast against white
const SELECTED_GREEN = "#5FBB97";

type Slot = CustomerSlot;
type Day = CustomerDay;

const FULL_DAYS: Record<string, string> = {
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
  Sat: "Saturday",
  Sun: "Sunday",
};

const FULL_MONTHS: Record<string, string> = {
  Jan: "January",
  Feb: "February",
  Mar: "March",
  Apr: "April",
  May: "May",
  Jun: "June",
  Jul: "July",
  Aug: "August",
  Sep: "September",
  Oct: "October",
  Nov: "November",
  Dec: "December",
};

const WINDOW_LABEL: Record<Slot["window"], string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
};

export function SlotsAccessibleReadable() {
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

  // Earliest bookable slot in view (morning before afternoon before
  // evening). Visual hint only — does not pre-select or change
  // Continue logic.
  const nextAvailableSlotId = useMemo<string | null>(() => {
    for (const d of visibleDays) {
      for (const slot of dayWindows(d)) {
        if (slot.status === "available") {
          return slot.id;
        }
      }
    }
    return null;
  }, [visibleDays]);

  return (
    <div className="flex h-[844px] w-[390px] flex-col overflow-hidden bg-white font-['Inter'] mx-auto border shadow-xl">
      {/* Header */}
      <div className="flex items-start justify-between px-6 pb-6 pt-8">
        <div>
          <h1 className="text-[32px] font-bold leading-tight text-slate-900">
            Schedule
          </h1>
          <div className="mt-2 text-[16px] text-slate-700">Pick a service slot</div>
        </div>
        <button
          type="button"
          aria-label="Back"
          className="flex h-12 w-12 items-center justify-center rounded-full border-2 transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-900 hover:bg-slate-50"
          style={{ borderColor: BRAND, color: BRAND_DARK }}
          data-testid="button-back-mobile"
        >
          <ArrowLeft className="h-6 w-6" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 pb-8">
        <div className="mb-4 mt-2 flex items-center justify-between">
          <h2 className="text-[20px] font-bold text-slate-900">
            Available Slots
          </h2>
          <button 
            type="button" 
            aria-label="Edit" 
            className="flex items-center gap-2 rounded-lg border-2 border-transparent px-3 py-2 text-[16px] font-bold text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-900"
          >
            <Pencil className="h-5 w-5" />
            <span className="sr-only">Edit</span>
          </button>
        </div>

        {/* Access-window commitment */}
        <div
          role="region"
          aria-label="Important: access commitment"
          className="mb-8 rounded-xl border-[3px] p-5 text-[16px] leading-relaxed shadow-sm bg-white text-slate-900"
          style={{ borderColor: BRAND }}
          data-testid="banner-access-commitment-mobile"
          data-access-mode={accessMode}
        >
          <div className="flex items-start gap-4">
            <Info className="mt-0.5 h-6 w-6 shrink-0" style={{ color: BRAND_DARK }} aria-hidden="true" />
            <div>
              {unattended ? (
                <div>
                  <span className="font-bold">You're authorising us</span>{" "}
                  to access the unit during the window you pick to carry out
                  the service — no one needs to be there.
                </div>
              ) : selfAttended ? (
                <div>
                  <span className="font-bold">Heads up:</span> we can't
                  guarantee an exact arrival or finish time within the window
                  you pick, so please make sure{" "}
                  <span className="font-bold">you are</span> available for
                  the <span className="font-bold">entire window</span>.
                </div>
              ) : (
                <div>
                  The service will be carried out{" "}
                  <span className="font-bold">sometime within the window</span>{" "}
                  you pick — there's no set arrival time.
                </div>
              )}
            </div>
          </div>
          <div className="mt-5 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-end">
            {showChangeAccess && (
              <button
                type="button"
                data-testid="button-change-access"
                className="rounded-lg px-4 py-3 text-[16px] font-bold underline underline-offset-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-900 hover:bg-slate-50 w-full sm:w-auto text-center border-2 border-transparent"
                style={{ color: BRAND_DARK }}
              >
                Change access method
              </button>
            )}
            <button
              type="button"
              data-testid="button-edit-ac"
              className="rounded-lg px-4 py-3 text-[16px] font-bold underline underline-offset-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-900 hover:bg-slate-50 w-full sm:w-auto text-center border-2 border-transparent"
              style={{ color: BRAND_DARK }}
            >
              Update AC info
            </button>
          </div>
        </div>

        {/* "Not sure" callout */}
        {isUnsure && (
          <div
            role="region"
            aria-label="Important: Unsure AC Details"
            className="mb-8 rounded-xl border-[3px] border-amber-500 bg-amber-50 p-5 text-[16px] leading-relaxed text-slate-900 shadow-sm"
            data-testid="callout-unsure-mobile"
          >
            <div className="flex items-start gap-4">
              <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-amber-700" aria-hidden="true" />
              <div>
                You picked <span className="font-bold">"Not sure"</span> on the AC step,
                so we've sized your slot for one indoor unit. If we find more on-site,
                the technician may not finish in one visit and Taylr will book a
                second slot — which means{" "}
                <span className="font-bold" data-testid="nudge-accountability-mobile">
                  {accountabilityNudge}
                </span>.{" "}
                <span className="font-bold block mt-2">If you can confirm the AC details now,
                you'll likely avoid that.</span>
              </div>
            </div>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                data-testid="button-edit-ac"
                className="rounded-lg bg-amber-700 px-5 py-3 text-[16px] font-bold text-white shadow-sm transition hover:bg-amber-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-900 w-full sm:w-auto"
              >
                Update AC info
              </button>
            </div>
          </div>
        )}

        {!rollout ? (
          <div
            role="region"
            aria-label="AC services not yet open at this address"
            className="rounded-xl border-[3px] border-amber-500 bg-amber-50 p-5 text-[16px] leading-relaxed text-slate-900 shadow-sm"
            data-testid="empty-no-rollout-mobile"
          >
            <div className="flex items-start gap-4">
              <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-amber-700" aria-hidden="true" />
              <div>
                <div className="font-bold text-[18px]">
                  AC services aren't open for booking at this address yet.
                </div>
                <div className="mt-2">
                  We're rolling this out building by building. Call{" "}
                  <span className="font-bold underline underline-offset-4" style={{ color: BRAND_DARK }}>
                    1300 TAYLR
                  </span>{" "}
                  and we'll add you to the waitlist.
                </div>
              </div>
            </div>
          </div>
        ) : lockedByOther ? (
          <div
            role="region"
            aria-label="Already scheduled for this address"
            className="rounded-xl border-[3px] border-slate-400 bg-slate-50 p-5 text-[16px] leading-relaxed text-slate-900 shadow-sm"
            data-testid="banner-locked-by-other-mobile"
            data-locked-kind={lockedByOther.kind}
          >
            <div className="flex items-start gap-4">
              <Lock className="mt-0.5 h-6 w-6 shrink-0 text-slate-700" aria-hidden="true" />
              <div className="flex-1">
                <div className="font-bold text-[18px]">
                  Already scheduled for this address
                </div>
                <div className="mt-2">
                  There's already a confirmed service booked at this property,
                  so it can't be booked again right now. Only one confirmed
                  booking is allowed per service run.
                </div>
                <div className="mt-3">
                  If you have any questions or believe this is a mistake,
                  contact Taylr at{" "}
                  <a
                    href="mailto:support@taylr.com.au"
                    className="font-bold underline underline-offset-4"
                    style={{ color: BRAND_DARK }}
                    data-testid="link-locked-support-email-mobile"
                  >
                    support@taylr.com.au
                  </a>{" "}
                  or call{" "}
                  <span className="font-bold underline underline-offset-4" style={{ color: BRAND_DARK }}>
                    1300 TAYLR
                  </span>
                  .
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
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

        <div className="mt-8 rounded-xl border-2 border-slate-300 bg-slate-100 p-5 text-[16px] text-slate-800 shadow-sm">
          Need a different date? Call us on{" "}
          <span className="font-bold underline underline-offset-4" style={{ color: BRAND_DARK }}>
            1300 TAYLR
          </span>.
        </div>
      </div>

      {/* Docked CTA */}
      <div className="border-t-[3px] border-slate-200 bg-white px-6 py-5 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <button
          type="button"
          disabled={!selected || !!lockedByOther}
          data-testid="button-continue-mobile"
          className="flex w-full items-center justify-center gap-3 rounded-xl px-6 py-4 text-[18px] font-bold text-white shadow-md transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-900 disabled:opacity-60 disabled:cursor-not-allowed h-[52px]"
          style={{ backgroundColor: BRAND }}
        >
          Continue
          <ArrowRight className="h-6 w-6" aria-hidden="true" />
        </button>
      </div>
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

  const fullDateString = `${FULL_DAYS[day.weekday] || day.weekday}, ${day.day} ${FULL_MONTHS[day.month] || day.month}`;

  return (
    <div className="flex flex-col gap-4">
      {/* Fully spelled out date */}
      <h3 className="text-[18px] font-bold text-slate-900 border-b-2 border-slate-200 pb-2">
        {fullDateString}
      </h3>

      {/* Slots */}
      <div className="flex flex-col gap-4">
        <SlotCard
          slot={day.morning}
          icon={<Sunrise className="h-6 w-6 shrink-0" aria-hidden="true" />}
          label={WINDOW_LABEL.morning}
          hint={WINDOW_TIME_RANGE.morning}
          selected={selected === day.morning.id}
          onClick={() => onSelect(day.morning.id)}
          isNextAvailable={day.morning.id === nextAvailableSlotId}
        />
        <SlotCard
          slot={day.afternoon}
          icon={<Sun className="h-6 w-6 shrink-0" aria-hidden="true" />}
          label={WINDOW_LABEL.afternoon}
          hint={WINDOW_TIME_RANGE.afternoon}
          selected={selected === day.afternoon.id}
          onClick={() => onSelect(day.afternoon.id)}
          isNextAvailable={day.afternoon.id === nextAvailableSlotId}
        />
        {day.evening && (
          <SlotCard
            slot={day.evening}
            icon={<Moon className="h-6 w-6 shrink-0" aria-hidden="true" />}
            label={WINDOW_LABEL.evening}
            hint={WINDOW_TIME_RANGE.evening}
            selected={selected === day.evening.id}
            onClick={() => onSelect(day.evening!.id)}
            isNextAvailable={day.evening.id === nextAvailableSlotId}
          />
        )}
      </div>
    </div>
  );
}

function SlotCard({
  slot, icon, label, hint, selected, onClick, isNextAvailable,
}: {
  slot: Slot;
  icon: React.ReactNode;
  label: string;
  hint: string;
  selected: boolean;
  onClick: () => void;
  isNextAvailable: boolean;
}) {
  const fits = slot.status === "available";
  const disabled = !fits;
  const isSelected = selected && fits;
  // Visual hint only — once the customer picks any slot the
  // selected-green state should win, so we hide the next-available
  // accent while this tile is the chosen one.
  const showNextAvailable = isNextAvailable && !disabled && !isSelected;

  const reason =
    slot.status === "full"
      ? "Full"
      : slot.status === "not_yet_open"
        ? "Not yet open for booking"
        : "Not enough time left for this service";

  let StatusIcon = null;
  if (slot.status === "full")
    StatusIcon = <XCircle className="h-6 w-6 shrink-0" aria-hidden="true" />;
  else if (slot.status === "not_enough_time" || slot.status === "not_yet_open")
    StatusIcon = <Lock className="h-6 w-6 shrink-0" aria-hidden="true" />;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      data-testid={`mobile-slot-${slot.id}`}
      aria-pressed={isSelected}
      data-next-available={showNextAvailable ? "true" : undefined}
      data-slot-status={slot.status}
      className={`relative flex w-full flex-row items-center gap-4 rounded-xl border-[3px] p-5 text-left transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-900 ${
        disabled
          ? "cursor-not-allowed border-slate-300 bg-slate-100 text-slate-600"
          : isSelected
            ? "border-[#5FBB97] bg-[#E6F5EE] text-slate-900 shadow-md"
            : showNextAvailable
              ? "bg-white text-slate-900 shadow-md hover:bg-pink-50"
              : "border-slate-300 bg-white text-slate-900 hover:border-slate-500 hover:bg-slate-50"
      }`}
      style={showNextAvailable ? { borderColor: BRAND_DARK } : undefined}
    >
      {showNextAvailable && (
        <span
          className="absolute -top-3 left-4 inline-flex items-center rounded-md px-2 py-1 text-[13px] font-bold uppercase tracking-wide text-white shadow-sm"
          style={{ backgroundColor: BRAND_DARK }}
          data-testid={`next-available-badge-${slot.id}`}
        >
          Next available
        </span>
      )}
      <div className={`flex items-center justify-center rounded-lg p-2 ${
        disabled
          ? "bg-slate-200 text-slate-500"
          : isSelected
            ? "bg-[#5FBB97] text-white"
            : showNextAvailable
              ? "bg-pink-100 text-pink-900"
              : "bg-slate-100 text-slate-700"
      }`}>
        {icon}
      </div>

      <div className="flex-1 flex flex-col">
        <div className="flex items-center gap-2">
          <span className="text-[18px] font-bold">{label}</span>
          {isSelected && (
            <span className="sr-only">Selected</span>
          )}
          {showNextAvailable && (
            <span className="sr-only">Next available</span>
          )}
        </div>
        <div className={`text-[16px] mt-1 ${disabled ? "text-slate-600" : "text-slate-700"}`}>
          {hint}
        </div>
        {disabled && (
          <div className="mt-2 flex items-center gap-2 text-[16px] font-bold text-slate-700 bg-slate-200/50 p-2 rounded">
            {StatusIcon}
            <span>{reason}</span>
          </div>
        )}
      </div>

      {isSelected && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#5FBB97] text-white">
          <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
        </div>
      )}
    </button>
  );
}
