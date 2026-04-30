/**
 * Booking detail view — shows the customer/unit/AC config + payment &
 * service timelines for a single booking, and lets the admin advance
 * the service status or edit notes.
 *
 * Bookings flagged `isLive` (the row mirroring the customer's current
 * session) are read-only here; the customer flow is the source of truth.
 */

import {
  Building2,
  CalendarClock,
  ChevronLeft,
  Circle,
  KeyRound,
  Mail,
  Phone,
  ReceiptText,
  RotateCcw,
  TriangleAlert,
  Users,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";

import { accessOnTheDayDescription } from "@/state/accessMethodCatalog";
import {
  bookerAgencyName,
  CALL_TEMPLATE_CUSTOM_ID,
  CALL_TEMPLATE_CUSTOM_LABEL,
  CALL_TEMPLATES,
  coordinationContactForBooking,
  EMAIL_TEMPLATE_CUSTOM_ID,
  EMAIL_TEMPLATE_CUSTOM_LABEL,
  findDefaultCallTemplate,
  findDefaultEmailTemplate,
  isCustomCallTemplateLabel,
  isCustomEmailTemplateLabel,
  EMAIL_TEMPLATES,
  formatAttemptRecency,
  formatCoordinationWaiting,
  formatLastContacted,
  getBuildingForUnit,
  getRolloutById,
  latestCoordinationAttempt,
  requiresTenantCoordination,
  SERVICE_STATUS_FLOW,
  type AdminAgent,
  type AdminBooking,
  type AdminUnit,
  type CallTemplate,
  type CoordinationContact,
  type EmailTemplate,
  type ServiceStatus,
  type TimelineEntry,
} from "@/state/adminMockData";

import { Card, Field } from "./atoms";
import { CancelBookingModal } from "./CancelBookingModal";
import { PaymentChip, ServiceChip, SlotCell } from "./chips";
import { BRAND, BRAND_DEEP, BRAND_SOFT } from "./theme";
import { UndoConflictDialog, type UndoConflictTakenBy } from "./UndoConflictDialog";

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
  onScheduleCoordination,
  onRescheduleAppointment,
  onUndoCancelBooking,
  onUndoCancelBookingAndReschedule,
  onAcknowledgeSupersede,
  onLogCallToast,
  onLogEmailToast,
  onOpenTemplate,
  onPivotToBookingsFilteredByTemplate,
  emailTemplates = EMAIL_TEMPLATES,
  callTemplates = CALL_TEMPLATES,
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
  /** Open the shared Schedule/Reschedule modal in "schedule" mode for a
   *  coordination booking. Optional so screens that don't yet support
   *  scheduling can omit it. */
  onScheduleCoordination?: (id: string) => void;
  /** Open the shared Schedule/Reschedule modal in "reschedule" mode for
   *  an already-scheduled booking. Same picker as the new "Schedule
   *  appointment" modal, pre-selecting the current date/window. The
   *  AdminApp shell handles the capacity swap and timeline entry.
   *  Optional so screens that don't yet support reschedule can omit it. */
  onRescheduleAppointment?: (id: string) => void;
  /** Reverse a cancellation — re-runs the uniqueness check and either
   *  restores the booking on the spot or returns a "slot_taken" verdict
   *  so the UI can pivot to the reschedule picker. Optional so screens
   *  that don't expose this affordance (none currently) can omit it. */
  onUndoCancelBooking?: (id: string) => UndoCancelResult;
  /** Companion to {@link onUndoCancelBooking}: when the original slot
   *  was given away, this opens the shared Schedule/Reschedule modal in
   *  "undo" mode so the admin can pick a fresh slot. The AdminApp shell
   *  performs the atomic restore + reschedule on confirm. */
  onUndoCancelBookingAndReschedule?: (id: string) => void;
  /** Admin-records the corresponding invoice has been voided in the
   *  billing system. Drives the prominent "void this invoice" alert
   *  shown when `supersededByBookingId` is set. Optional so older
   *  call-sites that don't yet thread it remain valid. */
  onAcknowledgeSupersede?: (id: string) => void;
  /** Mirror of the bulk-log-call toast on
   *  {@link AwaitingCoordinationView}: fired after a per-row call is
   *  logged so the AdminApp shell can surface a confirmation toast
   *  reflecting which template (or `Custom`) landed. Same shape as
   *  the bulk handler's toast so single- and batch-logged calls read
   *  consistently in ops' bottom-right toaster. The second arg is the
   *  human-readable outcome label (e.g. `"Spoke to them"`) so the
   *  toast can fall back to it on the `Custom` path — analogous to
   *  how the email toast falls back to the free-text subject.
   *  Optional so existing call-sites and tests that don't care about
   *  the toast remain valid — the timeline write happens regardless. */
  onLogCallToast?: (templateLabel: string, outcomeLabel: string) => void;
  /** Mirror of the bulk-log-email toast on
   *  {@link AwaitingCoordinationView}: fired after a per-row email
   *  is logged so the AdminApp shell can surface a confirmation toast
   *  reflecting which template (or `Custom`) landed. Same shape as the
   *  bulk handler's toast so single- and batch-logged emails read
   *  consistently in ops' bottom-right toaster. Optional so existing
   *  call-sites and tests that don't care about the toast remain
   *  valid — the timeline write happens regardless. */
  onLogEmailToast?: (templateLabel: string, subject: string) => void;
  /** Round-trip companion to the Call / Email templates panel's
   *  "Referenced by N entries" popover (Task #149): a timeline entry
   *  that was logged from a saved template renders a clickable
   *  `From template: <name>` chip, and clicking it asks the AdminApp
   *  shell to switch to the matching templates panel and focus the
   *  same row the popover surfaces. Optional so screens that don't
   *  expose template panels (or tests that don't care) can omit the
   *  prop — the chip then degrades to a non-interactive label so the
   *  audit trail still shows which template wrote the entry. */
  onOpenTemplate?: (kind: "call" | "email", templateName: string) => void;
  /** Round-trip companion to the BookingsView / Awaiting-coordination
   *  "Last attempt: …" template-name pivot (Task #153): a timeline
   *  entry that was logged from a saved template renders an extra
   *  "View other bookings using this template" link beside the
   *  `From template: <name>` chip. Clicking it asks the AdminApp
   *  shell to leave the detail screen and land in BookingsView with
   *  the matching template filter active and the clear chip showing,
   *  closing the loop for the common "I'm reading a single booking
   *  and want to see who else got this template" workflow.
   *
   *  Optional so screens that don't expose the bookings list (or
   *  tests that don't care about the pivot) can omit it — the link
   *  is then suppressed and the chip alone (when {@link onOpenTemplate}
   *  is wired) still gives admins their templates-panel jump. */
  onPivotToBookingsFilteredByTemplate?: (templateLabel: string) => void;
  /** Live email-template catalog the per-row Log-email form's
   *  template dropdown reads from. Defaults to the seeded
   *  {@link EMAIL_TEMPLATES} so the screen stays usable in isolation
   *  (and existing tests don't have to thread the prop through).
   *  When mounted from `AdminApp` the prop is the mutable state owned
   *  by the shell, so any add / edit / remove from the Email
   *  templates panel shows up in the dropdown on the next render. The
   *  form snapshots the chosen template's subject + note onto the
   *  literal timeline entry, so editing or removing a template never
   *  rewrites historical entries. Mirrors the bulk Log-email picker
   *  on `AwaitingCoordinationView`. */
  emailTemplates?: ReadonlyArray<EmailTemplate>;
  /** Live call-template catalog the per-row Log-call form's template
   *  dropdown reads from. Mirror of `emailTemplates` for the call
   *  channel — defaults to the seeded {@link CALL_TEMPLATES} so the
   *  screen stays usable in isolation, and is the shell's mutable
   *  state when mounted from `AdminApp`. The form snapshots the
   *  chosen template's note onto the literal timeline entry, so
   *  editing or removing a template never rewrites historical
   *  entries. */
  callTemplates?: ReadonlyArray<CallTemplate>;
}) {
  const booking = bookings.find((b) => b.id === bookingId);
  const [notes, setNotes] = useState(booking?.notes ?? "");
  // Modal open state — reset whenever the active booking changes so a
  // stale modal can't end up bound to a different booking after the
  // admin clicks back and into another row.
  const [showCancel, setShowCancel] = useState(false);
  // Undo-cancel pivot: when the original slot was given away while
  // the booking sat cancelled, we surface the conflict here so the
  // admin can choose to open the reschedule picker instead. `null`
  // means no conflict is being shown.
  const [undoConflict, setUndoConflict] = useState<UndoConflictTakenBy | null>(null);
  // Log-call / Log-email popovers — small inline forms anchored under
  // the right-column action buttons. Closed automatically when the
  // user navigates to a different booking so a stale draft can't end
  // up appended to the wrong row's timeline.
  const [showLogCall, setShowLogCall] = useState(false);
  const [showLogEmail, setShowLogEmail] = useState(false);
  useEffect(() => {
    setShowCancel(false);
    setUndoConflict(null);
    setShowLogCall(false);
    setShowLogEmail(false);
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
  // slot — coordination bookings (`to_be_coordinated`) are handled
  // by the "Schedule appointment" action surfaced in the Schedule
  // card instead.
  const canCancel = !booking.isLive && !isCancelled;
  const canReschedule =
    !booking.isLive &&
    !isCancelled &&
    !!booking.rolloutId &&
    (booking.serviceSlot === "morning" ||
      booking.serviceSlot === "afternoon" ||
      booking.serviceSlot === "evening");
  // Undo cancellation is only relevant for cancelled rows. The live
  // demo row's lifecycle is owned by the customer flow, so we never
  // expose admin-side undo for it.
  const canUndoCancel =
    !booking.isLive && isCancelled && !!onUndoCancelBooking;
  const rescheduleDisabledReason = booking.isLive
    ? "Live demo row is read-only"
    : isCancelled
      ? "Cancelled bookings can't be rescheduled"
      : !booking.rolloutId
        ? "No rollout linked to this unit"
        : "";

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
   * Append a "Logged call" entry to the service timeline and stamp
   * `lastContactedAt` with the current ISO time so the booking's
   * coordination-aging signals stay accurate. Outcome is encoded in
   * the entry label ("Logged call · No answer" / "Spoke to tenant"
   * / "Left voicemail"); free-text colour goes on the `note` field
   * so the timeline can render it inline. Replaces the previous
   * "Mark as chased" button — every chase now has structure.
   *
   * `templateLabel` is the human-readable name of the seeded
   * {@link CALL_TEMPLATES} entry the admin picked in the Log call
   * form (e.g. `"No answer — left voicemail"`), or
   * {@link CALL_TEMPLATE_CUSTOM_LABEL} when they bypassed the picker.
   * It does NOT change the timeline label — that stays
   * `Logged call · {Outcome}` so per-row entries line up with bulk-
   * logged ones in the Awaiting-coordination "Last attempt" cell.
   * Non-Custom picks are persisted on the timeline entry's
   * `templateLabel` so the Call-templates panel can count historical
   * references. The label is also forwarded to the optional
   * {@link onLogCallToast} callback so the AdminApp shell can fire
   * the same template-aware confirmation toast the bulk action does.
   */
  function logCall(outcome: CallOutcome, note: string, templateLabel: string) {
    if (!booking) return;
    const nowIso = new Date().toISOString();
    const trimmedTemplate = templateLabel.trim();
    const persistTemplate =
      trimmedTemplate.length > 0 &&
      !isCustomCallTemplateLabel(trimmedTemplate);
    const newEntry: TimelineEntry = {
      kind: "call",
      status: "logged_call",
      label: `Logged call · ${CALL_OUTCOME_LABEL[outcome]}`,
      at: "Just now",
      by: "Mia (admin)",
      loggedAt: nowIso,
      ...(note.trim().length > 0 ? { note: note.trim() } : {}),
      ...(persistTemplate ? { templateLabel: trimmedTemplate } : {}),
    };
    onUpdate(booking.id, {
      lastContactedAt: nowIso,
      serviceTimeline: [...booking.serviceTimeline, newEntry],
    });
    onLogCallToast?.(templateLabel, CALL_OUTCOME_LABEL[outcome]);
  }

  /**
   * Append a "Logged email" entry to the service timeline and stamp
   * `lastContactedAt`. Subject is encoded in the entry label so the
   * timeline reads as a one-line summary; the body / context goes on
   * `note`. Same shape as {@link logCall}, just with `kind: "email"`.
   *
   * `templateLabel` is the human-readable name of the seeded
   * {@link EMAIL_TEMPLATES} entry the admin picked in the Log email
   * form (e.g. `"Sent rebook link"`), or {@link EMAIL_TEMPLATE_CUSTOM_LABEL}
   * when they bypassed the picker. It does NOT change the timeline
   * label — that stays `Logged email · {subject}` so per-row entries
   * line up with bulk-logged ones in the Awaiting-coordination
   * "Last attempt" cell. Instead it's forwarded to the optional
   * {@link onLogEmailToast} callback so the AdminApp shell can fire
   * the same template-aware confirmation toast the bulk action does.
   */
  function logEmail(subject: string, note: string, templateLabel: string) {
    if (!booking) return;
    const nowIso = new Date().toISOString();
    const trimmedSubject = subject.trim();
    const trimmedTemplate = templateLabel.trim();
    // Persist the template name on the timeline entry only when a
    // real template was picked. Custom / blank picks skip the field
    // (matches the bulk path) so the renderer doesn't show a
    // redundant `Template: Custom` chip next to the free-text
    // subject ops just typed (Task #138).
    const persistTemplate =
      trimmedTemplate.length > 0 &&
      !isCustomEmailTemplateLabel(trimmedTemplate);
    const newEntry: TimelineEntry = {
      kind: "email",
      status: "logged_email",
      label:
        trimmedSubject.length > 0
          ? `Logged email · ${trimmedSubject}`
          : "Logged email",
      at: "Just now",
      by: "Mia (admin)",
      loggedAt: nowIso,
      ...(note.trim().length > 0 ? { note: note.trim() } : {}),
      ...(persistTemplate ? { templateLabel: trimmedTemplate } : {}),
    };
    onUpdate(booking.id, {
      lastContactedAt: nowIso,
      serviceTimeline: [...booking.serviceTimeline, newEntry],
    });
    onLogEmailToast?.(templateLabel, trimmedSubject);
  }

  return (
    <div
      className="flex flex-col gap-4"
      data-testid={`booking-detail-${booking.id}`}
    >
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

        {/* Right column: schedule + access + timelines */}
        <div className="flex flex-col gap-4">
          <Card title="Schedule">
            <SlotCell booking={booking} />
            {booking.serviceSlot === "to_be_coordinated" ? (
              <CoordinationCoordinatePanel
                booking={booking}
                contact={coordinationContactForBooking(booking, unit, agents)}
                isCancelled={isCancelled}
                showLogCall={showLogCall}
                showLogEmail={showLogEmail}
                onOpenLogCall={() => {
                  setShowLogEmail(false);
                  setShowLogCall(true);
                }}
                onOpenLogEmail={() => {
                  setShowLogCall(false);
                  setShowLogEmail(true);
                }}
                onCloseLogCall={() => setShowLogCall(false)}
                onCloseLogEmail={() => setShowLogEmail(false)}
                onLogCall={(outcome, note, templateLabel) => {
                  logCall(outcome, note, templateLabel);
                  setShowLogCall(false);
                }}
                onLogEmail={(subject, note, templateLabel) => {
                  logEmail(subject, note, templateLabel);
                  setShowLogEmail(false);
                }}
                onScheduleCoordination={
                  onScheduleCoordination
                    ? () => onScheduleCoordination(booking.id)
                    : undefined
                }
                emailTemplates={emailTemplates}
                callTemplates={callTemplates}
              />
            ) : (
              <AccessOnTheDayPanel
                booking={booking}
                contact={coordinationContactForBooking(booking, unit, agents)}
              />
            )}
            {canReschedule && onRescheduleAppointment && (
              <div className="mt-3 flex items-start">
                <button
                  type="button"
                  onClick={() => onRescheduleAppointment(booking.id)}
                  data-testid="button-reschedule-appointment"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
                  title={rescheduleDisabledReason}
                >
                  <CalendarClock className="h-3.5 w-3.5" />
                  Reschedule
                </button>
              </div>
            )}
          </Card>
          <Card title="Payment timeline">
            <Timeline
              entries={booking.paymentTimeline}
              accent={booking.paymentStatus === "paid" ? "#16A34A" : BRAND}
              onOpenTemplate={onOpenTemplate}
              onPivotToBookingsFilteredByTemplate={
                onPivotToBookingsFilteredByTemplate
              }
            />
            <div className="mt-3">
              <PaymentChip status={booking.paymentStatus} />
            </div>
          </Card>
          <Card title="Service timeline">
            <Timeline
              entries={booking.serviceTimeline}
              accent={BRAND}
              onOpenTemplate={onOpenTemplate}
              onPivotToBookingsFilteredByTemplate={
                onPivotToBookingsFilteredByTemplate
              }
            />
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
      {undoConflict && (
        <UndoConflictDialog
          takenBy={undoConflict}
          onOpenReschedule={() => {
            setUndoConflict(null);
            onUndoCancelBookingAndReschedule?.(booking.id);
          }}
          onDismiss={() => setUndoConflict(null)}
        />
      )}
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

/**
 * Service / payment timeline. Renders a coloured-dot rail with one
 * entry per row. Per-entry icon and accent are derived from
 * {@link TimelineEntry.kind}: `"status"` (default) keeps the stack's
 * accent colour and a filled dot; `"call"` and `"email"` flip to a
 * neutral icon so the audit trail can show "Logged call …" /
 * "Logged email …" rows distinct from the lifecycle dots above and
 * below them. Optional `note` text is rendered in muted slate beneath
 * the entry label so a Taylr admin can record context inline ("Spoke
 * to tenant — confirmed Wed afternoon", "Sent rebook link", etc.).
 */
function Timeline({
  entries,
  accent,
  onOpenTemplate,
  onPivotToBookingsFilteredByTemplate,
}: {
  entries: ReadonlyArray<TimelineEntry>;
  accent: string;
  /** When provided, the per-entry "From template: …" chip becomes a
   *  clickable button that asks the AdminApp shell to switch to the
   *  matching templates panel and focus the same row the popover
   *  surfaces (Task #155 round-trip with Task #149's popover).
   *  When omitted (older / isolated mounts) the chip degrades to a
   *  plain non-interactive label so the audit trail still shows
   *  which template wrote the entry. */
  onOpenTemplate?: (kind: "call" | "email", templateName: string) => void;
  /** When provided, an extra inline link renders beside the per-entry
   *  "From template: …" chip — clicking it asks the AdminApp shell
   *  to leave the detail and land in BookingsView with the matching
   *  template filter already active (Task #159 mirror of the
   *  BookingsView "Last attempt: …" template-name suffix introduced
   *  in Task #153). When omitted the link is suppressed; the chip
   *  alone (when {@link onOpenTemplate} is wired) still gives admins
   *  their templates-panel jump. */
  onPivotToBookingsFilteredByTemplate?: (templateLabel: string) => void;
}) {
  if (entries.length === 0) {
    return <div className="text-[12px] text-slate-500">No events yet.</div>;
  }
  return (
    <ol className="flex flex-col gap-3">
      {entries.map((e, i) => {
        const kind = e.kind ?? "status";
        const templateChipKind: "call" | "email" | null =
          (kind === "email" || kind === "call") && e.templateLabel
            ? kind
            : null;
        return (
          <li key={i} className="flex gap-3" data-testid={`timeline-entry-${i}`}>
            <div className="flex flex-col items-center">
              <TimelineMarker kind={kind} accent={accent} />
              {i < entries.length - 1 && (
                <span className="mt-0.5 flex-1 w-px bg-slate-200" />
              )}
            </div>
            <div className="-mt-0.5 flex-1 pb-1">
              <div className="text-[12px] font-medium text-slate-900">
                {e.label}
              </div>
              {templateChipKind && e.templateLabel && (
                // Row of template-related affordances for the entry.
                // The first child — the grey "From template: …" chip —
                // names the Call/Email template the admin picked when
                // logging this entry. Email entries got the chip first
                // (Task #138); call entries reuse the same affordance
                // so an admin can retrace which preset wrote each row
                // without opening the Log call / Log email panel and
                // counting references (Task #149). When `onOpenTemplate`
                // is wired (Task #155) the chip becomes a button that
                // round-trips back to the matching row in the Call /
                // Email templates panel — the inverse of that panel's
                // "Referenced by N entries" popover. Custom / legacy
                // entries leave `templateLabel` undefined and skip the
                // whole row entirely.
                //
                // The second child — the inline "View other bookings
                // using this template" link — only appears when the
                // shell wires `onPivotToBookingsFilteredByTemplate`
                // (Task #159). Clicking it leaves the detail screen
                // and lands the admin in BookingsView with the
                // matching template filter active and the clear chip
                // showing — the same affordance the BookingsView /
                // Awaiting-coordination "Last attempt: …" suffix
                // already exposes from the list views (Task #153).
                <div
                  className="mt-1 flex flex-wrap items-center gap-1.5"
                  data-testid={`timeline-entry-${i}-template-row`}
                >
                  {onOpenTemplate ? (
                    <button
                      type="button"
                      onClick={() =>
                        onOpenTemplate(templateChipKind, e.templateLabel!)
                      }
                      data-testid={`timeline-entry-${i}-template`}
                      aria-label={`Open ${
                        templateChipKind === "call" ? "Call" : "Email"
                      } template "${e.templateLabel}" in the templates panel`}
                      title={`Open this ${
                        templateChipKind === "call" ? "Call" : "Email"
                      } template in the templates panel`}
                      className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700 underline decoration-dotted underline-offset-2 transition hover:bg-slate-200 hover:text-slate-900"
                    >
                      From template: {e.templateLabel}
                    </button>
                  ) : (
                    <div
                      className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700"
                      data-testid={`timeline-entry-${i}-template`}
                    >
                      From template: {e.templateLabel}
                    </div>
                  )}
                  {onPivotToBookingsFilteredByTemplate && (
                    <button
                      type="button"
                      onClick={() =>
                        onPivotToBookingsFilteredByTemplate(e.templateLabel!)
                      }
                      data-testid={`timeline-entry-${i}-pivot-bookings`}
                      data-template-label={e.templateLabel}
                      aria-label={`View other bookings whose latest touch used "${e.templateLabel}"`}
                      title={`Filter the bookings list to entries whose latest touch used "${e.templateLabel}"`}
                      className="inline-flex items-center gap-1 rounded text-[10px] font-medium text-slate-500 underline decoration-dotted decoration-slate-400 underline-offset-2 transition hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
                    >
                      View other bookings using this template
                    </button>
                  )}
                </div>
              )}
              {e.note && (
                <div className="mt-0.5 text-[11px] text-slate-600">
                  {e.note}
                </div>
              )}
              <div className="mt-0.5 text-[11px] text-slate-500">
                {e.at} · {e.by}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function TimelineMarker({
  kind,
  accent,
}: {
  kind: NonNullable<TimelineEntry["kind"]>;
  accent: string;
}) {
  if (kind === "call") {
    return (
      <span
        className="flex h-4 w-4 items-center justify-center rounded-full bg-slate-100 text-slate-600"
        title="Logged phone call"
      >
        <Phone className="h-2.5 w-2.5" />
      </span>
    );
  }
  if (kind === "email") {
    return (
      <span
        className="flex h-4 w-4 items-center justify-center rounded-full bg-slate-100 text-slate-600"
        title="Logged email"
      >
        <Mail className="h-2.5 w-2.5" />
      </span>
    );
  }
  return (
    <span
      className="block h-2 w-2 rounded-full"
      style={{ backgroundColor: accent }}
    />
  );
}

// ─── Coordination + access panels ───────────────────────────────────────────

/**
 * Outcome of a logged call attempt. Shared with the bulk "Log call"
 * affordance in `AwaitingCoordinationView` so a one-row chase and a
 * many-row chase produce timeline entries with the exact same shape.
 */
export type CallOutcome = "no_answer" | "spoke" | "voicemail";

export const CALL_OUTCOME_LABEL: Record<CallOutcome, string> = {
  no_answer: "No answer",
  spoke: "Spoke to them",
  voicemail: "Left voicemail",
};

export const CALL_OUTCOME_ORDER: ReadonlyArray<CallOutcome> = [
  "no_answer",
  "spoke",
  "voicemail",
];

/**
 * Right-column "Coordinating with" panel for `to_be_coordinated`
 * bookings. Replaces the older WaitingChip / LastChasedChip / "Mark as
 * chased" stack with a structured Who/How summary plus three explicit
 * follow-up affordances: Log call, Log email, Schedule appointment.
 *
 * The waiting + last-contacted strings are rendered as muted helper
 * text rather than coloured pills — the urgency now lives in the
 * Awaiting-coordination queue's sort order, not in chip styling on
 * the detail screen.
 */
function CoordinationCoordinatePanel({
  booking,
  contact,
  isCancelled,
  showLogCall,
  showLogEmail,
  onOpenLogCall,
  onOpenLogEmail,
  onCloseLogCall,
  onCloseLogEmail,
  onLogCall,
  onLogEmail,
  onScheduleCoordination,
  emailTemplates,
  callTemplates,
}: {
  booking: AdminBooking;
  contact: CoordinationContact | null;
  isCancelled: boolean;
  showLogCall: boolean;
  showLogEmail: boolean;
  onOpenLogCall: () => void;
  onOpenLogEmail: () => void;
  onCloseLogCall: () => void;
  onCloseLogEmail: () => void;
  onLogCall: (outcome: CallOutcome, note: string, templateLabel: string) => void;
  onLogEmail: (subject: string, note: string, templateLabel: string) => void;
  onScheduleCoordination?: () => void;
  emailTemplates: ReadonlyArray<EmailTemplate>;
  callTemplates: ReadonlyArray<CallTemplate>;
}) {
  const waiting = formatCoordinationWaiting(booking.createdAt);
  const lastContacted = formatLastContacted(booking.lastContactedAt);
  // Most-recent typed call/email entry for the row-level "Last
  // attempt: spoke · 3d ago" line below. Mirrors the bookings list
  // and Awaiting-coordination queue (Task #132) so the staleness
  // signal an admin saw before clicking in stays visible on the
  // detail screen too. `null` for bookings that have only been
  // "Marked as chased" the legacy way (or never touched) — we just
  // omit the line in that case rather than render an empty stub.
  const latestAttempt = latestCoordinationAttempt(booking.serviceTimeline);
  const canLog = !booking.isLive && !isCancelled;
  return (
    <div
      className="mt-3 flex flex-col gap-3"
      data-testid="coordination-panel"
    >
      <div
        className="rounded-lg border p-3"
        style={{ borderColor: BRAND_SOFT, backgroundColor: "#FCFAFD" }}
      >
        <div
          className="text-[10px] uppercase tracking-wider"
          style={{ color: BRAND_DEEP }}
        >
          Coordinating with
        </div>
        <ContactBlock contact={contact} />
        <div className="mt-2 flex items-start gap-1.5 text-[11px] text-slate-600">
          <KeyRound className="mt-0.5 h-3 w-3 shrink-0 text-slate-500" />
          <span data-testid="access-method-summary">
            {accessOnTheDayDescription(booking.accessMethod)}
          </span>
        </div>
      </div>

      <div
        className="text-[11px] text-slate-500"
        data-testid="coordination-waiting-text"
      >
        Waiting{waiting.label === "just now" ? " just now" : ` ${waiting.label}`}
        {" · "}
        {lastContacted.severity === "never"
          ? "never contacted"
          : `last contact ${lastContacted.label}`}
      </div>

      {latestAttempt && (() => {
        // Same "Last attempt: spoke · 3d ago" line the bookings list
        // and Awaiting-coordination queue render (Task #132). The
        // recency suffix is sourced from the entry's own `loggedAt`
        // (not the row-level `lastContactedAt`) so logging an email
        // after a call shows the email's age rather than the call's.
        // Crosses LAST_ATTEMPT_STALE_HOURS → flips into amber so the
        // staleness signal stays consistent across the queue → detail
        // handoff.
        const recency = formatAttemptRecency(latestAttempt.loggedAt);
        const isStale = recency?.severity === "stale";
        return (
          <div
            className={`text-[11px] ${isStale ? "text-amber-700" : "text-slate-500"}`}
            data-testid="booking-detail-last-attempt"
            data-stale={isStale ? "true" : "false"}
          >
            Last attempt:{" "}
            <span
              className={`font-medium ${isStale ? "text-amber-800" : "text-slate-700"}`}
            >
              {latestAttempt.label}
              {recency ? ` · ${recency.label}` : ""}
            </span>
          </div>
        );
      })()}

      {canLog && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpenLogCall}
            data-testid="button-log-call"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
            title="Log a phone call attempt to the tenant or agent"
          >
            <Phone className="h-3.5 w-3.5" />
            Log call
          </button>
          <button
            type="button"
            onClick={onOpenLogEmail}
            data-testid="button-log-email"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
            title="Log an outbound email to the tenant or agent"
          >
            <Mail className="h-3.5 w-3.5" />
            Log email
          </button>
          {onScheduleCoordination && (
            <button
              type="button"
              onClick={onScheduleCoordination}
              data-testid="button-schedule-coordination"
              className="inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm transition hover:brightness-110"
              style={{ backgroundColor: BRAND }}
            >
              Schedule appointment
            </button>
          )}
        </div>
      )}

      {showLogCall && canLog && (
        <LogCallForm
          onCancel={onCloseLogCall}
          onSubmit={onLogCall}
          callTemplates={callTemplates}
        />
      )}
      {showLogEmail && canLog && (
        <LogEmailForm
          onCancel={onCloseLogEmail}
          onSubmit={onLogEmail}
          emailTemplates={emailTemplates}
        />
      )}
    </div>
  );
}

/**
 * Right-column "Access on the day" panel for bookings that already have
 * a concrete slot. Mirrors {@link CoordinationCoordinatePanel}'s
 * Who/How structure so a Taylr admin reading either booking type sees
 * the same shape — the difference is just whether we're still
 * coordinating or the access plan is already locked in.
 */
function AccessOnTheDayPanel({
  booking,
  contact,
}: {
  booking: AdminBooking;
  contact: CoordinationContact | null;
}) {
  return (
    <div
      className="mt-3 rounded-lg border p-3"
      style={{ borderColor: "#E2E8F0", backgroundColor: "#F8FAFC" }}
      data-testid="access-on-the-day-panel"
    >
      <div className="text-[10px] uppercase tracking-wider text-slate-500">
        Access on the day
      </div>
      <ContactBlock contact={contact} />
      <div className="mt-2 flex items-start gap-1.5 text-[11px] text-slate-600">
        <KeyRound className="mt-0.5 h-3 w-3 shrink-0 text-slate-500" />
        <span data-testid="access-method-summary">
          {accessOnTheDayDescription(booking.accessMethod)}
        </span>
      </div>
    </div>
  );
}

/**
 * Renders the structured Who block for either panel. `tenant` shows
 * each tenant on its own line with phone + email; `agent` shows the
 * managing agency name; `booker` shows the contact captured on the
 * booking itself (owner or agent), prefixed with the agency name when
 * the booker is an agent.
 */
function ContactBlock({ contact }: { contact: CoordinationContact | null }) {
  if (contact === null) {
    return (
      <div className="mt-1 text-[12px] text-slate-500">
        Access method not yet confirmed.
      </div>
    );
  }
  if (contact.kind === "tenant") {
    if (contact.tenants.length === 0) {
      return (
        <div className="mt-1 text-[12px] text-slate-500">
          Tenant — details not captured yet.
        </div>
      );
    }
    return (
      <div className="mt-1 flex flex-col gap-1.5" data-testid="contact-tenant">
        {contact.tenants.map((t, i) => {
          const fullName = `${t.first} ${t.last}`.trim() || `Tenant ${i + 1}`;
          return (
            <div key={`${t.email}-${i}`}>
              <div className="flex items-center gap-1.5 text-[12px] font-medium text-slate-900">
                <Users className="h-3 w-3 text-slate-500" />
                Tenant — {fullName}
              </div>
              <div className="mt-0.5 pl-[18px] text-[11px] text-slate-600">
                {t.phone || "—"} · {t.email || "—"}
              </div>
            </div>
          );
        })}
      </div>
    );
  }
  if (contact.kind === "agent") {
    return (
      <div className="mt-1" data-testid="contact-agent">
        <div className="flex items-center gap-1.5 text-[12px] font-medium text-slate-900">
          <Building2 className="h-3 w-3 text-slate-500" />
          Managing agent
        </div>
        <div className="mt-0.5 pl-[18px] text-[11px] text-slate-600">
          {contact.agency ?? "Agency not on file"}
        </div>
      </div>
    );
  }
  // booker
  const role = contact.role === "agent" ? "Agent" : "Owner";
  return (
    <div className="mt-1" data-testid="contact-booker">
      <div className="flex items-center gap-1.5 text-[12px] font-medium text-slate-900">
        {contact.role === "agent" ? (
          <Building2 className="h-3 w-3 text-slate-500" />
        ) : (
          <Circle className="h-3 w-3 text-slate-500" />
        )}
        {role}
        {contact.agency ? ` — ${contact.agency}` : ""}
      </div>
      <div className="mt-0.5 pl-[18px] text-[11px] text-slate-600">
        {contact.name}
      </div>
      <div className="pl-[18px] text-[11px] text-slate-600">
        {contact.phone} · {contact.email}
      </div>
    </div>
  );
}

function LogCallForm({
  onCancel,
  onSubmit,
  callTemplates,
}: {
  onCancel: () => void;
  onSubmit: (
    outcome: CallOutcome,
    note: string,
    templateLabel: string,
  ) => void;
  /** Live call-template catalog the dropdown reads from. Same prop
   *  shape (and same snapshot-on-use semantics) as the bulk Log-call
   *  form on `AwaitingCoordinationView`: picking a template prefills
   *  the note (still editable), and the submitted values are the
   *  literal strings — never a template id — so editing or removing
   *  a template later never rewrites the historical timeline entry. */
  callTemplates: ReadonlyArray<CallTemplate>;
}) {
  // Template picker mirrors the bulk-log-call form on
  // `AwaitingCoordinationView` (and the per-row Log email form
  // alongside) so a single-booking call logged here ends up with the
  // same canonical note as one logged in bulk. Defaults to `Custom…`
  // so opening the form lands ops in the same free-text spot they
  // were before this picker existed. Selecting a real template
  // prefills the shared note (still editable); selecting `Custom…`
  // clears it. Outcome is a separate dropdown — picking a template
  // never overwrites the outcome because the same template wording
  // ("Spoke to them — confirmed window") can apply across outcomes
  // and we'd rather ops re-pick the outcome explicitly than silently
  // lose what they had.
  const [templateId, setTemplateId] = useState<string>(
    () => findDefaultCallTemplate(callTemplates)?.id ?? CALL_TEMPLATE_CUSTOM_ID,
  );
  const [outcome, setOutcome] = useState<CallOutcome>("no_answer");
  const [note, setNote] = useState<string>(
    () => findDefaultCallTemplate(callTemplates)?.note ?? "",
  );
  function handleSelectTemplate(id: string) {
    setTemplateId(id);
    if (id === CALL_TEMPLATE_CUSTOM_ID) {
      setNote("");
      return;
    }
    const tpl = callTemplates.find((t) => t.id === id);
    if (!tpl) {
      // Defensive — the dropdown only renders ids from the live
      // `callTemplates` prop + the Custom sentinel, but if the prop
      // changes mid-edit (template removed from the Call templates
      // panel between render and select) we fall back to Custom
      // rather than leaving the note in a stale, half-prefilled
      // state.
      setTemplateId(CALL_TEMPLATE_CUSTOM_ID);
      setNote("");
      return;
    }
    setNote(tpl.note);
  }
  function handleSubmit() {
    // Resolve the template's display name so the AdminApp toast can
    // confirm what landed; falls back to the Custom label whenever
    // the dropdown is on Custom (or — defensively — pointing at an
    // unknown id, which `handleSelectTemplate` should already prevent).
    // Resolved against the live `callTemplates` prop so a renamed
    // template surfaces its current name in the toast — the literal
    // note still snapshots onto the timeline entry.
    const tpl = callTemplates.find((t) => t.id === templateId);
    const templateLabel = tpl ? tpl.name : CALL_TEMPLATE_CUSTOM_LABEL;
    onSubmit(outcome, note, templateLabel);
  }
  return (
    <div
      className="rounded-lg border border-slate-200 bg-white p-3"
      data-testid="log-call-form"
    >
      <div className="text-[12px] font-semibold text-slate-900">
        Log a call
      </div>
      {/* Template picker — sits above the outcome + note inputs so
          ops can grab a saved preset in one click. Defaults to
          Custom… so opening the form lands ops in the same free-text
          spot they were before this picker existed. Selecting a
          template prefills the note (still editable); selecting
          Custom… clears it. Mirror of the dropdown in the bulk-log-
          call form on `AwaitingCoordinationView`. */}
      <label
        className="mt-2 block text-[11px] font-medium uppercase tracking-wider text-slate-500"
        htmlFor="log-call-template"
      >
        Template
      </label>
      <select
        id="log-call-template"
        value={templateId}
        onChange={(e) => handleSelectTemplate(e.target.value)}
        data-testid="select-call-template"
        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] text-slate-900 focus:border-slate-400 focus:outline-none"
      >
        <option value={CALL_TEMPLATE_CUSTOM_ID}>Custom…</option>
        {callTemplates.map((tpl) => (
          <option key={tpl.id} value={tpl.id}>
            {tpl.isDefault ? `${tpl.name} (default)` : tpl.name}
          </option>
        ))}
      </select>
      <label
        className="mt-2 block text-[11px] font-medium uppercase tracking-wider text-slate-500"
        htmlFor="log-call-outcome"
      >
        Outcome
      </label>
      <select
        id="log-call-outcome"
        value={outcome}
        onChange={(e) => setOutcome(e.target.value as CallOutcome)}
        data-testid="select-call-outcome"
        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] text-slate-900 focus:border-slate-400 focus:outline-none"
      >
        {CALL_OUTCOME_ORDER.map((o) => (
          <option key={o} value={o}>
            {CALL_OUTCOME_LABEL[o]}
          </option>
        ))}
      </select>
      <label
        className="mt-2 block text-[11px] font-medium uppercase tracking-wider text-slate-500"
        htmlFor="log-call-note"
      >
        Note (optional)
      </label>
      <textarea
        id="log-call-note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="e.g. Left voicemail, will try again Wed AM"
        data-testid="input-call-note"
        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
      />
      <div className="mt-2 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[12px] font-medium text-slate-600 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          data-testid="button-confirm-log-call"
          className="rounded-lg px-2.5 py-1 text-[12px] font-semibold text-white shadow-sm transition hover:brightness-110"
          style={{ backgroundColor: BRAND }}
        >
          Save call
        </button>
      </div>
    </div>
  );
}

function LogEmailForm({
  onCancel,
  onSubmit,
  emailTemplates,
}: {
  onCancel: () => void;
  /** Receives the literal subject + note typed into the form, plus the
   *  display label of the template that produced them (or the Custom
   *  label when the picker is on Custom…). The literal subject and
   *  note are what land on the timeline — snapshot-on-use — while the
   *  label is forwarded by the AdminApp shell to its toast so a
   *  per-row email reads the same as a bulk-logged one. */
  onSubmit: (subject: string, note: string, templateLabel: string) => void;
  /** Live email-template catalog the dropdown reads from. Same prop
   *  shape (and same snapshot-on-use semantics) as the bulk
   *  Log-email form on `AwaitingCoordinationView`: picking a template
   *  prefills subject + note (still editable), and the submitted
   *  values are the literal strings — never a template id — so
   *  editing or removing a template later never rewrites the
   *  historical timeline entry. */
  emailTemplates: ReadonlyArray<EmailTemplate>;
}) {
  // Template picker mirrors the bulk-log-email form on
  // `AwaitingCoordinationView` so a single-booking email logged here
  // ends up with the same canonical subject + note (and therefore the
  // same `Logged email · {subject}` timeline label) as one logged in
  // bulk. Defaults to `Custom…` so opening the form lands ops in the
  // same free-text spot they were before this picker existed.
  // Selecting a real template prefills both inputs (still editable);
  // selecting `Custom…` clears them. The replacement is intentional
  // / unconditional — every change to the dropdown overwrites both
  // inputs, matching the bulk picker's mental model: "the dropdown is
  // the source of truth, edit it after if you need to tweak".
  const [templateId, setTemplateId] = useState<string>(
    () =>
      findDefaultEmailTemplate(emailTemplates)?.id ?? EMAIL_TEMPLATE_CUSTOM_ID,
  );
  const [subject, setSubject] = useState<string>(
    () => findDefaultEmailTemplate(emailTemplates)?.subject ?? "",
  );
  const [note, setNote] = useState<string>(
    () => findDefaultEmailTemplate(emailTemplates)?.note ?? "",
  );

  /**
   * Pick (or unpick) a saved email template from the dropdown above
   * the subject input. Mirrors the bulk picker's behaviour:
   *   - Selecting a real template id replaces both inputs with the
   *     template's presets so the common case doesn't require typing.
   *     Inputs stay editable so the admin can tweak per booking.
   *   - Selecting `EMAIL_TEMPLATE_CUSTOM_ID` clears both inputs and
   *     restores the historical free-text behaviour.
   *   - If the dropdown id ever drifts (template removed mid-edit),
   *     fall back to Custom rather than leaving the inputs in a
   *     stale, half-prefilled state.
   */
  function handleSelectTemplate(id: string) {
    setTemplateId(id);
    if (id === EMAIL_TEMPLATE_CUSTOM_ID) {
      setSubject("");
      setNote("");
      return;
    }
    const tpl = emailTemplates.find((t) => t.id === id);
    if (!tpl) {
      // Defensive — the dropdown only renders ids from the live
      // `emailTemplates` prop + the Custom sentinel, but if the prop
      // changes mid-edit (template removed from the Email templates
      // panel between render and select) we fall back to Custom
      // rather than leaving the inputs in a stale, half-prefilled
      // state.
      setTemplateId(EMAIL_TEMPLATE_CUSTOM_ID);
      setSubject("");
      setNote("");
      return;
    }
    setSubject(tpl.subject);
    setNote(tpl.note);
  }

  function handleSubmit() {
    // Resolve the template's display name so the AdminApp toast can
    // confirm what landed; falls back to the Custom label whenever
    // the dropdown is on Custom (or — defensively — pointing at an
    // unknown id, which `handleSelectTemplate` should already prevent).
    // Resolved against the live `emailTemplates` prop so a renamed
    // template surfaces its current name in the toast — the literal
    // subject + note still snapshot onto the timeline entry.
    const tpl = emailTemplates.find((t) => t.id === templateId);
    const templateLabel = tpl ? tpl.name : EMAIL_TEMPLATE_CUSTOM_LABEL;
    onSubmit(subject, note, templateLabel);
  }

  return (
    <div
      className="rounded-lg border border-slate-200 bg-white p-3"
      data-testid="log-email-form"
    >
      <div className="text-[12px] font-semibold text-slate-900">
        Log an email
      </div>
      {/* Template picker — sits above the subject input so the admin
          can grab a saved preset in one click. Defaults to Custom…
          so opening the form lands the admin in the same free-text
          spot they were before this picker existed. Selecting a
          template prefills subject + note (still editable);
          selecting Custom… clears them. Same dropdown shape as the
          bulk Log-email form on `AwaitingCoordinationView`. */}
      <label
        className="mt-2 block text-[11px] font-medium uppercase tracking-wider text-slate-500"
        htmlFor="log-email-template"
      >
        Template
      </label>
      <select
        id="log-email-template"
        value={templateId}
        onChange={(e) => handleSelectTemplate(e.target.value)}
        data-testid="select-email-template"
        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] text-slate-900 focus:border-slate-400 focus:outline-none"
      >
        <option value={EMAIL_TEMPLATE_CUSTOM_ID}>Custom…</option>
        {emailTemplates.map((tpl) => (
          <option key={tpl.id} value={tpl.id}>
            {tpl.isDefault ? `${tpl.name} (default)` : tpl.name}
          </option>
        ))}
      </select>
      <label
        className="mt-2 block text-[11px] font-medium uppercase tracking-wider text-slate-500"
        htmlFor="log-email-subject"
      >
        Subject
      </label>
      <input
        id="log-email-subject"
        type="text"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="e.g. Booking access — please confirm window"
        data-testid="input-email-subject"
        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
      />
      <label
        className="mt-2 block text-[11px] font-medium uppercase tracking-wider text-slate-500"
        htmlFor="log-email-note"
      >
        Note (optional)
      </label>
      <textarea
        id="log-email-note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="e.g. Sent rebook link + parcel-locker instructions"
        data-testid="input-email-note"
        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
      />
      <div className="mt-2 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[12px] font-medium text-slate-600 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          data-testid="button-confirm-log-email"
          className="rounded-lg px-2.5 py-1 text-[12px] font-semibold text-white shadow-sm transition hover:brightness-110"
          style={{ backgroundColor: BRAND }}
        >
          Save email
        </button>
      </div>
    </div>
  );
}
