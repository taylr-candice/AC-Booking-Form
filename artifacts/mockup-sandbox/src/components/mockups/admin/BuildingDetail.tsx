/**
 * Building detail — split layout for one building's rollout.
 *
 * Left column shows every unit in the building with its current
 * booking status (booked / complete / no booking yet); right column
 * lists the per-service rollouts running on this building, with a
 * link into the per-rollout schedule editor where admins actually
 * open / close days and edit per-window capacity.
 *
 * Read-only — editing schedule lives in the Rollouts view (per-rollout
 * editor); editing units / bookings lives in their own screens.
 */

import { ArrowRight, CalendarRange, ChevronLeft, ChevronRight } from "lucide-react";

import {
  bookerAgencyName,
  formatRolloutDateRange,
  getBuildingBookings,
  getBuildingUnits,
  getRolloutsForBuilding,
  getServiceById,
  latestBookingByUnit,
  summarizeBuildingRollout,
  type AdminBooking,
  type AdminBuilding,
  type AdminRollout,
  type AdminUnit,
} from "@/state/adminMockData";

import { Card } from "./atoms";
import { ServiceChip } from "./chips";
import { BRAND, BRAND_DEEP, BRAND_SOFT } from "./theme";

export function BuildingDetail({
  buildingId,
  buildings,
  units,
  bookings,
  onBack,
  onOpenBooking,
  onOpenAllBookings,
  onNewBooking,
  onOpenRollout,
}: {
  buildingId: string;
  buildings: AdminBuilding[];
  units: AdminUnit[];
  bookings: AdminBooking[];
  onBack: () => void;
  onOpenBooking: (bookingId: string) => void;
  onOpenAllBookings: (buildingId: string) => void;
  onNewBooking: (buildingId: string) => void;
  onOpenRollout: (rolloutId: string) => void;
}) {
  const building = buildings.find((b) => b.id === buildingId);

  if (!building) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="text-slate-700">
          That building is no longer available.{" "}
          <button
            type="button"
            onClick={onBack}
            className="font-semibold underline"
            style={{ color: BRAND }}
          >
            Back to buildings
          </button>
        </div>
      </div>
    );
  }

  const buildingUnits = getBuildingUnits(buildingId, units);
  const buildingBookings = getBuildingBookings(buildingId, units, bookings);
  const summary = summarizeBuildingRollout(buildingId, units, bookings);
  const coordinationBookings = buildingBookings.filter(
    (b) => b.serviceSlot === "to_be_coordinated",
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-600 hover:text-slate-900"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to buildings
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onNewBooking(buildingId)}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-semibold transition hover:bg-slate-50"
            style={{ borderColor: BRAND, color: BRAND }}
          >
            New booking
          </button>
          <button
            type="button"
            onClick={() => onOpenAllBookings(buildingId)}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white transition hover:brightness-110"
            style={{ backgroundColor: BRAND }}
          >
            View all bookings
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Summary card */}
      <Card>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[18px] font-semibold leading-tight text-slate-900">
              {building.name}
            </div>
            <div className="mt-0.5 text-[13px] text-slate-500">
              {building.addressLine1} · {building.addressLine2}
            </div>
            <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium capitalize text-slate-700">
              {building.acType} · {building.acBrand}
              <span className="text-[10px] font-normal text-slate-500">
                pre-fills new bookings
              </span>
            </div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-5 gap-3 border-t border-slate-100 pt-4">
          <SummaryStat label="Units" value={String(summary.totalUnits)} />
          <SummaryStat
            label="Booked"
            value={`${summary.bookedUnits} / ${summary.totalUnits}`}
            accent={BRAND_DEEP}
          />
          <SummaryStat
            label="Remaining"
            value={String(summary.remainingUnits)}
          />
          <SummaryStat
            label="Date range"
            value={formatRolloutDateRange(summary.dateRange)}
          />
          <SummaryStat
            label="Complete"
            value={String(summary.completedUnits)}
          />
        </div>
        {coordinationBookings.length > 0 && (
          <div
            className="mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
            style={{ backgroundColor: BRAND_SOFT, color: BRAND_DEEP }}
          >
            {coordinationBookings.length} booking
            {coordinationBookings.length === 1 ? "" : "s"} awaiting tenant
            coordination
          </div>
        )}
      </Card>

      {/* Two-column body: units list + schedule strip */}
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-1 flex flex-col gap-4">
          <Card
            title="Units in this building"
            subtitle={`${summary.bookedUnits} of ${summary.totalUnits} have a booking on file`}
          >
            <UnitsPanel
              units={buildingUnits}
              bookings={buildingBookings}
              onOpenBooking={onOpenBooking}
            />
          </Card>
        </div>
        <div className="col-span-2 flex flex-col gap-4">
          <Card
            title="Rollouts in this building"
            subtitle="Each rollout has its own date range, capacity model, and per-window schedule"
          >
            <RolloutsPanel
              rollouts={getRolloutsForBuilding(buildingId)}
              onOpenRollout={onOpenRollout}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─── Rollouts panel ────────────────────────────────────────────────────────

function RolloutsPanel({
  rollouts,
  onOpenRollout,
}: {
  rollouts: AdminRollout[];
  onOpenRollout: (rolloutId: string) => void;
}) {
  if (rollouts.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-[13px] text-slate-500">
        No rollouts yet. Create one from the Rollouts view to open this
        building for bookings.
      </div>
    );
  }
  return (
    <ol className="flex flex-col gap-2">
      {rollouts.map((r) => (
        <li key={r.id}>
          <RolloutRow rollout={r} onOpen={() => onOpenRollout(r.id)} />
        </li>
      ))}
    </ol>
  );
}

function RolloutRow({
  rollout,
  onOpen,
}: {
  rollout: AdminRollout;
  onOpen: () => void;
}) {
  const service = getServiceById(rollout.serviceId);
  const modeLabel =
    rollout.capacityModel === "slots_per_window"
      ? "Slots per window"
      : "Time budget per window";
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 text-left transition hover:border-slate-300 hover:bg-slate-50"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <CalendarRange
            className="h-3.5 w-3.5 shrink-0"
            style={{ color: BRAND }}
          />
          <div className="truncate text-[13px] font-semibold text-slate-900">
            {rollout.name}
          </div>
        </div>
        <div className="mt-0.5 text-[11px] text-slate-500">
          {service ? service.name : "Service"} ·{" "}
          {formatRolloutDateRange({
            from: rollout.startDate,
            to: rollout.endDate,
          })}{" "}
          · {modeLabel}
        </div>
      </div>
      <span
        className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
        style={{ backgroundColor: BRAND_SOFT, color: BRAND_DEEP }}
      >
        Open schedule
        <ArrowRight className="h-3 w-3" />
      </span>
    </button>
  );
}

// ─── Summary stat tile ─────────────────────────────────────────────────────

function SummaryStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div
        className="text-[18px] font-semibold leading-tight"
        style={{ color: accent ?? "#0F172A" }}
      >
        {value}
      </div>
    </div>
  );
}

// ─── Units panel ───────────────────────────────────────────────────────────

function UnitsPanel({
  units,
  bookings,
  onOpenBooking,
}: {
  units: AdminUnit[];
  bookings: AdminBooking[];
  onOpenBooking: (bookingId: string) => void;
}) {
  if (units.length === 0) {
    return (
      <div className="text-[13px] text-slate-500">
        No units linked to this building yet.
      </div>
    );
  }
  // Pick the most recent booking for each unit so the status chip
  // always reflects the unit's *current* booking — not whatever
  // happened to come last in the array. Shared with the rollout
  // summary so completion counts and unit chips can't disagree.
  const latestByUnit = latestBookingByUnit(bookings);
  return (
    <ol className="flex flex-col gap-2">
      {units.map((unit) => {
        const booking = latestByUnit.get(unit.id) ?? null;
        return (
          <li key={unit.id}>
            <UnitRow
              unit={unit}
              booking={booking}
              onOpenBooking={onOpenBooking}
            />
          </li>
        );
      })}
    </ol>
  );
}

function UnitRow({
  unit,
  booking,
  onOpenBooking,
}: {
  unit: AdminUnit;
  booking: AdminBooking | null;
  onOpenBooking: (bookingId: string) => void;
}) {
  const hasBooking = booking !== null;
  const customerLabel = booking
    ? booking.bookerRole === "agent"
      ? bookerAgencyName(booking) ?? booking.customerName
      : booking.customerName
    : null;
  return (
    <button
      type="button"
      disabled={!hasBooking}
      onClick={() => booking && onOpenBooking(booking.id)}
      className={`flex w-full items-center justify-between gap-3 rounded-lg border p-2.5 text-left transition ${
        hasBooking
          ? "cursor-pointer border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
          : "cursor-not-allowed border-dashed border-slate-200 bg-slate-50"
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium text-slate-900">
          {unit.addressLine1}
        </div>
        <div className="text-[11px] text-slate-500">
          {hasBooking
            ? customerLabel
            : "No booking yet — still in the rollout"}
        </div>
      </div>
      {booking ? (
        <div className="flex shrink-0 items-center gap-2">
          {booking.serviceSlot === "to_be_coordinated" || !booking.serviceDate ? (
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
              style={{ backgroundColor: BRAND_SOFT, color: BRAND_DEEP }}
            >
              To coordinate
            </span>
          ) : (
            <div className="text-right">
              <div className="text-[11px] font-medium text-slate-900">
                {booking.serviceDate}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500">
                {booking.serviceSlot}
              </div>
            </div>
          )}
          <ServiceChip status={booking.serviceStatus} />
        </div>
      ) : (
        <span className="shrink-0 text-[11px] text-slate-400">—</span>
      )}
    </button>
  );
}

