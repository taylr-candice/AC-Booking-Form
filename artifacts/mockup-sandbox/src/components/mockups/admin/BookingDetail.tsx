/**
 * Booking detail view — shows the customer/unit/AC config + payment &
 * service timelines for a single booking, and lets the admin advance
 * the service status or edit notes.
 *
 * Bookings flagged `isLive` (the row mirroring the customer's current
 * session) are read-only here; the customer flow is the source of truth.
 */

import {
  CalendarClock,
  ChevronLeft,
  PhoneOutgoing,
  ReceiptText,
  RotateCcw,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";

import {
  bookerAgencyName,
  getBuildingForUnit,
  getRolloutById,
  requiresTenantCoordination,
  SERVICE_STATUS_FLOW,
  type AdminAgent,
  type AdminBooking,
  type AdminUnit,
  type ServiceStatus,
} from "@/state/adminMockData";

import { Card, Field } from "./atoms";
import { CancelBookingModal } from "./CancelBookingModal";
import { LastChasedChip, PaymentChip, ServiceChip, SlotCell, WaitingChip } from "./chips";
import { RescheduleBookingModal } from "./RescheduleBookingModal";
import { BRAND, BRAND_DEEP, BRAND_SOFT } from "./theme";

/**
 * Outcome of {@link AdminApp.undoCancelBooking} — re-declared here as
 * a structural type so {@link BookingDetail} doesn't have to import
 * the helper. `restored` is silent (the row updates in place) and
 * `slot_taken` opens the pivot dialog with the conflicting booker's
 * details so the admin knows who's holding the slot now.
 */
export type UndoCancelResult =
  | { kind: "no_op" }
  | { kind: "restored" }
  | {
      kind: "slot_taken";
      takenBy: {
        name: string;
        role: AdminBooking["bookerRole"];
        /** May be `null` when the winning booking is itself an
         *  awaiting-coordination row that doesn't yet have a concrete
         *  date — the pivot dialog handles the missing-slot copy. */
        date: AdminBooking["serviceDate"];
        slot: AdminBooking["serviceSlot"];
      };
    };

export function BookingDetail({
  bookingId,
  bookings,
  units,
  agents,
  onBack,
  onUpdate,
  onCancelBooking,
  onRescheduleBooking,
  onScheduleCoordination,
  onUndoCancelBooking,
  onUndoCancelBookingAndReschedule,
  onAcknowledgeSupersede,
}: {
  bookingId: string;
  bookings: AdminBooking[];
  units: AdminUnit[];
  agents: AdminAgent[];
  onBack: () => void;
  onUpdate: (id: string, patch: Partial<AdminBooking>) => void;
  /** Permanently mark a booking cancelled with a mandatory note.
   *  Wired by `AdminApp` — the live demo row never reaches this. */
  onCancelBooking: (id: string, note: string) => void;
  /** Move a booking's slot. Reused capacity helpers ensure the rollout
   *  view stays in sync. Note is OPTIONAL per spec T007 — only cancel
   *  (T006) requires a note. */
  onRescheduleBooking: (
    id: string,
    date: string,
    window: "morning" | "afternoon",
    note?: string,
  ) => void;
  /** Open the "Schedule appointment" modal for a coordination booking.
   *  Optional so screens that don't yet support scheduling can omit it. */
  onScheduleCoordination?: (id: string) => void;
  /** Reverse a cancellation — re-runs the uniqueness check and either
   *  restores the booking on the spot or returns a "slot_taken" verdict
   *  so the UI can pivot to the reschedule picker. Optional so screens
   *  that don't expose this affordance (none currently) can omit it. */
  onUndoCancelBooking?: (id: string) => UndoCancelResult;
  /** Companion to {@link onUndoCancelBooking}: when the original slot
   *  was given away, this restores the booking AT a freshly picked
   *  slot in one mutation. */
  onUndoCancelBookingAndReschedule?: (
    id: string,
    date: string,
    window: "morning" | "afternoon",
  ) => void;
  /** Admin-records the corresponding invoice has been voided in the
   *  billing system. Drives the prominent "void this invoice" alert
   *  shown when `supersededByBookingId` is set. Optional so older
   *  call-sites that don't yet thread it remain valid. */
  onAcknowledgeSupersede?: (id: string) => void;
}) {
  const booking = bookings.find((b) => b.id === bookingId);
  const [notes, setNotes] = useState(booking?.notes ?? "");
  // Modal open state — reset whenever the active booking changes so a
  // stale modal can't end up bound to a different booking after the
  // admin clicks back and into another row.
  const [showCancel, setShowCancel] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);
  // Undo-cancel pivot: when the original slot was given away while
  // the booking sat cancelled, we surface the conflict here so the
  // admin can choose to open the reschedule picker instead. `null`
  // means no conflict is being shown.
  const [undoConflict, setUndoConflict] = useState<
    Extract<UndoCancelResult, { kind: "slot_taken" }>["takenBy"] | null
  >(null);
  // When the admin clicks "Open Reschedule" on the pivot dialog, we
  // open the existing reschedule modal in "undo" mode so its confirm
  // button atomically restores AND reschedules.
  const [showUndoReschedule, setShowUndoReschedule] = useState(false);
  useEffect(() => {
    setShowCancel(false);
    setShowReschedule(false);
    setUndoConflict(null);
    setShowUndoReschedule(false);
  }, [bookingId]);

  // Whenever the selected booking changes, pull the freshest notes value.
  useEffect(() => {
    setNotes(booking?.notes ?? "");
  }, [booking?.id, booking?.notes]);

  if (!booking) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="text-slate-700">
          That booking is no longer available.{" "}
          <button
            type="button"
            onClick={onBack}
            className="font-semibold underline"
            style={{ color: BRAND }}
          >
            Back to list
          </button>
        </div>
      </div>
    );
  }

  const unit = units.find((u) => u.id === booking.unitId) ?? null;
  const agent = unit?.agentId ? agents.find((a) => a.id === unit.agentId) ?? null : null;
  const currentIdx = SERVICE_STATUS_FLOW.indexOf(booking.serviceStatus);
  const nextStatus =
    currentIdx >= 0 && currentIdx < SERVICE_STATUS_FLOW.length - 1
      ? SERVICE_STATUS_FLOW[currentIdx + 1]
      : null;
  const isCancelled = booking.serviceStatus === "cancelled";
  // Cancel + Reschedule are disabled for the live demo row (the
  // customer flow owns it) and for already-cancelled bookings.
  // Reschedule additionally needs a rollout + a concrete current
  // slot — coordination bookings (`to_be_coordinated`) reschedule via
  // the awaiting-coordination flow instead.
  const canCancel = !booking.isLive && !isCancelled;
  const canReschedule =
    !booking.isLive &&
    !isCancelled &&
    !!booking.rolloutId &&
    (booking.serviceSlot === "morning" || booking.serviceSlot === "afternoon");
  // Undo cancellation is only relevant for cancelled rows. The live
  // demo row's lifecycle is owned by the customer flow, so we never
  // expose admin-side undo for it.
  const canUndoCancel =
    !booking.isLive && isCancelled && !!onUndoCancelBooking;

  function advanceStatus() {
    if (!nextStatus || !booking) return;
    const newEntry = {
      status: nextStatus,
      label: nextStatusLabel(nextStatus),
      at: "Just now",
      by: "Mia (admin)",
    };
    onUpdate(booking.id, {
      serviceStatus: nextStatus,
      serviceTimeline: [...booking.serviceTimeline, newEntry],
    });
  }

  function saveNotes() {
    if (!booking) return;
    onUpdate(booking.id, { notes });
  }

  /**
   * Record a chase: stamp `lastContactedAt` with the current ISO time
   * and append a service-timeline marker so the audit trail captures
   * who chased and when. Called from the Schedule card affordance —
   * disabled for the live demo row (read-only) and for cancelled rows
   * (no point chasing a closed booking).
   */
  function markAsChased() {
    if (!booking) return;
    const nowIso = new Date().toISOString();
    const newEntry = {
      status: "chased",
      label: "Marked as chased",
      at: "Just now",
      by: "Mia (admin)",
    };
    onUpdate(booking.id, {
      lastContactedAt: nowIso,
      serviceTimeline: [...booking.serviceTimeline, newEntry],
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {booking.supersededByBookingId && onAcknowledgeSupersede && (
        <SupersedeAlert
          booking={booking}
          onAcknowledge={() => onAcknowledgeSupersede(booking.id)}
        />
      )}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-600 hover:text-slate-900"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to list
        </button>
        <div className="flex items-center gap-2">
          {booking.isLive && (
            <span
              className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider"
              style={{ backgroundColor: BRAND, color: "white" }}
            >
              Live demo
            </span>
          )}
          {canUndoCancel && (
            <button
              type="button"
              onClick={() => {
                if (!onUndoCancelBooking) return;
                const result = onUndoCancelBooking(booking.id);
                if (result.kind === "slot_taken") {
                  setUndoConflict(result.takenBy);
                }
                // "restored" + "no_op" need no further UI — the row
                // re-renders and the button drops off (or stays
                // disabled) on its own.
              }}
              data-testid="button-undo-cancel"
              className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold transition hover:brightness-95"
              style={{ borderColor: BRAND, color: BRAND_DEEP, backgroundColor: BRAND_SOFT }}
              title="Reverse this cancellation if the slot is still free"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Undo cancellation
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowReschedule(true)}
            disabled={!canReschedule}
            data-testid="button-open-reschedule"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
            title={
              booking.isLive
                ? "Live demo row is read-only"
                : isCancelled
                  ? "Cancelled bookings can't be rescheduled"
                  : !booking.rolloutId
                    ? "No rollout linked"
                    : ""
            }
          >
            <CalendarClock className="h-3.5 w-3.5" />
            Reschedule
          </button>
          <button
            type="button"
            onClick={() => setShowCancel(true)}
            disabled={!canCancel}
            data-testid="button-open-cancel"
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
            title={
              booking.isLive
                ? "Live demo row is read-only"
                : isCancelled
                  ? "Already cancelled"
                  : ""
            }
          >
            <XCircle className="h-3.5 w-3.5" />
            Cancel
          </button>
          {nextStatus ? (
            <button
              type="button"
              onClick={advanceStatus}
              disabled={booking.isLive || isCancelled}
              className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white transition ${
                booking.isLive || isCancelled ? "cursor-not-allowed opacity-50" : "hover:brightness-110"
              }`}
              style={{ backgroundColor: BRAND }}
              title={
                booking.isLive
                  ? "Live demo row is read-only"
                  : isCancelled
                    ? "Cancelled bookings can't be advanced"
                    : ""
              }
            >
              Advance to "{nextStatusLabel(nextStatus)}"
            </button>
          ) : (
            <span className="text-[12px] font-semibold text-slate-500">
              {isCancelled ? "Cancelled" : "Service complete"}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Left column: customer, unit, agent, AC config */}
        <div className="col-span-2 flex flex-col gap-4">
          <Card>
            <div className="grid grid-cols-3 gap-4">
              <Field label="Booking ID" value={booking.id} />
              <Field
                label="Booker"
                value={booking.bookerRole === "agent" ? "Agent" : "Owner"}
              />
              <Field label="Total" value={`$${booking.totalAud.toFixed(2)}`} />
            </div>
            <BookerBlock booking={booking} />
          </Card>

          {requiresTenantCoordination(booking) && (
            <Card
              title="Tenant details"
              subtitle="Taylr will coordinate scheduling with these tenants"
            >
              <TenantList tenants={booking.tenants} />
            </Card>
          )}

          <Card title="Unit">
            {unit ? (
              <div>
                <div className="text-[14px] font-semibold text-slate-900">
                  {unit.addressLine1}
                </div>
                <div className="text-[12px] text-slate-500">{unit.addressLine2}</div>
                {(() => {
                  const building = getBuildingForUnit(unit);
                  const rollout = getRolloutById(booking.rolloutId);
                  if (!building && !rollout) return null;
                  return (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {building && (
                        <div
                          className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold"
                          style={{
                            backgroundColor: BRAND_SOFT,
                            color: BRAND_DEEP,
                          }}
                        >
                          {building.name}
                        </div>
                      )}
                      {rollout ? (
                        <div
                          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700"
                          title="Rollout this booking is placed against"
                        >
                          Rollout · {rollout.name}
                        </div>
                      ) : (
                        <div
                          className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-500"
                          title="Booking predates the rollouts feature"
                        >
                          No rollout linked
                        </div>
                      )}
                    </div>
                  );
                })()}
                {agent && (
                  <div className="mt-3 rounded-lg bg-slate-50 p-3 text-[12px] text-slate-700">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">
                      Managing agency
                    </div>
                    <div className="font-medium">{agent.company}</div>
                    <div className="text-[11px] text-slate-500">
                      Booker contact details are on the booking — see the
                      Customer card.
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-slate-500">Unit not found.</div>
            )}
          </Card>

          <Card
            title="AC config"
            subtitle="What's on record vs what the customer chose"
          >
            <AcDiscrepancyBlock booking={booking} unit={unit} />
          </Card>

          <Card title="Notes">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={saveNotes}
              disabled={booking.isLive}
              rows={3}
              placeholder="Add internal notes for the technician or future bookings…"
              className="w-full rounded-lg border border-slate-200 bg-white p-3 text-[13px] text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
            />
            <div className="mt-1 text-[11px] text-slate-400">
              {booking.isLive
                ? "Live demo row — notes are read-only."
                : "Saves on blur (mockup only)."}
            </div>
          </Card>
        </div>

        {/* Right column: timelines */}
        <div className="flex flex-col gap-4">
          <Card title="Schedule">
            <SlotCell booking={booking} />
            {booking.serviceSlot === "to_be_coordinated" && (
              <div className="mt-3 flex flex-col items-start gap-2">
                <WaitingChip createdAt={booking.createdAt} />
                <LastChasedChip lastContactedAt={booking.lastContactedAt} />
                {!booking.isLive && !isCancelled && (
                  <button
                    type="button"
                    onClick={markAsChased}
                    data-testid="button-mark-chased"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
                    title="Stamp 'last contacted' with the current time and add a marker to the service timeline."
                  >
                    <PhoneOutgoing className="h-3.5 w-3.5" />
                    Mark as chased
                  </button>
                )}
                {!booking.isLive && onScheduleCoordination && (
                  <button
                    type="button"
                    onClick={() => onScheduleCoordination(booking.id)}
                    className="inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm transition hover:brightness-110"
                    style={{ backgroundColor: BRAND }}
                  >
                    Schedule appointment
                  </button>
                )}
              </div>
            )}
          </Card>
          <Card title="Payment timeline">
            <Timeline
              entries={booking.paymentTimeline}
              accent={booking.paymentStatus === "paid" ? "#16A34A" : BRAND}
            />
            <div className="mt-3">
              <PaymentChip status={booking.paymentStatus} />
            </div>
          </Card>
          <Card title="Service timeline">
            <Timeline entries={booking.serviceTimeline} accent={BRAND} />
            <div className="mt-3">
              <ServiceChip status={booking.serviceStatus} />
            </div>
          </Card>
        </div>
      </div>
      {showCancel && (
        <CancelBookingModal
          booking={booking}
          onConfirm={(note) => {
            onCancelBooking(booking.id, note);
            setShowCancel(false);
          }}
          onDismiss={() => setShowCancel(false)}
        />
      )}
      {showReschedule && (
        <RescheduleBookingModal
          booking={booking}
          onConfirm={(date, window, note) => {
            onRescheduleBooking(booking.id, date, window, note);
            setShowReschedule(false);
          }}
          onDismiss={() => setShowReschedule(false)}
        />
      )}
      {undoConflict && (
        <UndoConflictDialog
          takenBy={undoConflict}
          onOpenReschedule={() => {
            setUndoConflict(null);
            setShowUndoReschedule(true);
          }}
          onDismiss={() => setUndoConflict(null)}
        />
      )}
      {showUndoReschedule && onUndoCancelBookingAndReschedule && (
        <RescheduleBookingModal
          booking={booking}
          mode="undo"
          onConfirm={(date, window) => {
            onUndoCancelBookingAndReschedule(booking.id, date, window);
            setShowUndoReschedule(false);
          }}
          onDismiss={() => setShowUndoReschedule(false)}
        />
      )}
    </div>
  );
}

/**
 * Pivot dialog shown when "Undo cancellation" detects the original
 * slot has been given away. Tells the admin who's holding the slot
 * now (so they have a defensible answer if the customer calls in)
 * and lets them open the reschedule picker to put the booking back
 * on the calendar somewhere else.
 *
 * Kept inline (rather than a separate file) because it only exists
 * to support the undo flow on this screen and has no reusable
 * surface area.
 */
function UndoConflictDialog({
  takenBy,
  onOpenReschedule,
  onDismiss,
}: {
  takenBy: Extract<UndoCancelResult, { kind: "slot_taken" }>["takenBy"];
  onOpenReschedule: () => void;
  onDismiss: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onDismiss();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  // Coordination bookings can win the slot too, in which case they
  // don't have a real date / window — fall back to a softer phrase
  // so the admin still gets the actionable info.
  const slotLabel =
    takenBy.slot === "morning" || takenBy.slot === "afternoon"
      ? `${takenBy.date} · ${takenBy.slot}`
      : "an awaiting-coordination booking";
  const roleLabel = takenBy.role === "agent" ? "agent" : "owner";

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 p-6"
      data-testid="modal-undo-conflict"
      role="dialog"
      aria-modal="true"
      aria-labelledby="undo-conflict-title"
    >
      <div className="flex w-full max-w-md flex-col rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-start gap-2.5">
            <div
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
              style={{ backgroundColor: BRAND_SOFT, color: BRAND_DEEP }}
            >
              <TriangleAlert className="h-4 w-4" />
            </div>
            <div>
              <div
                id="undo-conflict-title"
                className="text-[15px] font-semibold text-slate-900"
              >
                That slot was given away
              </div>
              <div className="mt-0.5 text-[12px] text-slate-500">
                Original slot is no longer available
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 px-5 py-4 text-[13px] leading-relaxed text-slate-600">
          <p>
            <span className="font-semibold text-slate-900">{takenBy.name}</span>{" "}
            ({roleLabel}) has booked{" "}
            <span className="font-semibold text-slate-900">{slotLabel}</span>{" "}
            on the unit while this booking sat cancelled, so the original
            slot can't be reclaimed.
          </p>
          <p>
            Open the reschedule picker to restore this booking on a different
            date or window — capacity will be consumed at the new slot only.
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <button
            type="button"
            onClick={onDismiss}
            data-testid="button-undo-conflict-dismiss"
            className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-slate-600 hover:bg-slate-100"
          >
            Leave cancelled
          </button>
          <button
            type="button"
            onClick={onOpenReschedule}
            data-testid="button-undo-conflict-open-reschedule"
            className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white transition hover:brightness-110"
            style={{ backgroundColor: BRAND }}
          >
            Open Reschedule
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * "This invoice still needs voiding" alert.
 *
 * Shown at the top of the booking detail whenever
 * {@link AdminBooking.supersededByBookingId} is set. The detail screen
 * is where an admin lands from the dashboard banner; this alert
 * restates the situation in context (which booking won the unit, the
 * outstanding amount) and exposes a single explicit "Record invoice
 * void" action. Clicking it fires `onAcknowledge` (which clears the
 * flag and stamps the service timeline), so the alert disappears and
 * the dashboard banner row drops off.
 */
function SupersedeAlert({
  booking,
  onAcknowledge,
}: {
  booking: AdminBooking;
  onAcknowledge: () => void;
}) {
  return (
    <div
      className="flex flex-wrap items-start gap-3 rounded-xl border p-4"
      style={{ borderColor: BRAND, backgroundColor: BRAND_SOFT }}
      data-testid="alert-supersede"
    >
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: "white", color: BRAND_DEEP }}
      >
        <ReceiptText className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div
          className="text-[13px] font-bold uppercase tracking-wider"
          style={{ color: BRAND_DEEP }}
        >
          Void this customer's invoice in billing
        </div>
        <p className="mt-0.5 text-[12px] text-slate-700">
          This booking was auto-cancelled when{" "}
          <strong>{booking.supersededByBookingId}</strong> paid for the
          same unit first. The customer's invoice for{" "}
          <strong>${booking.totalAud.toFixed(2)}</strong> is still open
          in your billing system — confirm it's been voided, then record
          it here so this alert clears.
        </p>
      </div>
      <button
        type="button"
        onClick={onAcknowledge}
        className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white transition hover:brightness-110"
        style={{ backgroundColor: BRAND }}
        data-testid="alert-supersede-acknowledge"
      >
        Record invoice void
      </button>
    </div>
  );
}

/**
 * Booker block — sits in the booking-summary card under the
 * Booking ID / Booker / Total trio.
 *
 * Owner bookings show the contact details directly. Agent bookings
 * lead with the agency name (the company on the hook for the booking)
 * and fall back to the contact name if no agency was captured. The
 * contact at the agency is shown beneath, so the admin always knows
 * who to call.
 */
function BookerBlock({ booking }: { booking: AdminBooking }) {
  if (booking.bookerRole === "agent") {
    const agency = bookerAgencyName(booking);
    return (
      <div className="mt-4 grid grid-cols-3 gap-4 border-t border-slate-100 pt-4">
        {agency ? (
          <Field label="Agency" value={agency} />
        ) : (
          <Field label="Agency" value="Not provided" />
        )}
        <Field label="Agent contact" value={booking.customerName} />
        <span aria-hidden />
        <Field label="Email" value={booking.customerEmail} />
        <Field label="Phone" value={booking.customerPhone} />
      </div>
    );
  }
  return (
    <div className="mt-4 grid grid-cols-3 gap-4 border-t border-slate-100 pt-4">
      <Field label="Owner" value={booking.customerName} />
      <Field label="Email" value={booking.customerEmail} />
      <Field label="Phone" value={booking.customerPhone} />
    </div>
  );
}

/**
 * Tenants list shown only for tenant-coordinated access methods.
 * Renders a small contact card per tenant; falls back to a placeholder
 * if the booking somehow has no captured tenants (live demo can hit
 * this path mid-flow before Step 5 is filled in).
 */
function TenantList({
  tenants,
}: {
  tenants: AdminBooking["tenants"];
}) {
  if (tenants.length === 0) {
    return (
      <div className="text-[13px] text-slate-500">
        No tenants captured yet — Taylr will follow up with the booker.
      </div>
    );
  }
  return (
    <ol className="flex flex-col gap-3">
      {tenants.map((t, i) => {
        const fullName = `${t.first} ${t.last}`.trim() || `Tenant ${i + 1}`;
        return (
          <li
            key={`${t.email}-${i}`}
            className="rounded-lg bg-slate-50 p-3 text-[12px] text-slate-700"
          >
            <div className="text-[10px] uppercase tracking-wider text-slate-500">
              Tenant {i + 1}
            </div>
            <div className="mt-0.5 font-medium text-slate-900">{fullName}</div>
            <div className="text-slate-500">
              {t.email || "—"} · {t.phone || "—"}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function nextStatusLabel(s: ServiceStatus): string {
  switch (s) {
    case "scheduled":
      return "Scheduled";
    case "en_route":
      return "En route";
    case "on_site":
      return "On site";
    case "complete":
      return "Complete";
    case "invoice_adjusted":
      return "Invoice adjusted";
    case "cancelled":
      // Not reachable from the SERVICE_STATUS_FLOW walk — included so the
      // exhaustive switch type-checks. The Cancel affordance writes its
      // own timeline entry directly.
      return "Cancelled";
  }
}

function AcDiscrepancyBlock({
  booking,
  unit,
}: {
  booking: AdminBooking;
  unit: AdminUnit | null;
}) {
  const recordedSummary = unit
    ? unit.ac.type === "unknown"
      ? "No record on file"
      : `${unit.ac.type} · ${unit.ac.systems} system${unit.ac.systems === 1 ? "" : "s"}${
          unit.ac.additional > 0 ? ` + ${unit.ac.additional} extra` : ""
        }`
    : "—";
  const customerSummary =
    booking.acType === "unsure"
      ? "Customer wasn't sure"
      : `${booking.acType} · ${booking.systems} system${booking.systems === 1 ? "" : "s"}${
          booking.additional > 0 ? ` + ${booking.additional} extra` : ""
        }`;
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="text-[10px] uppercase tracking-wider text-slate-500">
          On record
        </div>
        <div className="mt-1 text-[13px] font-medium capitalize text-slate-900">
          {recordedSummary}
        </div>
      </div>
      <div
        className="rounded-lg border p-3"
        style={
          booking.discrepancy
            ? { borderColor: BRAND, backgroundColor: BRAND_SOFT }
            : { borderColor: "#E2E8F0", backgroundColor: "#F8FAFC" }
        }
      >
        <div
          className="flex items-center justify-between text-[10px] uppercase tracking-wider"
          style={{ color: booking.discrepancy ? BRAND_DEEP : "#64748B" }}
        >
          <span>Customer chose</span>
          {booking.discrepancy && (
            <span className="inline-flex items-center gap-1 font-bold">
              <TriangleAlert className="h-2.5 w-2.5" />
              Mismatch
            </span>
          )}
        </div>
        <div
          className="mt-1 text-[13px] font-medium capitalize"
          style={{ color: booking.discrepancy ? BRAND_DEEP : "#0F172A" }}
        >
          {customerSummary}
        </div>
      </div>
      {booking.discrepancy && (
        <div
          className="col-span-2 rounded-lg border p-3 text-[12px]"
          style={{ borderColor: BRAND, backgroundColor: "white", color: BRAND_DEEP }}
        >
          <strong>Action:</strong> confirm head count on arrival and update the
          unit's AC record so future pre-fill is accurate.
        </div>
      )}
    </div>
  );
}

function Timeline({
  entries,
  accent,
}: {
  entries: { status: string; label: string; at: string; by: string }[];
  accent: string;
}) {
  if (entries.length === 0) {
    return <div className="text-[12px] text-slate-500">No events yet.</div>;
  }
  return (
    <ol className="flex flex-col gap-3">
      {entries.map((e, i) => (
        <li key={i} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span
              className="block h-2 w-2 rounded-full"
              style={{ backgroundColor: accent }}
            />
            {i < entries.length - 1 && (
              <span className="mt-0.5 flex-1 w-px bg-slate-200" />
            )}
          </div>
          <div className="-mt-0.5 flex-1 pb-1">
            <div className="text-[12px] font-medium text-slate-900">{e.label}</div>
            <div className="text-[11px] text-slate-500">
              {e.at} · {e.by}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
