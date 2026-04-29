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

import { useMemo, useState } from "react";

import {
  bookingDurationMinutes,
  createRollout,
  findRolloutForBooking,
  liveBookingFromSession,
  SEEDED_AGENTS,
  SEEDED_BOOKINGS,
  SEEDED_BUILDINGS,
  SEEDED_UNITS,
  updateRolloutSlot,
  type AdminAgent,
  type AdminBooking,
  type AdminBuilding,
  type AdminCreatedScheduleChoice,
  type AdminUnit,
  type PaymentStatus,
  type ServiceStatus,
} from "@/state/adminMockData";
import { useBookingSession } from "@/state/bookingSession";

import { AgentsView } from "./AgentsView";
import { BookingDetail } from "./BookingDetail";
import { BookingsView } from "./BookingsView";
import { BuildingDetail } from "./BuildingDetail";
import { BuildingsView } from "./BuildingsView";
import { NewBookingFlow } from "./NewBookingFlow";
import { RolloutScheduleEditor } from "./RolloutScheduleEditor";
import { RolloutsView } from "./RolloutsView";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { UnitsView } from "./UnitsView";
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

  // When jumping to Payments, default the bookings list to the payments filter.
  const [bookingsStatusFilter, setBookingsStatusFilter] =
    useState<"all" | ServiceStatus | PaymentStatus>("all");
  const [search, setSearch] = useState("");
  // Active building filter on the Bookings list ("all" = no filter).
  const [bookingsBuildingFilter, setBookingsBuildingFilter] =
    useState<string>("all");

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
    </div>
  );
}
