/**
 * Bookings list — drives both the "Bookings" view (all statuses, filter
 * by service status) and the "Payments" view (same table, filter by
 * payment status, status chips swapped). Selecting a row tells the
 * `AdminApp` shell to mount `BookingDetail`.
 */

import { Plus, RotateCcw, Search, TriangleAlert } from "lucide-react";
import { useState } from "react";

import {
  bookerAgencyName,
  formatAttemptRecency,
  getBuildingForUnit,
  latestCoordinationAttempt,
  type AdminBooking,
  type AdminBuilding,
  type AdminUnit,
  type PaymentStatus,
  type ServiceStatus,
} from "@/state/adminMockData";

import type { UndoCancelResult } from "./BookingDetail";
import { PaymentChip, ServiceChip, SlotCell } from "./chips";
import { InvoiceVoidAlerts } from "./InvoiceVoidAlerts";
import { BRAND, BRAND_DEEP, BRAND_SOFT } from "./theme";
import { UndoConflictDialog, type UndoConflictTakenBy } from "./UndoConflictDialog";

/**
 * Customer column cell.
 *
 * Owners are listed by their own name (they are the customer); agents
 * are listed by their agency, with the contact name shown beneath, so
 * an admin can scan the table by company and still know who to call.
 * If an agent booking has no agency captured we fall back to the
 * contact name to avoid showing "—".
 */
export function CustomerCell({ booking }: { booking: AdminBooking }) {
  if (booking.bookerRole === "agent") {
    const agency = bookerAgencyName(booking);
    return (
      <>
        <div className="font-medium text-slate-900">
          {agency ?? booking.customerName}
        </div>
        <div className="text-[11px] text-slate-500">
          {agency ? `${booking.customerName} · ` : ""}
          {booking.customerEmail}
        </div>
      </>
    );
  }
  return (
    <>
      <div className="font-medium text-slate-900">{booking.customerName}</div>
      <div className="text-[11px] text-slate-500">{booking.customerEmail}</div>
    </>
  );
}

/**
 * Pull the structured `loggedAt` of a booking's most recent
 * call/email entry as a numeric timestamp suitable for sorting.
 *
 * Returns `null` when the booking has no structured coordination
 * touch at all (no call/email entry on `serviceTimeline`) OR when
 * the latest entry pre-dates the `loggedAt` field (legacy entries
 * created before structured timestamps were captured). The sort
 * uses this `null` to pin those rows to the bottom in either
 * direction — there's no recency signal to compare them by.
 *
 * Returning `null` for an unparseable `loggedAt` (rather than
 * silently returning 0) avoids accidentally sorting malformed rows
 * to the very top of "stalest first" — which would be the most
 * misleading possible position for a row whose timestamp is
 * actually unknown.
 */
function attemptTimestamp(booking: AdminBooking): number | null {
  const latest = latestCoordinationAttempt(booking.serviceTimeline);
  if (latest === null || latest.loggedAt === null) return null;
  const ms = new Date(latest.loggedAt).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function BookingsView({
  bookings,
  units,
  buildings,
  statusFilter,
  onStatusFilter,
  buildingFilter,
  onBuildingFilter,
  search,
  onSearch,
  onOpen,
  onNewBooking,
  paymentMode,
  onAcknowledgeSupersede,
  onUndoCancelBooking,
  onUndoCancelBookingAndReschedule,
}: {
  bookings: AdminBooking[];
  units: AdminUnit[];
  buildings: AdminBuilding[];
  statusFilter: "all" | ServiceStatus | PaymentStatus;
  onStatusFilter: (s: "all" | ServiceStatus | PaymentStatus) => void;
  buildingFilter: string;
  onBuildingFilter: (id: string) => void;
  search: string;
  onSearch: (s: string) => void;
  onOpen: (id: string) => void;
  onNewBooking: () => void;
  paymentMode: boolean;
  onAcknowledgeSupersede: (id: string) => void;
  /** Reverse a cancellation from the row directly. Same handler the
   *  detail page uses — returns "restored" / "slot_taken" / "no_op"
   *  so the UI can pivot to the reschedule modal on conflict. Optional
   *  so callers that don't expose an inline affordance can omit it. */
  onUndoCancelBooking?: (id: string) => UndoCancelResult;
  /** Companion to {@link onUndoCancelBooking}: when the original slot
   *  was given away, this opens the shared SchedulingModal in "undo"
   *  mode at the AdminApp level so the admin can pick a fresh slot.
   *  The AdminApp shell performs the atomic restore + reschedule on
   *  confirm. */
  onUndoCancelBookingAndReschedule?: (id: string) => void;
}) {
  // "Show cancelled" is OFF by default — cancelled rows are an audit-trail
  // artefact, not the day-to-day work, so we hide them unless the admin
  // opts in. The toggle is local to this list (not lifted to AdminApp)
  // because it doesn't need to survive a view switch.
  const [showCancelled, setShowCancelled] = useState(false);
  // Optional "Last attempt" ordering. The Awaiting-coordination queue
  // already prioritises stale touches in its own composite sort, but
  // the broader bookings list previously had no equivalent — so a
  // freshly emailed-in customer would sit wherever their `createdAt`
  // happened to put them. Surfacing the same recency signal here as
  // an opt-in sort lets a team lead float the stalest touches to the
  // top in one click without having to scan every row.
  //
  // Rows that have NEVER had a structured call/email logged against
  // them are kept at the bottom in BOTH directions: they have no
  // recency signal, so sorting them in with timestamped rows would
  // be misleading either way. (Treating them as "infinitely stale"
  // would shove brand-new bookings to the very top of "stalest
  // first"; treating them as "infinitely fresh" would do the same
  // for "freshest first". Pinning them to the bottom keeps both
  // sort modes about the rows that actually have a touch to compare.)
  const [attemptSort, setAttemptSort] = useState<
    "default" | "stalest_first" | "freshest_first"
  >("default");
  // Inline-undo pivot state. When the row-level "Undo" affordance hits
  // a "slot_taken" verdict we surface the same conflict dialog the
  // detail page uses; clicking "Open Reschedule" then asks the
  // AdminApp shell to open the shared SchedulingModal in "undo" mode
  // so the confirm button atomically restores AND reschedules. The
  // conflict state is keyed by booking id so we always know which row
  // we're acting on even if the table re-renders behind the dialog.
  const [undoConflict, setUndoConflict] = useState<
    { bookingId: string; takenBy: UndoConflictTakenBy } | null
  >(null);

  function handleUndoCancel(id: string) {
    if (!onUndoCancelBooking) return;
    const result = onUndoCancelBooking(id);
    if (result.kind === "slot_taken") {
      setUndoConflict({ bookingId: id, takenBy: result.takenBy });
    }
    // "restored" + "no_op" need no further UI — the row updates in
    // place (or, if "Show cancelled" is off, drops out of the list).
  }
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
        { key: "on_site", label: "On site" },
        { key: "complete", label: "Complete" },
        { key: "cancelled", label: "Cancelled" },
      ];

  const filtered = bookings.filter((b) => {
    // Cancelled rows are hidden by default unless either the toggle is on
    // OR the user explicitly filtered to "cancelled" via the chip set
    // (so an admin can audit cancellations from a single click).
    //
    // Payments mode is the exception: cancellations naturally flip the
    // payment status to "refund_pending", so the cancelled row IS the
    // refund queue's day-to-day work — hiding it would hide the very
    // rows ops needs to act on (and would also strand the new inline
    // "Undo" affordance behind a filter that doesn't exist in payments
    // view, where the "Show cancelled" toggle isn't rendered).
    if (
      b.serviceStatus === "cancelled" &&
      !showCancelled &&
      statusFilter !== "cancelled" &&
      !paymentMode
    ) {
      return false;
    }
    if (statusFilter !== "all") {
      if (paymentMode) {
        if (b.paymentStatus !== statusFilter) return false;
      } else {
        if (b.serviceStatus !== statusFilter) return false;
      }
    }
    if (buildingFilter !== "all") {
      const unit = units.find((u) => u.id === b.unitId);
      if (!unit || unit.buildingId !== buildingFilter) return false;
    }
    if (search.trim().length > 0) {
      const q = search.trim().toLowerCase();
      const unit = units.find((u) => u.id === b.unitId);
      // Include the resolved agency name + the raw "Other / not listed"
      // free-text so admins can search by company in the same field
      // they see in the Customer column. (Without this, agent rows whose
      // visible label is the agency name would silently fail a search.)
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

  // Apply the optional "Last attempt" ordering after filtering so the
  // visible row count is independent of sort mode. We compute each
  // row's `loggedAt` once via the same helper the row uses to render
  // the "Last attempt" line, so the sort key and the visible suffix
  // can never disagree.
  //
  // `Array#sort` mutates in place, so we slice first to keep the
  // upstream `bookings` array untouched (the parent passes it down
  // and may rely on its ordering elsewhere). When `attemptSort` is
  // `"default"` we skip sorting entirely so existing callers that
  // depend on the source order still work.
  const sorted =
    attemptSort === "default"
      ? filtered
      : filtered.slice().sort((a, z) => {
          const aTs = attemptTimestamp(a);
          const zTs = attemptTimestamp(z);
          // Never-touched rows (or rows whose latest entry has no
          // structured `loggedAt`) sink to the bottom in BOTH
          // directions — see the comment on `attemptSort` state for
          // the rationale.
          if (aTs === null && zTs === null) return 0;
          if (aTs === null) return 1;
          if (zTs === null) return -1;
          // Stalest first ⇒ smallest timestamp wins (oldest touch on
          // top); freshest first ⇒ largest timestamp wins (newest
          // touch on top).
          return attemptSort === "stalest_first" ? aTs - zTs : zTs - aTs;
        });

  return (
    <div className="flex flex-col gap-4">
      {/* Invoice-void alerts — sit above the toolbar so admins notice
          superseded bookings even when "Show cancelled" is off and even
          if a building / status filter would otherwise hide the row. */}
      <InvoiceVoidAlerts
        bookings={bookings}
        units={units}
        onOpen={onOpen}
        onAcknowledge={onAcknowledgeSupersede}
      />
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
          {/* "Last attempt" sort. Lives next to the building filter
              (rather than amongst the status chips) so it reads as a
              modifier on the *order* of rows, not the *set* of rows
              shown. Default keeps the upstream order intact so admins
              who never engage with the control see no behaviour
              change. */}
          <select
            value={attemptSort}
            onChange={(e) =>
              setAttemptSort(
                e.target.value as "default" | "stalest_first" | "freshest_first",
              )
            }
            aria-label="Sort by last attempt"
            data-testid="bookings-sort-last-attempt"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-900 focus:border-slate-400 focus:outline-none"
          >
            <option value="default">Sort: default</option>
            <option value="stalest_first">Last attempt: stalest first</option>
            <option value="freshest_first">Last attempt: freshest first</option>
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {!paymentMode && (
            <>
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[12px] font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={showCancelled}
                  onChange={(e) => setShowCancelled(e.target.checked)}
                  className="h-3.5 w-3.5 accent-pink-600"
                />
                Show cancelled
              </label>
              <button
                type="button"
                onClick={onNewBooking}
                className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-[12px] font-semibold text-white transition hover:brightness-110"
                style={{ backgroundColor: BRAND }}
              >
                <Plus className="h-3.5 w-3.5" />
                New booking
              </button>
            </>
          )}
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
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                  No bookings match these filters.
                </td>
              </tr>
            ) : (
              sorted.map((b) => {
                const unit = units.find((u) => u.id === b.unitId);
                // Most recent structured call/email entry, if any.
                // Mirrors the helper used in the Awaiting-coordination
                // queue so a row's last touch reads identically across
                // both views (spoke / no answer / voicemail / email
                // subject) without ops having to open the booking.
                const latestAttempt = latestCoordinationAttempt(b.serviceTimeline);
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
                      <div className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
                        {b.id}
                        {b.isLive && (
                          <span
                            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                            style={{ backgroundColor: BRAND, color: "white" }}
                          >
                            Live
                          </span>
                        )}
                        {b.supersededByBookingId && (
                          <span
                            className="inline-flex items-center gap-1.5 rounded-full pl-2 pr-1 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                            style={{ backgroundColor: BRAND_SOFT, color: BRAND_DEEP }}
                            title={`Superseded by ${b.supersededByBookingId} — outstanding invoice should be voided`}
                            data-testid="pill-supersede"
                            data-booking-id={b.id}
                          >
                            Invoice to cancel · superseded
                            <button
                              type="button"
                              onClick={(e) => {
                                // Stop the click from bubbling up to the
                                // row's "open booking" handler — admins
                                // dismissing the pill don't want to be
                                // navigated away from the list.
                                e.stopPropagation();
                                onAcknowledgeSupersede(b.id);
                              }}
                              className="rounded-full bg-white/80 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
                              style={{ color: BRAND_DEEP }}
                              title="Mark this superseded invoice as voided in billing"
                              data-testid="button-acknowledge-supersede"
                            >
                              Acknowledge
                            </button>
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
                      {(() => {
                        const building = getBuildingForUnit(unit ?? null);
                        if (!building) return null;
                        return (
                          <div className="mt-0.5 text-[11px] font-medium text-slate-600">
                            {building.name}
                          </div>
                        );
                      })()}
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
                      <div className="flex flex-wrap items-center gap-2">
                        <ServiceChip status={b.serviceStatus} />
                        {/* Inline "Undo" affordance for accidental
                         *  cancellations — reuses the same handler the
                         *  detail page calls so the uniqueness check,
                         *  capacity restore, refund flip and timeline
                         *  entry are identical. Live demo row is owned
                         *  by the customer flow so we hide it there. */}
                        {b.serviceStatus === "cancelled" &&
                          !b.isLive &&
                          onUndoCancelBooking && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleUndoCancel(b.id);
                              }}
                              data-testid="button-undo-cancel-row"
                              data-booking-id={b.id}
                              className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold transition hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
                              style={{
                                borderColor: BRAND,
                                color: BRAND_DEEP,
                                backgroundColor: BRAND_SOFT,
                              }}
                              title="Reverse this cancellation if the slot is still free"
                            >
                              <RotateCcw className="h-3 w-3" />
                              Undo
                            </button>
                          )}
                      </div>
                      {/* Mirror the Awaiting-coordination queue's
                       *  "Last attempt: …" helper so ops scanning the
                       *  bookings list for a customer who just emailed
                       *  in can see at a glance whether anyone has
                       *  spoken to the tenant recently — without
                       *  opening the booking. Muted text keeps it from
                       *  competing with the lifecycle status chip. */}
                      {latestAttempt && (() => {
                        // Inline recency suffix ("· 2h ago") so a team
                        // lead can triage by freshness without opening
                        // the row. Pulled from the entry's own
                        // `loggedAt` (not the row-level
                        // `lastContactedAt`) so logging an email after
                        // a call surfaces the email's age, not the
                        // call's. Legacy entries with no `loggedAt`
                        // simply omit the suffix.
                        const recency = formatAttemptRecency(
                          latestAttempt.loggedAt,
                        );
                        // Once the latest touch crosses
                        // LAST_ATTEMPT_STALE_HOURS the line flips into
                        // an amber warning style so an admin scanning
                        // the queue sees the worst offenders pop —
                        // same idea the existing `lastContactedAt`
                        // severity buckets use, but applied to the
                        // per-row last-attempt line.
                        const isStale = recency?.severity === "stale";
                        return (
                          <div
                            className={`mt-1 text-[11px] ${isStale ? "text-amber-700" : "text-slate-500"}`}
                            data-testid="bookings-row-last-attempt"
                            data-booking-id={b.id}
                            data-stale={isStale ? "true" : "false"}
                          >
                            Last attempt:{" "}
                            <span
                              className={`font-medium ${isStale ? "text-amber-800" : "text-slate-700"}`}
                            >
                              {latestAttempt.label}
                              {recency ? ` · ${recency.label}` : ""}
                            </span>
                          </div>
                        );
                      })()}
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
      {undoConflict && (
        <UndoConflictDialog
          takenBy={undoConflict.takenBy}
          onOpenReschedule={() => {
            const id = undoConflict.bookingId;
            setUndoConflict(null);
            // Hand off to the AdminApp shell, which opens the shared
            // SchedulingModal in "undo" mode and performs the atomic
            // restore + reschedule when the admin confirms a new slot.
            // Guarded so the prop stays strictly optional — without a
            // handler we just drop quietly back to the list.
            if (onUndoCancelBookingAndReschedule) {
              onUndoCancelBookingAndReschedule(id);
            }
          }}
          onDismiss={() => setUndoConflict(null)}
        />
      )}
    </div>
  );
}
