/**
 * Bookings list — drives both the "Bookings" view (all statuses, filter
 * by service status) and the "Payments" view (same table, filter by
 * payment status, status chips swapped). Selecting a row tells the
 * `AdminApp` shell to mount `BookingDetail`.
 */

import { Search, TriangleAlert } from "lucide-react";

import type {
  AdminBooking,
  AdminUnit,
  PaymentStatus,
  ServiceStatus,
} from "@/state/adminMockData";

import { PaymentChip, ServiceChip, SlotCell } from "./chips";
import { BRAND, BRAND_DEEP, BRAND_SOFT } from "./theme";

export function BookingsView({
  bookings,
  units,
  statusFilter,
  onStatusFilter,
  search,
  onSearch,
  onOpen,
  paymentMode,
}: {
  bookings: AdminBooking[];
  units: AdminUnit[];
  statusFilter: "all" | ServiceStatus | PaymentStatus;
  onStatusFilter: (s: "all" | ServiceStatus | PaymentStatus) => void;
  search: string;
  onSearch: (s: string) => void;
  onOpen: (id: string) => void;
  paymentMode: boolean;
}) {
  const filterChips: ReadonlyArray<{
    key: "all" | ServiceStatus | PaymentStatus;
    label: string;
  }> = paymentMode
    ? [
        { key: "all", label: "All payments" },
        { key: "paid", label: "Paid" },
        { key: "pending", label: "Pending" },
        { key: "refund_pending", label: "Refund pending" },
      ]
    : [
        { key: "all", label: "All statuses" },
        { key: "scheduled", label: "Scheduled" },
        { key: "en_route", label: "En route" },
        { key: "on_site", label: "On site" },
        { key: "complete", label: "Complete" },
      ];

  const filtered = bookings.filter((b) => {
    if (statusFilter !== "all") {
      if (paymentMode) {
        if (b.paymentStatus !== statusFilter) return false;
      } else {
        if (b.serviceStatus !== statusFilter) return false;
      }
    }
    if (search.trim().length > 0) {
      const q = search.trim().toLowerCase();
      const unit = units.find((u) => u.id === b.unitId);
      const haystack = [
        b.id,
        b.customerName,
        b.customerEmail,
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
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
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
        <div className="flex flex-wrap items-center gap-1.5">
          {filterChips.map((chip) => {
            const active = statusFilter === chip.key;
            return (
              <button
                key={chip.key}
                type="button"
                onClick={() => onStatusFilter(chip.key)}
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
              <th className="px-4 py-3 font-semibold">Slot</th>
              <th className="px-4 py-3 font-semibold">Payment</th>
              <th className="px-4 py-3 font-semibold">Service</th>
              <th className="px-4 py-3 font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                  No bookings match these filters.
                </td>
              </tr>
            ) : (
              filtered.map((b) => {
                const unit = units.find((u) => u.id === b.unitId);
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
                      <div className="font-medium text-slate-900">{b.customerName}</div>
                      <div className="text-[11px] text-slate-500">{b.customerEmail}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">
                        {unit?.addressLine1 ?? b.unitId}
                      </div>
                      <div className="text-[11px] text-slate-500">{unit?.addressLine2}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 font-medium text-slate-900">
                        <span className="capitalize">{b.acType}</span>
                        {b.discrepancy && (
                          <span
                            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                            style={{ backgroundColor: BRAND_SOFT, color: BRAND_DEEP }}
                            title="Customer override differs from records"
                          >
                            <TriangleAlert className="h-2.5 w-2.5" />
                            Mismatch
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {b.systems} system{b.systems === 1 ? "" : "s"}
                        {b.additional > 0 ? ` + ${b.additional} extra` : ""}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <SlotCell booking={b} />
                    </td>
                    <td className="px-4 py-3">
                      <PaymentChip status={b.paymentStatus} />
                    </td>
                    <td className="px-4 py-3">
                      <ServiceChip status={b.serviceStatus} />
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
        Showing {filtered.length} of {bookings.length} booking
        {bookings.length === 1 ? "" : "s"}
        {bookings.some((b) => b.isLive) && (
          <> · Live row reflects the customer's current session</>
        )}
        .
      </div>
    </div>
  );
}
