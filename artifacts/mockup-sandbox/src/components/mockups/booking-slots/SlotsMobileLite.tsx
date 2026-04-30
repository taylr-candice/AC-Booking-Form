import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Sunrise,
  Sun,
  Moon,
  Pencil,
  CheckCircle2,
  Lock,
} from "lucide-react";

import { getBookingDurationMinutes } from "../../../state/bookingDerived";
import { useBookingSession } from "../../../state/bookingSession";
import { isBeThereMethod } from "../../../state/accessMethodCatalog";
import {
  accessRecapLabel,
  dayHasAvailable,
  dayWindows,
  type CustomerDay,
  type CustomerSlot,
  WINDOW_TIME_RANGE,
} from "./customerSlotData";
import { useCustomerSlotPicker } from "./useCustomerSlotPicker";

const BRAND = "#ED017F";
const SELECTED_GREEN = "#5FBB97";

type Slot = CustomerSlot;
type Day = CustomerDay;

export function SlotsMobileLite() {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [ack, setAck] = useState(false);
  const session = useBookingSession();
  const jobMinutes = getBookingDurationMinutes(session);
  const accessMethod = session.access_method;
  const beThere = isBeThereMethod(accessMethod);
  const recapLabel = accessRecapLabel(accessMethod);

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

  // Clear the be-there ack the moment the shared hook drops the
  // selected slot (rollout shifted, job grew, etc.) so Confirm can't
  // re-enable on a stale ack.
  useEffect(() => {
    if (!selectedSlotId) setAck(false);
  }, [selectedSlotId]);

  useEffect(() => {
    if (selectedDate && !activeDay) {
      setSelectedDate(null);
      setSelectedSlotId(null);
      setAck(false);
    }
  }, [selectedDate, activeDay, setSelectedSlotId]);

  const canConfirm =
    !!selectedSlotId && !lockedByOther && (!beThere || ack);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-white font-['Inter']">
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

      <div className="flex-1 overflow-y-auto px-5 pb-6">
        <div className="mb-2 mt-1 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold" style={{ color: BRAND }}>
            Available Slots
          </h2>
          <button type="button" aria-label="Edit" className="rounded p-1 text-slate-500 hover:text-slate-900">
            <Pencil className="h-4 w-4" />
          </button>
        </div>

        {/* Compact access recap. */}
        <div className="mb-4 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-700">
          <div>
            <span className="text-slate-500">Access:</span>{" "}
            <span className="font-medium text-slate-900">{recapLabel}</span>
          </div>
          <button
            type="button"
            data-testid="button-change-access"
            className="font-semibold underline underline-offset-2 hover:opacity-80"
            style={{ color: BRAND }}
          >
            Change
          </button>
        </div>

        {!rollout ? (
          <div
            className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900"
            data-testid="empty-no-rollout-mobile-lite"
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
            data-testid="banner-locked-by-other-mobile-lite"
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
                    data-testid="link-locked-support-email-mobile-lite"
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
            <div className="grid grid-cols-4 gap-2">
              {visibleDays.map((d) => (
                <DayCard
                  key={d.date}
                  day={d}
                  selected={d.date === selectedDate}
                  onClick={() => {
                    setSelectedDate(d.date);
                    setSelectedSlotId(null);
                    setAck(false);
                  }}
                />
              ))}
            </div>

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
                    hint={WINDOW_TIME_RANGE.morning}
                    selected={selectedSlotId === activeDay.morning.id}
                    onClick={() => {
                      setSelectedSlotId(activeDay.morning.id);
                      setAck(false);
                    }}
                  />
                  <SlotCard
                    slot={activeDay.afternoon}
                    icon={<Sun className="h-4 w-4" />}
                    label="Afternoon"
                    hint={WINDOW_TIME_RANGE.afternoon}
                    selected={selectedSlotId === activeDay.afternoon.id}
                    onClick={() => {
                      setSelectedSlotId(activeDay.afternoon.id);
                      setAck(false);
                    }}
                  />
                  {activeDay.evening && (
                    <SlotCard
                      slot={activeDay.evening}
                      icon={<Moon className="h-4 w-4" />}
                      label="Evening"
                      hint={WINDOW_TIME_RANGE.evening}
                      selected={selectedSlotId === activeDay.evening.id}
                      onClick={() => {
                        setSelectedSlotId(activeDay.evening!.id);
                        setAck(false);
                      }}
                    />
                  )}
                </div>

                {beThere && selectedSlotId && (
                  <label
                    className="mt-3 flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-700"
                    data-testid="ack-row-mobile-lite"
                  >
                    <input
                      type="checkbox"
                      checked={ack}
                      onChange={(e) => setAck(e.target.checked)}
                      className="mt-0.5 h-3.5 w-3.5 cursor-pointer"
                      style={{ accentColor: BRAND }}
                      data-testid="ack-checkbox-mobile-lite"
                    />
                    <span>I'll be available for the entire window.</span>
                  </label>
                )}
              </div>
            )}

            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-[11px] text-slate-500">
              None of these work? Call us on{" "}
              <span className="font-medium" style={{ color: BRAND }}>
                1300 TAYLR
              </span>{" "}
              and we'll look at options outside your area's regular run.
            </div>
          </>
        )}
      </div>

      <div className="border-t border-slate-100 bg-white px-5 py-3">
        <button
          type="button"
          disabled={!canConfirm}
          data-testid="button-continue-mobile"
          className="flex w-full items-center justify-center gap-2 rounded-full px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition disabled:opacity-50"
          style={{ backgroundColor: BRAND }}
        >
          Confirm
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function DayCard({
  day,
  selected,
  onClick,
}: {
  day: Day;
  selected: boolean;
  onClick: () => void;
}) {
  const hasAvailable = dayHasAvailable(day);
  const disabled = !hasAvailable;
  const isSelected = selected && hasAvailable;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      data-testid={`day-card-${day.date}`}
      aria-pressed={isSelected}
      className={`flex flex-col items-center justify-center rounded-xl border py-2 transition ${
        disabled
          ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
          : isSelected
            ? "text-white shadow-sm"
            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
      }`}
      style={
        isSelected
          ? { borderColor: SELECTED_GREEN, backgroundColor: SELECTED_GREEN }
          : undefined
      }
    >
      <div
        className={`text-[10px] font-medium uppercase tracking-wide ${
          disabled ? "text-slate-400" : isSelected ? "text-white/85" : "text-slate-500"
        }`}
      >
        {day.weekday}
      </div>
      <div className="text-lg font-bold leading-tight">{day.day}</div>
      <div
        className={`text-[10px] ${
          disabled ? "text-slate-400" : isSelected ? "text-white/85" : "text-slate-500"
        }`}
      >
        {day.month}
      </div>
    </button>
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
            ? "text-white shadow-sm"
            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
      }`}
      style={
        isSelected
          ? { borderColor: SELECTED_GREEN, backgroundColor: SELECTED_GREEN }
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
