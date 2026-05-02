/**
 * TenantSchedulingDesktop
 *
 * Desktop canvas view — the same "rebook link" scheduling flow as
 * TenantSchedulingMobile, laid out as a two-column card at 1280 × 720.
 *
 * Left panel  (40 %): booking context card + windows-are-not-times note.
 * Right panel (60 %): date + window picker, confirm button.
 *
 * Same seed as TenantSchedulingMobile:
 *   Owner / booker : Marcus Holloway (City Edge Property Group)
 *   Unit           : 6 / 21 Bourke Street, Surry Hills NSW 2010
 *   Service        : AC service · 1 × split system (45 min)
 *   Slot data      : live Bourke rollout (real Mon/Wed/Fri windows)
 */

import { useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, Wind } from "lucide-react";
import {
  findNextAvailable,
  getVisibleServiceDays,
  getVisibleWindowsForDay,
  hasUpcomingUnreleasedDays,
  resolveCustomerSlotData,
  windowDisplayLabel,
  type CustomerDay,
  type CustomerSlot,
} from "./customerSlotData";
import { AfternoonIcon, EveningIcon, MorningIcon } from "./TimeOfDayIcon";
import { CustomerAvailableDays } from "./CustomerAvailableDays";
import { NextAvailableCard } from "./NextAvailableCard";

const BRAND = "#ED017F";
const SELECTED_GREEN_BG = "#7BC9A8";
const SELECTED_GREEN_TEXT = "#ffffff";
const SELECTED_GREEN_BORDER = "#7BC9A8";

const REBOOK_UNIT_ID = "u6";
const JOB_MINUTES = 45;

const BOOKING_CONTEXT = {
  ref: "TLR-1038",
  unitAddress: "6 / 21 Bourke Street",
  suburb: "Surry Hills NSW 2010",
  service: "AC service",
  detail: "1 × split system · approx. 45 min",
  bookerName: "Marcus Holloway",
  bookerCompany: "City Edge Property Group",
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

export function TenantSchedulingDesktop() {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const { rollout, days } = useMemo(
    () => resolveCustomerSlotData(REBOOK_UNIT_ID, JOB_MINUTES),
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
    <div className="flex h-screen w-screen items-center justify-center bg-slate-50 font-['Inter'] p-6">
      <div className="flex w-full max-w-5xl rounded-2xl border border-slate-200/60 bg-white shadow-sm overflow-hidden" style={{ height: 660 }}>
        {/* Left panel — context */}
        <div className="flex w-2/5 flex-col border-r border-slate-100 bg-slate-50 p-8">
          <div className="flex items-start gap-3 mb-6">
            <div
              className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: "rgba(237,1,127,0.08)" }}
            >
              <Wind className="h-5 w-5" style={{ color: BRAND }} />
            </div>
            <div>
              <h1 className="text-[22px] font-bold leading-tight text-slate-900">
                Pick a service window
              </h1>
              <p className="mt-0.5 text-[13px] text-slate-500">
                {BOOKING_CONTEXT.unitAddress}
              </p>
              <p className="text-[13px] text-slate-500">{BOOKING_CONTEXT.suburb}</p>
            </div>
          </div>

          {/* Booking context card */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Service request
            </div>
            <div className="mt-1.5 text-[15px] font-semibold text-slate-900">
              {BOOKING_CONTEXT.service}
            </div>
            <div className="mt-0.5 text-[13px] text-slate-500">
              {BOOKING_CONTEXT.detail}
            </div>
            <div className="mt-3 text-[13px] text-slate-500">
              Arranged by{" "}
              <span className="font-medium text-slate-700">
                {BOOKING_CONTEXT.bookerName}
              </span>
            </div>
            <div className="text-[13px] text-slate-500">
              {BOOKING_CONTEXT.bookerCompany}
            </div>
            <div className="mt-2 text-[11px] text-slate-400">
              Ref {BOOKING_CONTEXT.ref}
            </div>
          </div>

          {/* Windows note */}
          <div className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-[13px] text-slate-600">
              <span className="font-semibold text-slate-800">
                These are windows, not set times.
              </span>{" "}
              Our technician will arrive within the window you choose.
            </p>
          </div>
        </div>

        {/* Right panel — slot picker */}
        <div className="flex flex-1 flex-col overflow-y-auto p-8">
          {rollout === null || visibleDays.length === 0 ? (
            <div
              className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-900"
              data-testid="empty-no-slots-tenant-desktop"
            >
              <div className="text-[15px] font-semibold">No windows available yet</div>
              <div className="mt-1 text-[13px] text-amber-800">
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
                  size="regular"
                  ctaLabel="Pick this"
                  testIdSuffix="tenant-desktop"
                />
              )}

              {nextAvailable && (
                <div className="mt-5 mb-2 text-[19px] font-bold text-slate-900">
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
                size="regular"
                testIdSuffix="tenant-desktop"
              />

              {activeDay && (
                <div className="mt-5">
                  <div className="mb-2 text-[19px] font-bold text-slate-900">
                    Pick a window
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {getVisibleWindowsForDay(activeDay).map((slot) => (
                      <DesktopSlotCard
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

              {hasUpcomingUnreleasedDays(rollout, visibleDays) && (
                <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-[13px] font-semibold text-slate-900">
                    Don't see a suitable day?
                  </div>
                  <div className="mt-0.5 text-[12px] text-slate-600">
                    More windows are being confirmed. Contact your property
                    manager to request a different date.
                  </div>
                </div>
              )}
            </>
          )}

          {/* Spacer to push confirm to bottom */}
          <div className="flex-1" />

          {/* Confirm button */}
          <div className="mt-6 border-t border-slate-100 pt-5 flex justify-end">
            <button
              type="button"
              disabled={!selectedSlotId}
              data-testid="button-confirm-tenant-desktop"
              className="flex items-center gap-2 rounded-full px-6 py-3 text-[14px] font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-40"
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
      </div>
    </div>
  );
}

function DesktopSlotCard({
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
      data-testid={`tenant-desktop-slot-${slot.id}`}
      aria-pressed={isSelected}
      className={`flex flex-col items-start gap-1 rounded-xl border px-3 py-3 text-left transition ${
        disabled
          ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
          : isSelected
            ? "shadow-sm"
            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:shadow-sm"
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
    <div className="flex h-screen w-screen items-center justify-center bg-slate-50 font-['Inter']">
      <div className="flex flex-col items-center rounded-2xl border border-slate-200/60 bg-white p-12 shadow-sm max-w-md w-full">
        <div
          className="mb-5 flex h-16 w-16 items-center justify-center rounded-full"
          style={{ backgroundColor: "rgba(123,201,168,0.12)" }}
        >
          <CheckCircle2 className="h-8 w-8" style={{ color: "#7BC9A8" }} />
        </div>
        <h2 className="text-[24px] font-bold text-slate-900">You're confirmed</h2>
        <p className="mt-2 text-center text-[14px] text-slate-500 max-w-xs">
          We've noted your preferred window and will let your property manager know.
        </p>
        <div className="mt-6 w-full rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Your window
          </div>
          <div className="mt-1 text-[16px] font-bold text-slate-900">
            {windowLabel} · {weekdayLong} {day.day} {monthTitle}
          </div>
          <div className="mt-0.5 text-[13px] text-slate-500">{slot.timeLabel}</div>
          <div className="mt-2 text-[11px] text-slate-400">Ref {bookingRef}</div>
        </div>
        <p className="mt-4 text-center text-[12px] text-slate-400 max-w-xs">
          You'll receive a confirmation from your property manager shortly.
        </p>
        <button
          type="button"
          onClick={onDone}
          className="mt-8 rounded-full px-6 py-3 text-[14px] font-semibold text-white transition hover:opacity-90"
          style={{ backgroundColor: BRAND }}
          data-testid="button-done-tenant-desktop"
        >
          Done
        </button>
      </div>
    </div>
  );
}
