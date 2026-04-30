/**
 * Taylr Admin (mockup) — shell.
 *
 * Single-page mockup of the admin-side ops UI: bookings list + detail,
 * per-rollout schedules, units & AC config, agents, payments. No real
 * DB, no real auth — all data is seeded and any "edits" live in
 * component state for the demo session only.
 *
 * The customer's current sessionStorage booking is folded into the
 * bookings list as a "Live demo" row so the customer can demo the
 * customer flow and see it appear here in real time.
 *
 * Each major screen lives in its own file under this directory; this
 * shell just owns the shared state (units, agents, bookings,
 * rollouts-refresh key, active view, current selection) and routes
 * between them.
 */

import { useEffect, useMemo, useState } from "react";

import {
  applyBulkLogEmail,
  buildRescheduledTimelineEntry,
  CALL_TEMPLATES,
  consumeBookingCapacity,
  convertCoordinationToScheduledPatch,
  countLatestTouchUsageForTemplate,
  countTimelineUsageForTemplate,
  createRollout,
  EMAIL_TEMPLATES,
  findRolloutForBooking,
  findUsageBookingsForTemplate,
  findUsageBookingsForTemplateOnDay,
  formatBookingShortDate,
  getActiveBookingForUnit,
  getEffectivePlacementForUnit,
  getRecordedAcTypeForUnit,
  getServiceRuleForAcType,
  getTemplateUsageTrend,
  isCustomCallTemplateLabel,
  liveBookingFromSession,
  nextCallTemplateId,
  nextEmailTemplateId,
  normalizeCallTemplateDraft,
  normalizeEmailTemplateDraft,
  notifyLiveBookingsChanged,
  notifyLiveBuildingsChanged,
  notifyLiveServiceCatalogueChanged,
  notifyLiveUnitsChanged,
  priorServiceStatusFromTimeline,
  releaseBookingCapacity,
  reorderCallTemplates,
  reorderEmailTemplates,
  revertScheduledToCoordinationPatch,
  setDefaultCallTemplate as setDefaultCallTemplateInCatalog,
  setDefaultEmailTemplate as setDefaultEmailTemplateInCatalog,
  SEEDED_AGENTS,
  SEEDED_BOOKINGS,
  SEEDED_BUILDINGS,
  SEEDED_SERVICES,
  SEEDED_UNITS,
  setLiveBookingsSource,
  setLiveBuildingsSource,
  setLiveServiceCatalogueSource,
  setLiveUnitsSource,
  summarizeTemplateUsageBooking,
  type AdminAgent,
  type AdminBooking,
  type AdminBuilding,
  type AdminCreatedScheduleChoice,
  type AdminService,
  type AdminUnit,
  type CallTemplate,
  type EmailTemplate,
  type PaymentStatus,
  type ServiceStatus,
  type TimelineEntry,
} from "@/state/adminMockData";
import {
  setServiceRuleResolver,
  setUnitDurationContextResolver,
} from "@/state/bookingDerived";
import { writeLiveOtherServices } from "@/state/liveOtherServices";
import { writeLiveAcCaps } from "@/state/liveAcServices";
import { setUniquenessGuard, useBookingSession } from "@/state/bookingSession";

import { AgentsView } from "./AgentsView";
import {
  AwaitingCoordinationView,
  OUTCOME_FILTER_VALUES,
  type OutcomeFilter,
} from "./AwaitingCoordinationView";
import {
  decodeTemplateFilter,
  encodeTemplateFilter,
  type BookingsTemplateFilter,
} from "./bookingsTemplateFilter";
import {
  CallTemplatesView,
  type CallTemplateSortMode,
} from "./CallTemplatesView";
import {
  EmailTemplatesView,
  type EmailTemplateSortMode,
} from "./EmailTemplatesView";
import {
  BookingDetail,
  CALL_OUTCOME_LABEL,
  type CallOutcome,
} from "./BookingDetail";
import { BookingsView } from "./BookingsView";
import { BuildingDetail } from "./BuildingDetail";
import { BuildingsView } from "./BuildingsView";
import { NewBookingFlow } from "./NewBookingFlow";
import { RolloutScheduleEditor } from "./RolloutScheduleEditor";
import { RolloutsView } from "./RolloutsView";
import { SchedulingModal, type SchedulingMode } from "./SchedulingModal";
import { selectPendingInvoiceVoids } from "./InvoiceVoidAlerts";
import { ServicesView } from "./ServicesView";
import { Sidebar } from "./Sidebar";
import { Toast, type ToastVariant } from "./Toast";
import { TopBar } from "./TopBar";
import { UnitsView } from "./UnitsView";
import type { CoordinationKind } from "@/state/adminMockData";
import type { ViewId } from "./types";

/**
 * Query-string param names for the lifted Bookings / Awaiting-
 * coordination toolbar filters. Task #195 wired the first one
 * (`template`) so an ops lead refreshing or sharing the URL mid-
 * batch wouldn't silently re-broaden the queue; Task #207 extends
 * the same treatment to the rest of the toolbar so a refresh
 * survives every lens, not just the template chip.
 *
 * All four params share the same grammar:
 *  - The encoded value mirrors the toolbar control's own value
 *    (the `<select>`'s string for the templates / status / building
 *    chips, the raw search box text for `q`).
 *  - Each filter's reset value (`null` template, `"all"` chip,
 *    empty string search) is represented by **omitting** the param
 *    so the URL of a fresh visit is byte-identical to one where
 *    every filter was manually cleared. This lets `handleNav`
 *    drop the params in lockstep with the state reset.
 */
const BOOKINGS_TEMPLATE_FILTER_PARAM = "template";
const BOOKINGS_STATUS_FILTER_PARAM = "status";
const BOOKINGS_BUILDING_FILTER_PARAM = "building";
const BOOKINGS_SEARCH_PARAM = "q";
const COORDINATION_FILTER_PARAM = "coordination";
const OUTCOME_FILTER_PARAM = "outcome";

/**
 * Generic single-param read/write pair the per-filter helpers
 * below all delegate to. Extracted from Task #195's
 * template-filter helpers so adding three more filters in
 * Task #207 didn't mean copy-pasting the same `URLSearchParams` /
 * `replaceState` choreography four times. The shape mirrors the
 * original template-filter pair exactly:
 *  - SSR-safe (`typeof window === "undefined"` short-circuit), so
 *    a server-rendered shell doesn't crash trying to read
 *    `window.location`.
 *  - Skip the `replaceState` call when the param is already
 *    correct — keeps the history clean and avoids the browser's
 *    own scroll/anchor side effects on a no-op write.
 *  - `null` value deletes the param entirely so a cleared filter
 *    leaves a URL identical to a fresh visit.
 */
function readUrlParam(name: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}

function writeUrlParam(name: string, value: string | null): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const current = url.searchParams.get(name);
  if (value === null) {
    if (current === null) return;
    url.searchParams.delete(name);
  } else {
    if (current === value) return;
    url.searchParams.set(name, value);
  }
  window.history.replaceState(window.history.state, "", url.toString());
}

/** Read the initial {@link BookingsTemplateFilter} from the URL on
 *  mount. Returns `null` (the toolbar's reset state) when the param
 *  is missing, malformed, or we're not in a browser. Exported so
 *  the Task #195 round-trip integration tests can assert that the
 *  URL → state seed Awaiting-coordination receives is the same one
 *  Bookings receives — both views share the lifted prop, so the
 *  helper is the symmetry boundary. */
export function readBookingsTemplateFilterFromURL(): BookingsTemplateFilter {
  const raw = readUrlParam(BOOKINGS_TEMPLATE_FILTER_PARAM);
  if (raw === null) return null;
  return decodeTemplateFilter(raw);
}

/** Mirror the {@link BookingsTemplateFilter} state back into the URL
 *  with `replaceState` (no history entry per chip flip). A `null`
 *  filter removes the param so the URL is identical to a fresh
 *  visit — clearing the chip / picking "All templates" therefore
 *  also "removes the param" as the task spec requires. */
function writeBookingsTemplateFilterToURL(
  filter: BookingsTemplateFilter,
): void {
  writeUrlParam(
    BOOKINGS_TEMPLATE_FILTER_PARAM,
    filter === null ? null : encodeTemplateFilter(filter),
  );
}

/** Whitelist of the status-filter chip values BookingsView /
 *  Payments knows how to render — the union of `ServiceStatus`,
 *  `PaymentStatus`, and the `"all"` reset. Used by
 *  {@link readBookingsStatusFilterFromURL} to drop unknown
 *  `?status=…` values back to the reset, so a typo'd or stale
 *  URL doesn't crash the chip lookup or render a chip the
 *  toolbar can't display. Mirrors the chip lists in
 *  `BookingsView.tsx` so any future status added there must also
 *  show up here to round-trip. */
const VALID_BOOKINGS_STATUS_FILTERS: ReadonlySet<string> = new Set<string>([
  "all",
  // ServiceStatus
  "scheduled",
  "on_site",
  "complete",
  "invoice_adjusted",
  "cancelled",
  // PaymentStatus
  "paid",
  "pending",
  "refund_pending",
  "refunded",
]);

type BookingsStatusFilter = "all" | ServiceStatus | PaymentStatus;

/** Read / write the Bookings list status chip from the URL. The
 *  reset value (`"all"`) is encoded by **omitting** the param, so
 *  picking the "All statuses" / "All payments" chip drops the
 *  param the same way clearing the template filter does. */
export function readBookingsStatusFilterFromURL(): BookingsStatusFilter {
  const raw = readUrlParam(BOOKINGS_STATUS_FILTER_PARAM);
  if (raw === null) return "all";
  if (!VALID_BOOKINGS_STATUS_FILTERS.has(raw)) return "all";
  return raw as BookingsStatusFilter;
}

function writeBookingsStatusFilterToURL(value: BookingsStatusFilter): void {
  writeUrlParam(BOOKINGS_STATUS_FILTER_PARAM, value === "all" ? null : value);
}

/** Read / write the building filter (`"all"` reset / building id).
 *  Building ids aren't whitelisted here on purpose: the catalog is
 *  mutable for the demo session and a filter pointing at a since-
 *  deleted building should still round-trip cleanly (the toolbar
 *  will fall back to "all" when the option isn't found, same as
 *  any out-of-catalog template filter). */
export function readBookingsBuildingFilterFromURL(): string {
  const raw = readUrlParam(BOOKINGS_BUILDING_FILTER_PARAM);
  if (raw === null || raw.length === 0) return "all";
  return raw;
}

function writeBookingsBuildingFilterToURL(value: string): void {
  writeUrlParam(
    BOOKINGS_BUILDING_FILTER_PARAM,
    value === "all" || value.length === 0 ? null : value,
  );
}

/** Read / write the toolbar search box. An empty / whitespace-only
 *  search is the reset value (no param), matching the chip /
 *  template-filter convention. */
export function readSearchFromURL(): string {
  const raw = readUrlParam(BOOKINGS_SEARCH_PARAM);
  if (raw === null) return "";
  return raw;
}

function writeSearchToURL(value: string): void {
  writeUrlParam(
    BOOKINGS_SEARCH_PARAM,
    value.trim().length === 0 ? null : value,
  );
}

/** Read / write the Awaiting-coordination "waiting on" chip. Same
 *  reset-as-omitted contract; only the two real `CoordinationKind`
 *  values are accepted so a stale URL falls back to "all". */
export function readCoordinationFilterFromURL(): "all" | CoordinationKind {
  const raw = readUrlParam(COORDINATION_FILTER_PARAM);
  if (raw === "awaiting_agent" || raw === "awaiting_tenant") return raw;
  return "all";
}

function writeCoordinationFilterToURL(value: "all" | CoordinationKind): void {
  writeUrlParam(COORDINATION_FILTER_PARAM, value === "all" ? null : value);
}

/** Whitelist of every outcome chip the Awaiting-coordination toolbar
 *  knows how to render, sourced directly from the chip row's own
 *  source of truth ({@link OUTCOME_FILTER_VALUES}) so a future chip
 *  added there is automatically allow-listed here too. Used by
 *  {@link readOutcomeFilterFromURL} to drop unknown / stale
 *  `?outcome=…` values back to the reset (`"all"`) instead of
 *  smuggling an out-of-catalog string into the chip's `aria-pressed`
 *  / count lookup. */
const VALID_OUTCOME_FILTERS: ReadonlySet<string> = new Set<string>(
  OUTCOME_FILTER_VALUES,
);

/** Read / write the Awaiting-coordination outcome chip from the URL.
 *  Same reset-as-omitted contract as the rest of the queue toolbar:
 *  picking the "Any outcome" chip removes the param so the URL of a
 *  fresh visit is byte-identical to one where every filter was
 *  manually cleared. Stale / malformed values fall back to `"all"`
 *  the same way the status chip helper does (Task #207). */
export function readOutcomeFilterFromURL(): OutcomeFilter {
  const raw = readUrlParam(OUTCOME_FILTER_PARAM);
  if (raw === null) return "all";
  if (!VALID_OUTCOME_FILTERS.has(raw)) return "all";
  return raw as OutcomeFilter;
}

function writeOutcomeFilterToURL(value: OutcomeFilter): void {
  writeUrlParam(OUTCOME_FILTER_PARAM, value === "all" ? null : value);
}

/**
 * `localStorage` keys for the lifted Call / Email templates panel
 * Sort toggle (Task #215). Task #192 hoisted both `sortMode` slots
 * into AdminApp shell state so the choice survived sidebar nav
 * round-trips, but the state was still in-memory only — a full
 * page reload reset both panels back to "Default order". Mirroring
 * the per-channel split here (one key per channel) means flipping
 * the Call panel doesn't move the Email panel's persisted choice
 * either. Namespaced under `admin.` so the same key can't collide
 * with any other artifact's persisted state.
 */
const CALL_TEMPLATES_SORT_MODE_STORAGE_KEY = "admin.callTemplatesSortMode";
const EMAIL_TEMPLATES_SORT_MODE_STORAGE_KEY = "admin.emailTemplatesSortMode";

/** All Sort modes the Call templates panel currently understands.
 *  Used as an allow-list when validating a value read back from
 *  localStorage so a stale / hand-edited entry can't smuggle an
 *  unknown string into typed shell state. Kept in lock-step with
 *  {@link CallTemplateSortMode}. */
const CALL_TEMPLATES_SORT_MODES: ReadonlyArray<CallTemplateSortMode> = [
  "default",
  "mostUsed",
  "mostReferenced",
];

/** Mirror of {@link CALL_TEMPLATES_SORT_MODES} for the Email panel.
 *  Kept separate so a future divergence in either channel's mode
 *  set doesn't silently widen the other's allow-list. */
const EMAIL_TEMPLATES_SORT_MODES: ReadonlyArray<EmailTemplateSortMode> = [
  "default",
  "mostUsed",
  "mostReferenced",
];

/** Read the persisted Call templates Sort choice on mount. Returns
 *  the panel's default (`"default"`) when we're not in a browser,
 *  when the storage entry is missing, when access throws (e.g.
 *  Safari private mode, quota), or when the stored string isn't
 *  one of the allow-listed modes — so a stale entry from an older
 *  build can never put the shell into an unknown sort state. */
export function readPersistedCallTemplatesSortMode(): CallTemplateSortMode {
  if (typeof window === "undefined") return "default";
  try {
    const raw = window.localStorage.getItem(
      CALL_TEMPLATES_SORT_MODE_STORAGE_KEY,
    );
    if (
      raw !== null &&
      (CALL_TEMPLATES_SORT_MODES as ReadonlyArray<string>).includes(raw)
    ) {
      return raw as CallTemplateSortMode;
    }
  } catch {
    // localStorage may throw (private mode, quota, disabled) — fall
    // through to the panel default.
  }
  return "default";
}

/** Email-side companion to {@link readPersistedCallTemplatesSortMode}.
 *  Same fallbacks, separate key, separate allow-list — flipping
 *  one panel's persisted mode never moves the other. */
export function readPersistedEmailTemplatesSortMode(): EmailTemplateSortMode {
  if (typeof window === "undefined") return "default";
  try {
    const raw = window.localStorage.getItem(
      EMAIL_TEMPLATES_SORT_MODE_STORAGE_KEY,
    );
    if (
      raw !== null &&
      (EMAIL_TEMPLATES_SORT_MODES as ReadonlyArray<string>).includes(raw)
    ) {
      return raw as EmailTemplateSortMode;
    }
  } catch {
    // See readPersistedCallTemplatesSortMode for why we swallow.
  }
  return "default";
}

/** Write the active Sort choice back to localStorage. Swallows
 *  storage errors so a quota-full / private-mode browser still
 *  renders the panel — the persistence is a nice-to-have, not a
 *  correctness requirement. */
function writePersistedSortMode(key: string, mode: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, mode);
  } catch {
    // See readPersistedCallTemplatesSortMode for why we swallow.
  }
}

/** Query-string param name for the active sidebar view (Task #208).
 *  Mirrors the Task #195 `?template=…` round-trip so a refresh
 *  restores both the view and the chip on the same paint. */
const VIEW_PARAM = "view";

/** View assumed when `?view=` is absent. Omitted from the URL by
 *  {@link writeViewToURL} so a fresh visit and a deliberate
 *  nav-back-to-default produce identical URLs. */
const DEFAULT_VIEW: ViewId = "bookings";

/** Allow-list for the URL decoder. The `satisfies Record<ViewId, true>`
 *  fails the build if a future {@link ViewId} is added without being
 *  listed here, so the decoder can never silently miss a new view. */
const VALID_VIEW_IDS: ReadonlySet<ViewId> = new Set(
  Object.keys({
    bookings: true,
    payments: true,
    awaiting_coordination: true,
    rollouts: true,
    buildings: true,
    units: true,
    services: true,
    agents: true,
    email_templates: true,
    call_templates: true,
  } satisfies Record<ViewId, true>) as ViewId[],
);

/** Read the initial {@link ViewId} from the URL on mount. Returns
 *  {@link DEFAULT_VIEW} when the param is missing, unrecognised, or
 *  we're not in a browser. Exported for the round-trip tests. */
export function readViewFromURL(): ViewId {
  if (typeof window === "undefined") return DEFAULT_VIEW;
  const raw = new URLSearchParams(window.location.search).get(VIEW_PARAM);
  if (raw === null) return DEFAULT_VIEW;
  return VALID_VIEW_IDS.has(raw as ViewId) ? (raw as ViewId) : DEFAULT_VIEW;
}

/** Mirror the {@link ViewId} state back into the URL with
 *  `replaceState` (no extra history entry per nav). The default
 *  view is omitted so the URL stays clean. */
function writeViewToURL(view: ViewId): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const current = url.searchParams.get(VIEW_PARAM);
  if (view === DEFAULT_VIEW) {
    if (current === null) return;
    url.searchParams.delete(VIEW_PARAM);
  } else {
    if (current === view) return;
    url.searchParams.set(VIEW_PARAM, view);
  }
  window.history.replaceState(window.history.state, "", url.toString());
}

/**
 * Copy for the missing-template hint toast: ops clicked a
 * `From template: <name>` chip but the catalog no longer has a row
 * with that name. Exported so the regression test can pin the wording.
 */
export function buildMissingTemplateHint(
  kind: "call" | "email",
  templateName: string,
): string {
  const channel = kind === "call" ? "Call" : "Email";
  return `"${templateName}" is no longer in the ${channel} templates catalog. Historical timeline entry kept.`;
}

export function AdminApp() {
  // Mutable working copies of the seeded data (so admin "edits" stick
  // for the demo session).
  const [units, setUnits] = useState<AdminUnit[]>([...SEEDED_UNITS]);
  const [agents, setAgents] = useState<AdminAgent[]>([...SEEDED_AGENTS]);
  const [seededBookings, setSeededBookings] =
    useState<AdminBooking[]>([...SEEDED_BOOKINGS]);

  // Bumped on every rollout mutation so any view reading from the
  // module-level rollouts store re-renders. We keep the rollout list in
  // module state (not React state) so a customer-side booking that
  // resolves a rollout sees the same data the admin is editing.
  const [rolloutsRefreshKey, setRolloutsRefreshKey] = useState(0);
  function bumpRolloutsRefreshKey() {
    setRolloutsRefreshKey((k) => k + 1);
    // Notify customer-side subscribers (slot pickers, unit tiles) that
    // the live bookings list changed so their "already scheduled by
    // someone else" lock and unit-availability badges re-evaluate.
    notifyLiveBookingsChanged();
  }

  // Live customer booking pulled from sessionStorage.
  const session = useBookingSession();
  const liveBooking = useMemo(() => liveBookingFromSession(session), [session]);
  const allBookings: AdminBooking[] = liveBooking
    ? [liveBooking, ...seededBookings]
    : seededBookings;

  // Buildings are mutable so the per-building "Outdoor unit placement"
  // controls (Task #182) can persist edits for the demo session — the
  // duration helper reads through `setLiveBuildingsSource` so any
  // change re-flows into the booking-detail duration breakdown and the
  // slot picker's time-budget math the next render.
  const [buildings, setBuildings] = useState<AdminBuilding[]>([
    ...SEEDED_BUILDINGS,
  ]);

  // Mutable service catalogue (Task #182). Seeded from `SEEDED_SERVICES`
  // so the catalogue isn't empty on first render; ops edits made on the
  // Services view re-flow through `setLiveServiceCatalogueSource` into
  // the duration helper and pricing card the next render.
  const [services, setServices] = useState<AdminService[]>([
    ...SEEDED_SERVICES,
  ]);
  function commitServices(next: AdminService[]) {
    setServices(next);
    notifyLiveServiceCatalogueChanged();
  }

  // Mutable email-template catalog for the bulk Log-email dropdown
  // on the Awaiting-coordination queue. Seeded from `EMAIL_TEMPLATES`
  // so the dropdown isn't empty on first render; admins can add /
  // edit / remove from the "Email templates" panel and the dropdown
  // picks the changes up on the next render. Editing or removing a
  // template never rewrites historical timeline entries — the bulk
  // form snapshots subject + note onto the entry at log time, not a
  // template id, so the audit trail is immutable by construction.
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([
    ...EMAIL_TEMPLATES,
  ]);
  function createEmailTemplate(draft: {
    name: string;
    subject: string;
    note: string;
  }) {
    const normalized = normalizeEmailTemplateDraft(draft);
    if (normalized.name.length === 0 || normalized.subject.length === 0) {
      // Modal already disables Save in this state; this guard keeps a
      // future programmatic caller from sneaking a half-formed
      // template into the catalog.
      return;
    }
    setEmailTemplates((prev) => [
      ...prev,
      { id: nextEmailTemplateId(prev), ...normalized },
    ]);
  }
  function updateEmailTemplate(
    id: string,
    draft: { name: string; subject: string; note: string },
  ) {
    const normalized = normalizeEmailTemplateDraft(draft);
    if (normalized.name.length === 0 || normalized.subject.length === 0) return;
    const previousName = emailTemplates.find((t) => t.id === id)?.name;
    setEmailTemplates((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...normalized } : t)),
    );
    // Auto-clear the BookingsView "Template used" filter if it was
    // bound to this template's old name (Task #162). The filter
    // matches by snapshot string, so a rename leaves it dangling —
    // the dropdown options reflect the new name, the chip is stuck
    // on the old, and the table silently empties out. Clearing the
    // filter is the honest behaviour: the lens the admin set up
    // referred to a label that no longer exists. (We don't quietly
    // re-bind to the new name because a rename can change meaning,
    // not just spelling — better to surface the change than to
    // silently follow it.)
    if (
      previousName !== undefined &&
      previousName !== normalized.name &&
      bookingsTemplateFilter !== null &&
      bookingsTemplateFilter.kind === "email" &&
      bookingsTemplateFilter.name === previousName
    ) {
      setBookingsTemplateFilter(null);
    }
  }
  function removeEmailTemplate(id: string) {
    const removed = emailTemplates.find((t) => t.id === id);
    setEmailTemplates((prev) => prev.filter((t) => t.id !== id));
    // Companion to the rename auto-clear above (Task #162): if the
    // BookingsView "Template used" filter was pointed at the
    // template that just disappeared, clear it so the toolbar
    // doesn't dangle on a label that's no longer in the catalog.
    if (
      removed !== undefined &&
      bookingsTemplateFilter !== null &&
      bookingsTemplateFilter.kind === "email" &&
      bookingsTemplateFilter.name === removed.name
    ) {
      setBookingsTemplateFilter(null);
    }
  }
  function setDefaultEmailTemplate(id: string) {
    setEmailTemplates((prev) => setDefaultEmailTemplateInCatalog(prev, id));
  }
  function reorderEmailTemplate(fromId: string, toId: string) {
    setEmailTemplates((prev) => reorderEmailTemplates(prev, fromId, toId));
  }

  // Mutable call-template catalog for the per-row Log-call form on
  // `BookingDetail` and the bulk Log-call form on
  // `AwaitingCoordinationView`. Mirror of `emailTemplates` above —
  // seeded from {@link CALL_TEMPLATES}, mutated from the
  // "Call templates" panel, and consumed live by both Log-call
  // dropdowns. Editing or removing a template never rewrites
  // historical timeline entries — both forms snapshot the template's
  // note onto the entry at log time, not a template id, so the audit
  // trail is immutable by construction.
  const [callTemplates, setCallTemplates] = useState<CallTemplate[]>([
    ...CALL_TEMPLATES,
  ]);
  function createCallTemplate(draft: { name: string; note: string }) {
    const normalized = normalizeCallTemplateDraft(draft);
    if (normalized.name.length === 0) {
      // Modal already disables Save in this state; this guard keeps a
      // future programmatic caller from sneaking a half-formed
      // template into the catalog.
      return;
    }
    setCallTemplates((prev) => [
      ...prev,
      { id: nextCallTemplateId(prev), ...normalized },
    ]);
  }
  function updateCallTemplate(
    id: string,
    draft: { name: string; note: string },
  ) {
    const normalized = normalizeCallTemplateDraft(draft);
    if (normalized.name.length === 0) return;
    const previousName = callTemplates.find((t) => t.id === id)?.name;
    setCallTemplates((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...normalized } : t)),
    );
    // Mirror of the email-template auto-clear (Task #162) — see the
    // comment on `updateEmailTemplate` for the rationale.
    if (
      previousName !== undefined &&
      previousName !== normalized.name &&
      bookingsTemplateFilter !== null &&
      bookingsTemplateFilter.kind === "call" &&
      bookingsTemplateFilter.name === previousName
    ) {
      setBookingsTemplateFilter(null);
    }
  }
  function removeCallTemplate(id: string) {
    const removed = callTemplates.find((t) => t.id === id);
    setCallTemplates((prev) => prev.filter((t) => t.id !== id));
    // Mirror of the email-template auto-clear (Task #162).
    if (
      removed !== undefined &&
      bookingsTemplateFilter !== null &&
      bookingsTemplateFilter.kind === "call" &&
      bookingsTemplateFilter.name === removed.name
    ) {
      setBookingsTemplateFilter(null);
    }
  }
  function setDefaultCallTemplate(id: string) {
    setCallTemplates((prev) => setDefaultCallTemplateInCatalog(prev, id));
  }
  function reorderCallTemplate(fromId: string, toId: string) {
    setCallTemplates((prev) => reorderCallTemplates(prev, fromId, toId));
  }

  // Per-template count of timeline entries that reference each
  // template, surfaced by the `*TemplatesView` panels for the Remove
  // confirm warning. Memoised so unrelated renders don't re-walk
  // every booking's timeline.
  const emailTemplateUsageCounts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const t of emailTemplates) {
      out[t.id] = countTimelineUsageForTemplate(allBookings, "email", t.name);
    }
    return out;
  }, [allBookings, emailTemplates]);
  const callTemplateUsageCounts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const t of callTemplates) {
      out[t.id] = countTimelineUsageForTemplate(allBookings, "call", t.name);
    }
    return out;
  }, [allBookings, callTemplates]);

  // Per-template count of bookings whose latest call/email touch is
  // each template (Task #160). Different from the timeline-entry
  // count above: this one matches the predicate that BookingsView's
  // template filter uses, so the badge rendered on each template row
  // equals the row count the admin will see on click-through.
  const emailTemplateLatestTouchCounts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const t of emailTemplates) {
      out[t.id] = countLatestTouchUsageForTemplate(
        allBookings,
        "email",
        t.name,
      );
    }
    return out;
  }, [allBookings, emailTemplates]);
  const callTemplateLatestTouchCounts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const t of callTemplates) {
      out[t.id] = countLatestTouchUsageForTemplate(
        allBookings,
        "call",
        t.name,
      );
    }
    return out;
  }, [allBookings, callTemplates]);

  // Per-template rolling 7-day usage trend (Task #171). Drives the
  // sparkline shown next to the "Used in N bookings" badge so admins
  // can spot a template whose usage is climbing without leaving the
  // panel. Snapshot-on-use semantics — a rename doesn't reattribute
  // historical bars, same rule the headline count badge follows.
  const emailTemplateUsageTrends = useMemo(() => {
    const out: Record<string, ReturnType<typeof getTemplateUsageTrend>> = {};
    for (const t of emailTemplates) {
      out[t.id] = getTemplateUsageTrend(allBookings, "email", t.name);
    }
    return out;
  }, [allBookings, emailTemplates]);
  const callTemplateUsageTrends = useMemo(() => {
    const out: Record<string, ReturnType<typeof getTemplateUsageTrend>> = {};
    for (const t of callTemplates) {
      out[t.id] = getTemplateUsageTrend(allBookings, "call", t.name);
    }
    return out;
  }, [allBookings, callTemplates]);

  // Per-template list of bookings that reference each template,
  // pre-summarised so the templates panels stay agnostic of the units
  // list. Drives the drill-down popover on each template row.
  const emailTemplateUsageBookings = useMemo(() => {
    const out: Record<string, ReturnType<typeof summarizeTemplateUsageBooking>[]> = {};
    for (const t of emailTemplates) {
      out[t.id] = findUsageBookingsForTemplate(allBookings, "email", t.name).map(
        (b) => summarizeTemplateUsageBooking(b, units),
      );
    }
    return out;
  }, [allBookings, emailTemplates, units]);
  const callTemplateUsageBookings = useMemo(() => {
    const out: Record<string, ReturnType<typeof summarizeTemplateUsageBooking>[]> = {};
    for (const t of callTemplates) {
      out[t.id] = findUsageBookingsForTemplate(allBookings, "call", t.name).map(
        (b) => summarizeTemplateUsageBooking(b, units),
      );
    }
    return out;
  }, [allBookings, callTemplates, units]);

  // Per-template, per-day list of bookings whose timeline touched
  // each template on each UTC day inside the sparkline window
  // (Task #197). The sparkline component reads this map by template
  // id and turns each non-zero bar into a clickable affordance that
  // opens a day-scoped drill-down popover. Same snapshot-on-use
  // semantics as the day-bucketed counts that drive the sparkline
  // itself, so the bar's count and the popover's booking list can
  // never disagree about which entries lit the bar up. Ties the
  // shape directly to the days that are actually rendered in the
  // companion `*UsageTrends` map so a future tweak to the trend
  // window (e.g. 14 days) only needs to change one place.
  const emailTemplateUsageBookingsByDay = useMemo(() => {
    const out: Record<
      string,
      Record<string, ReturnType<typeof summarizeTemplateUsageBooking>[]>
    > = {};
    for (const t of emailTemplates) {
      const days = emailTemplateUsageTrends[t.id] ?? [];
      const perDay: Record<
        string,
        ReturnType<typeof summarizeTemplateUsageBooking>[]
      > = {};
      for (const point of days) {
        if (point.count === 0) continue;
        perDay[point.date] = findUsageBookingsForTemplateOnDay(
          allBookings,
          "email",
          t.name,
          point.date,
        ).map((b) => summarizeTemplateUsageBooking(b, units));
      }
      out[t.id] = perDay;
    }
    return out;
  }, [allBookings, emailTemplates, units, emailTemplateUsageTrends]);
  const callTemplateUsageBookingsByDay = useMemo(() => {
    const out: Record<
      string,
      Record<string, ReturnType<typeof summarizeTemplateUsageBooking>[]>
    > = {};
    for (const t of callTemplates) {
      const days = callTemplateUsageTrends[t.id] ?? [];
      const perDay: Record<
        string,
        ReturnType<typeof summarizeTemplateUsageBooking>[]
      > = {};
      for (const point of days) {
        if (point.count === 0) continue;
        perDay[point.date] = findUsageBookingsForTemplateOnDay(
          allBookings,
          "call",
          t.name,
          point.date,
        ).map((b) => summarizeTemplateUsageBooking(b, units));
      }
      out[t.id] = perDay;
    }
    return out;
  }, [allBookings, callTemplates, units, callTemplateUsageTrends]);

  // Active sidebar view. Seeded from `?view=…` (Task #208) so a
  // refresh restores both the active screen and the Task #195
  // template chip on first paint; the effect mirrors changes back.
  const [view, setView] = useState<ViewId>(() => readViewFromURL());
  useEffect(() => {
    writeViewToURL(view);
  }, [view]);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(
    null,
  );
  const [selectedRolloutId, setSelectedRolloutId] = useState<string | null>(
    null,
  );

  // Round-trip companion to the Call/Email templates panel's
  // "Referenced by N entries" popover (Task #149): when ops clicks
  // the new "From template: …" chip on a booking timeline entry
  // (Task #155), the AdminApp shell switches to the matching
  // templates panel and highlights the row that's identified here.
  // Independent slots per channel so a focus from one panel doesn't
  // leak into the other when the user toggles between them. `null`
  // means no row is currently focused.
  const [focusedCallTemplateId, setFocusedCallTemplateId] = useState<
    string | null
  >(null);
  const [focusedEmailTemplateId, setFocusedEmailTemplateId] = useState<
    string | null
  >(null);

  // Lifted sort-toggle state for the Call / Email templates panels
  // (Task #192). Task #170 originally parked these `useState`s inside
  // each panel component, but that meant the choice was thrown away
  // every time ops popped over to Bookings (or to the other channel's
  // templates view) and back — admins comparing usage across channels
  // had to re-click "Most used first" on every return trip. Hoisting
  // both slots up here makes the choice a property of the shell
  // session: each channel remembers independently (so flipping the
  // Call panel doesn't move the Email panel) and the choice survives
  // any sidebar nav round-trip.
  //
  // Task #215 then made the choice survive a full page reload too,
  // by seeding each slot from `localStorage` on first paint and
  // mirroring writes back. Independent keys per channel preserve
  // the same don't-leak-between-panels invariant the in-memory
  // version enforces.
  const [callTemplatesSortMode, setCallTemplatesSortMode] =
    useState<CallTemplateSortMode>(readPersistedCallTemplatesSortMode);
  const [emailTemplatesSortMode, setEmailTemplatesSortMode] =
    useState<EmailTemplateSortMode>(readPersistedEmailTemplatesSortMode);
  useEffect(() => {
    writePersistedSortMode(
      CALL_TEMPLATES_SORT_MODE_STORAGE_KEY,
      callTemplatesSortMode,
    );
  }, [callTemplatesSortMode]);
  useEffect(() => {
    writePersistedSortMode(
      EMAIL_TEMPLATES_SORT_MODE_STORAGE_KEY,
      emailTemplatesSortMode,
    );
  }, [emailTemplatesSortMode]);

  // Admin "New booking" (phone booking) overlay. `newBookingBuildingId`
  // pre-applies a building filter on Step 1 when the flow was opened
  // from a building detail screen.
  const [newBookingOpen, setNewBookingOpen] = useState(false);
  const [newBookingBuildingId, setNewBookingBuildingId] = useState<
    string | null
  >(null);

  // Shared Schedule / Reschedule modal overlay. Holds the booking id
  // ops is scheduling and the active mode:
  //   - "schedule"   → coordination → scheduled (from awaiting-
  //                    coordination row or BookingDetail Schedule card)
  //   - "reschedule" → move an already-scheduled booking to a new slot
  //                    (from BookingDetail Schedule card)
  // `null` means the modal is closed.
  const [schedulingTarget, setSchedulingTarget] = useState<
    { id: string; mode: SchedulingMode } | null
  >(null);

  // Bottom-right success toast (Task #78). The `id` field gives each
  // toast a stable key so the Toast component can reset its 4s
  // auto-dismiss timer when a second scheduling lands while the
  // previous toast is still visible.
  //
  // The optional `undo` callback (Task #92) wires the success toast to
  // a one-click revert of the scheduling that just happened — flips
  // the booking back to "to_be_coordinated", restores its prior date,
  // drops the freshly-appended timeline entry, and releases the
  // rollout slot capacity that was consumed.
  const [toast, setToast] = useState<{
    id: string;
    message: string;
    undo?: () => void;
    /** Visual variant — defaults to "success". The "info" variant
     *  is used for the missing-template hint from
     *  {@link openTemplateFromBooking}. */
    variant?: ToastVariant;
    /** When true, the toast clears on the next sidebar nav. Used by
     *  the missing-template hint; scheduling / bulk-log toasts opt
     *  out so they persist when ops switches view. */
    dismissOnNav?: boolean;
  } | null>(null);

  // When jumping to Payments, default the bookings list to the payments filter.
  //
  // Each toolbar filter below seeds from its own `?…` param on
  // mount (Task #207 — extending Task #195's template-filter
  // round-trip to the rest of the queue toolbar) and mirrors any
  // subsequent state change back into the URL via the companion
  // `useEffect`. The reset value (`"all"` chip / empty search /
  // `null` template) is encoded by **omitting** the param so a
  // cleared toolbar leaves a URL identical to a fresh visit, and
  // `handleNav` can drop every param in lockstep with its own
  // wholesale state reset just by setting state to the reset value.
  const [bookingsStatusFilter, setBookingsStatusFilter] =
    useState<"all" | ServiceStatus | PaymentStatus>(() =>
      readBookingsStatusFilterFromURL(),
    );
  useEffect(() => {
    writeBookingsStatusFilterToURL(bookingsStatusFilter);
  }, [bookingsStatusFilter]);
  // One-shot seed: id of the booking the admin pivoted FROM, so
  // BookingsView can highlight the source row on first paint after a
  // BookingDetail timeline → BookingsView template-pivot.
  const [bookingsFocusedRowSeed, setBookingsFocusedRowSeed] =
    useState<string | null>(null);
  // One-shot seed: id of the rollout the admin pivoted FROM, so
  // RolloutsView can highlight the source row on first paint after
  // a RolloutScheduleEditor → RolloutsView "Back to rollouts"
  // pivot. Mirror of `bookingsFocusedRowSeed` for the rollouts
  // mount (Task #190); independent slot because the rollouts list
  // and bookings list can both have a pending source-row highlight
  // queued up at once (the sidebar nav clears both).
  const [rolloutsFocusedRowSeed, setRolloutsFocusedRowSeed] =
    useState<string | null>(null);
  // One-shot seed: id of the building the admin pivoted FROM, so
  // BuildingsView can highlight the source row on first paint after
  // a BuildingDetail → BuildingsView "Back to buildings" pivot.
  // Mirror of `bookingsFocusedRowSeed` / `rolloutsFocusedRowSeed`
  // for the buildings mount (Task #216); independent slot because
  // the buildings list, rollouts list, and bookings list can each
  // have a pending source-row highlight queued up at once (the
  // sidebar nav clears all three).
  const [buildingsFocusedRowSeed, setBuildingsFocusedRowSeed] =
    useState<string | null>(null);
  const [search, setSearch] = useState<string>(() => readSearchFromURL());
  useEffect(() => {
    writeSearchToURL(search);
  }, [search]);
  // Active building filter on the Bookings list ("all" = no filter).
  const [bookingsBuildingFilter, setBookingsBuildingFilter] =
    useState<string>(() => readBookingsBuildingFilterFromURL());
  useEffect(() => {
    writeBookingsBuildingFilterToURL(bookingsBuildingFilter);
  }, [bookingsBuildingFilter]);
  // Active "Template used" filter on the Bookings list (Task #156).
  // `null` is the toolbar's reset state — no filter applied. The
  // template is identified by its snapshot `name` + channel, the
  // same shape `findUsageBookingsForTemplate` matches against, so
  // a renamed template doesn't silently drag historical bookings
  // out of view (their timeline entries keep the old name).
  //
  // Initial value is read from the `?template=…` query param (Task
  // #195) so refreshing or sharing the URL restores the active chip
  // and dropdown selection on first paint. The companion effect
  // below mirrors any subsequent state change back into the URL.
  // Both Bookings and Awaiting-coordination read this same lifted
  // state, so the URL works on either view symmetrically.
  const [bookingsTemplateFilter, setBookingsTemplateFilter] =
    useState<BookingsTemplateFilter>(() => readBookingsTemplateFilterFromURL());
  useEffect(() => {
    writeBookingsTemplateFilterToURL(bookingsTemplateFilter);
  }, [bookingsTemplateFilter]);
  // Awaiting-coordination view filter — independent from the bookings
  // status filter so an admin can flip between views without losing
  // their coordination grouping. "all" shows both queues at once.
  const [coordinationFilter, setCoordinationFilter] =
    useState<"all" | CoordinationKind>(() => readCoordinationFilterFromURL());
  useEffect(() => {
    writeCoordinationFilterToURL(coordinationFilter);
  }, [coordinationFilter]);
  // Awaiting-coordination outcome chip (Spoke / No answer / Voicemail
  // / Email / Never logged) — lifted into shell state so it
  // round-trips through `?outcome=…` the same way the rest of the
  // queue toolbar does (Task #227). Was previously component-local
  // on AwaitingCoordinationView and reset on every refresh; now the
  // initialiser seeds from the URL on first mount and the companion
  // effect mirrors any subsequent state change back into the param.
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>(() =>
    readOutcomeFilterFromURL(),
  );
  useEffect(() => {
    writeOutcomeFilterToURL(outcomeFilter);
  }, [outcomeFilter]);

  function handleNav(id: ViewId) {
    setView(id);
    setSelectedBookingId(null);
    setSelectedBuildingId(null);
    setSelectedRolloutId(null);
    if (id === "payments") {
      setBookingsStatusFilter("pending");
    } else if (id === "bookings") {
      setBookingsStatusFilter("all");
    }
    setSearch("");
    setBookingsBuildingFilter("all");
    // Reset the Awaiting-coordination "waiting on" chip on sidebar
    // nav too, alongside the other queue lenses (search, building,
    // template). Task #207 turned this filter into a round-tripped
    // URL param, and the explicit "fresh start" gesture has to drop
    // it back to the reset value so the URL the next mount reads is
    // identical to a fresh visit — otherwise a refresh would silently
    // re-apply a stale waiting-on filter from a prior session.
    setCoordinationFilter("all");
    // Mirror the rest of the toolbar resets for the outcome chip
    // too (Task #227): sidebar nav clears `?outcome=…` in lockstep
    // with `?coordination=…`, `?building=…`, `?q=…`, etc., so a
    // refresh after the explicit "fresh start" gesture re-mounts
    // with no stale lens applied.
    setOutcomeFilter("all");
    // Sidebar nav is an explicit "fresh start" gesture, so clear any
    // pending source-row highlight seed from a BookingDetail timeline
    // pivot — otherwise a later visit could light up the wrong row.
    setBookingsFocusedRowSeed(null);
    // Same fresh-start convention for the rollouts mount: clear any
    // pending source-row seed from a RolloutScheduleEditor → list
    // back-pivot so an unrelated sidebar visit doesn't light up the
    // wrong rollout row.
    setRolloutsFocusedRowSeed(null);
    // Same fresh-start convention for the buildings mount: clear any
    // pending source-row seed from a BuildingDetail → list
    // back-pivot so an unrelated sidebar visit doesn't light up the
    // wrong building row (Task #216).
    setBuildingsFocusedRowSeed(null);
    // Sidebar nav is an explicit "fresh start" gesture, so clear any
    // template focus left behind by a chip click — the templates
    // panel should open in its default unfocused state when the user
    // navigates here themselves rather than via a booking chip.
    setFocusedCallTemplateId(null);
    setFocusedEmailTemplateId(null);
    // Drop dismiss-on-nav toasts (the missing-template hint) — other
    // toasts persist so ops can flip view without losing them.
    setToast((t) => (t && t.dismissOnNav ? null : t));
    setBookingsTemplateFilter(null);
  }

  /**
   * Open the bookings list filtered to a specific building (used by
   * "View bookings" links inside the Buildings view). Clears any
   * status filter / search so the building filter is the only lens.
   */
  function openBookingsForBuilding(buildingId: string) {
    setView("bookings");
    setSelectedBookingId(null);
    setSelectedBuildingId(null);
    setBookingsStatusFilter("all");
    setSearch("");
    setBookingsBuildingFilter(buildingId);
    setBookingsTemplateFilter(null);
  }

  /**
   * Cross-view pivot from the Call / Email templates panel's
   * "Used in N bookings" badge (Task #160). Switches to the bookings
   * list, clears the other filters / search / building lens, and
   * sets the (Task #156) lifted bookings template filter directly
   * with the picked template's channel + name — the BookingsView
   * toolbar select / clear chip then read straight from the lifted
   * state, so the dropdown reflects the active filter on first
   * render and the click-through "Used in N bookings" count and the
   * resulting filtered row count stay byte-for-byte consistent.
   *
   * Mirrors {@link pivotToBookingsFilteredByTemplate} (Task #159's
   * BookingDetail "View other bookings using this template" link) —
   * both pivots land in the same lifted slot so re-clicking the same
   * badge after manually clearing the chip just re-applies the same
   * filter value (no nonce / remount needed).
   */
  function openBookingsForTemplate(
    kind: "call" | "email",
    templateName: string,
  ) {
    setView("bookings");
    setSelectedBookingId(null);
    setSelectedBuildingId(null);
    setSelectedRolloutId(null);
    setBookingsStatusFilter("all");
    setSearch("");
    setBookingsBuildingFilter("all");
    setFocusedCallTemplateId(null);
    setFocusedEmailTemplateId(null);
    setBookingsTemplateFilter({ kind, name: templateName });
  }

  /**
   * Jump to a single booking's detail screen from the Call / Email
   * templates drill-down popover. Clears the list filters / search /
   * building lens so the booking is unambiguously selected.
   */
  function openBookingFromTemplate(bookingId: string) {
    setView("bookings");
    setSelectedBuildingId(null);
    setSelectedRolloutId(null);
    setBookingsStatusFilter("all");
    setSearch("");
    setBookingsBuildingFilter("all");
    // The popover drill-down is a single-booking pivot, not a filter
    // pivot, so any active lifted template filter (from a Task #159
    // BookingDetail link or a Task #160 templates badge click) must
    // clear here too — otherwise the BookingsView mount the admin
    // hits via "back" would still be filtered down.
    setBookingsTemplateFilter(null);
    setSelectedBookingId(bookingId);
    // Drop any template focus on the way out — the next visit to a
    // templates panel should open in its default unfocused state
    // unless the admin explicitly clicks another timeline chip.
    setFocusedCallTemplateId(null);
    setFocusedEmailTemplateId(null);
  }

  /**
   * Inverse of {@link openBookingFromTemplate}: jump from a booking's
   * timeline `From template: <name>` chip back to the matching row in
   * the Call / Email templates panel (Task #155). Looks the template
   * up by name so renamed templates still resolve, then stashes the
   * matched id in {@link focusedCallTemplateId} /
   * {@link focusedEmailTemplateId} so the panel can highlight + scroll
   * into view.
   *
   * If the template has since been renamed or removed there's no row
   * to focus — fire a non-blocking info toast naming the missing
   * template (Task #166). The toast is `dismissOnNav` so it clears
   * when ops moves on; otherwise it auto-dismisses after 4s.
   */
  function openTemplateFromBooking(
    kind: "call" | "email",
    templateName: string,
  ) {
    const list = kind === "call" ? callTemplates : emailTemplates;
    const match = list.find((t) => t.name === templateName);
    setSelectedBookingId(null);
    setSelectedBuildingId(null);
    setSelectedRolloutId(null);
    if (kind === "call") {
      setView("call_templates");
      setFocusedCallTemplateId(match ? match.id : null);
      setFocusedEmailTemplateId(null);
    } else {
      setView("email_templates");
      setFocusedEmailTemplateId(match ? match.id : null);
      setFocusedCallTemplateId(null);
    }
    if (match) {
      // Drop any stale missing-template hint from a prior click so a
      // clean resolve doesn't open over a "missing" toast.
      setToast((t) => (t && t.dismissOnNav ? null : t));
    } else {
      setToast({
        id: `missing-template-${kind}-${Date.now()}`,
        message: buildMissingTemplateHint(kind, templateName),
        variant: "info",
        dismissOnNav: true,
      });
    }
  }

  /**
   * Companion to the `BookingDetail` timeline's "View other bookings
   * using this template" link (Task #159): leave the detail screen
   * and land in BookingsView with the matching template filter
   * already active. Mirrors the in-list "Last attempt: …" template-
   * name suffix introduced in Task #153, which lets ops pivot to a
   * filtered table from the rows themselves — this closes the loop
   * for the "I'm reading a single booking and want to see who else
   * got this template" workflow without having to back out, scan the
   * row, and click the suffix.
   *
   * Implementation: clears the building / status / search filters and
   * the selected booking so the template lens is the sole filter
   * applied (matches `openBookingsForBuilding`'s "single lens"
   * convention), then sets the (now-lifted, Task #156) bookings
   * template filter directly with the timeline entry's channel +
   * template-label snapshot. The lifted state is shared with the
   * toolbar select on BookingsView, so the dropdown / clear chip
   * already reflect the active filter on first render — no separate
   * one-shot seed handoff needed.
   *
   * Always switches to "bookings" view (not "payments") regardless of
   * where the admin came from — the destination is the bookings list,
   * matching the BookingsView pivot-chip wording the link mirrors.
   *
   * `sourceBookingId` is the id of the booking the admin pivoted
   * FROM, stashed as a one-shot seed so BookingsView can highlight
   * that row on first paint.
   */
  function pivotToBookingsFilteredByTemplate(
    kind: "call" | "email",
    templateLabel: string,
    sourceBookingId: string,
  ) {
    setView("bookings");
    setSelectedBookingId(null);
    setSelectedBuildingId(null);
    setSelectedRolloutId(null);
    setBookingsStatusFilter("all");
    setSearch("");
    setBookingsBuildingFilter("all");
    setBookingsTemplateFilter({ kind, name: templateLabel });
    setBookingsFocusedRowSeed(sourceBookingId);
    // Drop any template focus on the way out — the next visit to a
    // templates panel should open in its default unfocused state.
    setFocusedCallTemplateId(null);
    setFocusedEmailTemplateId(null);
  }

  /**
   * Companion pivot for the awaiting-coordination mount of
   * `BookingDetail`'s "Back to list" button (Task #180). Going back
   * to the coordination queue from a coordination-mode detail screen
   * seeds the source booking id so `AwaitingCoordinationView`
   * highlights the row the admin came from on first paint —
   * mirroring the source-row highlight Task #172 introduced for the
   * bookings/payments list. Without it, an admin who opened a row
   * from a long queue, scrolled the detail, and went back would lose
   * their starting point.
   *
   * Reuses the same `bookingsFocusedRowSeed` slot the bookings mount
   * already drains because the two list views are mutually exclusive
   * — only one is ever rendered at a time, so we never have to
   * disambiguate which mount should consume the seed.
   */
  function returnToCoordinationListWithSource(sourceBookingId: string) {
    setBookingsFocusedRowSeed(sourceBookingId);
    setSelectedBookingId(null);
  }

  /**
   * Companion pivot for the rollouts mount of
   * {@link RolloutScheduleEditor}'s "Back to rollouts" button
   * (Task #190). Going back to the rollouts list from the per-rollout
   * editor seeds the source rollout id so {@link RolloutsView}
   * highlights the row the admin came from on first paint —
   * mirroring the source-row highlight Task #172 introduced for the
   * bookings list and Task #180 mirrored to the awaiting-coordination
   * list. Without it, an admin who opened a rollout from a long list,
   * scrolled the editor, and went back would lose their starting
   * point.
   *
   * Independent slot from `bookingsFocusedRowSeed` because the
   * rollouts list and bookings list can both have a pending seed at
   * once (sidebar nav clears both via {@link handleNav}).
   */
  function returnToRolloutsListWithSource(sourceRolloutId: string) {
    setRolloutsFocusedRowSeed(sourceRolloutId);
    setSelectedRolloutId(null);
  }

  /**
   * Companion pivot for the buildings mount of {@link BuildingDetail}'s
   * "Back to buildings" button (Task #216). Going back to the
   * buildings list from a building's detail screen seeds the source
   * building id so {@link BuildingsView} highlights the row the admin
   * came from on first paint — mirroring the source-row highlight
   * Task #172 introduced for the bookings list, Task #180 mirrored
   * to the awaiting-coordination list, and Task #190 mirrored to
   * the rollouts list. Without it, an admin who opened a building
   * from a long list, scrolled the detail, and went back would lose
   * their starting point on the buildings list.
   *
   * Independent slot from `bookingsFocusedRowSeed` /
   * `rolloutsFocusedRowSeed` because all three lists can have a
   * pending seed at once (sidebar nav clears all three via
   * {@link handleNav}).
   */
  function returnToBuildingsListWithSource(sourceBuildingId: string) {
    setBuildingsFocusedRowSeed(sourceBuildingId);
    setSelectedBuildingId(null);
  }

  // Service-status advance / payment status / notes edits flow back into
  // the local seeded list (live booking is read-only in this mockup).
  function updateBooking(id: string, patch: Partial<AdminBooking>) {
    if (id === "bk-live") return; // can't mutate the session-derived row here
    setSeededBookings((prev) =>
      prev.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    );
  }

  /**
   * Bulk-log a call across several coordination bookings in one go.
   * Mirrors the per-booking `logCall()` in `BookingDetail` (same typed
   * `kind: "call"` timeline entry, same `lastContactedAt` stamp) but
   * threads every selected id through a single `setSeededBookings` so
   * we don't race on stale state when ops chases four rows at once.
   *
   * Replaces the legacy `bulkMarkAsChased` that produced a generic
   * `"Marked as chased"` entry — the bulk affordance now carries the
   * same outcome (No answer / Spoke / Voicemail) and optional shared
   * note as the per-row Log call form, so the timeline reads
   * consistently regardless of how the entry was created. The live
   * demo row is silently skipped — same guard as `updateBooking`.
   *
   * Fires a confirmation toast so a busy admin scanning a long queue
   * sees the bulk action landed — matches the toast pattern used by
   * cancel / reschedule / schedule-coordination. The early return
   * above guarantees we never fire a toast for a no-op.
   *
   * `templateLabel` is the human-readable name of the seeded
   * `CALL_TEMPLATES` entry the admin picked in the bulk-log-call form
   * (e.g. `"No answer — left voicemail"`), or
   * `CALL_TEMPLATE_CUSTOM_LABEL` (`"Custom"`) when the admin bypassed
   * the picker. It does NOT change the timeline label — the timeline
   * still encodes outcome only, so per-row and bulk entries line up
   * in the Awaiting-coordination "Last attempt" cell. Instead it
   * shapes the confirmation toast: when a real template was picked
   * we surface its name; on the Custom path we surface the outcome
   * label so ops still sees what kind of attempt landed (mirror of
   * how the bulk-log-email toast falls back to the free-text subject
   * on Custom).
   */
  function bulkLogCall(
    ids: string[],
    outcome: CallOutcome,
    note: string,
    templateLabel: string,
    isDefault: boolean = false,
  ) {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const nowIso = new Date().toISOString();
    const trimmedNote = note.trim();
    const trimmedTemplate = templateLabel.trim();
    const isCustom = isCustomCallTemplateLabel(trimmedTemplate);
    const persistTemplate = trimmedTemplate.length > 0 && !isCustom;
    setSeededBookings((prev) =>
      prev.map((b) => {
        if (b.id === "bk-live") return b;
        if (!idSet.has(b.id)) return b;
        const newEntry: TimelineEntry = {
          kind: "call",
          status: "logged_call",
          label: `Logged call · ${CALL_OUTCOME_LABEL[outcome]}`,
          at: "Just now",
          by: "Mia (admin)",
          loggedAt: nowIso,
          ...(trimmedNote.length > 0 ? { note: trimmedNote } : {}),
          ...(persistTemplate ? { templateLabel: trimmedTemplate } : {}),
          // Mirror the per-row writer (Task #181) so a bulk-logged
          // default-template call also surfaces the amber `Default`
          // pill in the booking's Service timeline.
          ...(persistTemplate && isDefault ? { templateIsDefault: true } : {}),
        };
        return {
          ...b,
          lastContactedAt: nowIso,
          serviceTimeline: [...b.serviceTimeline, newEntry],
        };
      }),
    );
    const count = ids.length;
    // Toast format reflects which template (or "Custom") landed so
    // ops can confirm at a glance. On the Custom path we surface the
    // outcome label as a fallback (analogous to bulk-log-email
    // surfacing the free-text subject). Default templates also echo
    // a "(Default)" marker matching the per-row dropdown pill.
    const defaultSuffix = !isCustom && isDefault ? " · (Default)" : "";
    const tail = isCustom
      ? ` · Custom · ${CALL_OUTCOME_LABEL[outcome]}`
      : ` · ${trimmedTemplate}${defaultSuffix}`;
    setToast({
      id: `bulk-log-call-${Date.now()}`,
      message: `Logged call on ${count} booking${count === 1 ? "" : "s"}${tail}`,
    });
  }

  /**
   * Bulk-log an email across several coordination bookings in one go.
   * Mirror of {@link bulkLogCall} for the email channel — appends a
   * typed `kind: "email"` / `status: "logged_email"` timeline entry to
   * every selected row and stamps `lastContactedAt`. Same shape as
   * `BookingDetail.logEmail()` so timeline entries stay
   * interchangeable regardless of how they were created (per-row vs
   * bulk). The live demo row is silently skipped — same guard as
   * `updateBooking` and `bulkLogCall`.
   *
   * The shared subject is encoded in the entry label so the timeline
   * reads as a one-line summary; the optional shared note carries the
   * body / context. Both are trimmed before they reach the timeline so
   * stray whitespace from the form doesn't bleed into the audit trail.
   */
  function bulkLogEmail(
    ids: string[],
    subject: string,
    note: string,
    templateLabel: string,
    isDefault: boolean = false,
  ) {
    if (ids.length === 0) return;
    const nowIso = new Date().toISOString();
    setSeededBookings((prev) =>
      applyBulkLogEmail(
        prev,
        ids,
        subject,
        note,
        nowIso,
        undefined, // `by` — fall through to ADMIN_USER_LABEL default
        templateLabel,
        // Mirror the per-row writer (Task #181) so a bulk-logged
        // default-template email also surfaces the amber `Default`
        // pill in each booking's Service timeline.
        isDefault,
      ),
    );
    const count = ids.length;
    // Toast format reflects which template (or "Custom") landed so
    // ops can confirm at a glance. For Custom we surface the
    // free-text subject as a fallback. Default templates also echo
    // a "(Default)" marker matching the per-row dropdown pill.
    const trimmedTemplate = templateLabel.trim();
    const trimmedSubject = subject.trim();
    const isCustom =
      trimmedTemplate.length === 0 ||
      trimmedTemplate.toLowerCase() === "custom";
    const defaultSuffix = !isCustom && isDefault ? " · (Default)" : "";
    const tail = isCustom
      ? trimmedSubject.length > 0
        ? ` · Custom · ${trimmedSubject}`
        : ` · Custom`
      : ` · ${trimmedTemplate}${defaultSuffix}`;
    setToast({
      id: `bulk-log-email-${Date.now()}`,
      message: `Logged email on ${count} booking${count === 1 ? "" : "s"}${tail}`,
    });
  }

  /**
   * Per-row counterpart to the `bulkLogEmail` toast above. Wired to
   * {@link BookingDetail.onLogEmailToast}, which fires after the
   * detail screen's own `logEmail` writes the timeline entry. We
   * intentionally re-use the same toast format as bulk (with a
   * `1 booking` count and the same `· {Template} | · Custom · {subject}`
   * tail) so a busy admin sees a consistent confirmation regardless
   * of whether the email was logged from the detail screen or the
   * Awaiting-coordination bulk action bar. The detail screen still
   * owns the timeline write — this handler is purely the toast.
   */
  function logEmailToast(
    templateLabel: string,
    subject: string,
    isDefault: boolean = false,
  ) {
    const trimmedTemplate = templateLabel.trim();
    const trimmedSubject = subject.trim();
    const isCustom =
      trimmedTemplate.length === 0 ||
      trimmedTemplate.toLowerCase() === "custom";
    // Default templates echo a "(Default)" marker matching the
    // per-row dropdown pill.
    const defaultSuffix = !isCustom && isDefault ? " · (Default)" : "";
    const tail = isCustom
      ? trimmedSubject.length > 0
        ? ` · Custom · ${trimmedSubject}`
        : ` · Custom`
      : ` · ${trimmedTemplate}${defaultSuffix}`;
    setToast({
      id: `log-email-${Date.now()}`,
      message: `Logged email on 1 booking${tail}`,
    });
  }

  /**
   * Per-row counterpart to the {@link bulkLogCall} toast above. Wired
   * to {@link BookingDetail.onLogCallToast}, which fires after the
   * detail screen's own `logCall` writes the timeline entry. We
   * intentionally re-use the same toast format as bulk (with a
   * `1 booking` count and the same `· {Template}` /
   * `· Custom · {Outcome}` tail) so a busy admin sees a consistent
   * confirmation regardless of whether the call was logged from the
   * detail screen or the Awaiting-coordination bulk action bar. The
   * detail screen still owns the timeline write — this handler is
   * purely the toast.
   */
  function logCallToast(
    templateLabel: string,
    outcomeLabel: string,
    isDefault: boolean = false,
  ) {
    const trimmedTemplate = templateLabel.trim();
    const trimmedOutcome = outcomeLabel.trim();
    const isCustom =
      trimmedTemplate.length === 0 ||
      trimmedTemplate.toLowerCase() === "custom";
    // Default templates echo a "(Default)" marker matching the
    // per-row dropdown pill.
    const defaultSuffix = !isCustom && isDefault ? " · (Default)" : "";
    const tail = isCustom
      ? trimmedOutcome.length > 0
        ? ` · Custom · ${trimmedOutcome}`
        : ` · Custom`
      : ` · ${trimmedTemplate}${defaultSuffix}`;
    setToast({
      id: `log-call-${Date.now()}`,
      message: `Logged call on 1 booking${tail}`,
    });
  }

  // ── Cancel / Reschedule (Task #49) ─────────────────────────────────────
  //
  // Both flows are admin-only and the live demo row is read-only here
  // (it mirrors the customer's session — the customer is the source of
  // truth for their own booking). We:
  //   1. Update the booking row (status / payment / timeline patch).
  //   2. Free / move the rollout slot capacity via the helpers in
  //      `adminMockData` so the schedule strip + Rollouts view reflect
  //      the change immediately.
  //   3. Bump the rollouts refresh key so any view reading from the
  //      module-level rollouts store re-renders.
  function cancelBooking(id: string, note: string) {
    if (id === "bk-live") return;
    // Mirror the reschedule guard: cancellation note is mandatory for
    // the audit trail. The modal already enforces this in the UI; the
    // defensive trim+empty check here protects any future caller.
    const trimmedNote = note.trim();
    if (trimmedNote.length === 0) return;
    const booking = seededBookings.find((b) => b.id === id);
    if (!booking) return;
    if (booking.serviceStatus === "cancelled") return;
    const wasPaid = booking.paymentStatus === "paid";
    const releaseOk = releaseBookingCapacity(booking);
    const serviceEntry: TimelineEntry = {
      status: "cancelled",
      label: `Cancelled · ${trimmedNote}`,
      at: "Just now",
      by: "Mia (admin)",
    };
    const patch: Partial<AdminBooking> = {
      serviceStatus: "cancelled",
      cancelledAt: "Just now",
      cancelledBy: "Mia (admin)",
      cancellationNote: trimmedNote,
      serviceTimeline: [...booking.serviceTimeline, serviceEntry],
    };
    if (wasPaid) {
      const paymentEntry: TimelineEntry = {
        status: "refund_pending",
        label: "Refund pending · cancelled by Mia (admin)",
        at: "Just now",
        by: "Mia (admin)",
      };
      patch.paymentStatus = "refund_pending";
      patch.paymentTimeline = [...booking.paymentTimeline, paymentEntry];
    }
    setSeededBookings((prev) =>
      prev.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    );
    // Cancel always changes the booking's lifecycle, so customer-side
    // subscribers (slot pickers + unit tiles) MUST be told even when
    // the booking had no concrete slot to release (coordination /
    // unscheduled). Keep `releaseOk` to gate the rollouts refresh
    // (capacity didn't change in that case) but always notify
    // live-bookings subscribers via `notifyLiveBookingsChanged`.
    if (releaseOk) {
      bumpRolloutsRefreshKey();
    } else {
      notifyLiveBookingsChanged();
    }
  }

  /**
   * Reverse a cancellation. Re-runs the same uniqueness check the
   * customer flow uses (`getActiveBookingForUnit`) against the
   * booking's unit + rollout. Three outcomes:
   *   - "no_op"      → booking missing, live, or not actually cancelled
   *                    (button shouldn't have been clickable; defensive).
   *   - "restored"   → the slot is still free, so the booking is put
   *                    back at its original date/window, capacity is
   *                    re-consumed, refund-pending payments flip back
   *                    to "paid", and an "Undo · {note}" entry is
   *                    appended to the service timeline. The original
   *                    cancellation note is reused so the audit trail
   *                    stays explicit about *what* was undone.
   *   - "slot_taken" → another booking grabbed the unit while this
   *                    row was cancelled; we leave the cancellation
   *                    intact and hand the caller enough context to
   *                    pivot to the reschedule modal.
   *
   * The combined "undo + reschedule" path is intentionally separate
   * (`undoCancelBookingAndReschedule` below) — it lets the user pick a
   * fresh slot atomically with the restore so we never leave the
   * booking in a half-restored state with no slot.
   */
  function undoCancelBooking(
    id: string,
  ):
    | { kind: "no_op" }
    | { kind: "restored" }
    | {
        kind: "slot_taken";
        takenBy: {
          name: string;
          role: AdminBooking["bookerRole"];
          // `serviceDate` may be null for awaiting-coordination winners
          // — we surface the null through to the dialog which softens
          // the copy when there's no concrete date to show.
          date: AdminBooking["serviceDate"];
          slot: AdminBooking["serviceSlot"];
        };
      } {
    if (id === "bk-live") return { kind: "no_op" };
    const booking = seededBookings.find((b) => b.id === id);
    if (!booking) return { kind: "no_op" };
    if (booking.serviceStatus !== "cancelled") return { kind: "no_op" };
    // Uniqueness check against the unit + rollout — this skips
    // cancelled rows (i.e. it ignores the booking we're trying to
    // restore, which is still in the list with status "cancelled").
    const verdict = getActiveBookingForUnit(
      booking.unitId,
      seededBookings,
      booking.rolloutId,
    );
    if (verdict.kind === "paid" || verdict.kind === "invoice_pending") {
      const winning = verdict.booking;
      return {
        kind: "slot_taken",
        takenBy: {
          name: winning.customerName,
          role: winning.bookerRole,
          date: winning.serviceDate,
          slot: winning.serviceSlot,
        },
      };
    }
    // Restore in place. Re-consume capacity if the booking had a
    // concrete slot — coordination bookings never consumed capacity
    // in the first place so there's nothing to put back.
    if (
      booking.rolloutId &&
      booking.serviceDate &&
      (booking.serviceSlot === "morning" ||
        booking.serviceSlot === "afternoon" ||
        booking.serviceSlot === "evening")
    ) {
      consumeBookingCapacity(
        booking,
        booking.rolloutId,
        booking.serviceDate,
        booking.serviceSlot,
      );
    }
    const restoredStatus = priorServiceStatusFromTimeline(booking);
    const note = booking.cancellationNote ?? "";
    const undoEntry: TimelineEntry = {
      status: restoredStatus,
      label: note ? `Undo · ${note}` : "Undo · cancellation reversed",
      at: "Just now",
      by: "Mia (admin)",
    };
    const patch: Partial<AdminBooking> = {
      serviceStatus: restoredStatus,
      cancelledAt: undefined,
      cancelledBy: undefined,
      cancellationNote: undefined,
      serviceTimeline: [...booking.serviceTimeline, undoEntry],
    };
    if (booking.paymentStatus === "refund_pending") {
      const paymentEntry: TimelineEntry = {
        status: "paid",
        label: "Refund cancelled · booking restored by Mia (admin)",
        at: "Just now",
        by: "Mia (admin)",
      };
      patch.paymentStatus = "paid";
      patch.paymentTimeline = [...booking.paymentTimeline, paymentEntry];
    }
    setSeededBookings((prev) =>
      prev.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    );
    bumpRolloutsRefreshKey();
    return { kind: "restored" };
  }

  /**
   * Pivot path for {@link undoCancelBooking}: the original slot is
   * gone, so the admin picks a new one in the reschedule modal and we
   * restore + reschedule atomically. Capacity is consumed at the new
   * slot only — the booking's old slot was already freed by the
   * original cancellation, so there's nothing to release.
   */
  function undoCancelBookingAndReschedule(
    id: string,
    date: string,
    window: "morning" | "afternoon" | "evening",
  ) {
    if (id === "bk-live") return;
    const booking = seededBookings.find((b) => b.id === id);
    if (!booking || !booking.rolloutId) return;
    if (booking.serviceStatus !== "cancelled") return;
    consumeBookingCapacity(booking, booking.rolloutId, date, window);
    const restoredStatus = priorServiceStatusFromTimeline(booking);
    const note = booking.cancellationNote ?? "";
    const winLabel =
      window === "morning"
        ? "morning"
        : window === "afternoon"
          ? "afternoon"
          : "evening";
    const undoLabel = note
      ? `Undo · ${note} — restored to ${date} · ${winLabel}`
      : `Undo · cancellation reversed — restored to ${date} · ${winLabel}`;
    const undoEntry: TimelineEntry = {
      status: restoredStatus,
      label: undoLabel,
      at: "Just now",
      by: "Mia (admin)",
    };
    const patch: Partial<AdminBooking> = {
      serviceStatus: restoredStatus,
      serviceDate: date,
      serviceSlot: window,
      cancelledAt: undefined,
      cancelledBy: undefined,
      cancellationNote: undefined,
      serviceTimeline: [...booking.serviceTimeline, undoEntry],
    };
    if (booking.paymentStatus === "refund_pending") {
      const paymentEntry: TimelineEntry = {
        status: "paid",
        label: "Refund cancelled · booking restored by Mia (admin)",
        at: "Just now",
        by: "Mia (admin)",
      };
      patch.paymentStatus = "paid";
      patch.paymentTimeline = [...booking.paymentTimeline, paymentEntry];
    }
    setSeededBookings((prev) =>
      prev.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    );
    bumpRolloutsRefreshKey();
  }

  /**
   * Move an already-scheduled booking from its current slot to
   * (`date`, `window`). Mirrors `scheduleCoordinationBooking` but
   * operates on bookings that already have a concrete slot:
   *   1. Release the booking's footprint from its current slot.
   *   2. Consume that same footprint at the new slot.
   *   3. Append a "Rescheduled · {short date} · {window}" timeline
   *      entry attributed to Mia (admin).
   *   4. Bump the rollouts refresh key so any view reading from the
   *      module-level rollouts store re-renders.
   * No-ops on the live demo row (read-only), cancelled bookings, and
   * bookings with no rollout linked.
   */
  function rescheduleAppointment(
    id: string,
    date: string,
    window: "morning" | "afternoon" | "evening",
    note?: string,
  ) {
    if (id === "bk-live") return;
    const booking = seededBookings.find((b) => b.id === id);
    if (!booking || !booking.rolloutId) return;
    if (booking.serviceStatus === "cancelled") return;
    if (
      booking.serviceSlot !== "morning" &&
      booking.serviceSlot !== "afternoon" &&
      booking.serviceSlot !== "evening"
    ) {
      return;
    }
    if (booking.serviceDate === date && booking.serviceSlot === window) {
      // No-op reschedule. Modal also gates this, but keep the guard
      // for any future caller.
      setSchedulingTarget(null);
      return;
    }
    releaseBookingCapacity(booking);
    // Build the post-reschedule shape so consumeBookingCapacity sees
    // the booking against its new slot — duration is unchanged so this
    // is mostly cosmetic, but it keeps the helper symmetric with
    // release.
    const moved: AdminBooking = {
      ...booking,
      serviceDate: date,
      serviceSlot: window,
    };
    consumeBookingCapacity(moved, booking.rolloutId, date, window);
    const entry: TimelineEntry = buildRescheduledTimelineEntry({
      date,
      window,
      note,
    });
    setSeededBookings((prev) =>
      prev.map((b) =>
        b.id === id
          ? {
              ...b,
              serviceDate: date,
              serviceSlot: window,
              serviceTimeline: [...b.serviceTimeline, entry],
            }
          : b,
      ),
    );
    bumpRolloutsRefreshKey();
    setSchedulingTarget(null);
  }

  /** Admin acknowledges that the superseded invoice has been voided
   *  in the billing system. Clears `supersededByBookingId` (so the
   *  "Invoice to cancel" pill drops off the row) and stamps a service-
   *  timeline note for the audit trail. Live demo row + bookings that
   *  were never superseded are no-ops. */
  function acknowledgeSupersede(id: string) {
    if (id === "bk-live") return;
    const booking = seededBookings.find((b) => b.id === id);
    if (!booking || !booking.supersededByBookingId) return;
    const entry: TimelineEntry = {
      status: "cancelled",
      label: "Invoice supersede acknowledged · void recorded",
      at: "Just now",
      by: "Mia (admin)",
    };
    setSeededBookings((prev) =>
      prev.map((b) =>
        b.id === id
          ? {
              ...b,
              supersededByBookingId: undefined,
              serviceTimeline: [...b.serviceTimeline, entry],
            }
          : b,
      ),
    );
  }

  // ── Customer submit-time uniqueness guard (Task #49) ───────────────────
  //
  // When the customer hits "Pay" in the iframed booking flow, their
  // `submitBooking()` calls into the registered guard before promoting
  // the session to `submitted`. The guard re-checks the unit against
  // the current admin-side bookings, since seeded rows can change
  // during the demo. Three outcomes:
  //   - "paid"             → another customer paid first; reject.
  //   - "invoice_pending"  → an admin invoice-pending row exists; we
  //                          supersede it (cancel + free capacity +
  //                          stamp `supersededByBookingId`) and let
  //                          the new booking through.
  //   - "ok"               → no conflict.
  //
  // The guard re-registers whenever `seededBookings` changes so it
  // always sees the freshest list. Reset on unmount to prevent a stale
  // closure from outliving the admin shell.
  useEffect(() => {
    // Expose the admin's live (mutable) bookings list to customer-side
    // helpers (slot pickers, unit tiles) so admin cancel / reschedule /
    // supersede edits become visible to the customer flow when both
    // shells are mounted in the same React tree.
    setLiveBookingsSource(() => seededBookings);
    notifyLiveBookingsChanged();
    setLiveUnitsSource(() => units);
    notifyLiveUnitsChanged();
    // Task #110: customer-side helpers (`getAcType`/`getAcBrand`/
    // `lookupLiveUnitAc`) inherit the AC type and brand from the unit's
    // building when the unit hasn't overridden them. Register the live
    // buildings list so those helpers see admin edits in lockstep with
    // the unit changes registered just above.
    setLiveBuildingsSource(() => buildings);
    notifyLiveBuildingsChanged();
    // Task #182: register the live service catalogue + per-AC-type rule
    // resolver + per-unit duration context resolver so the booking
    // duration helper (`getBookingDurationMinutes`) reads ops-edited
    // base / add-on minutes and per-building / per-unit outdoor
    // placement instead of the legacy 45 / 15 / 0 constants. All three
    // close over the latest `services` / `buildings` / `units` state,
    // so any admin edit re-flows into the slot picker the next render.
    setLiveServiceCatalogueSource(() => services);
    notifyLiveServiceCatalogueChanged();
    setServiceRuleResolver((acType) => getServiceRuleForAcType(acType));
    setUnitDurationContextResolver((unitId) => ({
      acType: getRecordedAcTypeForUnit(unitId),
      placement: getEffectivePlacementForUnit(unitId),
    }));
    // Task #186: project the live `services` list down to the
    // customer-flow's `OtherServiceRule` shape and persist it via
    // sessionStorage so the iframed booking flow
    // (`BookingFlow{Mobile,Desktop}` renders each step in its own JS
    // realm) sees ops-edited "other" services. Module-level state
    // doesn't cross frames, but same-origin sessionStorage does — the
    // bridge in `liveOtherServices.ts` mirrors how `bookingSession`
    // already handles cross-frame state. The AC step's toggle cards,
    // the slot picker's duration math, and the Pay step's total all
    // read from this same key.
    writeLiveOtherServices(
      services
        .filter((s) => s.acTypeKey === null)
        .map((s) => ({
          id: s.id,
          name: s.name,
          baseMinutes: s.baseMinutes,
          addonMinutes: s.addonMinutes,
          priceAud: s.priceAud,
          addonPriceAud: s.addonPriceAud,
          appliesToNote: s.appliesToNote,
          addonLabel: s.addonLabel,
          maxQty: s.maxQty,
        })),
    );
    // Task #222 — project the AC entries' per-add-on caps so the
    // customer flow's iframe-rendered AC step can disable "+" at
    // the cap and `bookingActions.setAdditionalIndoor` can clamp
    // without crashing when the parent frame isn't reachable.
    // Same cross-iframe sessionStorage pattern as the "other"
    // services bridge above.
    {
      const splitEntry = services.find((s) => s.acTypeKey === "split");
      const ductedEntry = services.find((s) => s.acTypeKey === "ducted");
      writeLiveAcCaps({
        split:
          splitEntry?.additionalIndoorMaxQty != null &&
          splitEntry.additionalIndoorMaxQty > 0
            ? Math.floor(splitEntry.additionalIndoorMaxQty)
            : null,
        ducted:
          ductedEntry?.additionalIndoorMaxQty != null &&
          ductedEntry.additionalIndoorMaxQty > 0
            ? Math.floor(ductedEntry.additionalIndoorMaxQty)
            : null,
      });
    }
    setUniquenessGuard((sess, newBookingReference) => {
      if (!sess.unit_id) return "ok";
      const rollout = findRolloutForBooking("svc-ac", sess.unit_id);
      if (!rollout) return "ok";
      const verdict = getActiveBookingForUnit(
        sess.unit_id,
        seededBookings,
        rollout.id,
      );
      if (verdict.kind === "paid") {
        // Hand the dead-end screen the booker context (Task #49
        // review feedback) so it can show name + role + scheduled
        // window + a "Contact us" CTA instead of a generic message.
        const winning = verdict.booking;
        return {
          kind: "paid",
          blocker: {
            name: winning.customerName,
            role: winning.bookerRole,
            date: winning.serviceDate,
            slot: winning.serviceSlot,
          },
        };
      }
      if (verdict.kind === "invoice_pending") {
        const prior = verdict.booking;
        releaseBookingCapacity(prior);
        const supersedingName =
          `${sess.contact_first_name} ${sess.contact_last_name}`.trim() ||
          "the new customer";
        const note = `Superseded by paid booking ${newBookingReference} by ${supersedingName}.`;
        const entry: TimelineEntry = {
          status: "cancelled",
          label: "Cancelled · superseded by paid booking",
          at: "Just now",
          by: "System",
        };
        setSeededBookings((prev) =>
          prev.map((b) =>
            b.id === prior.id
              ? {
                  ...b,
                  serviceStatus: "cancelled",
                  cancelledAt: "Just now",
                  cancelledBy: "System",
                  cancellationNote: note,
                  supersededByBookingId: newBookingReference,
                  serviceTimeline: [...b.serviceTimeline, entry],
                }
              : b,
          ),
        );
        bumpRolloutsRefreshKey();
        return "invoice_pending";
      }
      return "ok";
    });
    return () => {
      setUniquenessGuard(null);
      setLiveBookingsSource(null);
      setLiveUnitsSource(null);
      setLiveBuildingsSource(null);
      setLiveServiceCatalogueSource(null);
      setServiceRuleResolver(null);
      setUnitDurationContextResolver(null);
      // Clear the cross-iframe "other" services bridge so a remount
      // (or a different page that loads after AdminApp unmounts)
      // doesn't see stale catalogue entries.
      writeLiveOtherServices(null);
      // Same rationale for the AC caps bridge (Task #222) — clear so
      // a fresh mount doesn't pick up a stale cap.
      writeLiveAcCaps(null);
    };
  }, [seededBookings, units, buildings, services]);

  function openNewBooking(buildingId: string | null) {
    setNewBookingBuildingId(buildingId);
    setNewBookingOpen(true);
  }
  function closeNewBooking() {
    setNewBookingOpen(false);
    setNewBookingBuildingId(null);
  }

  /**
   * Append a freshly-created admin (phone) booking to the in-memory
   * store. When a concrete slot was picked, also bump the matching
   * rollout's per-window capacity so the booking is reflected on the
   * Rollouts view and the building detail's schedule strip (both read
   * the same rollouts store).
   *
   *  - For `time_budget_per_window` rollouts we add the job's duration
   *    to `bookedMinutes` (mirrors customer-side bookings).
   *  - For `slots_per_window` rollouts we increment `bookedCount` by 1
   *    regardless of duration (matches the rollout slot status semantics).
   *
   * Coordination outcomes ("to_be_coordinated") leave the rollout
   * untouched — the slot hasn't been claimed yet. We also no-op when
   * no rollout exists for the picked unit (the New Booking flow forces
   * coordination in that case, but belt-and-suspenders).
   */
  function appendBooking(
    booking: AdminBooking,
    schedule: AdminCreatedScheduleChoice,
  ) {
    setSeededBookings((prev) => [booking, ...prev]);
    if (schedule.kind === "slot") {
      const rollout = findRolloutForBooking("svc-ac", booking.unitId);
      // Funnel admin phone-booking capacity bumps through the same
      // helper as Coordination → Scheduled and reschedule. That is
      // what re-evaluates the rollout's release strategy after every
      // confirm and writes a `system` audit row when an auto-flip
      // lands. Calling `updateRolloutSlot` directly here would skip
      // `evaluateAutoRelease` and the new admin booking would never
      // trip the auto-release ladder. (Task #123, T005.)
      if (
        rollout &&
        consumeBookingCapacity(
          booking,
          rollout.id,
          schedule.date,
          schedule.window,
        )
      ) {
        bumpRolloutsRefreshKey();
      }
    }
    closeNewBooking();
    // Drop the user back into the bookings list so they can see the
    // freshly-created row right away.
    setView("bookings");
    setSelectedBookingId(null);
    setSelectedBuildingId(null);
    setBookingsStatusFilter("all");
    setSearch("");
    setBookingsBuildingFilter("all");
    setBookingsTemplateFilter(null);
  }

  /**
   * Convert a coordination booking into a scheduled appointment. Flips
   * the booking's serviceSlot from "to_be_coordinated" to a real
   * window, appends a "Coordinated · {date} · {window}" timeline
   * entry, and bumps the matching rollout's per-window capacity using
   * the same logic `appendBooking` uses for freshly-created phone
   * bookings (slot-count or time-budget, depending on the rollout).
   *
   * No-ops on the live demo row (read-only) and when the booking can't
   * be found.
   */
  function scheduleCoordinationBooking(
    bookingId: string,
    date: string,
    window: "morning" | "afternoon" | "evening",
  ): (() => void) | undefined {
    const booking = allBookings.find((b) => b.id === bookingId);
    if (!booking || booking.isLive) return undefined;

    const patch = convertCoordinationToScheduledPatch(booking, {
      date,
      window,
    });
    updateBooking(bookingId, patch);

    // Track whether capacity was actually consumed so the undo can
    // decide whether to release. Only `consumeBookingCapacity` knows
    // (it returns false when the rollout / day / slot can't be
    // resolved — defensive only). Coordination bookings always have a
    // rolloutId, but we null-guard for type safety.
    const consumedCapacity =
      booking.rolloutId !== null &&
      consumeBookingCapacity(booking, booking.rolloutId, date, window);
    if (consumedCapacity) {
      bumpRolloutsRefreshKey();
    }

    // Inverse of everything we just did, captured at call time so the
    // undo doesn't need to re-derive the prior shape from the
    // post-patch booking row. `releaseBookingCapacity` reads the
    // *current* slot from the rollouts store — important because
    // `updateRolloutSlot` is immutable, so any rollout reference
    // closed over here would be a stale pre-consume snapshot. We pass
    // the post-schedule shape (date + window we just consumed
    // against) so it knows which slot to release.
    return () => {
      const revertPatch = revertScheduledToCoordinationPatch(booking);
      updateBooking(bookingId, revertPatch);

      if (consumedCapacity) {
        const released = releaseBookingCapacity({
          ...booking,
          serviceDate: date,
          serviceSlot: window,
        });
        if (released) {
          bumpRolloutsRefreshKey();
        }
      }
    };
  }

  const schedulingBooking =
    schedulingTarget !== null
      ? allBookings.find((b) => b.id === schedulingTarget.id) ?? null
      : null;

  function openSchedule(id: string) {
    setSchedulingTarget({ id, mode: "schedule" });
  }
  function openReschedule(id: string) {
    setSchedulingTarget({ id, mode: "reschedule" });
  }
  function openUndoReschedule(id: string) {
    setSchedulingTarget({ id, mode: "undo" });
  }
  function handleSchedulingConfirm(
    bookingId: string,
    date: string,
    window: "morning" | "afternoon" | "evening",
    note?: string,
  ) {
    if (!schedulingTarget) return;
    const mode = schedulingTarget.mode;
    // Only the "schedule" path exposes Undo on the toast — that's the
    // only mode Task #92 covers. Reschedule and undo-cancel go through
    // their own separate flows.
    let undo: (() => void) | undefined;
    if (mode === "reschedule") {
      rescheduleAppointment(bookingId, date, window, note);
    } else if (mode === "undo") {
      undoCancelBookingAndReschedule(bookingId, date, window);
    } else {
      undo = scheduleCoordinationBooking(bookingId, date, window);
    }
    setSchedulingTarget(null);

    // Confirmation toast so ops sees the outcome even if they're
    // looking at a different list than the one this booking moved
    // into. Uses the same short-date formatter as the rollouts list
    // and timeline labels so the format is consistent across the app.
    // The Undo affordance disappears with the toast (4-second
    // auto-dismiss) — matches the existing inline undo pattern in
    // RolloutScheduleEditor.
    const windowLabel =
      window === "morning"
        ? "Morning"
        : window === "afternoon"
          ? "Afternoon"
          : "Evening";
    const action =
      mode === "reschedule"
        ? "rescheduled to"
        : mode === "undo"
          ? "restored to"
          : "scheduled for";
    setToast({
      id: `${bookingId}-${Date.now()}`,
      message: `${bookingId} ${action} ${formatBookingShortDate(date)} · ${windowLabel}`,
      undo,
    });
  }

  // Sidebar badges — surface the invoice-void queue from any view so
  // an admin spending their day in Awaiting coordination, Buildings,
  // Rollouts, or Units doesn't miss outstanding voids. Reuses the
  // same selector the dashboard banner does so the badge count and
  // the banner list never drift apart. Mirror the badge on Bookings
  // and Payments — the banner currently lives at the top of both
  // views, so both nav entries should advertise the same queue.
  const invoiceVoidCount = selectPendingInvoiceVoids(allBookings).length;
  const sidebarBadges: Partial<Record<ViewId, number>> = {
    bookings: invoiceVoidCount,
    payments: invoiceVoidCount,
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 font-['Inter'] text-slate-900">
      <Sidebar activeView={view} onNav={handleNav} badges={sidebarBadges} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar
          view={view}
          selectedBookingId={selectedBookingId}
          selectedBuildingId={selectedBuildingId}
          selectedRolloutId={selectedRolloutId}
          bookings={allBookings}
          buildings={buildings}
          units={units}
        />
        <main className="flex-1 overflow-y-auto px-8 py-6">
          {view === "bookings" || view === "payments" ? (
            selectedBookingId ? (
              <BookingDetail
                bookingId={selectedBookingId}
                bookings={allBookings}
                units={units}
                agents={agents}
                onBack={() => setSelectedBookingId(null)}
                onUpdate={updateBooking}
                onCancelBooking={cancelBooking}
                onScheduleCoordination={openSchedule}
                onRescheduleAppointment={openReschedule}
                onUndoCancelBooking={undoCancelBooking}
                onUndoCancelBookingAndReschedule={openUndoReschedule}
                onAcknowledgeSupersede={acknowledgeSupersede}
                onLogCallToast={logCallToast}
                onLogEmailToast={logEmailToast}
                onOpenTemplate={openTemplateFromBooking}
                onPivotToBookingsFilteredByTemplate={
                  pivotToBookingsFilteredByTemplate
                }
                emailTemplates={emailTemplates}
                callTemplates={callTemplates}
              />
            ) : (
              <BookingsView
                bookings={allBookings}
                units={units}
                buildings={buildings}
                statusFilter={bookingsStatusFilter}
                onStatusFilter={setBookingsStatusFilter}
                buildingFilter={bookingsBuildingFilter}
                onBuildingFilter={setBookingsBuildingFilter}
                templateFilter={bookingsTemplateFilter}
                onTemplateFilter={setBookingsTemplateFilter}
                emailTemplates={emailTemplates}
                callTemplates={callTemplates}
                search={search}
                onSearch={setSearch}
                onOpen={setSelectedBookingId}
                onNewBooking={() => openNewBooking(null)}
                paymentMode={view === "payments"}
                onAcknowledgeSupersede={acknowledgeSupersede}
                onUndoCancelBooking={undoCancelBooking}
                onUndoCancelBookingAndReschedule={openUndoReschedule}
                initialFocusedRowId={bookingsFocusedRowSeed}
                onFocusedRowConsumed={() =>
                  setBookingsFocusedRowSeed(null)
                }
              />
            )
          ) : null}

          {view === "awaiting_coordination" ? (
            selectedBookingId ? (
              <BookingDetail
                bookingId={selectedBookingId}
                bookings={allBookings}
                units={units}
                agents={agents}
                onBack={() => returnToCoordinationListWithSource(selectedBookingId)}
                onUpdate={updateBooking}
                onCancelBooking={cancelBooking}
                onScheduleCoordination={openSchedule}
                onRescheduleAppointment={openReschedule}
                onUndoCancelBooking={undoCancelBooking}
                onUndoCancelBookingAndReschedule={openUndoReschedule}
                onAcknowledgeSupersede={acknowledgeSupersede}
                onLogCallToast={logCallToast}
                onLogEmailToast={logEmailToast}
                onOpenTemplate={openTemplateFromBooking}
                onPivotToBookingsFilteredByTemplate={
                  pivotToBookingsFilteredByTemplate
                }
                emailTemplates={emailTemplates}
                callTemplates={callTemplates}
              />
            ) : (
              <AwaitingCoordinationView
                bookings={allBookings}
                units={units}
                buildings={buildings}
                filter={coordinationFilter}
                onFilter={setCoordinationFilter}
                buildingFilter={bookingsBuildingFilter}
                onBuildingFilter={setBookingsBuildingFilter}
                templateFilter={bookingsTemplateFilter}
                onTemplateFilter={setBookingsTemplateFilter}
                outcomeFilter={outcomeFilter}
                onOutcomeFilter={setOutcomeFilter}
                search={search}
                onSearch={setSearch}
                onOpen={setSelectedBookingId}
                onSchedule={openSchedule}
                onBulkLogCall={bulkLogCall}
                onBulkLogEmail={bulkLogEmail}
                emailTemplates={emailTemplates}
                callTemplates={callTemplates}
                initialFocusedRowId={bookingsFocusedRowSeed}
                onFocusedRowConsumed={() =>
                  setBookingsFocusedRowSeed(null)
                }
              />
            )
          ) : null}

          {view === "rollouts" ? (
            selectedRolloutId ? (
              <RolloutScheduleEditor
                rolloutId={selectedRolloutId}
                buildings={buildings}
                refreshKey={rolloutsRefreshKey}
                bumpRefreshKey={bumpRolloutsRefreshKey}
                onBack={() =>
                  returnToRolloutsListWithSource(selectedRolloutId)
                }
              />
            ) : (
              <RolloutsView
                buildings={buildings}
                bookings={allBookings}
                refreshKey={rolloutsRefreshKey}
                onCreate={(input) => {
                  const created = createRollout(input);
                  bumpRolloutsRefreshKey();
                  setSelectedRolloutId(created.id);
                }}
                onOpen={(id) => setSelectedRolloutId(id)}
                initialFocusedRowId={rolloutsFocusedRowSeed}
                onFocusedRowConsumed={() =>
                  setRolloutsFocusedRowSeed(null)
                }
              />
            )
          ) : null}

          {view === "buildings" ? (
            selectedBuildingId ? (
              <BuildingDetail
                buildingId={selectedBuildingId}
                buildings={buildings}
                setBuildings={setBuildings}
                units={units}
                bookings={allBookings}
                onBack={() =>
                  returnToBuildingsListWithSource(selectedBuildingId)
                }
                onOpenBooking={(bookingId) => {
                  setSelectedBuildingId(null);
                  setView("bookings");
                  setBookingsStatusFilter("all");
                  setSearch("");
                  setBookingsBuildingFilter("all");
                  setBookingsTemplateFilter(null);
                  setSelectedBookingId(bookingId);
                }}
                onOpenAllBookings={openBookingsForBuilding}
                onNewBooking={openNewBooking}
                onOpenRollout={(rolloutId) => {
                  setSelectedBuildingId(null);
                  setView("rollouts");
                  setSelectedRolloutId(rolloutId);
                }}
              />
            ) : (
              <BuildingsView
                buildings={buildings}
                units={units}
                bookings={allBookings}
                onOpen={setSelectedBuildingId}
                initialFocusedRowId={buildingsFocusedRowSeed}
                onFocusedRowConsumed={() =>
                  setBuildingsFocusedRowSeed(null)
                }
              />
            )
          ) : null}

          {view === "units" && (
            <UnitsView
              units={units}
              setUnits={setUnits}
              agents={agents}
              buildings={buildings}
            />
          )}

          {view === "services" && (
            <ServicesView services={services} setServices={commitServices} />
          )}

          {view === "agents" && (
            <AgentsView
              agents={agents}
              setAgents={setAgents}
              units={units}
              setUnits={setUnits}
            />
          )}

          {view === "email_templates" && (
            <EmailTemplatesView
              templates={emailTemplates}
              usageCounts={emailTemplateUsageCounts}
              usageBookings={emailTemplateUsageBookings}
              latestTouchCounts={emailTemplateLatestTouchCounts}
              usageTrends={emailTemplateUsageTrends}
              usageBookingsByDay={emailTemplateUsageBookingsByDay}
              onOpenFilteredBookings={(templateName) =>
                openBookingsForTemplate("email", templateName)
              }
              onOpenBooking={openBookingFromTemplate}
              onCreate={createEmailTemplate}
              onUpdate={updateEmailTemplate}
              onRemove={removeEmailTemplate}
              onSetDefault={setDefaultEmailTemplate}
              onReorder={reorderEmailTemplate}
              focusedTemplateId={focusedEmailTemplateId}
              sortMode={emailTemplatesSortMode}
              onSortModeChange={setEmailTemplatesSortMode}
            />
          )}

          {view === "call_templates" && (
            <CallTemplatesView
              templates={callTemplates}
              usageCounts={callTemplateUsageCounts}
              usageBookings={callTemplateUsageBookings}
              latestTouchCounts={callTemplateLatestTouchCounts}
              usageTrends={callTemplateUsageTrends}
              usageBookingsByDay={callTemplateUsageBookingsByDay}
              onOpenFilteredBookings={(templateName) =>
                openBookingsForTemplate("call", templateName)
              }
              onOpenBooking={openBookingFromTemplate}
              onCreate={createCallTemplate}
              onUpdate={updateCallTemplate}
              onRemove={removeCallTemplate}
              onSetDefault={setDefaultCallTemplate}
              onReorder={reorderCallTemplate}
              focusedTemplateId={focusedCallTemplateId}
              sortMode={callTemplatesSortMode}
              onSortModeChange={setCallTemplatesSortMode}
            />
          )}
        </main>
      </div>
      {newBookingOpen && (
        <NewBookingFlow
          units={units}
          buildings={buildings}
          bookings={allBookings}
          rolloutsRefreshKey={rolloutsRefreshKey}
          presetBuildingId={newBookingBuildingId}
          onCancel={closeNewBooking}
          onConfirm={appendBooking}
        />
      )}
      {schedulingBooking && schedulingTarget && (
        <SchedulingModal
          booking={schedulingBooking}
          units={units}
          mode={schedulingTarget.mode}
          onCancel={() => setSchedulingTarget(null)}
          onConfirm={handleSchedulingConfirm}
        />
      )}
      {toast && (
        <Toast
          id={toast.id}
          message={toast.message}
          variant={toast.variant}
          onUndo={toast.undo}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  );
}
