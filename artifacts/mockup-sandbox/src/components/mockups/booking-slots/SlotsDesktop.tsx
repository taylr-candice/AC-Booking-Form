import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock,
  Lock,
} from "lucide-react";

import { AfternoonIcon, EveningIcon, MorningIcon } from "./TimeOfDayIcon";

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
import {
  canContinueScheduling,
  getAccessSchedulingMode,
  getNextAvailableCtaLabel,
} from "./accessSchedulingMode";
import {
  findNextAvailable,
  getVisibleWindowsForDay,
  hasUpcomingUnreleasedDays,
  windowDisplayLabel,
  type CustomerSlot,
} from "./customerSlotData";
import { useCustomerSlotPicker } from "./useCustomerSlotPicker";
import { TermsAckRow } from "./TermsAckRow";
import { SlotsAccessBanner } from "./SlotsAccessBanner";
import { WhyWindowsModal } from "./WhyWindowsModal";
import { SlotsAccessNotesDisclosure } from "./SlotsAccessNotesDisclosure";
import { CustomerAvailableDays } from "./CustomerAvailableDays";
import { NextAvailableCard } from "./NextAvailableCard";

function windowIcon(window: CustomerSlot["window"]): React.ReactNode {
  if (window === "morning") return <MorningIcon className="h-4 w-4" />;
  if (window === "afternoon") return <AfternoonIcon className="h-4 w-4" />;
  return <EveningIcon className="h-4 w-4" />;
}

const BRAND = "#ED017F";
const SELECTED_GREEN_BG = "#7BC9A8";
// White text on the green selected fill so it reads as a clearly
// active, "in use" choice rather than a neutral card.
const SELECTED_GREEN_TEXT = "#ffffff";
const SELECTED_GREEN_BORDER = "#7BC9A8";
const ERROR_PURPLE = "#9747FF";

type Slot = CustomerSlot;

export function SlotsDesktop() {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [termsOpen, setTermsOpen] = useState(false);
  const [whyWindowsOpen, setWhyWindowsOpen] = useState(false);
  const [attemptedConfirm, setAttemptedConfirm] = useState(false);
  const session = useBookingSession();
  const cancellationAck = session.cancellation_acknowledged;
  const jobMinutes = getBookingDurationMinutes(session);
  const accessMethod = session.access_method;
  const leaveKeySub = session.leave_key_sub_method;
  const schedulingMode = getAccessSchedulingMode(accessMethod, leaveKeySub);
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

  const nextAvailable = useMemo(
    () => findNextAvailable(visibleDays),
    [visibleDays],
  );
  const pickSlotOneTap = (iso: string, slotId: string) => {
    setSelectedDate(iso);
    setSelectedSlotId(slotId);
  };

  useEffect(() => {
    if (selectedDate && !activeDay) {
      setSelectedDate(null);
      setSelectedSlotId(null);
    }
  }, [selectedDate, activeDay, setSelectedSlotId]);

  // True when the rollout exists but every day is still staged
  // (openByAdmin: false). The customer can't pick a window yet but
  // can proceed to checkout — Taylr notifies them via their provided
  // email once dates are released.
  const noDatesYet =
    hasUpcomingUnreleasedDays(rollout, visibleDays) && visibleDays.length === 0;

  const canConfirm =
    canContinueScheduling(selectedDate, selectedSlotId, accessMethod, noDatesYet) &&
    !lockedByOther &&
    (noDatesYet || cancellationAck);

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-['Inter'] flex justify-center overflow-y-auto">
      <div className="w-full max-w-2xl">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-8 md:p-10 flex flex-col">
          <div className="mb-6 flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Schedule your service</h1>
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

          {/* Top-of-page notification: only shown when there are actual
              dates to pick from. When noDatesYet the customer has
              nothing to select so the windows notice would be misleading. */}
          {!noDatesYet && (
            <SlotsAccessBanner
              accessMethod={accessMethod}
              leaveKeySub={leaveKeySub}
              size="regular"
              testIdSuffix="desktop"
              onWhyWindows={() => setWhyWindowsOpen(true)}
            />
          )}

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
                {nextAvailable && (
                  <NextAvailableCard
                    day={nextAvailable.day}
                    slot={nextAvailable.slot}
                    onPick={pickSlotOneTap}
                    size="regular"
                    testIdSuffix="desktop"
                  />
                )}

                {nextAvailable && (
                  <div
                    className="mt-6 mb-3 text-[20px] font-bold text-slate-900"
                    data-testid="label-choose-another-day-desktop"
                  >
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
                  testIdSuffix="desktop"
                />

                {activeDay && (
                  <div className="mt-6">
                    <div
                      className="mb-3 text-[20px] font-bold text-slate-900"
                      data-testid="label-pick-a-window-desktop"
                    >
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

                {selectedSlotId && (
                  <div className="mt-4">
                    <SlotsAccessNotesDisclosure
                      size="regular"
                      testIdSuffix="desktop"
                    />
                  </div>
                )}

                {/* "Dates pending" notice — same two-variant logic
                    as the mobile picker. Zero visible days → prominent
                    panel; user can still proceed to checkout. Some
                    visible days → subtle footer note only. */}
                {hasUpcomingUnreleasedDays(rollout, visibleDays) && (
                  visibleDays.length === 0 ? (
                    <div
                      className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-5"
                      data-testid="banner-dates-coming-soon-desktop"
                    >
                      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-sky-100">
                        <CalendarClock className="h-6 w-6 text-sky-400" />
                      </div>
                      <div className="text-base font-semibold text-sky-900">
                        Dates are on the way
                      </div>
                      <div className="mt-1.5 text-sm text-sky-800">
                        We're still confirming the service schedule for
                        this building. You can complete your booking now
                        and we'll lock in your window as soon as dates
                        are released.
                      </div>
                      <div className="mt-2 text-sm text-sky-700">
                        We'll notify you at{" "}
                        <span className="font-semibold">
                          {session.contact_email || "the email address you provided"}
                        </span>{" "}
                        as soon as dates become available.
                      </div>
                    </div>
                  ) : (
                    <div
                      className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4"
                      data-testid="section-more-dates-desktop"
                    >
                      <div className="text-sm font-semibold text-slate-900">
                        Don't see a suitable day?
                      </div>
                      <div className="mt-0.5 text-sm text-slate-600">
                        More service windows are being confirmed —
                        additional dates will open shortly.
                      </div>
                    </div>
                  )
                )}
              </>
            )}
          </div>

          {/* Cancellation-terms ack sits above Confirm. The
              "available for the entire window" reminder moved up
              into the SlotsAccessBanner so it's an informational
              notification, not a checkbox the customer has to
              remember to tick. */}
          {!noDatesYet && (
            <div className="mt-8 space-y-2">
              <TermsAckRow
                checked={cancellationAck}
                onChange={(next) => {
                  bookingActions.setCancellationAcknowledged(next);
                  if (next) setAttemptedConfirm(false);
                }}
                label={CANCELLATION_ACK_LABEL}
                onViewTerms={() => setTermsOpen(true)}
                ackTestId="checkbox-cancellation-ack-desktop"
                rowTestId="cancellation-ack-row-desktop"
                viewTermsTestId="button-view-cancellation-terms-desktop"
                invalid={attemptedConfirm && !cancellationAck}
                errorText="Please confirm the cancellation policy to continue."
              />
            </div>
          )}

          <div className="mt-6 pt-6 border-t border-slate-100 flex items-center justify-between">
            <button
              type="button"
              className="text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors"
              data-testid="button-back-desktop"
            >
              ← Back
            </button>
            {/* See SlotsMobile.tsx for why we keep the button enabled
                without the ack and intercept the click in capture
                phase to surface the invalid styling. */}
            {attemptedConfirm &&
              !canContinueScheduling(selectedDate, selectedSlotId, accessMethod, noDatesYet) &&
              !lockedByOther && (
              <div
                className="mr-4 flex items-center gap-2 rounded-xl border px-3 py-2 text-[12px] font-medium"
                style={{ color: ERROR_PURPLE, borderColor: ERROR_PURPLE, backgroundColor: "rgba(151,71,255,0.04)" }}
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>Please select a service window.</span>
              </div>
            )}
            <span
              onClickCapture={(e) => {
                if (noDatesYet) return;
                if (!cancellationAck) {
                  e.stopPropagation();
                  e.preventDefault();
                  setAttemptedConfirm(true);
                }
              }}
            >
              <button
                type="button"
                disabled={
                  !canContinueScheduling(selectedDate, selectedSlotId, accessMethod, noDatesYet) ||
                  !!lockedByOther
                }
                aria-disabled={!canConfirm}
                data-testid="button-continue-desktop"
                className="flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white transition disabled:opacity-50 hover:opacity-90"
                style={{ backgroundColor: BRAND }}
                onClick={() => { if (noDatesYet) bookingActions.setBookedWithoutDates(true); }}
              >
                Confirm
                <ArrowRight className="h-4 w-4" />
              </button>
            </span>
          </div>
        </div>
      </div>
      {termsOpen && (
        <CancellationTermsModal mode="pre_order" onClose={() => setTermsOpen(false)} />
      )}
      {whyWindowsOpen && (
        <WhyWindowsModal onClose={() => setWhyWindowsOpen(false)} />
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
            ? "shadow-sm"
            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:shadow-sm"
      }`}
      style={
        isSelected
          ? {
              borderColor: SELECTED_GREEN_BORDER,
              backgroundColor: SELECTED_GREEN_BG,
              color: SELECTED_GREEN_TEXT,
            }
          : undefined
      }
    >
      <div className="flex w-full items-center justify-between">
        <div
          className={disabled ? "text-slate-400" : ""}
          style={
            disabled
              ? undefined
              : { color: isSelected ? "#ffffff" : BRAND }
          }
        >
          {icon}
        </div>
        {isSelected && (
          <CheckCircle2 className="h-3.5 w-3.5" style={{ color: "#ffffff" }} />
        )}
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
