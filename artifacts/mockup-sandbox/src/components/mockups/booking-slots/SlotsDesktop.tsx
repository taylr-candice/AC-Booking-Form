import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Sunrise,
  Sun,
  Moon,
  CheckCircle2,
  Clock,
  Lock,
} from "lucide-react";

import { getBookingDurationMinutes } from "../../../state/bookingDerived";
import {
  bookingActions,
  useBookingSession,
} from "../../../state/bookingSession";
import {
  CANCELLATION_ACK_LABEL,
  unitCity,
} from "../../../state/bookingHelpers";
import { CancellationTermsModal } from "../booking-pages/CancellationTermsModal";
import { type CustomerSlot } from "./customerSlotData";
import { useCustomerSlotPicker } from "./useCustomerSlotPicker";
import { TermsAckRow } from "./TermsAckRow";
import { SlotsAccessBanner } from "./SlotsAccessBanner";
import { CustomerMonthCalendar } from "./CustomerMonthCalendar";

const BRAND = "#ED017F";

type Slot = CustomerSlot;

export function SlotsDesktop() {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [termsOpen, setTermsOpen] = useState(false);
  const session = useBookingSession();
  const cancellationAck = session.cancellation_acknowledged;
  const jobMinutes = getBookingDurationMinutes(session);
  const accessMethod = session.access_method;
  // Timezone pill mirrors the city the building is in — a Canberra unit
  // shows "Canberra time", a Melbourne unit shows "Melbourne time", and
  // so on. Falls back to "Sydney" when no unit is known.
  const cityLabel = unitCity(session.unit_id);

  // Shared customer slot-picker wiring (Task #214): rollout
  // resolution, live-bookings subscription, past-date filtering, and
  // the selected-slot invalidation effect all live in one place so
  // every picker stays in sync.
  const {
    rollout,
    visibleDays,
    lockedByOther,
    selected: selectedSlotId,
    setSelected: setSelectedSlotId,
  } = useCustomerSlotPicker(session.unit_id, jobMinutes);

  const activeDay = useMemo(
    () => visibleDays.find((d) => d.date === selectedDate) ?? null,
    [visibleDays, selectedDate],
  );

  useEffect(() => {
    if (selectedDate && !activeDay) {
      setSelectedDate(null);
      setSelectedSlotId(null);
    }
  }, [selectedDate, activeDay, setSelectedSlotId]);

  const canConfirm =
    !!selectedSlotId && !lockedByOther && cancellationAck;

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

          {/* Top-of-page notification: explains the slot is a window
              (not a fixed time), with an inline Change-access prompt
              for be-there methods. Replaces the earlier be-there ack
              checkbox so the same information becomes a piece of
              guidance the customer reads up front, rather than a
              term-to-agree-to checkbox above Confirm. */}
          <SlotsAccessBanner
            accessMethod={accessMethod}
            size="regular"
            testIdSuffix="desktop"
          />

          <div className="flex-1">
            {!rollout && (
              <div
                className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center text-amber-900"
                data-testid="empty-no-rollout-desktop"
              >
                <div className="text-base font-semibold">
                  AC services aren't open for booking at this address yet.
                </div>
                <div className="mt-2 text-sm text-amber-800">
                  We're rolling this service out building by building. Call{" "}
                  <span className="font-medium" style={{ color: BRAND }}>
                    1300 TAYLR
                  </span>{" "}
                  and we'll add you to the waitlist.
                </div>
              </div>
            )}

            {rollout && lockedByOther && (
              <div
                className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-slate-700"
                data-testid="banner-locked-by-other-desktop"
                data-locked-kind={lockedByOther.kind}
              >
                <div className="flex items-start gap-3">
                  <Lock className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" />
                  <div className="flex-1">
                    <div className="text-base font-semibold text-slate-900">
                      Already scheduled for this address
                    </div>
                    <div className="mt-1.5 text-sm text-slate-600">
                      There's already a confirmed service booked at
                      this property, so it can't be booked again right
                      now. Only one confirmed booking is allowed per
                      service run.
                    </div>
                    <div className="mt-3 text-sm text-slate-600">
                      If you have any questions or believe this is a
                      mistake, contact Taylr at{" "}
                      <a
                        href="mailto:support@taylr.com.au"
                        className="font-medium underline"
                        style={{ color: BRAND }}
                        data-testid="link-locked-support-email-desktop"
                      >
                        support@taylr.com.au
                      </a>{" "}
                      or call{" "}
                      <span className="font-medium" style={{ color: BRAND }}>
                        1300 TAYLR
                      </span>
                      .
                    </div>
                  </div>
                </div>
              </div>
            )}

            {rollout && !lockedByOther && (
              <>
                {/* Full-month calendar with per-day availability dots
                    — Su–Sa grid, prev/next month nav, and a glanceable
                    three-segment indicator (one micro-dot per window)
                    so the customer can scan an entire month at once. */}
                <CustomerMonthCalendar
                  days={visibleDays}
                  selectedDate={selectedDate}
                  onSelect={(iso) => {
                    setSelectedDate(iso);
                    setSelectedSlotId(null);
                  }}
                  size="regular"
                  testIdSuffix="desktop"
                />

                {activeDay && (
                  <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
                    <div className="mb-3 text-sm font-medium text-slate-600">
                      {activeDay.weekday} {activeDay.day} {activeDay.month} ·
                      pick a window
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <DesktopSlotCard
                        slot={activeDay.morning}
                        icon={<Sunrise className="h-4 w-4" />}
                        label="Morning"
                        hint={activeDay.morning.timeLabel}
                        selected={selectedSlotId === activeDay.morning.id}
                        onClick={() =>
                          setSelectedSlotId(activeDay.morning.id)
                        }
                      />
                      <DesktopSlotCard
                        slot={activeDay.afternoon}
                        icon={<Sun className="h-4 w-4" />}
                        label="Afternoon"
                        hint={activeDay.afternoon.timeLabel}
                        selected={selectedSlotId === activeDay.afternoon.id}
                        onClick={() =>
                          setSelectedSlotId(activeDay.afternoon.id)
                        }
                      />
                      {activeDay.evening && (
                        <DesktopSlotCard
                          slot={activeDay.evening}
                          icon={<Moon className="h-4 w-4" />}
                          label="Evening"
                          hint={activeDay.evening.timeLabel}
                          selected={selectedSlotId === activeDay.evening.id}
                          onClick={() =>
                            setSelectedSlotId(activeDay.evening!.id)
                          }
                        />
                      )}
                    </div>

                  </div>
                )}
              </>
            )}
          </div>

          {/* Cancellation-terms ack sits above Confirm. The
              "available for the entire window" reminder moved up
              into the SlotsAccessBanner so it's an informational
              notification, not a checkbox the customer has to
              remember to tick. */}
          <div className="mt-8 space-y-2">
            <TermsAckRow
              checked={cancellationAck}
              onChange={(next) =>
                bookingActions.setCancellationAcknowledged(next)
              }
              label={CANCELLATION_ACK_LABEL}
              onViewTerms={() => setTermsOpen(true)}
              ackTestId="checkbox-cancellation-ack-desktop"
              rowTestId="cancellation-ack-row-desktop"
              viewTermsTestId="button-view-cancellation-terms-desktop"
              size="regular"
            />
          </div>

          <div className="mt-6 pt-6 border-t border-slate-100 flex items-center justify-between">
            <button
              type="button"
              className="text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors"
              data-testid="button-back-desktop"
            >
              ← Back
            </button>
            <button
              type="button"
              disabled={!canConfirm}
              data-testid="button-continue-desktop"
              className="flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white transition disabled:opacity-50 hover:opacity-90"
              style={{ backgroundColor: BRAND }}
            >
              Confirm
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
      {termsOpen && (
        <CancellationTermsModal onClose={() => setTermsOpen(false)} />
      )}
    </div>
  );
}

function DesktopSlotCard({
  slot, icon, label, hint, selected, onClick,
}: {
  slot: Slot;
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
          ? { borderColor: BRAND, backgroundColor: BRAND }
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
    </button>
  );
}
