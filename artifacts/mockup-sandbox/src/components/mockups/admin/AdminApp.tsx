/**
 * Taylr Admin (mockup) — shell.
 *
 * Single-page mockup of the admin-side ops UI: bookings list + detail,
 * slot calendar, units & AC config, agents, payments. No real DB, no
 * real auth — all data is seeded and any "edits" live in component
 * state for the demo session only.
 *
 * The customer's current sessionStorage booking is folded into the
 * bookings list as a "Live demo" row so the customer can demo the
 * customer flow and see it appear here in real time.
 *
 * Each major screen lives in its own file under this directory; this
 * shell just owns the shared state (units, agents, bookings, calendar,
 * active view, current selection) and routes between them.
 */

import { useMemo, useState } from "react";

import {
  bookingDurationMinutes,
  getCalendar,
  liveBookingFromSession,
  SEEDED_AGENTS,
  SEEDED_BOOKINGS,
  SEEDED_BUILDINGS,
  SEEDED_UNITS,
  type AdminAgent,
  type AdminBooking,
  type AdminBuilding,
  type AdminCalendarDay,
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
import { CalendarView } from "./CalendarView";
import { NewBookingFlow } from "./NewBookingFlow";
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
  const [calendar, setCalendar] = useState<AdminCalendarDay[]>(() => getCalendar());

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
   * store. When a concrete slot was picked, also bump the global slot
   * calendar so the booking is reflected on the calendar view (and on
   * the building detail's schedule strip, which reads the same source).
   *
   *  - For `time_based` windows we add the job's duration to
   *    `bookedMinutes` (mirrors customer-side bookings).
   *  - For `count_based` windows we increment `bookedCount` by 1
   *    regardless of duration (matches `slotIsAvailable` semantics).
   *
   * Coordination outcomes ("to_be_coordinated") leave the calendar
   * untouched — the slot hasn't been claimed yet.
   */
  function appendBooking(
    booking: AdminBooking,
    schedule: AdminCreatedScheduleChoice,
  ) {
    setSeededBookings((prev) => [booking, ...prev]);
    if (schedule.kind === "slot") {
      const jobMin = bookingDurationMinutes(booking);
      setCalendar((prev) =>
        prev.map((day) => {
          if (day.isoDate !== schedule.date) return day;
          const which = schedule.window;
          const slot = day[which];
          const updated =
            slot.mode === "count_based"
              ? { ...slot, bookedCount: slot.bookedCount + 1 }
              : { ...slot, bookedMinutes: slot.bookedMinutes + jobMin };
          return { ...day, [which]: updated };
        }),
      );
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

          {view === "calendar" && (
            <CalendarView calendar={calendar} setCalendar={setCalendar} />
          )}

          {view === "buildings" ? (
            selectedBuildingId ? (
              <BuildingDetail
                buildingId={selectedBuildingId}
                buildings={buildings}
                units={units}
                bookings={allBookings}
                calendar={calendar}
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
          calendar={calendar}
          presetBuildingId={newBookingBuildingId}
          onCancel={closeNewBooking}
          onConfirm={appendBooking}
        />
      )}
    </div>
  );
}
