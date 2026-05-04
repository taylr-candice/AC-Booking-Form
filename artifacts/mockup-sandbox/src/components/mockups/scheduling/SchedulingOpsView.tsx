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
import { CheckCircle2, X } from "lucide-react";
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

  const [toast, setToast] = useState<{
    message: string;
    variant: "success" | "info";
  } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(message: string, variant: "success" | "info" = "success") {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, variant });
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

    setBookings((prev) =>
      prev.map((b) => (b.id === bookingId ? { ...b, ...patch } : b)),
    );

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
      "success",
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
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="relative w-full max-w-2xl mx-4 rounded-2xl overflow-hidden shadow-2xl bg-white">
            <button
              type="button"
              onClick={() => setSchedulingBookingId(null)}
              className="absolute top-4 right-4 z-10 p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
            <SchedulingModal
              booking={schedulingBooking}
              units={Array.from(SEEDED_UNITS)}
              mode="schedule"
              onCancel={() => setSchedulingBookingId(null)}
              onConfirm={handleScheduleConfirm}
            />
          </div>
        </div>
      )}

      {toast && (
        <div
          className="absolute bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-xl px-4 py-3 shadow-lg text-sm font-medium text-white transition-all"
          style={{ backgroundColor: BRAND }}
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {toast.message}
        </div>
      )}
    </div>
  );
}
