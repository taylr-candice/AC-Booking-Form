/**
 * Bookings whose service slot is `to_be_coordinated` — the queue Taylr
 * ops works through to nail down a real appointment time.
 *
 * Bookings here come from three access-method branches (see
 * {@link coordinationKindForBooking}): owner-leased + tenant
 * coordination, owner-leased + managing-agent coordination, and the
 * agent-side "Tenants will provide access · Taylr coordinates" path.
 * The view groups them by who we're waiting on so an admin can scan
 * the tenant queue and the agent queue separately.
 *
 * Reuses the bookings-list visual language: same toolbar (search +
 * filter chips), same row markup (Booking / Customer / Unit / AC),
 * same `PaymentChip`. The "Slot" column is replaced by a "Waiting on"
 * column whose chip flips between Tenant and Managing agent.
 *
 * Selecting a row tells the `AdminApp` shell to mount `BookingDetail`
 * — exactly the same click-through as the bookings list.
 */

import { Clock, Search } from "lucide-react";

import {
  bookerAgencyName,
  coordinationKindForBooking,
  getBuildingForUnit,
  type AdminBooking,
  type AdminBuilding,
  type AdminUnit,
  type CoordinationKind,
} from "@/state/adminMockData";

import { CustomerCell } from "./BookingsView";
import { PaymentChip, WaitingChip } from "./chips";
import { BRAND, BRAND_DEEP, BRAND_SOFT } from "./theme";

type Filter = "all" | CoordinationKind;

const FILTER_CHIPS: ReadonlyArray<{ key: Filter; label: string }> = [
  { key: "all", label: "All" },
  { key: "awaiting_tenant", label: "Awaiting tenant" },
  { key: "awaiting_agent", label: "Awaiting agent" },
];

function WaitingOnChip({ kind }: { kind: CoordinationKind | null }) {
  if (kind === null) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
        <Clock className="h-2.5 w-2.5" />
        Unassigned
      </span>
    );
  }
  const label = kind === "awaiting_agent" ? "Managing agent" : "Tenant";
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ backgroundColor: BRAND_SOFT, color: BRAND_DEEP }}
    >
      <Clock className="h-2.5 w-2.5" />
      {label}
    </span>
  );
}

export function AwaitingCoordinationView({
  bookings,
  units,
  buildings,
  filter,
  onFilter,
  buildingFilter,
  onBuildingFilter,
  search,
  onSearch,
  onOpen,
}: {
  bookings: AdminBooking[];
  units: AdminUnit[];
  buildings: AdminBuilding[];
  filter: Filter;
  onFilter: (f: Filter) => void;
  buildingFilter: string;
  onBuildingFilter: (id: string) => void;
  search: string;
  onSearch: (s: string) => void;
  onOpen: (id: string) => void;
}) {
  // Pre-compute the kind for each coordination booking so we don't
  // recompute it on every filter / search keystroke. We include every
  // booking whose serviceSlot is `to_be_coordinated`; rows whose
  // accessMethod doesn't match a known coordination bucket are kept
  // and rendered with an "Unassigned" chip so ops never lose sight
  // of them.
  const coordinating = bookings
    .filter((b) => b.serviceSlot === "to_be_coordinated")
    .map((b) => ({ b, kind: coordinationKindForBooking(b) }));

  const tenantCount = coordinating.filter((x) => x.kind === "awaiting_tenant").length;
  const agentCount = coordinating.filter((x) => x.kind === "awaiting_agent").length;
  const unassignedCount = coordinating.filter((x) => x.kind === null).length;
  const totalCount = coordinating.length;

  const filtered = coordinating.filter(({ b, kind }) => {
    if (filter !== "all" && kind !== filter) return false;
    if (buildingFilter !== "all") {
      const unit = units.find((u) => u.id === b.unitId);
      if (!unit || unit.buildingId !== buildingFilter) return false;
    }
    if (search.trim().length > 0) {
      const q = search.trim().toLowerCase();
      const unit = units.find((u) => u.id === b.unitId);
      const agency = bookerAgencyName(b);
      const haystack = [
        b.id,
        b.customerName,
        b.customerEmail,
        agency ?? "",
        b.bookerAgencyOtherName,
        unit?.addressLine1 ?? "",
        unit?.addressLine2 ?? "",
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Summary */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[13px] text-slate-700">
        <Clock className="h-4 w-4 text-slate-500" />
        {totalCount === 0 ? (
          <span>Nothing in coordination right now.</span>
        ) : (
          <>
            <span className="font-semibold text-slate-900">
              {totalCount} booking{totalCount === 1 ? "" : "s"} in coordination
            </span>
            <span className="text-slate-400">·</span>
            <span>
              <span className="font-semibold text-slate-900">{tenantCount}</span>{" "}
              awaiting tenant
            </span>
            <span className="text-slate-400">·</span>
            <span>
              <span className="font-semibold text-slate-900">{agentCount}</span>{" "}
              awaiting agent
            </span>
            {unassignedCount > 0 && (
              <>
                <span className="text-slate-400">·</span>
                <span>
                  <span className="font-semibold text-slate-900">
                    {unassignedCount}
                  </span>{" "}
                  unassigned
                </span>
              </>
            )}
          </>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Search by customer, ID, or address…"
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-[13px] text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
            />
          </div>
          <select
            value={buildingFilter}
            onChange={(e) => onBuildingFilter(e.target.value)}
            aria-label="Filter by building"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-900 focus:border-slate-400 focus:outline-none"
          >
            <option value="all">All buildings</option>
            {buildings.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTER_CHIPS.map((chip) => {
            const active = filter === chip.key;
            return (
              <button
                key={chip.key}
                type="button"
                onClick={() => onFilter(chip.key)}
                className={`rounded-full px-3 py-1 text-[12px] font-medium transition ${
                  active
                    ? "text-white"
                    : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
                }`}
                style={active ? { backgroundColor: BRAND } : undefined}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-[13px]">
          <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Booking</th>
              <th className="px-4 py-3 font-semibold">Customer</th>
              <th className="px-4 py-3 font-semibold">Unit</th>
              <th className="px-4 py-3 font-semibold">AC</th>
              <th className="px-4 py-3 font-semibold">Waiting on</th>
              <th className="px-4 py-3 font-semibold">Payment</th>
              <th className="px-4 py-3 font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                  No coordination bookings match these filters.
                </td>
              </tr>
            ) : (
              filtered.map(({ b, kind }) => {
                const unit = units.find((u) => u.id === b.unitId);
                const building = getBuildingForUnit(unit ?? null);
                return (
                  <tr
                    key={b.id}
                    onClick={() => onOpen(b.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onOpen(b.id);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={`Open booking ${b.id} for ${b.customerName}`}
                    className="cursor-pointer border-b border-slate-100 transition last:border-b-0 hover:bg-slate-50 focus:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 font-semibold text-slate-900">
                        {b.id}
                        {b.isLive && (
                          <span
                            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                            style={{ backgroundColor: BRAND, color: "white" }}
                          >
                            Live
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {b.bookerRole === "agent" ? "Agent booking" : "Owner booking"}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <CustomerCell booking={b} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">
                        {unit?.addressLine1 ?? b.unitId}
                      </div>
                      <div className="text-[11px] text-slate-500">{unit?.addressLine2}</div>
                      {building && (
                        <div className="mt-0.5 text-[11px] font-medium text-slate-600">
                          {building.name}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900 capitalize">
                        {b.acType}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {b.systems} system{b.systems === 1 ? "" : "s"}
                        {b.additional > 0 ? ` + ${b.additional} extra` : ""}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1">
                        <WaitingOnChip kind={kind} />
                        <WaitingChip createdAt={b.createdAt} />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <PaymentChip status={b.paymentStatus} />
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      ${b.totalAud.toFixed(2)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <div className="text-[11px] text-slate-500">
        Showing {filtered.length} of {totalCount} coordination booking
        {totalCount === 1 ? "" : "s"}.
      </div>
    </div>
  );
}
