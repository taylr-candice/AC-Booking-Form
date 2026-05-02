import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Lock,
} from "lucide-react";

import { AfternoonIcon, EveningIcon, MorningIcon } from "./TimeOfDayIcon";

import { getBookingDurationMinutes } from "../../../state/bookingDerived";
import {
  bookingActions,
  useBookingSession,
} from "../../../state/bookingSession";
import { CANCELLATION_ACK_LABEL } from "../../../state/bookingHelpers";
import { CancellationTermsModal } from "../booking-pages/CancellationTermsModal";
import {
  canContinueScheduling,
  getAccessSchedulingMode,
  getNextAvailableCtaLabel,
} from "./accessSchedulingMode";
import {
  findNextAvailable,
  getVisibleWindowsForDay,
  windowDisplayLabel,
  type CustomerSlot,
} from "./customerSlotData";
import { useCustomerSlotPicker } from "./useCustomerSlotPicker";
import { TermsAckRow } from "./TermsAckRow";
import { SlotsAccessBanner } from "./SlotsAccessBanner";
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

export function SlotsMobile() {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [termsOpen, setTermsOpen] = useState(false);
  const [attemptedConfirm, setAttemptedConfirm] = useState(false);
  const session = useBookingSession();
  const jobMinutes = getBookingDurationMinutes(session);
  const accessMethod = session.access_method;
  const leaveKeySub = session.leave_key_sub_method;
  // Cancellation ack moved here from Pay (Task #121). Reads/writes the
  // existing `cancellation_acknowledged` boolean on the session store —
  // single source of truth, unchanged across the rest of the flow.
  const cancellationAck = session.cancellation_acknowledged;
  const schedulingMode = getAccessSchedulingMode(accessMethod, leaveKeySub);

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

  // If the active day is no longer in view (rolled past, etc.), clear it.
  useEffect(() => {
    if (selectedDate && !activeDay) {
      setSelectedDate(null);
      setSelectedSlotId(null);
    }
  }, [selectedDate, activeDay, setSelectedSlotId]);

  const canConfirm =
    canContinueScheduling(selectedDate, selectedSlotId, accessMethod) &&
    !lockedByOther &&
    cancellationAck;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-white font-['Inter']">
      {/* Page header */}
      <div className="flex items-start justify-between px-5 pb-4 pt-5">
        <div>
          <h1 className="text-[26px] font-bold leading-tight text-slate-900">
            Schedule
          </h1>
          <div className="mt-0.5 text-xs text-slate-500">Pick a service window</div>
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

      {/* Body */}
      <div className="no-scrollbar flex-1 overflow-y-auto px-5 pb-6">
        {/* Top-of-page notification: explains the slot is a window
            (not a fixed time), with an inline Change-access prompt
            for be-there methods. Replaces the earlier be-there ack
            checkbox. */}
        <SlotsAccessBanner
          accessMethod={accessMethod}
          leaveKeySub={leaveKeySub}
          size="compact"
          testIdSuffix="mobile"
        />

        {!rollout ? (
          <div
            className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900"
            data-testid="empty-no-rollout-mobile"
          >
            <div className="text-[14px] font-semibold">
              AC services aren't open for booking at this address yet.
            </div>
            <div className="mt-1.5 text-[12px] text-amber-800">
              We're rolling this out building by building. Call{" "}
              <span className="font-medium" style={{ color: BRAND }}>
                1300 TAYLR
              </span>{" "}
              and we'll add you to the waitlist.
            </div>
          </div>
        ) : lockedByOther ? (
          <div
            className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-slate-700"
            data-testid="banner-locked-by-other-mobile"
            data-locked-kind={lockedByOther.kind}
          >
            <div className="flex items-start gap-2.5">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
              <div className="flex-1">
                <div className="text-[14px] font-semibold text-slate-900">
                  Already scheduled for this address
                </div>
                <div className="mt-1 text-[12px] text-slate-600">
                  There's already a confirmed service booked at this
                  property, so it can't be booked again right now. Only
                  one confirmed booking is allowed per service run.
                </div>
                <div className="mt-2 text-[12px] text-slate-600">
                  If you have any questions or believe this is a
                  mistake, contact Taylr at{" "}
                  <a
                    href="mailto:support@taylr.com.au"
                    className="font-medium underline"
                    style={{ color: BRAND }}
                    data-testid="link-locked-support-email-mobile"
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
        ) : (
          <>
            {nextAvailable && (
              <div className="mt-1">
                <NextAvailableCard
                  day={nextAvailable.day}
                  slot={nextAvailable.slot}
                  onPick={pickSlotOneTap}
                  size="compact"
                  ctaLabel={getNextAvailableCtaLabel(schedulingMode)}
                  testIdSuffix="mobile"
                />
              </div>
            )}

            {nextAvailable && (
              <div
                className="mt-4 mb-2 text-[18px] font-bold text-slate-900"
                data-testid="label-choose-another-day-mobile"
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
              size="compact"
              testIdSuffix="mobile"
            />

            {/* Window reveal — only after a day is picked. The
                section sits flat against the page (no rounded card
                border) so the day picker and window picker read as
                a continuous flow rather than two separate panels. */}
            {activeDay && (
              <div className="mt-5">
                <div
                  className="mb-2 text-[18px] font-bold text-slate-900"
                  data-testid="label-pick-a-window-mobile"
                >
                  Pick a window
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {getVisibleWindowsForDay(activeDay).map((slot) => (
                    <SlotCard
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
              <div className="mt-3">
                <SlotsAccessNotesDisclosure
                  size="compact"
                  testIdSuffix="mobile"
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* Docked CTA — the cancellation ack is always present so the
          customer sees what they're agreeing to before tapping a
          slot. The "available for the entire window" message moved
          to the top-of-page banner (SlotsAccessBanner) so it's an
          informational notification, not a checkbox to remember to
          tick. */}
      <div className="border-t border-slate-100 bg-white px-5 py-3">
        <TermsAckRow
          checked={cancellationAck}
          onChange={(next) => {
            bookingActions.setCancellationAcknowledged(next);
            if (next) setAttemptedConfirm(false);
          }}
          label={CANCELLATION_ACK_LABEL}
          onViewTerms={() => setTermsOpen(true)}
          ackTestId="checkbox-cancellation-ack-mobile"
          rowTestId="cancellation-ack-row-mobile"
          viewTermsTestId="button-view-cancellation-terms-mobile"
          invalid={attemptedConfirm && !cancellationAck}
          errorText="Please confirm the cancellation policy to continue."
        />
        {/* When the cancellation ack isn't ticked we *deliberately*
            keep the Confirm button enabled so the user can tap it and
            see the invalid styling on the ack row. We then swallow
            the click in capture phase so `BookingFlowMobile`'s
            document-level NAV_FORWARD handler never sees it and the
            flow doesn't advance. The button is only truly disabled
            when there's nothing to confirm yet (no slot picked, or
            the slot is already locked by another booking). */}
        {attemptedConfirm &&
          !canContinueScheduling(selectedDate, selectedSlotId, accessMethod) &&
          !lockedByOther && (
          <div
            className="mb-3 flex items-start gap-2 rounded-xl border p-3 text-[12px] font-medium"
            style={{ color: ERROR_PURPLE, borderColor: ERROR_PURPLE, backgroundColor: "rgba(151,71,255,0.04)" }}
          >
            <AlertCircle className="h-4 w-4 mt-px shrink-0" />
            <span>Please select a service window to continue.</span>
          </div>
        )}
        <span
          onClickCapture={(e) => {
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
              !canContinueScheduling(selectedDate, selectedSlotId, accessMethod) ||
              !!lockedByOther
            }
            aria-disabled={String(!canConfirm)}
            data-testid="button-continue-mobile"
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-full px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: BRAND }}
          >
            Confirm
            <ArrowRight className="h-4 w-4" />
          </button>
        </span>
      </div>
      {termsOpen && (
        <CancellationTermsModal mode="pre_order" onClose={() => setTermsOpen(false)} />
      )}
    </div>
  );
}

function SlotCard({
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
      data-testid={`mobile-slot-${slot.id}`}
      aria-pressed={isSelected}
      className={`relative flex flex-col items-start gap-1 rounded-xl border px-3 py-2.5 text-left transition ${
        disabled
          ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
          : isSelected
            ? "shadow-sm"
            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
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
