/**
 * Buildings list — one row per residential building Taylr is rolling
 * the AC service out to. Each row summarises the rollout: total units
 * vs. units that have booked, the date range of bookings so far, and
 * the next service the admin should be aware of. Selecting a row
 * tells the `AdminApp` shell to mount `BuildingDetail`.
 *
 * Counts are derived live from `units` + `bookings` via
 * `summarizeBuildingRollout`, so they stay in sync as the rest of
 * the admin shell mutates state.
 */

import { Building2, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  formatRolloutDateRange,
  summarizeBuildingRollout,
  type AdminBooking,
  type AdminBuilding,
  type AdminUnit,
} from "@/state/adminMockData";

import { BRAND, BRAND_DEEP, BRAND_SOFT } from "./theme";

export function BuildingsView({
  buildings,
  units,
  bookings,
  onOpen,
  initialFocusedRowId,
  onFocusedRowConsumed,
}: {
  buildings: AdminBuilding[];
  units: AdminUnit[];
  bookings: AdminBooking[];
  onOpen: (id: string) => void;
  /** One-shot seed for the source-row highlight: id of the building
   *  the admin pivoted FROM (e.g. via the {@link BuildingDetail}
   *  "Back to buildings" button). Mirrors the `initialFocusedRowId`
   *  prop on {@link BookingsView} / {@link AwaitingCoordinationView} /
   *  {@link RolloutsView} so a pivot back into the buildings list
   *  keeps the same source-row highlight + scroll-into-view behaviour
   *  the other list views have (Task #216). Applied on first paint
   *  (BRAND_SOFT tint + pulse + scroll-into-view), dismissed on first
   *  interaction, then cleared via {@link onFocusedRowConsumed} so
   *  re-renders never re-apply it. Optional. */
  initialFocusedRowId?: string | null;
  /** Fires once after BuildingsView consumes
   *  {@link initialFocusedRowId} so the parent can clear its seed
   *  slot. Mirrors the BookingsView / AwaitingCoordinationView /
   *  RolloutsView callback. */
  onFocusedRowConsumed?: () => void;
}) {
  // Source-row highlight (Task #216): mirror of the same machinery
  // in {@link BookingsView} / {@link AwaitingCoordinationView} /
  // {@link RolloutsView} so an admin pivoting back into this list
  // (via the BuildingDetail "Back to buildings" button) lands on a
  // visibly highlighted source row instead of losing their place on
  // a long buildings list. Persistent BRAND_SOFT tint + one-shot
  // pulse + scroll-into-view, dismissed on first interaction
  // (scroll / mousedown / keydown). Seeded from
  // `initialFocusedRowId` so first paint already carries the
  // highlight; re-seeded via the effect below when a fresh non-null
  // value lands mid-life.
  const [focusedRowId, setFocusedRowId] = useState<string | null>(
    initialFocusedRowId ?? null,
  );
  const [pulseRowId, setPulseRowId] = useState<string | null>(null);
  const rowRefs = useRef<Map<string, HTMLElement | null>>(new Map());
  // Re-apply when the parent hands us a fresh non-null seed mid-life
  // (admin pivots, dismisses, navigates away, pivots again into the
  // same component instance). Notify the parent so it can clear its
  // slot — otherwise unrelated re-renders would re-apply the
  // highlight after dismissal.
  useEffect(() => {
    if (initialFocusedRowId) {
      setFocusedRowId(initialFocusedRowId);
      setPulseRowId(initialFocusedRowId);
      onFocusedRowConsumed?.();
    }
    // Depend on seed value only, not callback identity — re-running
    // on consume-callback re-creation would defeat the one-shot
    // handoff invariant. Mirrors RolloutsView's approach.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFocusedRowId]);
  useEffect(() => {
    if (!focusedRowId) return;
    const row = rowRefs.current.get(focusedRowId);
    if (row && typeof row.scrollIntoView === "function") {
      row.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [focusedRowId]);
  // Drop the pulse marker after the keyframe plays (1100ms = 1s
  // animation + small buffer so the class survives the final frame).
  useEffect(() => {
    if (!pulseRowId) return;
    const t = setTimeout(() => setPulseRowId(null), 1100);
    return () => clearTimeout(t);
  }, [pulseRowId]);
  // Dismiss on first interaction. Listeners are scoped to the
  // focus-id lifecycle so the originating click can't dismiss
  // mid-flight, and a subsequent pivot re-arms a fresh dismissal.
  useEffect(() => {
    if (!focusedRowId) return;
    function dismiss() {
      setFocusedRowId(null);
    }
    window.addEventListener("scroll", dismiss, { passive: true, capture: true });
    window.addEventListener("mousedown", dismiss, true);
    window.addEventListener("keydown", dismiss, true);
    return () => {
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("mousedown", dismiss, true);
      window.removeEventListener("keydown", dismiss, true);
    };
  }, [focusedRowId]);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-[12px] text-slate-600">
        <div className="font-semibold text-slate-900">
          Each row is a building rollout
        </div>
        <div className="mt-1 text-slate-600">
          The AC service is sold building-by-building. Use this view to
          track how many units inside each building have booked, when
          the work is happening, and which buildings still have
          customers to convert.
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-[13px]">
          <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Building</th>
              <th className="px-4 py-3 font-semibold">Units</th>
              <th className="px-4 py-3 font-semibold">Booked</th>
              <th className="px-4 py-3 font-semibold">Remaining</th>
              <th className="px-4 py-3 font-semibold">Date range</th>
              <th className="px-4 py-3 font-semibold">Next service</th>
              <th className="px-4 py-3 font-semibold" />
            </tr>
          </thead>
          <tbody>
            {buildings.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-10 text-center text-slate-500"
                >
                  No buildings have been added yet.
                </td>
              </tr>
            ) : (
              buildings.map((building) => {
                const summary = summarizeBuildingRollout(
                  building.id,
                  units,
                  bookings,
                );
                const progressPct =
                  summary.totalUnits > 0
                    ? Math.round(
                        (summary.bookedUnits / summary.totalUnits) * 100,
                      )
                    : 0;
                const isFocused = focusedRowId === building.id;
                const isPulsing = pulseRowId === building.id;
                return (
                  <tr
                    key={building.id}
                    ref={(el) => {
                      rowRefs.current.set(building.id, el);
                    }}
                    onClick={() => onOpen(building.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onOpen(building.id);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={`Open ${building.name}`}
                    data-testid={`buildings-row-${building.id}`}
                    data-focused={isFocused ? "true" : undefined}
                    data-pulsing={isPulsing ? "true" : undefined}
                    className={`cursor-pointer border-b border-slate-100 transition last:border-b-0 hover:bg-slate-50 focus:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500${
                      isPulsing ? " template-row-focus-pulse" : ""
                    }`}
                    style={
                      isFocused ? { backgroundColor: BRAND_SOFT } : undefined
                    }
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="flex h-9 w-9 items-center justify-center rounded-lg"
                          style={{ backgroundColor: BRAND_SOFT }}
                        >
                          <Building2
                            className="h-4 w-4"
                            style={{ color: BRAND_DEEP }}
                          />
                        </div>
                        <div>
                          <div className="font-semibold text-slate-900">
                            {building.name}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {building.addressLine1} · {building.addressLine2}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {summary.totalUnits}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-900">
                          {summary.bookedUnits}
                        </span>
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${progressPct}%`,
                              backgroundColor: BRAND,
                            }}
                          />
                        </div>
                        <span className="text-[11px] text-slate-500">
                          {progressPct}%
                        </span>
                      </div>
                      {summary.completedUnits > 0 && (
                        <div className="mt-0.5 text-[11px] text-slate-500">
                          {summary.completedUnits} complete
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {summary.remainingUnits}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {formatRolloutDateRange(summary.dateRange)}
                      {summary.coordinationCount > 0 && (
                        <div className="mt-0.5 text-[11px] text-slate-500">
                          + {summary.coordinationCount} to coordinate
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {summary.nextScheduled ? (
                        <NextServiceCell
                          date={summary.nextScheduled.date}
                          slot={summary.nextScheduled.slot}
                        />
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <ChevronRight className="ml-auto h-4 w-4 text-slate-400" />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <div className="text-[11px] text-slate-500">
        Showing {buildings.length} building
        {buildings.length === 1 ? "" : "s"}.
      </div>
    </div>
  );
}

function NextServiceCell({
  date,
  slot,
}: {
  date: string;
  slot: "morning" | "afternoon" | "evening";
}) {
  return (
    <>
      <div className="font-medium text-slate-900">{date}</div>
      <div className="text-[11px] text-slate-500 capitalize">{slot}</div>
    </>
  );
}
