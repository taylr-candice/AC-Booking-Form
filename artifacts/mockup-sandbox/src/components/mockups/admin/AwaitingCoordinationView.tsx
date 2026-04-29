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

import { useEffect, useMemo, useState } from "react";
import { ArrowDownNarrowWide, Clock, Mail, Phone, Search } from "lucide-react";

import {
  bookerAgencyName,
  coordinationKindForBooking,
  formatCoordinationWaiting,
  formatLastContacted,
  getBuildingForUnit,
  latestCoordinationAttempt,
  SEEDED_AGENTS,
  type AdminBooking,
  type AdminBuilding,
  type AdminUnit,
  type CoordinationKind,
} from "@/state/adminMockData";

import {
  CALL_OUTCOME_LABEL,
  CALL_OUTCOME_ORDER,
  type CallOutcome,
} from "./BookingDetail";
import { CustomerCell } from "./BookingsView";
import { PaymentChip } from "./chips";
import { BRAND } from "./theme";

type Filter = "all" | CoordinationKind;

const FILTER_CHIPS: ReadonlyArray<{ key: Filter; label: string }> = [
  { key: "all", label: "All" },
  { key: "awaiting_tenant", label: "Awaiting tenant" },
  { key: "awaiting_agent", label: "Awaiting agent" },
];

/**
 * Outcome filter chips. Narrow the queue down to rows whose most
 * recent `kind: "call" | "email"` timeline entry matches a specific
 * outcome — e.g. "show me everyone we left a voicemail for so I can
 * decide who to ring next" — or to rows with no logged attempts at
 * all ("Never logged"). Composed on top of the waiting-on chip,
 * building filter, and search.
 */
type OutcomeFilter =
  | "all"
  | "spoke"
  | "no_answer"
  | "voicemail"
  | "email"
  | "never_logged";

const OUTCOME_FILTER_CHIPS: ReadonlyArray<{
  key: OutcomeFilter;
  label: string;
}> = [
  { key: "all", label: "Any outcome" },
  { key: "spoke", label: "Spoke" },
  { key: "no_answer", label: "No answer" },
  { key: "voicemail", label: "Voicemail" },
  { key: "email", label: "Email" },
  { key: "never_logged", label: "Never logged" },
];

/**
 * Plain "who we're coordinating with" cell — replaces the older 3-chip
 * stack (WaitingOnChip + WaitingChip + LastChasedChip). The first line
 * names the contact (tenant + phone, or managing agency, or
 * "Unassigned"); the second line shows total wait + last-contact
 * recency in muted text. The urgency that was previously encoded in
 * chip colour now lives in the queue's sort order, not in styling.
 */
function CoordinatingWithCell({
  booking,
  unit,
  units,
  kind,
}: {
  booking: AdminBooking;
  unit: AdminUnit | undefined;
  units: AdminUnit[];
  kind: CoordinationKind | null;
}) {
  const waiting = formatCoordinationWaiting(booking.createdAt);
  const lastContacted = formatLastContacted(booking.lastContactedAt);
  // Most recent structured call/email entry, if any. Renders as a
  // separate "Last attempt: …" helper line so a team lead can tell
  // at a glance whether the previous touch got through (spoke), hit
  // voicemail, or was just an email — without opening the booking.
  const latestAttempt = latestCoordinationAttempt(booking.serviceTimeline);
  const headerLabel =
    kind === "awaiting_agent"
      ? "Managing agent"
      : kind === "awaiting_tenant"
        ? "Tenant"
        : "Unassigned";

  let detail: string;
  if (kind === "awaiting_tenant") {
    const first = booking.tenants[0];
    if (first) {
      const fullName = `${first.first} ${first.last}`.trim() || "Tenant 1";
      const extra =
        booking.tenants.length > 1
          ? ` · +${booking.tenants.length - 1} more`
          : "";
      detail = `${fullName} · ${first.phone || "—"}${extra}`;
    } else {
      detail = "Tenant details not captured";
    }
  } else if (kind === "awaiting_agent") {
    // Look up the unit's managing agent (the agency name is on the
    // unit, not the booking) so the cell stays consistent with the
    // BookingDetail "Coordinating with" panel.
    const lookup = unit ?? units.find((u) => u.id === booking.unitId);
    const agency = lookup?.agentId
      ? SEEDED_AGENTS.find((a) => a.id === lookup.agentId)?.company ?? null
      : null;
    detail = agency ?? "Agency not on file";
  } else {
    // No coordination bucket matched — surface the access method so
    // ops at least know why this row is here.
    detail = "Access method not yet confirmed";
  }

  const waitingText =
    waiting.label === "just now" ? "Waiting just now" : `Waiting ${waiting.label}`;
  const lastContactText =
    lastContacted.severity === "never"
      ? "never contacted"
      : `last contact ${lastContacted.label}`;

  return (
    <div className="flex flex-col gap-0.5" data-testid="coordinating-with-cell">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        {headerLabel}
      </div>
      <div className="text-[12px] font-medium text-slate-900">{detail}</div>
      <div className="text-[11px] text-slate-500">
        {waitingText} · {lastContactText}
      </div>
      {latestAttempt && (
        <div
          className="text-[11px] text-slate-500"
          data-testid="coordinating-with-last-attempt"
        >
          Last attempt:{" "}
          <span className="font-medium text-slate-700">
            {latestAttempt.label}
          </span>
        </div>
      )}
    </div>
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
  onSchedule,
  onBulkLogCall,
  onBulkLogEmail,
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
  /** Open the "Schedule appointment" modal for a coordination booking.
   *  Optional so this view stays usable in isolation. */
  onSchedule?: (id: string) => void;
  /** Bulk-log a call against every supplied booking. Stamps
   *  `lastContactedAt` and appends a typed `kind: "call"` timeline
   *  entry whose label encodes the chosen outcome (No answer / Spoke /
   *  Voicemail) and whose optional shared note carries any free-text
   *  colour. Same shape as `BookingDetail.logCall()` so the timeline
   *  reads consistently regardless of how the entry was created.
   *  Replaces the legacy `onBulkMarkAsChased` (generic chased entry).
   *  Optional so this view stays usable in isolation. */
  onBulkLogCall?: (ids: string[], outcome: CallOutcome, note: string) => void;
  /** Bulk-log an email against every supplied booking. Mirror of
   *  `onBulkLogCall` for the email channel — appends a typed
   *  `kind: "email"` / `status: "logged_email"` timeline entry whose
   *  label encodes the shared subject and whose optional shared note
   *  carries any free-text body. Same shape as
   *  `BookingDetail.logEmail()` so timeline entries are
   *  interchangeable regardless of how they were created.
   *  Optional so this view stays usable in isolation. */
  onBulkLogEmail?: (ids: string[], subject: string, note: string) => void;
}) {
  // Selection lives entirely in this view — once a bulk action fires
  // we clear it. The live demo row is excluded from selection because
  // `updateBooking` is a no-op for it (mirrors the per-booking
  // affordance, which hides for live rows).
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Bulk-log-call form state — collapsed by default so the action bar
  // stays a slim pill, expands inline above the bar when ops chooses
  // to log a call. Outcome defaults to "no_answer" to match the
  // per-row LogCallForm behaviour; the shared note is optional.
  // Only one of the two bulk forms (call / email) can be open at a
  // time so the action bar never grows two competing panels above it.
  const [showBulkLogCall, setShowBulkLogCall] = useState(false);
  const [bulkOutcome, setBulkOutcome] = useState<CallOutcome>("no_answer");
  const [bulkNote, setBulkNote] = useState("");

  // Bulk-log-email form state — same shape as the per-row
  // `LogEmailForm` on `BookingDetail` (subject + optional note) so
  // ops can fire a templated email-out across a batch. Subject is
  // optional in the form to mirror the per-row form, but the
  // AdminApp handler will fall back to a plain "Logged email" label
  // if it's blank.
  const [showBulkLogEmail, setShowBulkLogEmail] = useState(false);
  const [bulkEmailSubject, setBulkEmailSubject] = useState("");
  const [bulkEmailNote, setBulkEmailNote] = useState("");

  // Outcome chip filter — local because no other view needs to know
  // which outcome ops are pivoting on, and resetting it on view
  // remount matches how the bulk-action selection behaves.
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>("all");
  // Pre-compute the kind for each coordination booking so we don't
  // recompute it on every filter / search keystroke. We include every
  // booking whose serviceSlot is `to_be_coordinated`; rows whose
  // accessMethod doesn't match a known coordination bucket are kept
  // and rendered with an "Unassigned" chip so ops never lose sight
  // of them.
  //
  // Default order is a composite "what needs a nudge today?" priority:
  //   1. `never chased` rows first (no one has touched them yet),
  //      tiebroken by oldest `createdAt` so the longest-suffering
  //      bookings rise to the very top.
  //   2. `stale` rows (chased ≥ 24h ago) next, oldest chase first
  //      (largest `hours since chase` first) so the rows ops
  //      forgot about beat the rows ops chased a day ago.
  //   3. `fresh` rows (chased < 24h ago) last, again oldest chase
  //      first so the most-recently-chased rows sink to the bottom.
  // Logging a call (per-row or via the bulk action) flips a row from
  // `never`/`stale` to `fresh` with `hours ≈ 0`, which naturally
  // pushes it to the bottom of the queue.
  //
  // Array#sort is stable in modern JS engines, so rows with the same
  // bucket and chase-hours keep a predictable order across re-renders.
  const bucketRank = { never: 0, stale: 1, fresh: 2 } as const;
  const coordinating = bookings
    .filter((b) => b.serviceSlot === "to_be_coordinated")
    .map((b) => {
      const chased = formatLastContacted(b.lastContactedAt);
      return { b, kind: coordinationKindForBooking(b), chased };
    })
    .sort((a, z) => {
      const bucketDiff = bucketRank[a.chased.severity] - bucketRank[z.chased.severity];
      if (bucketDiff !== 0) return bucketDiff;
      if (a.chased.severity === "never") {
        // No chase yet for either — break ties by who landed first.
        return new Date(a.b.createdAt).getTime() - new Date(z.b.createdAt).getTime();
      }
      // Stale + fresh: oldest chase first ⇒ larger `hours` wins.
      return z.chased.hours - a.chased.hours;
    });

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
    if (outcomeFilter !== "all") {
      const latest = latestCoordinationAttempt(b.serviceTimeline);
      if (outcomeFilter === "never_logged") {
        if (latest !== null) return false;
      } else if (outcomeFilter === "email") {
        if (!latest || latest.kind !== "email") return false;
      } else {
        // spoke | no_answer | voicemail
        if (
          !latest ||
          latest.kind !== "call" ||
          latest.callOutcome !== outcomeFilter
        ) {
          return false;
        }
      }
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

  // Live-demo rows are read-only in this mockup, and cancelled rows
  // can't be logged against (mirrors the same `!isLive &&
  // !isCancelled` guard the per-booking Log call / Log email buttons
  // use in BookingDetail). Cancelled bookings shouldn't normally
  // appear here — the queue filters by
  // `serviceSlot === "to_be_coordinated"` — but we apply the same
  // constraint defensively so the bulk path can never get out of
  // sync with the single-row path.
  const selectableIds = useMemo(
    () =>
      filtered
        .filter(({ b }) => !b.isLive && b.serviceStatus !== "cancelled")
        .map(({ b }) => b.id),
    [filtered],
  );
  // Drop any stale ids from the selection if a filter / search change
  // hides them. This keeps the bulk "Log call for N" honest — the
  // count and the action only ever refer to rows the user can
  // actually see.
  useEffect(() => {
    setSelectedIds((prev) => {
      const visible = new Set(filtered.map(({ b }) => b.id));
      let dirty = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (visible.has(id)) {
          next.add(id);
        } else {
          dirty = true;
        }
      }
      return dirty ? next : prev;
    });
  }, [filtered]);

  const selectedCount = selectedIds.size;
  const allSelectableSelected =
    selectableIds.length > 0 &&
    selectableIds.every((id) => selectedIds.has(id));
  const someSelectableSelected =
    selectedCount > 0 && !allSelectableSelected;

  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds((prev) => {
      // Conventional table-checkbox semantics: if every visible
      // selectable row is already in the selection, the next click
      // clears; otherwise (none or a partial set) we top up the
      // selection to include every visible selectable row.
      const everyVisibleSelected =
        selectableIds.length > 0 &&
        selectableIds.every((id) => prev.has(id));
      if (everyVisibleSelected) return new Set();
      const next = new Set(prev);
      for (const id of selectableIds) next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
    // Closing the forms too keeps the bulk-action UI in a clean
    // "nothing in flight" state — otherwise re-selecting a different
    // set would resurface the previous outcome / subject / note.
    setShowBulkLogCall(false);
    setBulkOutcome("no_answer");
    setBulkNote("");
    setShowBulkLogEmail(false);
    setBulkEmailSubject("");
    setBulkEmailNote("");
  }

  function handleSubmitBulkLogCall() {
    if (!onBulkLogCall || selectedCount === 0) return;
    onBulkLogCall(Array.from(selectedIds), bulkOutcome, bulkNote);
    clearSelection();
  }

  function handleSubmitBulkLogEmail() {
    if (!onBulkLogEmail || selectedCount === 0) return;
    onBulkLogEmail(Array.from(selectedIds), bulkEmailSubject, bulkEmailNote);
    clearSelection();
  }

  // The selection column / bulk action bar is mounted whenever either
  // bulk handler is wired up — the same checkbox column drives both
  // the call and email affordances.
  const bulkActionsEnabled = Boolean(onBulkLogCall || onBulkLogEmail);

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

      {/* Outcome chip row — narrows the queue by the most recent
          call/email outcome on each row, so a team lead can pull up
          (say) "everyone we left a voicemail for" in one click and
          decide who to ring next. Composes with the waiting-on chip,
          building filter, and search above. */}
      <div
        className="flex flex-wrap items-center gap-1.5"
        data-testid="awaiting-coordination-outcome-filter"
      >
        <span className="mr-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Last attempt
        </span>
        {OUTCOME_FILTER_CHIPS.map((chip) => {
          const active = outcomeFilter === chip.key;
          return (
            <button
              key={chip.key}
              type="button"
              onClick={() => setOutcomeFilter(chip.key)}
              data-testid={`chip-outcome-${chip.key}`}
              aria-pressed={active}
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

      {/* Ordering hint — explains the composite priority sort so ops
          aren't surprised that the row order doesn't match the
          BookingsView "newest first" they're used to. */}
      <div
        className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-600"
        data-testid="awaiting-coordination-sort-hint"
      >
        <ArrowDownNarrowWide className="h-3.5 w-3.5 text-slate-500" />
        <span>
          Sorted by priority: <span className="font-semibold text-slate-800">never chased</span>{" "}
          first, then <span className="font-semibold text-slate-800">stale</span> (chased ≥24h
          ago), then everything else — oldest chase first.
        </span>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-[13px]">
          <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
            <tr>
              {bulkActionsEnabled && (
                <th className="w-10 px-4 py-3 font-semibold">
                  <input
                    type="checkbox"
                    aria-label={
                      allSelectableSelected
                        ? "Clear all selections"
                        : "Select all visible coordination bookings"
                    }
                    data-testid="checkbox-select-all-coordination"
                    disabled={selectableIds.length === 0}
                    checked={allSelectableSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelectableSelected;
                    }}
                    onChange={toggleAll}
                    className="h-4 w-4 cursor-pointer rounded border-slate-300 text-pink-600 focus:ring-pink-500 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </th>
              )}
              <th className="px-4 py-3 font-semibold">Booking</th>
              <th className="px-4 py-3 font-semibold">Customer</th>
              <th className="px-4 py-3 font-semibold">Unit</th>
              <th className="px-4 py-3 font-semibold">AC</th>
              <th className="px-4 py-3 font-semibold">Waiting on</th>
              <th className="px-4 py-3 font-semibold">Payment</th>
              <th className="px-4 py-3 font-semibold">Total</th>
              <th className="px-4 py-3 font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={bulkActionsEnabled ? 9 : 8}
                  className="px-4 py-10 text-center text-slate-500"
                >
                  No coordination bookings match these filters.
                </td>
              </tr>
            ) : (
              filtered.map(({ b, kind }) => {
                const unit = units.find((u) => u.id === b.unitId);
                const building = getBuildingForUnit(unit ?? null);
                const isSelected = selectedIds.has(b.id);
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
                    aria-selected={isSelected || undefined}
                    className={`cursor-pointer border-b border-slate-100 transition last:border-b-0 hover:bg-slate-50 focus:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 ${
                      isSelected ? "bg-pink-50/60" : ""
                    }`}
                  >
                    {bulkActionsEnabled && (
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={
                            b.isLive
                              ? `Booking ${b.id} is read-only and cannot be selected`
                              : b.serviceStatus === "cancelled"
                                ? `Booking ${b.id} is cancelled and cannot be logged against`
                                : `Select booking ${b.id} for bulk action`
                          }
                          data-testid={`checkbox-coordination-row-${b.id}`}
                          disabled={b.isLive || b.serviceStatus === "cancelled"}
                          checked={isSelected}
                          onChange={() => toggleRow(b.id)}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                          className="h-4 w-4 cursor-pointer rounded border-slate-300 text-pink-600 focus:ring-pink-500 disabled:cursor-not-allowed disabled:opacity-50"
                        />
                      </td>
                    )}
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
                      <CoordinatingWithCell
                        booking={b}
                        unit={unit}
                        units={units}
                        kind={kind}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <PaymentChip status={b.paymentStatus} />
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      ${b.totalAud.toFixed(2)}
                    </td>
                    <td className="px-4 py-3">
                      {onSchedule && !b.isLive ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSchedule(b.id);
                          }}
                          className="rounded-lg px-2.5 py-1 text-[12px] font-semibold text-white shadow-sm transition hover:brightness-110"
                          style={{ backgroundColor: BRAND }}
                        >
                          Schedule
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-400">—</span>
                      )}
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

      {/* Sticky bulk-action bar — only mounted when ops has actually
          selected something. Pinned to the viewport bottom so it's
          reachable even while scrolling a long queue.

          The collapsed state is a slim pill with "Log call" / "Log
          email" / "Clear". Clicking either trigger expands an inline
          form above the pill so ops can pick a shared outcome /
          subject and an optional shared note before the entry is
          appended to every selected row. Both forms mirror the
          per-row equivalents on `BookingDetail` so timeline entries
          are interchangeable regardless of how they were created.
          Only one form can be open at a time — opening the other
          collapses the first to keep the bar visually calm. */}
      {bulkActionsEnabled && selectedCount > 0 && (
        <div
          role="region"
          aria-label="Bulk actions for selected coordination bookings"
          data-testid="bulk-action-bar-coordination"
          className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4"
        >
          <div className="pointer-events-auto flex w-full max-w-md flex-col gap-2">
            {showBulkLogCall && onBulkLogCall && (
              <div
                className="rounded-xl border border-slate-200 bg-white p-3 shadow-lg"
                data-testid="bulk-log-call-form"
              >
                <div className="text-[12px] font-semibold text-slate-900">
                  Log a call for {selectedCount} booking
                  {selectedCount === 1 ? "" : "s"}
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500">
                  Same outcome and note will be added to every selected row.
                </div>
                <label
                  className="mt-2 block text-[11px] font-medium uppercase tracking-wider text-slate-500"
                  htmlFor="bulk-log-call-outcome"
                >
                  Outcome
                </label>
                <select
                  id="bulk-log-call-outcome"
                  value={bulkOutcome}
                  onChange={(e) => setBulkOutcome(e.target.value as CallOutcome)}
                  data-testid="select-bulk-call-outcome"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] text-slate-900 focus:border-slate-400 focus:outline-none"
                >
                  {CALL_OUTCOME_ORDER.map((o) => (
                    <option key={o} value={o}>
                      {CALL_OUTCOME_LABEL[o]}
                    </option>
                  ))}
                </select>
                <label
                  className="mt-2 block text-[11px] font-medium uppercase tracking-wider text-slate-500"
                  htmlFor="bulk-log-call-note"
                >
                  Shared note (optional)
                </label>
                <textarea
                  id="bulk-log-call-note"
                  value={bulkNote}
                  onChange={(e) => setBulkNote(e.target.value)}
                  rows={2}
                  placeholder="e.g. Building-wide voicemail blast — try again Wed AM"
                  data-testid="input-bulk-call-note"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
                />
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowBulkLogCall(false);
                      setBulkOutcome("no_answer");
                      setBulkNote("");
                    }}
                    data-testid="button-bulk-cancel-log-call"
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[12px] font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmitBulkLogCall}
                    data-testid="button-bulk-confirm-log-call"
                    className="rounded-lg px-2.5 py-1 text-[12px] font-semibold text-white shadow-sm transition hover:brightness-110"
                    style={{ backgroundColor: BRAND }}
                  >
                    Save call for {selectedCount}
                  </button>
                </div>
              </div>
            )}
            {showBulkLogEmail && onBulkLogEmail && (
              <div
                className="rounded-xl border border-slate-200 bg-white p-3 shadow-lg"
                data-testid="bulk-log-email-form"
              >
                <div className="text-[12px] font-semibold text-slate-900">
                  Log an email for {selectedCount} booking
                  {selectedCount === 1 ? "" : "s"}
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500">
                  Same subject and note will be added to every selected row.
                </div>
                <label
                  className="mt-2 block text-[11px] font-medium uppercase tracking-wider text-slate-500"
                  htmlFor="bulk-log-email-subject"
                >
                  Subject
                </label>
                <input
                  id="bulk-log-email-subject"
                  type="text"
                  value={bulkEmailSubject}
                  onChange={(e) => setBulkEmailSubject(e.target.value)}
                  placeholder="e.g. Booking access — please confirm window"
                  data-testid="input-bulk-email-subject"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
                />
                <label
                  className="mt-2 block text-[11px] font-medium uppercase tracking-wider text-slate-500"
                  htmlFor="bulk-log-email-note"
                >
                  Shared note (optional)
                </label>
                <textarea
                  id="bulk-log-email-note"
                  value={bulkEmailNote}
                  onChange={(e) => setBulkEmailNote(e.target.value)}
                  rows={2}
                  placeholder="e.g. Sent rebook link + parcel-locker instructions"
                  data-testid="input-bulk-email-note"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
                />
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowBulkLogEmail(false);
                      setBulkEmailSubject("");
                      setBulkEmailNote("");
                    }}
                    data-testid="button-bulk-cancel-log-email"
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[12px] font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmitBulkLogEmail}
                    data-testid="button-bulk-confirm-log-email"
                    className="rounded-lg px-2.5 py-1 text-[12px] font-semibold text-white shadow-sm transition hover:brightness-110"
                    style={{ backgroundColor: BRAND }}
                  >
                    Save email for {selectedCount}
                  </button>
                </div>
              </div>
            )}
            <div className="flex items-center justify-center gap-3 rounded-full border border-slate-200 bg-white px-4 py-2.5 shadow-lg">
              <span className="text-[13px] font-semibold text-slate-900">
                {selectedCount} selected
              </span>
              <span className="text-slate-300">·</span>
              {onBulkLogCall && (
                <button
                  type="button"
                  onClick={() => {
                    setShowBulkLogCall((v) => !v);
                    // Mutually exclusive — opening Log call collapses
                    // the email form so only one panel ever floats
                    // above the pill at a time.
                    setShowBulkLogEmail(false);
                  }}
                  data-testid="button-bulk-log-call"
                  aria-expanded={showBulkLogCall}
                  aria-controls="bulk-log-call-form"
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm transition hover:brightness-110"
                  style={{ backgroundColor: BRAND }}
                >
                  <Phone className="h-3.5 w-3.5" />
                  Log call
                </button>
              )}
              {onBulkLogEmail && (
                <button
                  type="button"
                  onClick={() => {
                    setShowBulkLogEmail((v) => !v);
                    setShowBulkLogCall(false);
                  }}
                  data-testid="button-bulk-log-email"
                  aria-expanded={showBulkLogEmail}
                  aria-controls="bulk-log-email-form"
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm transition hover:brightness-110"
                  style={{ backgroundColor: BRAND }}
                >
                  <Mail className="h-3.5 w-3.5" />
                  Log email
                </button>
              )}
              <button
                type="button"
                onClick={clearSelection}
                data-testid="button-bulk-clear-selection"
                className="rounded-full px-2.5 py-1.5 text-[12px] font-medium text-slate-600 hover:bg-slate-100"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
