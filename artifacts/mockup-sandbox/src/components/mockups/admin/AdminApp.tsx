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
  bookingDurationMinutes,
  consumeBookingCapacity,
  convertCoordinationToScheduledPatch,
  createRollout,
  findRolloutForBooking,
  getActiveBookingForUnit,
  getRolloutById,
  liveBookingFromSession,
  notifyLiveBookingsChanged,
  notifyLiveUnitsChanged,
  releaseBookingCapacity,
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
  type PaymentStatus,
  type ServiceStatus,
  type TimelineEntry,
} from "@/state/adminMockData";
import { setUniquenessGuard, useBookingSession } from "@/state/bookingSession";

import { AgentsView } from "./AgentsView";
import { AwaitingCoordinationView } from "./AwaitingCoordinationView";
import { BookingDetail } from "./BookingDetail";
import { BookingsView } from "./BookingsView";
import { BuildingDetail } from "./BuildingDetail";
import { BuildingsView } from "./BuildingsView";
import { NewBookingFlow } from "./NewBookingFlow";
import { RolloutScheduleEditor } from "./RolloutScheduleEditor";
import { RolloutsView } from "./RolloutsView";
import { ScheduleCoordinationModal } from "./ScheduleCoordinationModal";
import { Sidebar } from "./Sidebar";
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

  // Coordination → scheduled overlay. Holds the booking id ops is
  // scheduling. `null` means the modal is closed.
  const [schedulingBookingId, setSchedulingBookingId] = useState<string | null>(
    null,
  );

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

  function rescheduleBooking(
    id: string,
    date: string,
    window: "morning" | "afternoon",
    note?: string,
  ) {
    if (id === "bk-live") return;
    // Per spec T007 the reschedule note is OPTIONAL — only cancel
    // (T006) requires a note. Trim defensively so accidental
    // whitespace doesn't leak into the audit-trail label.
    const trimmedNote = note?.trim() ?? "";
    const booking = seededBookings.find((b) => b.id === id);
    if (!booking || !booking.rolloutId) return;
    if (booking.serviceStatus === "cancelled") return;
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
    const winLabel = window === "morning" ? "morning" : "afternoon";
    // Note is optional — append it only when the admin actually typed
    // one so the audit-trail label stays clean for note-less moves.
    const noteSuffix = trimmedNote ? ` — ${trimmedNote}` : "";
    // Task #49 review: include the *previous* date/window in the
    // timeline label so the audit trail reads end-to-end ("from →
    // to"). Falls back to "an unscheduled slot" only for legacy rows
    // that didn't have a concrete starting slot — won't happen in
    // practice because reschedule is gated on a concrete current
    // slot in the BookingDetail action area.
    const fromLabel =
      booking.serviceDate &&
      (booking.serviceSlot === "morning" || booking.serviceSlot === "afternoon")
        ? `${booking.serviceDate} · ${booking.serviceSlot}`
        : "an unscheduled slot";
    const entry: TimelineEntry = {
      status: "rescheduled",
      label: `Rescheduled from ${fromLabel} to ${date} · ${winLabel}${noteSuffix}`,
      at: "Just now",
      by: "Mia (admin)",
    };
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
  ) {
    const booking = allBookings.find((b) => b.id === bookingId);
    if (!booking || booking.isLive) return;

    const patch = convertCoordinationToScheduledPatch(booking, {
      date,
      window,
    });
    updateBooking(bookingId, patch);

    const rollout = getRolloutById(booking.rolloutId);
    if (rollout) {
      const day = rollout.days.find((d) => d.isoDate === date);
      const slot = day
        ? window === "morning"
          ? day.morning
          : day.afternoon
        : null;
      if (slot) {
        if (rollout.capacityModel === "slots_per_window") {
          updateRolloutSlot(rollout.id, date, window, {
            bookedCount: (slot.bookedCount ?? 0) + 1,
          });
        } else {
          const jobMin = bookingDurationMinutes(booking);
          updateRolloutSlot(rollout.id, date, window, {
            bookedMinutes: slot.bookedMinutes + jobMin,
          });
        }
        bumpRolloutsRefreshKey();
      }
    }

    setSchedulingBookingId(null);
  }

  const schedulingBooking =
    schedulingBookingId !== null
      ? allBookings.find((b) => b.id === schedulingBookingId) ?? null
      : null;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 font-['Inter'] text-slate-900">
      <Sidebar activeView={view} onNav={handleNav} />
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
                onRescheduleBooking={rescheduleBooking}
                onScheduleCoordination={(id) => setSchedulingBookingId(id)}
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
                onRescheduleBooking={rescheduleBooking}
                onScheduleCoordination={(id) => setSchedulingBookingId(id)}
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
                onSchedule={(id) => setSchedulingBookingId(id)}
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
      {schedulingBooking && (
        <ScheduleCoordinationModal
          booking={schedulingBooking}
          units={units}
          onCancel={() => setSchedulingBookingId(null)}
          onConfirm={scheduleCoordinationBooking}
        />
      )}
    </div>
  );
}
