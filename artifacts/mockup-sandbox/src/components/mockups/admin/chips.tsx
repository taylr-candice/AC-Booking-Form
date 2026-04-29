/**
 * Small status chips reused by the bookings list and the booking
 * detail screen: the slot column ("Tue · Morning · ~1h"), the payment
 * status pill, and the service status pill.
 */

import {
  bookingDurationMinutes,
  type AdminBooking,
  type PaymentStatus,
  type ServiceStatus,
} from "@/state/adminMockData";
import { formatDurationMinutes } from "@/state/bookingDerived";

import { BRAND_DEEP, BRAND_SOFT } from "./theme";

export function SlotCell({ booking }: { booking: AdminBooking }) {
  if (booking.serviceSlot === "to_be_coordinated" || !booking.serviceDate) {
    return (
      <div data-testid="slot-cell">
        <div className="font-medium text-slate-900">To be coordinated</div>
        <div className="text-[11px] text-slate-500">Tenant / agent flow</div>
      </div>
    );
  }
  const slotLabel = booking.serviceSlot
    ? `${booking.serviceSlot.charAt(0).toUpperCase()}${booking.serviceSlot.slice(1)}`
    : "—";
  return (
    <div data-testid="slot-cell">
      <div className="font-medium text-slate-900">{booking.serviceDate}</div>
      <div className="text-[11px] text-slate-500">
        {slotLabel} · ~{formatDurationMinutes(bookingDurationMinutes(booking))}
      </div>
    </div>
  );
}

export function PaymentChip({ status }: { status: PaymentStatus }) {
  const map: Record<PaymentStatus, { label: string; bg: string; fg: string }> = {
    paid: { label: "Paid", bg: "#DCFCE7", fg: "#166534" },
    pending: { label: "Pending", bg: "#FEF3C7", fg: "#92400E" },
    refund_pending: { label: "Refund pending", bg: BRAND_SOFT, fg: BRAND_DEEP },
    refunded: { label: "Refunded", bg: "#E2E8F0", fg: "#334155" },
  };
  const m = map[status];
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ backgroundColor: m.bg, color: m.fg }}
    >
      {m.label}
    </span>
  );
}

export function ServiceChip({ status }: { status: ServiceStatus }) {
  const map: Record<
    ServiceStatus,
    { label: string; bg: string; fg: string; strike?: boolean }
  > = {
    scheduled: { label: "Scheduled", bg: "#E2E8F0", fg: "#334155" },
    on_site: { label: "On site", bg: "#E0E7FF", fg: "#3730A3" },
    complete: { label: "Complete", bg: "#DCFCE7", fg: "#166534" },
    invoice_adjusted: { label: "Invoice adjusted", bg: "#FEF3C7", fg: "#92400E" },
    cancelled: { label: "Cancelled", bg: "#F1F5F9", fg: "#64748B", strike: true },
  };
  const m = map[status];
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{
        backgroundColor: m.bg,
        color: m.fg,
        textDecoration: m.strike ? "line-through" : undefined,
      }}
    >
      {m.label}
    </span>
  );
}
