/**
 * Top breadcrumb / title bar for the admin mockup. Reads the active
 * view + current selection from props and shows the right title.
 */

import { Sparkles } from "lucide-react";

import {
  getBuildingForUnit,
  getRolloutById,
  type AdminBooking,
  type AdminBuilding,
  type AdminUnit,
} from "@/state/adminMockData";

import { BRAND_DEEP, BRAND_SOFT } from "./theme";
import type { ViewId } from "./types";

export function TopBar({
  view,
  selectedBookingId,
  selectedBuildingId,
  selectedRolloutId,
  bookings,
  buildings,
  units,
}: {
  view: ViewId;
  selectedBookingId: string | null;
  selectedBuildingId: string | null;
  selectedRolloutId: string | null;
  bookings: AdminBooking[];
  buildings: AdminBuilding[];
  units: AdminUnit[];
}) {
  let title = "";
  let crumb = "";
  if (view === "bookings") {
    title = selectedBookingId ? "Booking detail" : "Bookings";
    const b = bookings.find((x) => x.id === selectedBookingId);
    const unit = b ? units.find((u) => u.id === b.unitId) ?? null : null;
    const building = getBuildingForUnit(unit);
    crumb = selectedBookingId
      ? `Bookings / ${building ? `${building.name} · ` : ""}${b?.id ?? selectedBookingId}`
      : "All bookings across the workspace";
  } else if (view === "payments") {
    title = selectedBookingId ? "Booking detail" : "Payments";
    const b = bookings.find((x) => x.id === selectedBookingId);
    const unit = b ? units.find((u) => u.id === b.unitId) ?? null : null;
    const building = getBuildingForUnit(unit);
    crumb = selectedBookingId
      ? `Payments / ${building ? `${building.name} · ` : ""}${selectedBookingId}`
      : "Bookings filtered by payment status";
  } else if (view === "rollouts") {
    const rollout = getRolloutById(selectedRolloutId);
    title = rollout ? rollout.name : "Rollouts";
    crumb = rollout
      ? `Rollouts / ${rollout.name}`
      : "Per-rollout schedules — one (service × building) per row";
  } else if (view === "buildings") {
    const building = buildings.find((b) => b.id === selectedBuildingId);
    title = selectedBuildingId
      ? building?.name ?? "Building"
      : "Buildings";
    crumb = selectedBuildingId
      ? `Buildings / ${building?.name ?? selectedBuildingId}`
      : "AC rollouts grouped by residential building";
  } else if (view === "units") {
    title = "Units";
    crumb = "AC config on file (the source of customer pre-fill)";
  } else if (view === "agents") {
    title = "Agents";
    crumb = "Leasing agents and the units they manage";
  }
  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-8 py-4">
      <div>
        <div className="text-[12px] font-medium uppercase tracking-wider text-slate-500">
          {crumb}
        </div>
        <h1 className="text-[20px] font-semibold leading-tight text-slate-900">
          {title}
        </h1>
      </div>
      <div className="flex items-center gap-2">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider"
          style={{ backgroundColor: BRAND_SOFT, color: BRAND_DEEP }}
        >
          <Sparkles className="h-3 w-3" />
          Mockup mode · seeded data
        </span>
      </div>
    </header>
  );
}
