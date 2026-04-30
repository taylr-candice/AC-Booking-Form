/**
 * Bookings list — drives both the "Bookings" view (all statuses, filter
 * by service status) and the "Payments" view (same table, filter by
 * payment status, status chips swapped). Selecting a row tells the
 * `AdminApp` shell to mount `BookingDetail`.
 */

import { Info, Plus, RotateCcw, Search, TriangleAlert, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  bookerAgencyName,
  formatAttemptRecency,
  getBuildingForUnit,
  latestCoordinationAttempt,
  type AdminBooking,
  type AdminBuilding,
  type AdminUnit,
  type CallTemplate,
  type EmailTemplate,
  type PaymentStatus,
  type ServiceStatus,
} from "@/state/adminMockData";

import {
  decodeTemplateFilter,
  encodeTemplateFilter,
  matchesTemplateFilter,
  TEMPLATE_FILTER_ALL_VALUE,
  templateFilterIsMissingFromCatalogs,
  type BookingsTemplateFilter,
} from "./bookingsTemplateFilter";
import type { UndoCancelResult } from "./BookingDetail";
import { PaymentChip, ServiceChip, SlotCell } from "./chips";
import { InvoiceVoidAlerts } from "./InvoiceVoidAlerts";
import { BRAND, BRAND_DEEP, BRAND_SOFT } from "./theme";
import { UndoConflictDialog, type UndoConflictTakenBy } from "./UndoConflictDialog";

// Re-export the filter shape so existing consumers (tests, AdminApp)
// can keep importing it from BookingsView. The canonical definition
// now lives in `./bookingsTemplateFilter` so the bookings list and
// the awaiting-coordination queue can share the matching rule
// without copy-paste drift.
export type { BookingsTemplateFilter };

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
  templateFilter,
  onTemplateFilter,
  emailTemplates,
  callTemplates,
  search,
  onSearch,
  onOpen,
  onNewBooking,
  paymentMode,
  onAcknowledgeSupersede,
  onUndoCancelBooking,
  onUndoCancelBookingAndReschedule,
  initialFocusedRowId,
  onFocusedRowConsumed,
}: {
  bookings: AdminBooking[];
  units: AdminUnit[];
  buildings: AdminBuilding[];
  statusFilter: "all" | ServiceStatus | PaymentStatus;
  onStatusFilter: (s: "all" | ServiceStatus | PaymentStatus) => void;
  buildingFilter: string;
  onBuildingFilter: (id: string) => void;
  /** Active "Template used" filter (Call/Email + template name) or
   *  `null` for the toolbar's reset state. Lets an ops lead audit
   *  every booking whose timeline references a given seeded or
   *  admin-edited template, composed with the existing status /
   *  building / search filters. */
  templateFilter?: BookingsTemplateFilter;
  onTemplateFilter?: (filter: BookingsTemplateFilter) => void;
  /** Email template catalog driving the dropdown options on the
   *  "Template used" filter. Defaults to an empty list so callers
   *  that don't yet wire the filter (e.g. older test harnesses)
   *  still render. Pulled from `EMAIL_TEMPLATES` + admin edits in
   *  the AdminApp shell. */
  emailTemplates?: ReadonlyArray<EmailTemplate>;
  /** Call template catalog driving the dropdown options on the
   *  "Template used" filter. Mirror of `emailTemplates`. */
  callTemplates?: ReadonlyArray<CallTemplate>;
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
  /** One-shot seed for the source-row highlight: id of the booking
   *  the admin pivoted FROM via a BookingDetail timeline "View other
   *  bookings using this template" link. Applied on first paint
   *  (BRAND_SOFT tint + pulse + scroll-into-view, mirroring the
   *  focused-row pattern in Call/EmailTemplatesView), dismissed on
   *  first interaction, then cleared via {@link onFocusedRowConsumed}
   *  so re-renders never re-apply it. Optional. */
  initialFocusedRowId?: string | null;
  /** Fires once after BookingsView consumes {@link initialFocusedRowId}
   *  so the parent can clear its seed slot. */
  onFocusedRowConsumed?: () => void;
}) {
  // Default the template filter to "no filter applied" + a no-op
  // setter so the prop stays strictly optional — older harnesses
  // (and the AwaitingCoordinationView's own unrelated tests) keep
  // rendering without having to thread template state through.
  const activeTemplateFilter: BookingsTemplateFilter = templateFilter ?? null;
  const setTemplateFilter = onTemplateFilter ?? (() => {});
  const emailTemplateOptions = emailTemplates ?? [];
  const callTemplateOptions = callTemplates ?? [];
  // Resolve once per render: is the active filter's snapshot name still
  // present in the catalog for its channel?  Drives BOTH the synthetic
  // dropdown option (so the `<select>` displays the active filter
  // legibly even after a rename / remove) and the missing-template
  // chip hint below the toolbar. Hoisted so the two surfaces can never
  // disagree about which filters count as stale. The shared
  // `templateFilterIsMissingFromCatalogs` helper also keeps this view
  // aligned with the Awaiting-coordination queue's chip hint
  // (Task #194) — both surfaces narrow the lookup to the matching
  // channel and both suppress the hint when the catalogs aren't
  // threaded in (older harnesses), since we can't tell
  // renamed/removed apart from "we just don't know".
  const activeFilterIsMissing = templateFilterIsMissingFromCatalogs(
    activeTemplateFilter,
    { callTemplates, emailTemplates },
  );
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
  // Source-row highlight: mirrors the `focusedTemplateId` pattern in
  // Call/EmailTemplatesView — persistent BRAND_SOFT tint + one-shot
  // pulse so the landing row is unmistakable on a long filtered list.
  // Seeded from `initialFocusedRowId` so first paint already carries
  // the highlight; re-seeded via the effect below if a fresh non-null
  // value lands mid-life. Dismissed on first interaction (scroll /
  // click / keydown) so it doesn't linger.
  const [focusedRowId, setFocusedRowId] = useState<string | null>(
    initialFocusedRowId ?? null,
  );
  const [pulseRowId, setPulseRowId] = useState<string | null>(null);
  const rowRefs = useRef<Map<string, HTMLTableRowElement | null>>(new Map());
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
    // handoff invariant.
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
  // Filter changes flow through clicks / keystrokes / selects that
  // already fire these events, so the global listener catches them
  // without us enumerating every filter knob.
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

  // Predicate for the "global" filters that aren't tied to the
  // status chip row — building filter, search, and the active
  // "Template used" filter. Mirrors the helper on
  // AwaitingCoordinationView so each chip's count answers
  // "how many rows would survive if I clicked me?" without
  // double-counting against its own selection. The template filter
  // is folded in here (rather than re-checked at every chip site)
  // so chip counts shrink when an ops lead pivots to a specific
  // template — same way they already shrink for building / search.
  function matchesBuildingAndSearch(b: AdminBooking) {
    if (buildingFilter !== "all") {
      const unit = units.find((u) => u.id === b.unitId);
      if (!unit || unit.buildingId !== buildingFilter) return false;
    }
    if (!matchesTemplateFilter(b, activeTemplateFilter)) return false;
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
  }

  // Pre-rollup of per-chip counts. Each chip's count answers "how
  // many rows would survive if I clicked me?" — i.e. apply the
  // global building + search filters AND the cancelled-hiding rule
  // *as it would behave with this chip active*, then narrow by the
  // chip's own status. Critically the cancelled-hiding rule is
  // re-evaluated per chip, so the "Cancelled" chip's count reflects
  // the cancelled rows it would surface even when "Show cancelled"
  // is off (otherwise the bucket would always read 0 until toggled).
  const chipCounts: Record<string, number> = (() => {
    const counts: Record<string, number> = {};
    for (const chip of filterChips) {
      counts[chip.key] = bookings.filter((b) => {
        if (
          b.serviceStatus === "cancelled" &&
          !showCancelled &&
          chip.key !== "cancelled" &&
          !paymentMode
        ) {
          return false;
        }
        if (chip.key !== "all") {
          if (paymentMode) {
            if (b.paymentStatus !== chip.key) return false;
          } else {
            if (b.serviceStatus !== chip.key) return false;
          }
        }
        return matchesBuildingAndSearch(b);
      }).length;
    }
    return counts;
  })();

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
    if (!matchesTemplateFilter(b, activeTemplateFilter)) return false;
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
          {/* "Template used" filter. Pulls Call + Email options from
              the seeded + admin-edited template catalogs threaded down
              from AdminApp; selecting a template narrows the table to
              bookings whose service timeline references that template
              by snapshot name (same matching rule as the per-template
              usage popover). Composes with the existing status,
              building, and search filters. The sentinel "All
              templates" value is the toolbar's reset / clearable
              affordance — admins flip back to it to drop the lens. */}
          {(emailTemplateOptions.length > 0 ||
            callTemplateOptions.length > 0 ||
            activeFilterIsMissing) && (
            <select
              value={encodeTemplateFilter(activeTemplateFilter)}
              onChange={(e) =>
                setTemplateFilter(decodeTemplateFilter(e.target.value))
              }
              aria-label="Filter by template used"
              data-testid="bookings-filter-template"
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-900 focus:border-slate-400 focus:outline-none"
            >
              <option value={TEMPLATE_FILTER_ALL_VALUE}>All templates</option>
              {/* Synthetic option for an active filter whose snapshot
                  name no longer maps to any catalog row in its
                  channel. Without this, the controlled `<select>`
                  silently displays the wrong row (browsers render
                  the first option when the bound value matches no
                  option) — the dropdown would lie about what's
                  actively filtering the table. The "(no longer in
                  catalog)" suffix lets an ops lead notice the lens
                  has gone stale at a glance. The chip below
                  (`bookings-template-filter-chip`) carries the same
                  signal in long-form; AdminApp also auto-clears the
                  filter when the rename / remove happens in-app
                  (Task #162), so this is the defensive fallback for
                  call-sites that don't auto-clear (e.g. tests or
                  external state pivots). */}
              {activeFilterIsMissing && (
                <optgroup label="No longer in catalog">
                  <option
                    key="missing-active-filter"
                    value={encodeTemplateFilter(activeTemplateFilter)}
                    data-testid="bookings-filter-template-missing-option"
                  >
                    {activeTemplateFilter!.name} (no longer in catalog)
                  </option>
                </optgroup>
              )}
              {callTemplateOptions.length > 0 && (
                <optgroup label="Call templates">
                  {callTemplateOptions.map((t) => (
                    <option
                      key={`call-${t.id}`}
                      value={encodeTemplateFilter({ kind: "call", name: t.name })}
                    >
                      {t.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {emailTemplateOptions.length > 0 && (
                <optgroup label="Email templates">
                  {emailTemplateOptions.map((t) => (
                    <option
                      key={`email-${t.id}`}
                      value={encodeTemplateFilter({ kind: "email", name: t.name })}
                    >
                      {t.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          )}
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
            const count = chipCounts[chip.key] ?? 0;
            // Mute + disable chips with nothing in their bucket so the
            // non-empty queues stand out at a glance — same treatment
            // as the Awaiting-coordination toolbar. The "All" chip is
            // never muted; it always represents the visible total, so
            // the toolbar still has a sensible "reset" affordance even
            // when every specific bucket is empty.
            //
            // `isEmpty` takes precedence over `active` for styling:
            // an already-selected chip whose bucket later drains
            // (e.g. after changing the search or building filter)
            // should drop into the muted treatment rather than stay
            // in its brand-coloured "active" pill — otherwise the
            // toolbar would lie about which buckets currently hold
            // rows. The chip is `disabled` either way, so this only
            // affects the visual.
            const isEmpty = chip.key !== "all" && count === 0;
            return (
              <button
                key={chip.key}
                type="button"
                onClick={() => onStatusFilter(chip.key)}
                data-testid={`chip-bookings-${chip.key}`}
                aria-pressed={active}
                disabled={isEmpty}
                className={`rounded-full px-3 py-1 text-[12px] font-medium transition ${
                  isEmpty
                    ? "cursor-not-allowed bg-white text-slate-400 opacity-50 ring-1 ring-slate-100"
                    : active
                      ? "text-white"
                      : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
                }`}
                style={!isEmpty && active ? { backgroundColor: BRAND } : undefined}
              >
                {chip.label}{" "}
                <span
                  className={
                    isEmpty
                      ? "text-slate-400"
                      : active
                        ? "text-white/80"
                        : "text-slate-500"
                  }
                  data-testid={`chip-bookings-${chip.key}-count`}
                >
                  ({count})
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {activeTemplateFilter !== null && (
        // The chip's name is a snapshot — it was captured onto the
        // timeline entry when the call/email was logged, and the
        // table filter still matches by that snapshot string. If the
        // template has since been renamed or removed in the
        // templates panel, the filter still works for any other
        // timelines that share that snapshot, but the chip's name
        // won't show up in the templates list anymore. We surface a
        // small icon + label in that case so admins know why,
        // without breaking the snapshot-based match. The
        // `activeFilterIsMissing` flag is hoisted at the top of the
        // component so the chip and the dropdown's synthetic option
        // can never disagree about which filters are stale.
        <div
          className="flex items-center gap-2 text-[12px]"
          data-testid="bookings-template-filter-chip"
        >
          <span className="text-slate-500">
            Filtered by{" "}
            {activeTemplateFilter.kind === "call" ? "call" : "email"} template:
          </span>
          <button
            type="button"
            onClick={() => setTemplateFilter(null)}
            data-testid="button-clear-bookings-template-filter"
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold transition hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
            style={{
              backgroundColor: BRAND_SOFT,
              color: BRAND_DEEP,
            }}
            title="Clear template filter"
            aria-label={`Clear template filter "${activeTemplateFilter.name}"`}
          >
            <span>{activeTemplateFilter.name}</span>
            <X className="h-3 w-3" />
          </button>
          {activeFilterIsMissing && (
            <span
              role="img"
              aria-label={`"${activeTemplateFilter.name}" is no longer in the templates catalog (renamed or removed). The filter still matches historical timeline entries.`}
              title={`"${activeTemplateFilter.name}" is no longer in the templates catalog (renamed or removed). The filter still matches historical timeline entries.`}
              data-testid="bookings-template-filter-missing-hint"
              className="inline-flex items-center gap-1 text-slate-500"
            >
              <Info className="h-3.5 w-3.5" />
              <span className="text-[11px]">No longer in templates catalog</span>
            </span>
          )}
        </div>
      )}

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
                const isFocused = focusedRowId === b.id;
                const isPulsing = pulseRowId === b.id;
                return (
                  <tr
                    key={b.id}
                    ref={(el) => {
                      rowRefs.current.set(b.id, el);
                    }}
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
                    data-testid={`bookings-row-${b.id}`}
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
                            {latestAttempt.templateLabel && (
                              // stopPropagation so the suffix activation
                              // doesn't bubble to the row's open handler.
                              <>
                                {" · "}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const label = latestAttempt.templateLabel;
                                    if (label) {
                                      setTemplateFilter({
                                        kind: latestAttempt.kind,
                                        name: label,
                                      });
                                    }
                                  }}
                                  onKeyDown={(e) => e.stopPropagation()}
                                  className="cursor-pointer rounded text-slate-500 underline decoration-dotted decoration-slate-400 underline-offset-2 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
                                  data-testid="bookings-row-last-attempt-template"
                                  data-booking-id={b.id}
                                  data-template-label={
                                    latestAttempt.templateLabel
                                  }
                                  title={`Filter the table to bookings whose latest touch used "${latestAttempt.templateLabel}"`}
                                  aria-label={`Filter by template "${latestAttempt.templateLabel}"`}
                                >
                                  {latestAttempt.templateLabel}
                                </button>
                              </>
                            )}
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
