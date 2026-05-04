/**
 * SchedulingOpsView
 *
 * Standalone ops form — the "Awaiting scheduling" queue with a live
 * Schedule modal that actually mutates rollout capacity and persists
 * to the protoStore so every other canvas iframe (tenant/owner
 * scheduling views, booking flow) updates in real time.
 *
 * Dynamic sync story:
 *   1. Ops clicks "Schedule" on a coordination booking row.
 *   2. The SchedulingModal opens — ops picks a date + window.
 *   3. On confirm:
 *      a. convertCoordinationToScheduledPatch flips the booking to
 *         a real scheduled slot and appends a timeline entry.
 *      b. consumeBookingCapacity reduces the matching rollout window's
 *         booked minutes / slot count in the shared in-memory store.
 *      c. persistRolloutsToStore serialises the updated store to
 *         localStorage and broadcasts "rollouts_changed" so every
 *         other iframe's useSyncExternalStore subscription fires and
 *         the slot picker re-renders with the new availability.
 *
 * Subscribes to protoStore bookings so customer-created bookings
 * (from the BookingFlow canvas iframe) appear in the queue without
 * a page refresh.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { AwaitingCoordinationView } from "../admin/AwaitingCoordinationView";
import type { OutcomeFilter } from "../admin/AwaitingCoordinationView";
import { SchedulingModal } from "../admin/SchedulingModal";
import {
  consumeBookingCapacity,
  convertCoordinationToScheduledPatch,
  SEEDED_BOOKINGS,
  SEEDED_UNITS,
  SEEDED_BUILDINGS,
  type AdminBooking,
  type CoordinationKind,
} from "@/state/adminMockData";
import {
  getProtoBookings,
  persistProtoBooking,
  persistRolloutsToStore,
  subscribeProtoBookings,
} from "@/state/protoStore";

type Filter = "all" | CoordinationKind;

const BRAND = "#ED017F";

function mergeBookings(
  seeded: readonly AdminBooking[],
  proto: AdminBooking[],
): AdminBooking[] {
  const out = [...(seeded as AdminBooking[])];
  for (const p of proto) {
    const idx = out.findIndex((b) => b.id === p.id);
    if (idx >= 0) {
      out[idx] = p;
    } else {
      out.unshift(p);
    }
  }
  return out;
}

export function SchedulingOpsView() {
  const [filter, setFilter] = useState<Filter>("awaiting_scheduling");
  const [buildingFilter, setBuildingFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>("all");

  const [schedulingBookingId, setSchedulingBookingId] = useState<string | null>(
    null,
  );

  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  function showToast(message: string) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(message);
    toastTimerRef.current = setTimeout(() => setToast(null), 4000);
  }

  const [bookings, setBookings] = useState<AdminBooking[]>(() =>
    mergeBookings(SEEDED_BOOKINGS, getProtoBookings()),
  );

  useEffect(() => {
    return subscribeProtoBookings(() => {
      setBookings(mergeBookings(SEEDED_BOOKINGS, getProtoBookings()));
    });
  }, []);

  const schedulingBooking = useMemo(
    () =>
      schedulingBookingId
        ? bookings.find((b) => b.id === schedulingBookingId) ?? null
        : null,
    [bookings, schedulingBookingId],
  );

  function handleScheduleConfirm(
    bookingId: string,
    date: string,
    window: "morning" | "afternoon" | "evening",
  ) {
    const booking = bookings.find((b) => b.id === bookingId);
    if (!booking) return;

    const patch = convertCoordinationToScheduledPatch(booking, { date, window });
    const scheduledBooking = { ...booking, ...patch };

    // Persist the scheduled booking to the proto store so that the
    // subscribeProtoBookings listener — which rebuilds local state from
    // mergeBookings(SEEDED_BOOKINGS, getProtoBookings()) — always produces
    // the scheduled version, even after subsequent bookings_changed events
    // from other iframes (e.g. a customer completing their booking). Without
    // this, any later broadcast would revert the booking to to_be_coordinated
    // and allow double-consumption of rollout capacity.
    persistProtoBooking(scheduledBooking);
    // Note: persistProtoBooking fires subscribeProtoBookings listeners
    // synchronously, which calls setBookings with the rebuilt (scheduled)
    // state — no separate setBookings call needed here.

    if (booking.rolloutId) {
      const consumed = consumeBookingCapacity(
        booking,
        booking.rolloutId,
        date,
        window,
      );
      if (consumed) {
        persistRolloutsToStore();
      }
    }

    setSchedulingBookingId(null);

    const windowLabel =
      window === "morning"
        ? "Morning"
        : window === "afternoon"
          ? "Afternoon"
          : "Evening";
    const shortDate = new Date(date + "T00:00:00").toLocaleDateString("en-AU", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
    showToast(
      `Scheduled ${booking.customerName ?? "booking"} · ${shortDate} · ${windowLabel}`,
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden font-['Inter'] bg-white relative">
      <AwaitingCoordinationView
        bookings={bookings}
        units={Array.from(SEEDED_UNITS)}
        buildings={Array.from(SEEDED_BUILDINGS)}
        filter={filter}
        onFilter={setFilter}
        buildingFilter={buildingFilter}
        onBuildingFilter={setBuildingFilter}
        search={search}
        onSearch={setSearch}
        outcomeFilter={outcomeFilter}
        onOutcomeFilter={setOutcomeFilter}
        onOpen={() => {}}
        onSchedule={(id) => setSchedulingBookingId(id)}
      />

      {schedulingBooking && (
        <SchedulingModal
          booking={schedulingBooking}
          units={Array.from(SEEDED_UNITS)}
          mode="schedule"
          onCancel={() => setSchedulingBookingId(null)}
          onConfirm={handleScheduleConfirm}
        />
      )}

      {toast && (
        <div
          className="absolute bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-xl px-4 py-3 shadow-lg text-sm font-medium text-white transition-all"
          style={{ backgroundColor: BRAND }}
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {toast}
        </div>
      )}
    </div>
  );
}
