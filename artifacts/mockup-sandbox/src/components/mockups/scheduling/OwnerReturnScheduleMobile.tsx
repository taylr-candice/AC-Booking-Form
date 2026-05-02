/**
 * OwnerReturnScheduleMobile
 *
 * Canvas view — what an owner sees on mobile when they follow the
 * "dates are now available — schedule your service" email link.
 *
 * Post-booking context: the owner booked while Lakeside Towers had no
 * open dates (noDatesYet). Taylr sent a "dates released" email once the
 * rollout opened. The owner taps the link and lands here — straight to
 * the slot picker, no login, no payment, no access step.
 *
 * Context seeded from bk-lakeside-01:
 *   Owner : Sophie Brennan, 7 / 45 Lakeside Drive, Meadowbank NSW 2114
 *   Service: AC service · 2 × split system · approx. 90 min
 *   Access : Owner will be present (owner_live_at_unit)
 *   Ref    : TLR-L01
 *
 * Slot data uses the live Bourke rollout (u6) — same real Mon/Wed/Fri
 * windows as TenantSchedulingMobile — to demonstrate a picker that
 * has actual dates rather than a placeholder panel.
 *
 * Two screens:
 *   1. Slot picker — "dates released" success banner + context card
 *      + day/window picker + Confirm
 *   2. Thank-you  — confirmation panel
 */

import { useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, Home, Sparkles } from "lucide-react";
import {
  findNextAvailable,
  getVisibleServiceDays,
  getVisibleWindowsForDay,
  resolveCustomerSlotData,
  windowDisplayLabel,
  type CustomerDay,
  type CustomerSlot,
} from "../booking-slots/customerSlotData";
import { AfternoonIcon, EveningIcon, MorningIcon } from "../booking-slots/TimeOfDayIcon";
import { CustomerAvailableDays } from "../booking-slots/CustomerAvailableDays";
import { NextAvailableCard } from "../booking-slots/NextAvailableCard";

const BRAND = "#ED017F";
const SELECTED_GREEN_BG = "#7BC9A8";
const SELECTED_GREEN_TEXT = "#ffffff";
const SELECTED_GREEN_BORDER = "#7BC9A8";

const SLOT_UNIT_ID = "u6";
const JOB_MINUTES = 90;

const BOOKING_CONTEXT = {
  ref: "TLR-L01",
  unitAddress: "7 / 45 Lakeside Drive",
  suburb: "Meadowbank NSW 2114",
  service: "AC service",
  detail: "2 × split system · approx. 90 min",
  ownerName: "Sophie Brennan",
  accessNote: "You'll need to be present on the day",
  building: "Lakeside Towers",
};

function windowIcon(window: CustomerSlot["window"]) {
  if (window === "morning") return <MorningIcon className="h-4 w-4" />;
  if (window === "afternoon") return <AfternoonIcon className="h-4 w-4" />;
  return <EveningIcon className="h-4 w-4" />;
}

function longWeekday(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map((s) => parseInt(s, 10));
  const local = new Date(y, (m ?? 1) - 1, d ?? 1);
  return local.toLocaleDateString("en-AU", { weekday: "long" });
}

export function OwnerReturnScheduleMobile() {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const { rollout, days } = useMemo(
    () => resolveCustomerSlotData(SLOT_UNIT_ID, JOB_MINUTES),
    [],
  );
  const visibleDays = useMemo(() => getVisibleServiceDays(days), [days]);
  const nextAvailable = useMemo(() => findNextAvailable(visibleDays), [visibleDays]);
  const activeDay = useMemo(
    () => visibleDays.find((d) => d.date === selectedDate) ?? null,
    [visibleDays, selectedDate],
  );

  const confirmedDetails = useMemo(() => {
    if (!selectedDate || !selectedSlotId) return null;
    const day = visibleDays.find((d) => d.date === selectedDate);
    if (!day) return null;
    const wins = [day.morning, day.afternoon, ...(day.evening ? [day.evening] : [])];
    const slot = wins.find((s) => s.id === selectedSlotId);
    return slot ? { day, slot } : null;
  }, [visibleDays, selectedDate, selectedSlotId]);

  const pickSlotOneTap = (iso: string, slotId: string) => {
    setSelectedDate(iso);
    setSelectedSlotId(slotId);
  };

  if (confirmed && confirmedDetails) {
    return (
      <ThankYouScreen
        day={confirmedDetails.day}
        slot={confirmedDetails.slot}
        bookingRef={BOOKING_CONTEXT.ref}
        onDone={() => {
          setConfirmed(false);
          setSelectedDate(null);
          setSelectedSlotId(null);
        }}
      />
    );
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-white font-['Inter']">
      {/* Header */}
      <div className="flex-none border-b border-slate-100 px-5 pb-4 pt-5">
        <div className="flex items-start gap-3">
          <div
            className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
            style={{ backgroundColor: "rgba(237,1,127,0.08)" }}
          >
            <Home className="h-4 w-4" style={{ color: BRAND }} />
          </div>
          <div>
            <h1 className="text-[20px] font-bold leading-tight text-slate-900">
              Schedule your service
            </h1>
            <p className="mt-0.5 text-[12px] text-slate-500">
              {BOOKING_CONTEXT.unitAddress} · {BOOKING_CONTEXT.suburb}
            </p>
          </div>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="no-scrollbar flex-1 overflow-y-auto px-5 pb-6">
        {/* Dates-released banner */}
        <div
          className="mt-4 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3"
          data-testid="banner-dates-released-owner"
        >
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <div>
            <div className="text-[13px] font-semibold text-emerald-900">
              Dates are now available
            </div>
            <div className="mt-0.5 text-[12px] text-emerald-800">
              Service windows have just been released for{" "}
              {BOOKING_CONTEXT.building}. Pick a window below to lock in
              your appointment.
            </div>
          </div>
        </div>

        {/* Booking context card */}
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Your booking
          </div>
          <div className="mt-1 text-[14px] font-semibold text-slate-900">
            {BOOKING_CONTEXT.service}
          </div>
          <div className="mt-0.5 text-[12px] text-slate-500">
            {BOOKING_CONTEXT.detail}
          </div>
          <div className="mt-2 text-[12px] text-slate-500">
            Owner:{" "}
            <span className="font-medium text-slate-700">
              {BOOKING_CONTEXT.ownerName}
            </span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            Ref {BOOKING_CONTEXT.ref}
          </div>
        </div>

        {/* Access note */}
        <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-3.5 py-2.5">
          <p className="text-[12px] text-amber-900">
            <span className="font-semibold">Access note:</span>{" "}
            {BOOKING_CONTEXT.accessNote}.
          </p>
        </div>

        {/* Date / window picker */}
        <div className="mt-4">
          {rollout === null || visibleDays.length === 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
              <div className="text-[14px] font-semibold">No windows available yet</div>
              <div className="mt-1 text-[12px] text-amber-800">
                Check back soon, or call{" "}
                <span className="font-medium" style={{ color: BRAND }}>
                  1300 TAYLR
                </span>{" "}
                if you need to arrange access urgently.
              </div>
            </div>
          ) : (
            <>
              {nextAvailable && (
                <NextAvailableCard
                  day={nextAvailable.day}
                  slot={nextAvailable.slot}
                  onPick={pickSlotOneTap}
                  size="compact"
                  ctaLabel="Pick this"
                  testIdSuffix="owner-return"
                />
              )}

              {nextAvailable && (
                <div className="mt-4 mb-2 text-[18px] font-bold text-slate-900">
                  Choose a day
                </div>
              )}

              <CustomerAvailableDays
                days={visibleDays}
                selectedDate={selectedDate}
                onSelect={(iso) => {
                  setSelectedDate(iso);
                  setSelectedSlotId(null);
                }}
                size="compact"
                testIdSuffix="owner-return"
              />

              {activeDay && (
                <div className="mt-5">
                  <div className="mb-2 text-[18px] font-bold text-slate-900">
                    Pick a window
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {getVisibleWindowsForDay(activeDay).map((slot) => (
                      <OwnerSlotCard
                        key={slot.id}
                        slot={slot}
                        icon={windowIcon(slot.window)}
                        label={windowDisplayLabel(slot.window)}
                        hint={slot.timeLabel}
                        selected={selectedSlotId === slot.id}
                        onClick={() => setSelectedSlotId(slot.id)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Docked CTA */}
      <div className="flex-none border-t border-slate-100 bg-white px-5 py-4">
        <button
          type="button"
          disabled={!selectedSlotId}
          data-testid="button-confirm-owner-return"
          className="flex w-full items-center justify-center gap-2 rounded-full px-5 py-3.5 text-[14px] font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-40"
          style={{ backgroundColor: BRAND }}
          onClick={() => {
            if (selectedSlotId) setConfirmed(true);
          }}
        >
          Confirm this window
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function OwnerSlotCard({
  slot,
  icon,
  label,
  hint,
  selected,
  onClick,
}: {
  slot: CustomerSlot;
  icon: React.ReactNode;
  label: string;
  hint: string;
  selected: boolean;
  onClick: () => void;
}) {
  const fits = slot.status === "available";
  const disabled = !fits;
  const isSelected = selected && fits;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      data-testid={`owner-return-slot-${slot.id}`}
      aria-pressed={isSelected}
      className={`flex flex-col items-start gap-1 rounded-xl border px-3 py-2.5 text-left transition ${
        disabled
          ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
          : isSelected
            ? "shadow-sm"
            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
      }`}
      style={
        isSelected
          ? { borderColor: SELECTED_GREEN_BORDER, backgroundColor: SELECTED_GREEN_BG, color: SELECTED_GREEN_TEXT }
          : undefined
      }
    >
      <div className="flex w-full items-center justify-between">
        <div style={disabled ? undefined : { color: isSelected ? "#ffffff" : BRAND }}>
          {icon}
        </div>
        {isSelected && <CheckCircle2 className="h-3.5 w-3.5" style={{ color: "#ffffff" }} />}
      </div>
      <div className="text-[13px] font-semibold">{label}</div>
      <div
        className={`text-[10px] ${disabled ? "text-slate-400" : isSelected ? "" : "text-slate-500"}`}
        style={isSelected ? { color: SELECTED_GREEN_TEXT, opacity: 0.85 } : undefined}
      >
        {hint}
      </div>
    </button>
  );
}

function ThankYouScreen({
  day,
  slot,
  bookingRef,
  onDone,
}: {
  day: CustomerDay;
  slot: CustomerSlot;
  bookingRef: string;
  onDone: () => void;
}) {
  const windowLabel = windowDisplayLabel(slot.window);
  const monthTitle = day.month.charAt(0) + day.month.slice(1).toLowerCase();
  const weekdayLong = longWeekday(day.date);

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center bg-white px-6 font-['Inter']">
      <div
        className="mb-5 flex h-16 w-16 items-center justify-center rounded-full"
        style={{ backgroundColor: "rgba(123,201,168,0.12)" }}
      >
        <CheckCircle2 className="h-8 w-8" style={{ color: "#7BC9A8" }} />
      </div>
      <h2 className="text-[24px] font-bold text-slate-900">All booked in</h2>
      <p className="mt-2 max-w-xs text-center text-[14px] text-slate-500">
        Your service window is locked in. We'll confirm the exact arrival
        time closer to the date.
      </p>
      <div className="mt-6 w-full max-w-xs rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Your window
        </div>
        <div className="mt-1 text-[16px] font-bold text-slate-900">
          {windowLabel} · {weekdayLong} {day.day} {monthTitle}
        </div>
        <div className="mt-0.5 text-[13px] text-slate-500">{slot.timeLabel}</div>
        <div className="mt-1 text-[12px] text-amber-700 font-medium">
          Remember — you'll need to be present
        </div>
        <div className="mt-2 text-[11px] text-slate-400">Ref {bookingRef}</div>
      </div>
      <button
        type="button"
        onClick={onDone}
        className="mt-8 rounded-full px-6 py-3 text-[14px] font-semibold text-white transition hover:opacity-90"
        style={{ backgroundColor: BRAND }}
        data-testid="button-done-owner-return"
      >
        Done
      </button>
    </div>
  );
}
