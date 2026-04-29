/**
 * Taylr Admin (mockup) — shell.
 *
 * Single-page mockup of the admin-side ops UI: bookings list + detail,
 * per-rollout schedules, units & AC config, agents, payments. No real
 * DB, no real auth — all data is seeded and any "edits" live in
 * component state for the demo session only.
 *
 * The customer's current sessionStorage booking is folded into the
 * bookings list as a "Live demo" row so the customer can demo the
 * customer flow and see it appear here in real time.
 *
 * Each major screen lives in its own file under this directory; this
 * shell just owns the shared state (units, agents, bookings,
 * rollouts-refresh key, active view, current selection) and routes
 * between them.
 */

import { useEffect, useMemo, useState } from "react";

import {
  applyBulkLogEmail,
  bookingDurationMinutes,
  buildRescheduledTimelineEntry,
  consumeBookingCapacity,
  convertCoordinationToScheduledPatch,
  createRollout,
  EMAIL_TEMPLATES,
  findRolloutForBooking,
  formatBookingShortDate,
  getActiveBookingForUnit,
  liveBookingFromSession,
  nextEmailTemplateId,
  normalizeEmailTemplateDraft,
  notifyLiveBookingsChanged,
  notifyLiveUnitsChanged,
  priorServiceStatusFromTimeline,
  releaseBookingCapacity,
  revertScheduledToCoordinationPatch,
  SEEDED_AGENTS,
  SEEDED_BOOKINGS,
  SEEDED_BUILDINGS,
  SEEDED_UNITS,
  setLiveBookingsSource,
  setLiveUnitsSource,
  updateRolloutSlot,
  type AdminAgent,
  type AdminBooking,
  type AdminBuilding,
  type AdminCreatedScheduleChoice,
  type AdminUnit,
  type EmailTemplate,
  type PaymentStatus,
  type ServiceStatus,
  type TimelineEntry,
} from "@/state/adminMockData";
import { setUniquenessGuard, useBookingSession } from "@/state/bookingSession";

import { AgentsView } from "./AgentsView";
import { AwaitingCoordinationView } from "./AwaitingCoordinationView";
import { EmailTemplatesView } from "./EmailTemplatesView";
import {
  BookingDetail,
  CALL_OUTCOME_LABEL,
  type CallOutcome,
} from "./BookingDetail";
import { BookingsView } from "./BookingsView";
import { BuildingDetail } from "./BuildingDetail";
import { BuildingsView } from "./BuildingsView";
import { NewBookingFlow } from "./NewBookingFlow";
import { RolloutScheduleEditor } from "./RolloutScheduleEditor";
import { RolloutsView } from "./RolloutsView";
import { SchedulingModal, type SchedulingMode } from "./SchedulingModal";
import { selectPendingInvoiceVoids } from "./InvoiceVoidAlerts";
import { Sidebar } from "./Sidebar";
import { Toast } from "./Toast";
import { TopBar } from "./TopBar";
import { UnitsView } from "./UnitsView";
import type { CoordinationKind } from "@/state/adminMockData";
import type { ViewId } from "./types";

export function AdminApp() {
  // Mutable working copies of the seeded data (so admin "edits" stick
  // for the demo session).
  const [units, setUnits] = useState<AdminUnit[]>([...SEEDED_UNITS]);
  const [agents, setAgents] = useState<AdminAgent[]>([...SEEDED_AGENTS]);
  const [seededBookings, setSeededBookings] =
    useState<AdminBooking[]>([...SEEDED_BOOKINGS]);

  // Bumped on every rollout mutation so any view reading from the
  // module-level rollouts store re-renders. We keep the rollout list in
  // module state (not React state) so a customer-side booking that
  // resolves a rollout sees the same data the admin is editing.
  const [rolloutsRefreshKey, setRolloutsRefreshKey] = useState(0);
  function bumpRolloutsRefreshKey() {
    setRolloutsRefreshKey((k) => k + 1);
    // Notify customer-side subscribers (slot pickers, unit tiles) that
    // the live bookings list changed so their "already scheduled by
    // someone else" lock and unit-availability badges re-evaluate.
    notifyLiveBookingsChanged();
  }

  // Live customer booking pulled from sessionStorage.
  const session = useBookingSession();
  const liveBooking = useMemo(() => liveBookingFromSession(session), [session]);
  const allBookings: AdminBooking[] = liveBooking
    ? [liveBooking, ...seededBookings]
    : seededBookings;

  // Buildings are not currently editable from the admin UI — but we hold
  // them in state so future tasks (e.g. add a building, rename one) only
  // need to flip a `setBuildings` setter through.
  const [buildings] = useState<AdminBuilding[]>([...SEEDED_BUILDINGS]);

  // Mutable email-template catalog for the bulk Log-email dropdown
  // on the Awaiting-coordination queue. Seeded from `EMAIL_TEMPLATES`
  // so the dropdown isn't empty on first render; admins can add /
  // edit / remove from the "Email templates" panel and the dropdown
  // picks the changes up on the next render. Editing or removing a
  // template never rewrites historical timeline entries — the bulk
  // form snapshots subject + note onto the entry at log time, not a
  // template id, so the audit trail is immutable by construction.
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([
    ...EMAIL_TEMPLATES,
  ]);
  function createEmailTemplate(draft: {
    name: string;
    subject: string;
    note: string;
  }) {
    const normalized = normalizeEmailTemplateDraft(draft);
    if (normalized.name.length === 0 || normalized.subject.length === 0) {
      // Modal already disables Save in this state; this guard keeps a
      // future programmatic caller from sneaking a half-formed
      // template into the catalog.
      return;
    }
    setEmailTemplates((prev) => [
      ...prev,
      { id: nextEmailTemplateId(prev), ...normalized },
    ]);
  }
  function updateEmailTemplate(
    id: string,
    draft: { name: string; subject: string; note: string },
  ) {
    const normalized = normalizeEmailTemplateDraft(draft);
    if (normalized.name.length === 0 || normalized.subject.length === 0) return;
    setEmailTemplates((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...normalized } : t)),
    );
  }
  function removeEmailTemplate(id: string) {
    setEmailTemplates((prev) => prev.filter((t) => t.id !== id));
  }

  const [view, setView] = useState<ViewId>("bookings");
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(
    null,
  );
  const [selectedRolloutId, setSelectedRolloutId] = useState<string | null>(
    null,
  );

  // Admin "New booking" (phone booking) overlay. `newBookingBuildingId`
  // pre-applies a building filter on Step 1 when the flow was opened
  // from a building detail screen.
  const [newBookingOpen, setNewBookingOpen] = useState(false);
  const [newBookingBuildingId, setNewBookingBuildingId] = useState<
    string | null
  >(null);

  // Shared Schedule / Reschedule modal overlay. Holds the booking id
  // ops is scheduling and the active mode:
  //   - "schedule"   → coordination → scheduled (from awaiting-
  //                    coordination row or BookingDetail Schedule card)
  //   - "reschedule" → move an already-scheduled booking to a new slot
  //                    (from BookingDetail Schedule card)
  // `null` means the modal is closed.
  const [schedulingTarget, setSchedulingTarget] = useState<
    { id: string; mode: SchedulingMode } | null
  >(null);

  // Bottom-right success toast (Task #78). The `id` field gives each
  // toast a stable key so the Toast component can reset its 4s
  // auto-dismiss timer when a second scheduling lands while the
  // previous toast is still visible.
  //
  // The optional `undo` callback (Task #92) wires the success toast to
  // a one-click revert of the scheduling that just happened — flips
  // the booking back to "to_be_coordinated", restores its prior date,
  // drops the freshly-appended timeline entry, and releases the
  // rollout slot capacity that was consumed.
  const [toast, setToast] = useState<{
    id: string;
    message: string;
    undo?: () => void;
  } | null>(null);

  // When jumping to Payments, default the bookings list to the payments filter.
  const [bookingsStatusFilter, setBookingsStatusFilter] =
    useState<"all" | ServiceStatus | PaymentStatus>("all");
  const [search, setSearch] = useState("");
  // Active building filter on the Bookings list ("all" = no filter).
  const [bookingsBuildingFilter, setBookingsBuildingFilter] =
    useState<string>("all");
  // Awaiting-coordination view filter — independent from the bookings
  // status filter so an admin can flip between views without losing
  // their coordination grouping. "all" shows both queues at once.
  const [coordinationFilter, setCoordinationFilter] =
    useState<"all" | CoordinationKind>("all");

  function handleNav(id: ViewId) {
    setView(id);
    setSelectedBookingId(null);
    setSelectedBuildingId(null);
    setSelectedRolloutId(null);
    if (id === "payments") {
      setBookingsStatusFilter("pending");
    } else if (id === "bookings") {
      setBookingsStatusFilter("all");
    }
    setSearch("");
    setBookingsBuildingFilter("all");
  }

  /**
   * Open the bookings list filtered to a specific building (used by
   * "View bookings" links inside the Buildings view). Clears any
   * status filter / search so the building filter is the only lens.
   */
  function openBookingsForBuilding(buildingId: string) {
    setView("bookings");
    setSelectedBookingId(null);
    setSelectedBuildingId(null);
    setBookingsStatusFilter("all");
    setSearch("");
    setBookingsBuildingFilter(buildingId);
  }

  // Service-status advance / payment status / notes edits flow back into
  // the local seeded list (live booking is read-only in this mockup).
  function updateBooking(id: string, patch: Partial<AdminBooking>) {
    if (id === "bk-live") return; // can't mutate the session-derived row here
    setSeededBookings((prev) =>
      prev.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    );
  }

  /**
   * Bulk-log a call across several coordination bookings in one go.
   * Mirrors the per-booking `logCall()` in `BookingDetail` (same typed
   * `kind: "call"` timeline entry, same `lastContactedAt` stamp) but
   * threads every selected id through a single `setSeededBookings` so
   * we don't race on stale state when ops chases four rows at once.
   *
   * Replaces the legacy `bulkMarkAsChased` that produced a generic
   * `"Marked as chased"` entry — the bulk affordance now carries the
   * same outcome (No answer / Spoke / Voicemail) and optional shared
   * note as the per-row Log call form, so the timeline reads
   * consistently regardless of how the entry was created. The live
   * demo row is silently skipped — same guard as `updateBooking`.
   *
   * Fires a confirmation toast so a busy admin scanning a long queue
   * sees the bulk action landed — matches the toast pattern used by
   * cancel / reschedule / schedule-coordination. The early return
   * above guarantees we never fire a toast for a no-op.
   */
  function bulkLogCall(ids: string[], outcome: CallOutcome, note: string) {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const nowIso = new Date().toISOString();
    const trimmedNote = note.trim();
    setSeededBookings((prev) =>
      prev.map((b) => {
        if (b.id === "bk-live") return b;
        if (!idSet.has(b.id)) return b;
        const newEntry: TimelineEntry = {
          kind: "call",
          status: "logged_call",
          label: `Logged call · ${CALL_OUTCOME_LABEL[outcome]}`,
          at: "Just now",
          by: "Mia (admin)",
          loggedAt: nowIso,
          ...(trimmedNote.length > 0 ? { note: trimmedNote } : {}),
        };
        return {
          ...b,
          lastContactedAt: nowIso,
          serviceTimeline: [...b.serviceTimeline, newEntry],
        };
      }),
    );
    const count = ids.length;
    setToast({
      id: `bulk-log-call-${Date.now()}`,
      message: `Logged call on ${count} booking${count === 1 ? "" : "s"} · ${CALL_OUTCOME_LABEL[outcome]}`,
    });
  }

  /**
   * Bulk-log an email across several coordination bookings in one go.
   * Mirror of {@link bulkLogCall} for the email channel — appends a
   * typed `kind: "email"` / `status: "logged_email"` timeline entry to
   * every selected row and stamps `lastContactedAt`. Same shape as
   * `BookingDetail.logEmail()` so timeline entries stay
   * interchangeable regardless of how they were created (per-row vs
   * bulk). The live demo row is silently skipped — same guard as
   * `updateBooking` and `bulkLogCall`.
   *
   * The shared subject is encoded in the entry label so the timeline
   * reads as a one-line summary; the optional shared note carries the
   * body / context. Both are trimmed before they reach the timeline so
   * stray whitespace from the form doesn't bleed into the audit trail.
   */
  function bulkLogEmail(
    ids: string[],
    subject: string,
    note: string,
    templateLabel: string,
  ) {
    if (ids.length === 0) return;
    const nowIso = new Date().toISOString();
    setSeededBookings((prev) =>
      applyBulkLogEmail(prev, ids, subject, note, nowIso),
    );
    const count = ids.length;
    // Toast format reflects which template (or "Custom") landed so
    // ops can confirm at a glance — keeps the Awaiting-coordination
    // "Last attempt" cell consistent across batches because the same
    // template label that ops just acknowledged also ends up in the
    // timeline subject. For Custom we additionally surface the
    // free-text subject so the toast still tells ops which message
    // they actually sent. Trimmed for parity with the audit trail.
    const trimmedTemplate = templateLabel.trim();
    const trimmedSubject = subject.trim();
    const isCustom =
      trimmedTemplate.length === 0 ||
      trimmedTemplate.toLowerCase() === "custom";
    const tail = isCustom
      ? trimmedSubject.length > 0
        ? ` · Custom · ${trimmedSubject}`
        : ` · Custom`
      : ` · ${trimmedTemplate}`;
    setToast({
      id: `bulk-log-email-${Date.now()}`,
      message: `Logged email on ${count} booking${count === 1 ? "" : "s"}${tail}`,
    });
  }

  /**
   * Per-row counterpart to the `bulkLogEmail` toast above. Wired to
   * {@link BookingDetail.onLogEmailToast}, which fires after the
   * detail screen's own `logEmail` writes the timeline entry. We
   * intentionally re-use the same toast format as bulk (with a
   * `1 booking` count and the same `· {Template} | · Custom · {subject}`
   * tail) so a busy admin sees a consistent confirmation regardless
   * of whether the email was logged from the detail screen or the
   * Awaiting-coordination bulk action bar. The detail screen still
   * owns the timeline write — this handler is purely the toast.
   */
  function logEmailToast(templateLabel: string, subject: string) {
    const trimmedTemplate = templateLabel.trim();
    const trimmedSubject = subject.trim();
    const isCustom =
      trimmedTemplate.length === 0 ||
      trimmedTemplate.toLowerCase() === "custom";
    const tail = isCustom
      ? trimmedSubject.length > 0
        ? ` · Custom · ${trimmedSubject}`
        : ` · Custom`
      : ` · ${trimmedTemplate}`;
    setToast({
      id: `log-email-${Date.now()}`,
      message: `Logged email on 1 booking${tail}`,
    });
  }

  // ── Cancel / Reschedule (Task #49) ─────────────────────────────────────
  //
  // Both flows are admin-only and the live demo row is read-only here
  // (it mirrors the customer's session — the customer is the source of
  // truth for their own booking). We:
  //   1. Update the booking row (status / payment / timeline patch).
  //   2. Free / move the rollout slot capacity via the helpers in
  //      `adminMockData` so the schedule strip + Rollouts view reflect
  //      the change immediately.
  //   3. Bump the rollouts refresh key so any view reading from the
  //      module-level rollouts store re-renders.
  function cancelBooking(id: string, note: string) {
    if (id === "bk-live") return;
    // Mirror the reschedule guard: cancellation note is mandatory for
    // the audit trail. The modal already enforces this in the UI; the
    // defensive trim+empty check here protects any future caller.
    const trimmedNote = note.trim();
    if (trimmedNote.length === 0) return;
    const booking = seededBookings.find((b) => b.id === id);
    if (!booking) return;
    if (booking.serviceStatus === "cancelled") return;
    const wasPaid = booking.paymentStatus === "paid";
    const releaseOk = releaseBookingCapacity(booking);
    const serviceEntry: TimelineEntry = {
      status: "cancelled",
      label: `Cancelled · ${trimmedNote}`,
      at: "Just now",
      by: "Mia (admin)",
    };
    const patch: Partial<AdminBooking> = {
      serviceStatus: "cancelled",
      cancelledAt: "Just now",
      cancelledBy: "Mia (admin)",
      cancellationNote: trimmedNote,
      serviceTimeline: [...booking.serviceTimeline, serviceEntry],
    };
    if (wasPaid) {
      const paymentEntry: TimelineEntry = {
        status: "refund_pending",
        label: "Refund pending · cancelled by Mia (admin)",
        at: "Just now",
        by: "Mia (admin)",
      };
      patch.paymentStatus = "refund_pending";
      patch.paymentTimeline = [...booking.paymentTimeline, paymentEntry];
    }
    setSeededBookings((prev) =>
      prev.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    );
    // Cancel always changes the booking's lifecycle, so customer-side
    // subscribers (slot pickers + unit tiles) MUST be told even when
    // the booking had no concrete slot to release (coordination /
    // unscheduled). Keep `releaseOk` to gate the rollouts refresh
    // (capacity didn't change in that case) but always notify
    // live-bookings subscribers via `notifyLiveBookingsChanged`.
    if (releaseOk) {
      bumpRolloutsRefreshKey();
    } else {
      notifyLiveBookingsChanged();
    }
  }

  /**
   * Reverse a cancellation. Re-runs the same uniqueness check the
   * customer flow uses (`getActiveBookingForUnit`) against the
   * booking's unit + rollout. Three outcomes:
   *   - "no_op"      → booking missing, live, or not actually cancelled
   *                    (button shouldn't have been clickable; defensive).
   *   - "restored"   → the slot is still free, so the booking is put
   *                    back at its original date/window, capacity is
   *                    re-consumed, refund-pending payments flip back
   *                    to "paid", and an "Undo · {note}" entry is
   *                    appended to the service timeline. The original
   *                    cancellation note is reused so the audit trail
   *                    stays explicit about *what* was undone.
   *   - "slot_taken" → another booking grabbed the unit while this
   *                    row was cancelled; we leave the cancellation
   *                    intact and hand the caller enough context to
   *                    pivot to the reschedule modal.
   *
   * The combined "undo + reschedule" path is intentionally separate
   * (`undoCancelBookingAndReschedule` below) — it lets the user pick a
   * fresh slot atomically with the restore so we never leave the
   * booking in a half-restored state with no slot.
   */
  function undoCancelBooking(
    id: string,
  ):
    | { kind: "no_op" }
    | { kind: "restored" }
    | {
        kind: "slot_taken";
        takenBy: {
          name: string;
          role: AdminBooking["bookerRole"];
          // `serviceDate` may be null for awaiting-coordination winners
          // — we surface the null through to the dialog which softens
          // the copy when there's no concrete date to show.
          date: AdminBooking["serviceDate"];
          slot: AdminBooking["serviceSlot"];
        };
      } {
    if (id === "bk-live") return { kind: "no_op" };
    const booking = seededBookings.find((b) => b.id === id);
    if (!booking) return { kind: "no_op" };
    if (booking.serviceStatus !== "cancelled") return { kind: "no_op" };
    // Uniqueness check against the unit + rollout — this skips
    // cancelled rows (i.e. it ignores the booking we're trying to
    // restore, which is still in the list with status "cancelled").
    const verdict = getActiveBookingForUnit(
      booking.unitId,
      seededBookings,
      booking.rolloutId,
    );
    if (verdict.kind === "paid" || verdict.kind === "invoice_pending") {
      const winning = verdict.booking;
      return {
        kind: "slot_taken",
        takenBy: {
          name: winning.customerName,
          role: winning.bookerRole,
          date: winning.serviceDate,
          slot: winning.serviceSlot,
        },
      };
    }
    // Restore in place. Re-consume capacity if the booking had a
    // concrete slot — coordination bookings never consumed capacity
    // in the first place so there's nothing to put back.
    if (
      booking.rolloutId &&
      booking.serviceDate &&
      (booking.serviceSlot === "morning" || booking.serviceSlot === "afternoon")
    ) {
      consumeBookingCapacity(
        booking,
        booking.rolloutId,
        booking.serviceDate,
        booking.serviceSlot,
      );
    }
    const restoredStatus = priorServiceStatusFromTimeline(booking);
    const note = booking.cancellationNote ?? "";
    const undoEntry: TimelineEntry = {
      status: restoredStatus,
      label: note ? `Undo · ${note}` : "Undo · cancellation reversed",
      at: "Just now",
      by: "Mia (admin)",
    };
    const patch: Partial<AdminBooking> = {
      serviceStatus: restoredStatus,
      cancelledAt: undefined,
      cancelledBy: undefined,
      cancellationNote: undefined,
      serviceTimeline: [...booking.serviceTimeline, undoEntry],
    };
    if (booking.paymentStatus === "refund_pending") {
      const paymentEntry: TimelineEntry = {
        status: "paid",
        label: "Refund cancelled · booking restored by Mia (admin)",
        at: "Just now",
        by: "Mia (admin)",
      };
      patch.paymentStatus = "paid";
      patch.paymentTimeline = [...booking.paymentTimeline, paymentEntry];
    }
    setSeededBookings((prev) =>
      prev.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    );
    bumpRolloutsRefreshKey();
    return { kind: "restored" };
  }

  /**
   * Pivot path for {@link undoCancelBooking}: the original slot is
   * gone, so the admin picks a new one in the reschedule modal and we
   * restore + reschedule atomically. Capacity is consumed at the new
   * slot only — the booking's old slot was already freed by the
   * original cancellation, so there's nothing to release.
   */
  function undoCancelBookingAndReschedule(
    id: string,
    date: string,
    window: "morning" | "afternoon",
  ) {
    if (id === "bk-live") return;
    const booking = seededBookings.find((b) => b.id === id);
    if (!booking || !booking.rolloutId) return;
    if (booking.serviceStatus !== "cancelled") return;
    consumeBookingCapacity(booking, booking.rolloutId, date, window);
    const restoredStatus = priorServiceStatusFromTimeline(booking);
    const note = booking.cancellationNote ?? "";
    const winLabel = window === "morning" ? "morning" : "afternoon";
    const undoLabel = note
      ? `Undo · ${note} — restored to ${date} · ${winLabel}`
      : `Undo · cancellation reversed — restored to ${date} · ${winLabel}`;
    const undoEntry: TimelineEntry = {
      status: restoredStatus,
      label: undoLabel,
      at: "Just now",
      by: "Mia (admin)",
    };
    const patch: Partial<AdminBooking> = {
      serviceStatus: restoredStatus,
      serviceDate: date,
      serviceSlot: window,
      cancelledAt: undefined,
      cancelledBy: undefined,
      cancellationNote: undefined,
      serviceTimeline: [...booking.serviceTimeline, undoEntry],
    };
    if (booking.paymentStatus === "refund_pending") {
      const paymentEntry: TimelineEntry = {
        status: "paid",
        label: "Refund cancelled · booking restored by Mia (admin)",
        at: "Just now",
        by: "Mia (admin)",
      };
      patch.paymentStatus = "paid";
      patch.paymentTimeline = [...booking.paymentTimeline, paymentEntry];
    }
    setSeededBookings((prev) =>
      prev.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    );
    bumpRolloutsRefreshKey();
  }

  /**
   * Move an already-scheduled booking from its current slot to
   * (`date`, `window`). Mirrors `scheduleCoordinationBooking` but
   * operates on bookings that already have a concrete slot:
   *   1. Release the booking's footprint from its current slot.
   *   2. Consume that same footprint at the new slot.
   *   3. Append a "Rescheduled · {short date} · {window}" timeline
   *      entry attributed to Mia (admin).
   *   4. Bump the rollouts refresh key so any view reading from the
   *      module-level rollouts store re-renders.
   * No-ops on the live demo row (read-only), cancelled bookings, and
   * bookings with no rollout linked.
   */
  function rescheduleAppointment(
    id: string,
    date: string,
    window: "morning" | "afternoon",
    note?: string,
  ) {
    if (id === "bk-live") return;
    const booking = seededBookings.find((b) => b.id === id);
    if (!booking || !booking.rolloutId) return;
    if (booking.serviceStatus === "cancelled") return;
    if (
      booking.serviceSlot !== "morning" &&
      booking.serviceSlot !== "afternoon"
    ) {
      return;
    }
    if (booking.serviceDate === date && booking.serviceSlot === window) {
      // No-op reschedule. Modal also gates this, but keep the guard
      // for any future caller.
      setSchedulingTarget(null);
      return;
    }
    releaseBookingCapacity(booking);
    // Build the post-reschedule shape so consumeBookingCapacity sees
    // the booking against its new slot — duration is unchanged so this
    // is mostly cosmetic, but it keeps the helper symmetric with
    // release.
    const moved: AdminBooking = {
      ...booking,
      serviceDate: date,
      serviceSlot: window,
    };
    consumeBookingCapacity(moved, booking.rolloutId, date, window);
    const entry: TimelineEntry = buildRescheduledTimelineEntry({
      date,
      window,
      note,
    });
    setSeededBookings((prev) =>
      prev.map((b) =>
        b.id === id
          ? {
              ...b,
              serviceDate: date,
              serviceSlot: window,
              serviceTimeline: [...b.serviceTimeline, entry],
            }
          : b,
      ),
    );
    bumpRolloutsRefreshKey();
    setSchedulingTarget(null);
  }

  /** Admin acknowledges that the superseded invoice has been voided
   *  in the billing system. Clears `supersededByBookingId` (so the
   *  "Invoice to cancel" pill drops off the row) and stamps a service-
   *  timeline note for the audit trail. Live demo row + bookings that
   *  were never superseded are no-ops. */
  function acknowledgeSupersede(id: string) {
    if (id === "bk-live") return;
    const booking = seededBookings.find((b) => b.id === id);
    if (!booking || !booking.supersededByBookingId) return;
    const entry: TimelineEntry = {
      status: "cancelled",
      label: "Invoice supersede acknowledged · void recorded",
      at: "Just now",
      by: "Mia (admin)",
    };
    setSeededBookings((prev) =>
      prev.map((b) =>
        b.id === id
          ? {
              ...b,
              supersededByBookingId: undefined,
              serviceTimeline: [...b.serviceTimeline, entry],
            }
          : b,
      ),
    );
  }

  // ── Customer submit-time uniqueness guard (Task #49) ───────────────────
  //
  // When the customer hits "Pay" in the iframed booking flow, their
  // `submitBooking()` calls into the registered guard before promoting
  // the session to `submitted`. The guard re-checks the unit against
  // the current admin-side bookings, since seeded rows can change
  // during the demo. Three outcomes:
  //   - "paid"             → another customer paid first; reject.
  //   - "invoice_pending"  → an admin invoice-pending row exists; we
  //                          supersede it (cancel + free capacity +
  //                          stamp `supersededByBookingId`) and let
  //                          the new booking through.
  //   - "ok"               → no conflict.
  //
  // The guard re-registers whenever `seededBookings` changes so it
  // always sees the freshest list. Reset on unmount to prevent a stale
  // closure from outliving the admin shell.
  useEffect(() => {
    // Expose the admin's live (mutable) bookings list to customer-side
    // helpers (slot pickers, unit tiles) so admin cancel / reschedule /
    // supersede edits become visible to the customer flow when both
    // shells are mounted in the same React tree.
    setLiveBookingsSource(() => seededBookings);
    notifyLiveBookingsChanged();
    setLiveUnitsSource(() => units);
    notifyLiveUnitsChanged();
    setUniquenessGuard((sess, newBookingReference) => {
      if (!sess.unit_id) return "ok";
      const rollout = findRolloutForBooking("svc-ac", sess.unit_id);
      if (!rollout) return "ok";
      const verdict = getActiveBookingForUnit(
        sess.unit_id,
        seededBookings,
        rollout.id,
      );
      if (verdict.kind === "paid") {
        // Hand the dead-end screen the booker context (Task #49
        // review feedback) so it can show name + role + scheduled
        // window + a "Contact us" CTA instead of a generic message.
        const winning = verdict.booking;
        return {
          kind: "paid",
          blocker: {
            name: winning.customerName,
            role: winning.bookerRole,
            date: winning.serviceDate,
            slot: winning.serviceSlot,
          },
        };
      }
      if (verdict.kind === "invoice_pending") {
        const prior = verdict.booking;
        releaseBookingCapacity(prior);
        const supersedingName =
          `${sess.contact_first_name} ${sess.contact_last_name}`.trim() ||
          "the new customer";
        const note = `Superseded by paid booking ${newBookingReference} by ${supersedingName}.`;
        const entry: TimelineEntry = {
          status: "cancelled",
          label: "Cancelled · superseded by paid booking",
          at: "Just now",
          by: "System",
        };
        setSeededBookings((prev) =>
          prev.map((b) =>
            b.id === prior.id
              ? {
                  ...b,
                  serviceStatus: "cancelled",
                  cancelledAt: "Just now",
                  cancelledBy: "System",
                  cancellationNote: note,
                  supersededByBookingId: newBookingReference,
                  serviceTimeline: [...b.serviceTimeline, entry],
                }
              : b,
          ),
        );
        bumpRolloutsRefreshKey();
        return "invoice_pending";
      }
      return "ok";
    });
    return () => {
      setUniquenessGuard(null);
      setLiveBookingsSource(null);
      setLiveUnitsSource(null);
    };
  }, [seededBookings, units]);

  function openNewBooking(buildingId: string | null) {
    setNewBookingBuildingId(buildingId);
    setNewBookingOpen(true);
  }
  function closeNewBooking() {
    setNewBookingOpen(false);
    setNewBookingBuildingId(null);
  }

  /**
   * Append a freshly-created admin (phone) booking to the in-memory
   * store. When a concrete slot was picked, also bump the matching
   * rollout's per-window capacity so the booking is reflected on the
   * Rollouts view and the building detail's schedule strip (both read
   * the same rollouts store).
   *
   *  - For `time_budget_per_window` rollouts we add the job's duration
   *    to `bookedMinutes` (mirrors customer-side bookings).
   *  - For `slots_per_window` rollouts we increment `bookedCount` by 1
   *    regardless of duration (matches the rollout slot status semantics).
   *
   * Coordination outcomes ("to_be_coordinated") leave the rollout
   * untouched — the slot hasn't been claimed yet. We also no-op when
   * no rollout exists for the picked unit (the New Booking flow forces
   * coordination in that case, but belt-and-suspenders).
   */
  function appendBooking(
    booking: AdminBooking,
    schedule: AdminCreatedScheduleChoice,
  ) {
    setSeededBookings((prev) => [booking, ...prev]);
    if (schedule.kind === "slot") {
      const rollout = findRolloutForBooking("svc-ac", booking.unitId);
      if (rollout) {
        const day = rollout.days.find((d) => d.isoDate === schedule.date);
        const slot = day
          ? schedule.window === "morning"
            ? day.morning
            : day.afternoon
          : null;
        if (slot) {
          if (rollout.capacityModel === "slots_per_window") {
            updateRolloutSlot(rollout.id, schedule.date, schedule.window, {
              bookedCount: (slot.bookedCount ?? 0) + 1,
            });
          } else {
            const jobMin = bookingDurationMinutes(booking);
            updateRolloutSlot(rollout.id, schedule.date, schedule.window, {
              bookedMinutes: slot.bookedMinutes + jobMin,
            });
          }
          bumpRolloutsRefreshKey();
        }
      }
    }
    closeNewBooking();
    // Drop the user back into the bookings list so they can see the
    // freshly-created row right away.
    setView("bookings");
    setSelectedBookingId(null);
    setSelectedBuildingId(null);
    setBookingsStatusFilter("all");
    setSearch("");
    setBookingsBuildingFilter("all");
  }

  /**
   * Convert a coordination booking into a scheduled appointment. Flips
   * the booking's serviceSlot from "to_be_coordinated" to a real
   * window, appends a "Coordinated · {date} · {window}" timeline
   * entry, and bumps the matching rollout's per-window capacity using
   * the same logic `appendBooking` uses for freshly-created phone
   * bookings (slot-count or time-budget, depending on the rollout).
   *
   * No-ops on the live demo row (read-only) and when the booking can't
   * be found.
   */
  function scheduleCoordinationBooking(
    bookingId: string,
    date: string,
    window: "morning" | "afternoon",
  ): (() => void) | undefined {
    const booking = allBookings.find((b) => b.id === bookingId);
    if (!booking || booking.isLive) return undefined;

    const patch = convertCoordinationToScheduledPatch(booking, {
      date,
      window,
    });
    updateBooking(bookingId, patch);

    // Track whether capacity was actually consumed so the undo can
    // decide whether to release. Only `consumeBookingCapacity` knows
    // (it returns false when the rollout / day / slot can't be
    // resolved — defensive only). Coordination bookings always have a
    // rolloutId, but we null-guard for type safety.
    const consumedCapacity =
      booking.rolloutId !== null &&
      consumeBookingCapacity(booking, booking.rolloutId, date, window);
    if (consumedCapacity) {
      bumpRolloutsRefreshKey();
    }

    // Inverse of everything we just did, captured at call time so the
    // undo doesn't need to re-derive the prior shape from the
    // post-patch booking row. `releaseBookingCapacity` reads the
    // *current* slot from the rollouts store — important because
    // `updateRolloutSlot` is immutable, so any rollout reference
    // closed over here would be a stale pre-consume snapshot. We pass
    // the post-schedule shape (date + window we just consumed
    // against) so it knows which slot to release.
    return () => {
      const revertPatch = revertScheduledToCoordinationPatch(booking);
      updateBooking(bookingId, revertPatch);

      if (consumedCapacity) {
        const released = releaseBookingCapacity({
          ...booking,
          serviceDate: date,
          serviceSlot: window,
        });
        if (released) {
          bumpRolloutsRefreshKey();
        }
      }
    };
  }

  const schedulingBooking =
    schedulingTarget !== null
      ? allBookings.find((b) => b.id === schedulingTarget.id) ?? null
      : null;

  function openSchedule(id: string) {
    setSchedulingTarget({ id, mode: "schedule" });
  }
  function openReschedule(id: string) {
    setSchedulingTarget({ id, mode: "reschedule" });
  }
  function openUndoReschedule(id: string) {
    setSchedulingTarget({ id, mode: "undo" });
  }
  function handleSchedulingConfirm(
    bookingId: string,
    date: string,
    window: "morning" | "afternoon",
    note?: string,
  ) {
    if (!schedulingTarget) return;
    const mode = schedulingTarget.mode;
    // Only the "schedule" path exposes Undo on the toast — that's the
    // only mode Task #92 covers. Reschedule and undo-cancel go through
    // their own separate flows.
    let undo: (() => void) | undefined;
    if (mode === "reschedule") {
      rescheduleAppointment(bookingId, date, window, note);
    } else if (mode === "undo") {
      undoCancelBookingAndReschedule(bookingId, date, window);
    } else {
      undo = scheduleCoordinationBooking(bookingId, date, window);
    }
    setSchedulingTarget(null);

    // Confirmation toast so ops sees the outcome even if they're
    // looking at a different list than the one this booking moved
    // into. Uses the same short-date formatter as the rollouts list
    // and timeline labels so the format is consistent across the app.
    // The Undo affordance disappears with the toast (4-second
    // auto-dismiss) — matches the existing inline undo pattern in
    // RolloutScheduleEditor.
    const windowLabel = window === "morning" ? "Morning" : "Afternoon";
    const action =
      mode === "reschedule"
        ? "rescheduled to"
        : mode === "undo"
          ? "restored to"
          : "scheduled for";
    setToast({
      id: `${bookingId}-${Date.now()}`,
      message: `${bookingId} ${action} ${formatBookingShortDate(date)} · ${windowLabel}`,
      undo,
    });
  }

  // Sidebar badges — surface the invoice-void queue from any view so
  // an admin spending their day in Awaiting coordination, Buildings,
  // Rollouts, or Units doesn't miss outstanding voids. Reuses the
  // same selector the dashboard banner does so the badge count and
  // the banner list never drift apart. Mirror the badge on Bookings
  // and Payments — the banner currently lives at the top of both
  // views, so both nav entries should advertise the same queue.
  const invoiceVoidCount = selectPendingInvoiceVoids(allBookings).length;
  const sidebarBadges: Partial<Record<ViewId, number>> = {
    bookings: invoiceVoidCount,
    payments: invoiceVoidCount,
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 font-['Inter'] text-slate-900">
      <Sidebar activeView={view} onNav={handleNav} badges={sidebarBadges} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar
          view={view}
          selectedBookingId={selectedBookingId}
          selectedBuildingId={selectedBuildingId}
          selectedRolloutId={selectedRolloutId}
          bookings={allBookings}
          buildings={buildings}
          units={units}
        />
        <main className="flex-1 overflow-y-auto px-8 py-6">
          {view === "bookings" || view === "payments" ? (
            selectedBookingId ? (
              <BookingDetail
                bookingId={selectedBookingId}
                bookings={allBookings}
                units={units}
                agents={agents}
                onBack={() => setSelectedBookingId(null)}
                onUpdate={updateBooking}
                onCancelBooking={cancelBooking}
                onScheduleCoordination={openSchedule}
                onRescheduleAppointment={openReschedule}
                onUndoCancelBooking={undoCancelBooking}
                onUndoCancelBookingAndReschedule={openUndoReschedule}
                onAcknowledgeSupersede={acknowledgeSupersede}
                onLogEmailToast={logEmailToast}
              />
            ) : (
              <BookingsView
                bookings={allBookings}
                units={units}
                buildings={buildings}
                statusFilter={bookingsStatusFilter}
                onStatusFilter={setBookingsStatusFilter}
                buildingFilter={bookingsBuildingFilter}
                onBuildingFilter={setBookingsBuildingFilter}
                search={search}
                onSearch={setSearch}
                onOpen={setSelectedBookingId}
                onNewBooking={() => openNewBooking(null)}
                paymentMode={view === "payments"}
                onAcknowledgeSupersede={acknowledgeSupersede}
                onUndoCancelBooking={undoCancelBooking}
                onUndoCancelBookingAndReschedule={openUndoReschedule}
              />
            )
          ) : null}

          {view === "awaiting_coordination" ? (
            selectedBookingId ? (
              <BookingDetail
                bookingId={selectedBookingId}
                bookings={allBookings}
                units={units}
                agents={agents}
                onBack={() => setSelectedBookingId(null)}
                onUpdate={updateBooking}
                onCancelBooking={cancelBooking}
                onScheduleCoordination={openSchedule}
                onRescheduleAppointment={openReschedule}
                onUndoCancelBooking={undoCancelBooking}
                onUndoCancelBookingAndReschedule={openUndoReschedule}
                onAcknowledgeSupersede={acknowledgeSupersede}
                onLogEmailToast={logEmailToast}
              />
            ) : (
              <AwaitingCoordinationView
                bookings={allBookings}
                units={units}
                buildings={buildings}
                filter={coordinationFilter}
                onFilter={setCoordinationFilter}
                buildingFilter={bookingsBuildingFilter}
                onBuildingFilter={setBookingsBuildingFilter}
                search={search}
                onSearch={setSearch}
                onOpen={setSelectedBookingId}
                onSchedule={openSchedule}
                onBulkLogCall={bulkLogCall}
                onBulkLogEmail={bulkLogEmail}
                emailTemplates={emailTemplates}
              />
            )
          ) : null}

          {view === "rollouts" ? (
            selectedRolloutId ? (
              <RolloutScheduleEditor
                rolloutId={selectedRolloutId}
                buildings={buildings}
                refreshKey={rolloutsRefreshKey}
                bumpRefreshKey={bumpRolloutsRefreshKey}
                onBack={() => setSelectedRolloutId(null)}
              />
            ) : (
              <RolloutsView
                buildings={buildings}
                bookings={allBookings}
                refreshKey={rolloutsRefreshKey}
                onCreate={(input) => {
                  const created = createRollout(input);
                  bumpRolloutsRefreshKey();
                  setSelectedRolloutId(created.id);
                }}
                onOpen={(id) => setSelectedRolloutId(id)}
              />
            )
          ) : null}

          {view === "buildings" ? (
            selectedBuildingId ? (
              <BuildingDetail
                buildingId={selectedBuildingId}
                buildings={buildings}
                units={units}
                bookings={allBookings}
                onBack={() => setSelectedBuildingId(null)}
                onOpenBooking={(bookingId) => {
                  setSelectedBuildingId(null);
                  setView("bookings");
                  setBookingsStatusFilter("all");
                  setSearch("");
                  setBookingsBuildingFilter("all");
                  setSelectedBookingId(bookingId);
                }}
                onOpenAllBookings={openBookingsForBuilding}
                onNewBooking={openNewBooking}
                onOpenRollout={(rolloutId) => {
                  setSelectedBuildingId(null);
                  setView("rollouts");
                  setSelectedRolloutId(rolloutId);
                }}
              />
            ) : (
              <BuildingsView
                buildings={buildings}
                units={units}
                bookings={allBookings}
                onOpen={setSelectedBuildingId}
              />
            )
          ) : null}

          {view === "units" && (
            <UnitsView
              units={units}
              setUnits={setUnits}
              agents={agents}
              buildings={buildings}
            />
          )}

          {view === "agents" && (
            <AgentsView
              agents={agents}
              setAgents={setAgents}
              units={units}
              setUnits={setUnits}
            />
          )}

          {view === "email_templates" && (
            <EmailTemplatesView
              templates={emailTemplates}
              onCreate={createEmailTemplate}
              onUpdate={updateEmailTemplate}
              onRemove={removeEmailTemplate}
            />
          )}
        </main>
      </div>
      {newBookingOpen && (
        <NewBookingFlow
          units={units}
          buildings={buildings}
          bookings={allBookings}
          rolloutsRefreshKey={rolloutsRefreshKey}
          presetBuildingId={newBookingBuildingId}
          onCancel={closeNewBooking}
          onConfirm={appendBooking}
        />
      )}
      {schedulingBooking && schedulingTarget && (
        <SchedulingModal
          booking={schedulingBooking}
          units={units}
          mode={schedulingTarget.mode}
          onCancel={() => setSchedulingTarget(null)}
          onConfirm={handleSchedulingConfirm}
        />
      )}
      {toast && (
        <Toast
          id={toast.id}
          message={toast.message}
          onUndo={toast.undo}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  );
}
