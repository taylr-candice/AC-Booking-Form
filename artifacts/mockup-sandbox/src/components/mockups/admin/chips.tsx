/**
 * Small status chips reused by the bookings list and the booking
 * detail screen: the slot column ("Tue · Morning · ~1h"), the payment
 * status pill, and the service status pill.
 */

import { Clock, PhoneOff, PhoneOutgoing } from "lucide-react";

import {
  bookingDurationMinutes,
  formatCoordinationWaiting,
  formatLastContacted,
  type AdminBooking,
  type PaymentStatus,
  type ServiceStatus,
} from "@/state/adminMockData";
import { formatDurationMinutes } from "@/state/bookingDerived";

import { BRAND_DEEP, BRAND_SOFT } from "./theme";

export function SlotCell({ booking }: { booking: AdminBooking }) {
  if (booking.serviceSlot === "to_be_coordinated" || !booking.serviceDate) {
    return (
      <div>
        <div className="font-medium text-slate-900">To be coordinated</div>
        <div className="text-[11px] text-slate-500">Tenant / agent flow</div>
      </div>
    );
  }
  const slotLabel = booking.serviceSlot
    ? `${booking.serviceSlot.charAt(0).toUpperCase()}${booking.serviceSlot.slice(1)}`
    : "—";
  return (
    <div>
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

/**
 * "Waiting Xh / Xd" chip used by the admin Awaiting-coordination queue
 * and the booking detail Schedule card. Colour escalates as a booking
 * sits in coordination longer:
 *   - fresh (< 24h) — slate (calm; nothing to chase yet)
 *   - warn  (24-48h) — amber (chase today)
 *   - stale (≥ 48h)  — red   (escalate)
 *
 * Pulls the bucket + label from {@link formatCoordinationWaiting} so
 * the thresholds stay defined in one place. The icon makes the chip
 * read as a duration even when the row is busy.
 */
export function WaitingChip({ createdAt }: { createdAt: string }) {
  const { label, severity, hours } = formatCoordinationWaiting(createdAt);
  const map: Record<typeof severity, { bg: string; fg: string }> = {
    fresh: { bg: "#F1F5F9", fg: "#475569" },
    warn: { bg: "#FEF3C7", fg: "#92400E" },
    stale: { bg: "#FEE2E2", fg: "#991B1B" },
  };
  const { bg, fg } = map[severity];
  const fullText =
    severity === "stale"
      ? "Past 48h — escalate"
      : severity === "warn"
        ? "Past 24h — chase today"
        : "Under 24h";
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ backgroundColor: bg, color: fg }}
      title={`${fullText} · ${hours.toFixed(1)}h since booking landed`}
    >
      <Clock className="h-2.5 w-2.5" />
      Waiting {label}
    </span>
  );
}

/**
 * "Last chased Xh/Xd ago" / "Never chased" chip used by the admin
 * Awaiting-coordination queue (per-row) and the booking detail
 * Schedule card. Sits next to {@link WaitingChip} so an ops user can
 * read both signals in one glance — total wait + recency of the last
 * follow-up.
 *
 * Pulls the bucket + label from {@link formatLastContacted}. The icon
 * flips to a struck-through phone when the row has never been chased,
 * to make the "you should call this customer" signal scannable.
 */
export function LastChasedChip({
  lastContactedAt,
}: {
  lastContactedAt: string | null;
}) {
  const { label, severity } = formatLastContacted(lastContactedAt);
  const map: Record<typeof severity, { bg: string; fg: string }> = {
    // Amber for "never" so the unchased rows stand out next to the
    // chased ones — pairs well with WaitingChip's own escalation.
    never: { bg: "#FEF3C7", fg: "#92400E" },
    fresh: { bg: "#F1F5F9", fg: "#475569" },
    // Stale isn't an emergency on its own — it's "consider another
    // nudge" — so we use a softer tone than WaitingChip's stale red.
    stale: { bg: "#F1F5F9", fg: "#475569" },
  };
  const { bg, fg } = map[severity];
  const Icon = severity === "never" ? PhoneOff : PhoneOutgoing;
  const tooltip =
    severity === "never"
      ? "Never chased — consider following up with the tenant or agent"
      : `Last chase: ${label}`;
  const text = severity === "never" ? "Never chased" : `Last chased ${label}`;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ backgroundColor: bg, color: fg }}
      title={tooltip}
      data-testid="chip-last-chased"
    >
      <Icon className="h-2.5 w-2.5" />
      {text}
    </span>
  );
}

export function ServiceChip({ status }: { status: ServiceStatus }) {
  const map: Record<
    ServiceStatus,
    { label: string; bg: string; fg: string; strike?: boolean }
  > = {
    scheduled: { label: "Scheduled", bg: "#E2E8F0", fg: "#334155" },
    en_route: { label: "En route", bg: "#DBEAFE", fg: "#1D4ED8" },
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
