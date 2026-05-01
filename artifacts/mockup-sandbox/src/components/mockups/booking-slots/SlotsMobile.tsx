import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Sunrise,
  Sun,
  Moon,
  CheckCircle2,
  Lock,
} from "lucide-react";

import { getBookingDurationMinutes } from "../../../state/bookingDerived";
import {
  bookingActions,
  useBookingSession,
} from "../../../state/bookingSession";
import { CANCELLATION_ACK_LABEL } from "../../../state/bookingHelpers";
import { CancellationTermsModal } from "../booking-pages/CancellationTermsModal";
import { findNextAvailable, type CustomerSlot } from "./customerSlotData";
import { useCustomerSlotPicker } from "./useCustomerSlotPicker";
import { TermsAckRow } from "./TermsAckRow";
import { SlotsAccessBanner } from "./SlotsAccessBanner";
import { SlotsAccessNotesDisclosure } from "./SlotsAccessNotesDisclosure";
import { CustomerAvailableDays } from "./CustomerAvailableDays";
import { NextAvailableCard } from "./NextAvailableCard";

const BRAND = "#ED017F";
const SELECTED_PINK_BG = "#FCE7F3";
const SELECTED_PINK_TEXT = "#0F172A";
const SELECTED_PINK_BORDER = "#ED017F";

type Slot = CustomerSlot;

export function SlotsMobile() {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [termsOpen, setTermsOpen] = useState(false);
  const session = useBookingSession();
  const jobMinutes = getBookingDurationMinutes(session);
  const accessMethod = session.access_method;
  // Cancellation ack moved here from Pay (Task #121). Reads/writes the
  // existing `cancellation_acknowledged` boolean on the session store —
  // single source of truth, unchanged across the rest of the flow.
  const cancellationAck = session.cancellation_acknowledged;

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
    !!selectedSlotId && !lockedByOther && cancellationAck;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-white font-['Inter']">
      {/* Page header */}
      <div className="flex items-start justify-between px-5 pb-4 pt-5">
        <div>
          <h1 className="text-[26px] font-semibold leading-tight text-slate-900">
            Schedule
          </h1>
          <div className="mt-0.5 text-xs text-slate-500">Pick a service slot</div>
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
        {/* Section header */}
        <div className="mb-2 mt-1">
          <h2 className="text-[15px] font-semibold text-slate-900">
            Available windows
          </h2>
        </div>

        {/* Top-of-page notification: explains the slot is a window
            (not a fixed time), with an inline Change-access prompt
            for be-there methods. Replaces the earlier be-there ack
            checkbox. */}
        <SlotsAccessBanner
          accessMethod={accessMethod}
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
                  testIdSuffix="mobile"
                />
              </div>
            )}

            {nextAvailable && (
              <div
                className="mt-3 mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500"
                data-testid="label-choose-another-day-mobile"
              >
                Or choose another day
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

            {/* Window reveal — only after a day is picked. */}
            {activeDay && (
              <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
                <div className="mb-2 text-[12px] font-medium text-slate-500">
                  {activeDay.weekday} {activeDay.day} {activeDay.month} ·
                  pick a window
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <SlotCard
                    slot={activeDay.morning}
                    icon={<Sunrise className="h-4 w-4" />}
                    label="Morning"
                    hint={activeDay.morning.timeLabel}
                    selected={selectedSlotId === activeDay.morning.id}
                    onClick={() => setSelectedSlotId(activeDay.morning.id)}
                  />
                  <SlotCard
                    slot={activeDay.afternoon}
                    icon={<Sun className="h-4 w-4" />}
                    label="Afternoon"
                    hint={activeDay.afternoon.timeLabel}
                    selected={selectedSlotId === activeDay.afternoon.id}
                    onClick={() => setSelectedSlotId(activeDay.afternoon.id)}
                  />
                  {activeDay.evening && (
                    <SlotCard
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
          onChange={(next) =>
            bookingActions.setCancellationAcknowledged(next)
          }
          label={CANCELLATION_ACK_LABEL}
          onViewTerms={() => setTermsOpen(true)}
          ackTestId="checkbox-cancellation-ack-mobile"
          rowTestId="cancellation-ack-row-mobile"
          viewTermsTestId="button-view-cancellation-terms-mobile"
          size="compact"
        />
        <button
          type="button"
          disabled={!canConfirm}
          data-testid="button-continue-mobile"
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-full px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition disabled:opacity-50"
          style={{ backgroundColor: BRAND }}
        >
          Confirm
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
      {termsOpen && (
        <CancellationTermsModal onClose={() => setTermsOpen(false)} />
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
              borderColor: SELECTED_PINK_BORDER,
              backgroundColor: SELECTED_PINK_BG,
              color: SELECTED_PINK_TEXT,
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
              : { color: BRAND }
          }
        >
          {icon}
        </div>
        {isSelected && (
          <CheckCircle2 className="h-3.5 w-3.5" style={{ color: BRAND }} />
        )}
      </div>
      <div className="text-[13px] font-semibold">{label}</div>
      <div
        className={`text-[10px] ${disabled ? "text-slate-400" : isSelected ? "" : "text-slate-500"}`}
        style={isSelected ? { color: SELECTED_PINK_TEXT, opacity: 0.85 } : undefined}
      >
        {hint}
      </div>
    </button>
  );
}
