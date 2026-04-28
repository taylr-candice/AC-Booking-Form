/**
 * Building detail — split layout for one building's rollout.
 *
 * Left column shows every unit in the building with its current
 * booking status (booked / complete / no booking yet); right column
 * shows a 14-day schedule strip overlaying the building's bookings
 * onto the shared slot calendar, in the same time-based vs.
 * count-based visual language as the slot calendar view.
 *
 * Read-only — editing schedule, units, etc. happens in their own
 * dedicated screens (Calendar / Units / Booking detail).
 */

import { ChevronLeft, ChevronRight, Clock, Hash } from "lucide-react";

import {
  bookerAgencyName,
  formatRolloutDateRange,
  getBuildingBookings,
  getBuildingUnits,
  summarizeBuildingRollout,
  type AdminBooking,
  type AdminBuilding,
  type AdminCalendarDay,
  type AdminSlotMode,
  type AdminUnit,
} from "@/state/adminMockData";

import { Card } from "./atoms";
import { ServiceChip } from "./chips";
import { BRAND, BRAND_DEEP, BRAND_SOFT, modeColor } from "./theme";

export function BuildingDetail({
  buildingId,
  buildings,
  units,
  bookings,
  calendar,
  onBack,
  onOpenBooking,
  onOpenAllBookings,
}: {
  buildingId: string;
  buildings: AdminBuilding[];
  units: AdminUnit[];
  bookings: AdminBooking[];
  calendar: AdminCalendarDay[];
  onBack: () => void;
  onOpenBooking: (bookingId: string) => void;
  onOpenAllBookings: (buildingId: string) => void;
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
            title="Schedule across the next 14 days"
            subtitle="Where this building's bookings land in the shared slot calendar"
          >
            <ScheduleStripLegend />
            <ScheduleStrip
              calendar={calendar}
              bookings={buildingBookings}
            />
          </Card>
        </div>
      </div>
    </div>
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
  // Pick the most recent booking for each unit (last in the seeded list
  // is the freshest one). Falling back to "no booking" otherwise.
  const latestByUnit = new Map<string, AdminBooking>();
  for (const b of bookings) {
    latestByUnit.set(b.unitId, b);
  }
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

// ─── Schedule strip ────────────────────────────────────────────────────────

/**
 * Legend explaining the time-based vs count-based color coding —
 * mirrors the slot calendar's legend so the visual language is
 * consistent.
 */
function ScheduleStripLegend() {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
      <div className="inline-flex items-center gap-1.5">
        <Clock className="h-3 w-3" style={{ color: BRAND }} />
        <span>
          <strong className="text-slate-900">Time-based</strong> window
        </span>
      </div>
      <div className="inline-flex items-center gap-1.5">
        <Hash className="h-3 w-3" style={{ color: "#3B82F6" }} />
        <span>
          <strong className="text-slate-900">Count-based</strong> window
        </span>
      </div>
      <div className="inline-flex items-center gap-1.5">
        <span
          className="inline-block h-2 w-2 rounded-sm"
          style={{ backgroundColor: BRAND_DEEP }}
        />
        <span>This building's bookings</span>
      </div>
    </div>
  );
}

function ScheduleStrip({
  calendar,
  bookings,
}: {
  calendar: AdminCalendarDay[];
  bookings: AdminBooking[];
}) {
  // Index bookings per (date, window) for fast lookup while rendering days.
  const byDayWindow = new Map<string, AdminBooking[]>();
  for (const b of bookings) {
    if (!b.serviceDate) continue;
    if (b.serviceSlot !== "morning" && b.serviceSlot !== "afternoon") continue;
    const key = `${b.serviceDate}::${b.serviceSlot}`;
    const arr = byDayWindow.get(key) ?? [];
    arr.push(b);
    byDayWindow.set(key, arr);
  }
  return (
    <div className="grid grid-cols-7 gap-2">
      {calendar.map((day) => {
        const morningBookings =
          byDayWindow.get(`${day.isoDate}::morning`) ?? [];
        const afternoonBookings =
          byDayWindow.get(`${day.isoDate}::afternoon`) ?? [];
        return (
          <div
            key={day.isoDate}
            className={`flex flex-col gap-1.5 rounded-lg border p-2 ${
              day.open
                ? "border-slate-200 bg-white"
                : "border-slate-200 bg-slate-50 opacity-70"
            }`}
          >
            <div className="flex items-baseline justify-between">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                {day.weekdayLabel}
              </div>
              <div className="text-[14px] font-semibold leading-none text-slate-900">
                {day.dayLabel}
              </div>
            </div>
            {day.open ? (
              <>
                <ScheduleSlotCell
                  label="AM"
                  mode={day.morning.mode}
                  bookingsHere={morningBookings}
                />
                <ScheduleSlotCell
                  label="PM"
                  mode={day.afternoon.mode}
                  bookingsHere={afternoonBookings}
                />
              </>
            ) : (
              <div className="rounded bg-slate-100 px-1.5 py-1 text-center text-[10px] font-medium text-slate-500">
                Closed
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ScheduleSlotCell({
  label,
  mode,
  bookingsHere,
}: {
  label: string;
  mode: AdminSlotMode;
  bookingsHere: AdminBooking[];
}) {
  const accent = modeColor(mode);
  const count = bookingsHere.length;
  const ModeIcon = mode === "count_based" ? Hash : Clock;
  const hasBooking = count > 0;
  return (
    <div
      className={`rounded border px-1.5 py-1 ${
        hasBooking ? "" : "border-slate-100"
      }`}
      style={
        hasBooking
          ? { borderColor: accent, backgroundColor: `${accent}14` }
          : undefined
      }
      title={
        hasBooking
          ? `${count} booking${count === 1 ? "" : "s"} in this ${
              mode === "count_based" ? "count-based" : "time-based"
            } window`
          : `No bookings · ${
              mode === "count_based" ? "count-based" : "time-based"
            } window`
      }
    >
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1 text-[10px] font-semibold text-slate-600">
          <ModeIcon className="h-2.5 w-2.5" style={{ color: accent }} />
          {label}
        </div>
        {hasBooking ? (
          <span
            className="inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
            style={{ backgroundColor: accent }}
          >
            {count}
          </span>
        ) : (
          <span className="text-[10px] text-slate-400">·</span>
        )}
      </div>
    </div>
  );
}
