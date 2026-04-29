/**
 * Surface "invoices that need cancelling in billing" front-and-centre
 * for admins.
 *
 * When a customer wins the race for a unit (paying while another
 * customer's booking was still `invoice_pending`), the prior booking is
 * auto-cancelled and tagged with `supersededByBookingId`. Without this
 * banner the only trace was a tiny pill on the cancelled row — which is
 * hidden by default in the bookings list — so an admin could silently
 * miss invoices to void in the billing system. As more buildings come
 * online that risk only grows.
 *
 * This component renders a list of every booking with
 * `supersededByBookingId` still set (i.e. void not yet recorded). Each
 * row links straight to the affected booking detail (where the
 * "Record invoice void" button lives) and offers an inline acknowledge
 * affordance so a confident admin can clear an item without opening it.
 *
 * Lives at the top of both the Bookings and Payments views — it's an
 * ops alert, not a status pill, so it sits above the filter toolbar
 * and ignores the active filter chips. (An admin can still find the
 * row through the per-row pill if they want the audit trail.)
 */

import { ChevronRight, ReceiptText } from "lucide-react";

import {
  type AdminBooking,
  type AdminUnit,
} from "@/state/adminMockData";

import { BRAND, BRAND_DEEP, BRAND_SOFT } from "./theme";

export function InvoiceVoidAlerts({
  bookings,
  units,
  onOpen,
  onAcknowledge,
}: {
  bookings: AdminBooking[];
  units: AdminUnit[];
  /** Open the affected booking detail so the admin can confirm and
   *  record the void. */
  onOpen: (id: string) => void;
  /** Quick "I've voided it" affordance — drops the row off the list. */
  onAcknowledge: (id: string) => void;
}) {
  const pending = bookings.filter((b) => !!b.supersededByBookingId);
  if (pending.length === 0) return null;

  return (
    <section
      className="overflow-hidden rounded-xl border"
      style={{ borderColor: BRAND, backgroundColor: BRAND_SOFT }}
      data-testid="banner-invoice-voids"
      aria-label="Invoices that need cancelling in billing"
    >
      <header className="flex items-start gap-3 px-4 pt-4">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: "white", color: BRAND_DEEP }}
        >
          <ReceiptText className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <div
            className="text-[13px] font-bold uppercase tracking-wider"
            style={{ color: BRAND_DEEP }}
          >
            {pending.length === 1
              ? "1 invoice needs cancelling in billing"
              : `${pending.length} invoices need cancelling in billing`}
          </div>
          <p className="mt-0.5 text-[12px] text-slate-700">
            These bookings were auto-cancelled when another customer paid
            for the same unit first. Open each one to confirm, then record
            the void so the row drops off this list.
          </p>
        </div>
      </header>
      <ul className="mt-3 divide-y divide-white/60">
        {pending.map((b) => {
          const unit = units.find((u) => u.id === b.unitId) ?? null;
          return (
            <li
              key={b.id}
              className="flex flex-wrap items-center gap-3 px-4 py-3"
              data-testid="banner-invoice-row"
              data-booking-id={b.id}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
                  <span
                    className="font-bold"
                    style={{ color: BRAND_DEEP }}
                  >
                    {b.id}
                  </span>
                  <span className="text-slate-700">{b.customerName}</span>
                  <span
                    className="text-[11px] font-medium uppercase tracking-wider"
                    style={{ color: BRAND_DEEP }}
                  >
                    · superseded by {b.supersededByBookingId}
                  </span>
                </div>
                <div className="mt-0.5 text-[12px] text-slate-600">
                  {unit?.addressLine1 ?? b.unitId}
                  {unit?.addressLine2 ? ` · ${unit.addressLine2}` : ""}
                  {" · "}${b.totalAud.toFixed(2)} invoice to void
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onAcknowledge(b.id)}
                  className="rounded-lg bg-white/80 px-2.5 py-1 text-[12px] font-semibold transition hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
                  style={{ color: BRAND_DEEP }}
                  title="Mark this superseded invoice as voided in billing"
                  data-testid="banner-acknowledge"
                  data-booking-id={b.id}
                >
                  Record void
                </button>
                <button
                  type="button"
                  onClick={() => onOpen(b.id)}
                  className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[12px] font-semibold text-white transition hover:brightness-110"
                  style={{ backgroundColor: BRAND }}
                  title="Open the affected booking"
                  data-testid="banner-open"
                  data-booking-id={b.id}
                >
                  Open
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
