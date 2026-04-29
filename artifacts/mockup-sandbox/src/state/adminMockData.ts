/**
 * Seeded mock data for the Taylr admin mockup.
 *
 * Pure module — no DOM access, no async — so it can be imported by any
 * admin view (and unit-tested in isolation if ever needed).
 *
 * Conventions:
 * - Slot capacity uses the same `windowMinutes` / `bookedMinutes` shape
 *   as the customer-side slot picker (see SlotsDesktop / SlotsMobile),
 *   so admins read the calendar with the exact same time-budget mental
 *   model the customer just used.
 * - Booking duration mirrors `getBookingDurationMinutes()` from
 *   `bookingDerived.ts` (45 min/system + 15 min/extra indoor).
 * - The customer's own current sessionStorage booking is folded into
 *   the bookings list at runtime (see `getAllBookings()`); this file
 *   only provides the seeded set.
 */

import {
  DEMO_MANAGING_AGENCIES,
  isTenantMethod,
  OTHER_AGENCY_ID,
} from "./accessMethodCatalog";
import {
  getBookingDurationMinutes,
  MINUTES_PER_ADDITIONAL_INDOOR,
  MINUTES_PER_SYSTEM,
  UNSURE_FALLBACK_MINUTES,
} from "./bookingDerived";
import type {
  AccessMethod,
  AcDiscrepancy,
  BookingState,
  Tenant,
} from "./bookingSession";
import { getBookingSession } from "./bookingSession";

// ─── Types ──────────────────────────────────────────────────────────────────

export type AdminUnit = {
  id: string;
  addressLine1: string;
  addressLine2: string;
  ac: { type: "split" | "ducted" | "unknown"; systems: number; additional: number };
  agentId: string | null;
  /**
   * The building this unit belongs to. Required: every unit must live
   * inside one of the seeded buildings, so an admin can always group
   * a unit's booking by its rollout. The building↔unit relationship
   * has a single source of truth here on the unit (the building does
   * NOT carry a `unitIds` field), so the two cannot drift apart —
   * same lesson the agency↔unit refactor learned in Task #37.
   */
  buildingId: string;
};

/**
 * A residential building Taylr is rolling out the AC service to.
 *
 * The Buildings view treats each one as its own rollout campaign:
 * the admin sees the building's units, how many have booked vs.
 * still to book, the date range bookings span, and a 14-day strip
 * of where this building's bookings land inside the shared slot
 * calendar.
 *
 * The unit list for a building is **derived** from
 * `AdminUnit.buildingId` (see {@link getBuildingUnits}) — there is
 * intentionally no `unitIds` field here, matching the pattern set
 * by `AdminAgent` so the relationship has one source of truth.
 */
export type AdminBuilding = {
  id: string;
  /** Marketing-style name (e.g. "Aspen Village", "Marine Parade Apartments"). */
  name: string;
  /** Street address line, e.g. "335 Aspen Boulevard". */
  addressLine1: string;
  /** Suburb + state + postcode, e.g. "Greenway ACT 2900". */
  addressLine2: string;
};

/**
 * A managing agency on file. Agents are tracked at the company level
 * only — there is no individual contact person on the agency record
 * itself, since multiple people from the same agency may book on its
 * behalf at different times. The actual booker's name / email / phone
 * is captured on the booking instead (see `AdminBooking.customerName`
 * etc. when `bookerRole === "agent"`), so the admin can always tell
 * who specifically placed each individual booking.
 *
 * Which units an agency manages is **derived** from `AdminUnit.agentId`
 * — there is intentionally no `unitIds` field here, so the unit↔agency
 * relationship has a single source of truth and cannot drift between
 * the agents view and the units view.
 */
export type AdminAgent = {
  id: string;
  /** Display name of the agency (e.g. "Vantage Strata Management"). */
  company: string;
};

export type PaymentStatus = "paid" | "pending" | "refund_pending" | "refunded";
/**
 * Service-side lifecycle of a booking.
 *
 * `cancelled` is a terminal off-flow state (admin-initiated cancellation
 * via the BookingDetail "Cancel booking" affordance, or system-initiated
 * supersede of an invoice-pending booking by a paid one). It is
 * intentionally NOT part of {@link SERVICE_STATUS_FLOW} — the "Advance"
 * affordance must never reach it from the normal scheduled→complete walk.
 *
 * Note: there is no `en_route` state. Taylr doesn't track dispatch as a
 * distinct lifecycle stage; bookings move straight from `scheduled` to
 * `on_site` once the technician arrives.
 */
export type ServiceStatus =
  | "scheduled"
  | "on_site"
  | "complete"
  | "invoice_adjusted"
  | "cancelled";

export const SERVICE_STATUS_FLOW: readonly ServiceStatus[] = [
  "scheduled",
  "on_site",
  "complete",
  "invoice_adjusted",
];

/**
 * Kind of timeline entry — drives the icon the renderer picks.
 *
 *  - `"status"` (default) — a lifecycle event ("Scheduled", "On site",
 *    "Cancelled · …", etc.). Renders as the small status dot.
 *  - `"call"` — Taylr logged a phone call attempt to the tenant/agent.
 *  - `"email"` — Taylr logged an outbound email to the tenant/agent.
 *
 * Optional so existing seed data + every other call-site doesn't have
 * to spell it out for the common "status" case.
 */
export type TimelineEntryKind = "status" | "call" | "email";

export type TimelineEntry = {
  status: string;
  label: string;
  at: string; // human-readable timestamp
  by: string; // who did it ("System", "Mia (admin)", etc.)
  /** What kind of event this is — drives the icon. Defaults to
   *  `"status"` when omitted. */
  kind?: TimelineEntryKind;
  /** Optional one-line note Taylr typed when logging a call or email
   *  ("Left voicemail", "Spoke to tenant — confirmed Wed afternoon",
   *  "Sent rebook link", etc.). Rendered beneath the entry label. */
  note?: string;
};

export type AdminBooking = {
  id: string;
  unitId: string;
  /** Human-readable name of the human who placed the booking. For the
   *  "live" booking we synthesise this from the session contact fields.
   *  When `bookerRole === "agent"` this is the individual at the agency
   *  (e.g. "Eloise Tran"), and the agency itself is carried separately
   *  in `bookerAgencyId` / `bookerAgencyOtherName`. */
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  /** "owner" or "agent" — drives the booker display + the Customer
   *  column tag. */
  bookerRole: "owner" | "agent";
  /** When the booker is an agent, the id of the agency they selected
   *  on Step 2 (matches one of `DEMO_MANAGING_AGENCIES`). `null` for
   *  owners (and for agents who haven't picked one yet). */
  bookerAgencyId: string | null;
  /** When `bookerAgencyId === OTHER_AGENCY_ID` the agent typed a
   *  free-text company name; we surface it instead of the literal
   *  "Other / not listed" label. Empty string otherwise. */
  bookerAgencyOtherName: string;
  /** The access method chosen on Step 4. Carried so the admin booking
   *  detail can decide whether to show the tenant-coordination card.
   *  `null` for legacy seeded rows where the method isn't surfaced. */
  accessMethod: AccessMethod | null;
  /** Tenants captured for tenant-coordinated access methods (see
   *  {@link isTenantMethod}). Empty for every other access method. */
  tenants: ReadonlyArray<Tenant>;
  /** Customer-chosen AC config. */
  systems: number;
  additional: number;
  acType: "split" | "ducted" | "unsure";
  /** Snapshot of any discrepancy with the unit's record on file. Null
   *  when matched (or unit has no record). */
  discrepancy: AcDiscrepancy | null;
  /** Service date (YYYY-MM-DD) and slot ("morning" / "afternoon" /
   *  "to_be_coordinated"). */
  serviceDate: string | null;
  serviceSlot: "morning" | "afternoon" | "evening" | "to_be_coordinated" | null;
  paymentStatus: PaymentStatus;
  serviceStatus: ServiceStatus;
  /** Total in AUD (matches `computeBookingTotal` shape). */
  totalAud: number;
  paymentTimeline: TimelineEntry[];
  serviceTimeline: TimelineEntry[];
  notes: string;
  /** True when this row is the customer's current sessionStorage booking
   *  (so the admin UI can flag it as "Live demo"). */
  isLive?: boolean;
  /** The {@link AdminRollout} this booking was placed against. Resolved
   *  per (service, building) when the booking is created, so the admin
   *  UI can show the rollout chip on a booking and the rollout schedule
   *  editor knows which slots are taken. `null` for legacy seeded rows
   *  whose unit's building has no rollout in the seed (e.g. bookings on
   *  Anzac Parade — kept around so the empty-state customer flow has a
   *  realistic counterpart). */
  rolloutId: string | null;
  /** Cancellation audit trail (set when {@link ServiceStatus} is
   *  `"cancelled"`). All four fields are optional so seed data and the
   *  rest of the codebase don't have to spell them out for non-cancelled
   *  rows. */
  cancelledAt?: string;
  cancelledBy?: string;
  cancellationNote?: string;
  /** When the system auto-cancels an `invoice_pending` row because a
   *  newer paid booking landed on the same unit, we record the winning
   *  booking id here. Drives the "Invoice to cancel · superseded" pill
   *  in the bookings list so an admin knows there's an outstanding
   *  invoice they should void. */
  supersededByBookingId?: string;
  /** ISO timestamp the booking was created (i.e. when it landed in the
   *  system — for paid bookings this matches when the card was charged,
   *  for pending ones it matches when the intent was created). Used by
   *  the admin "Awaiting coordination" queue to show how long each item
   *  has been waiting for a real slot. The string-form labels carried
   *  on `paymentTimeline` / `serviceTimeline` are display-only and not
   *  reliable for arithmetic, hence this dedicated field. */
  createdAt: string;
  /** ISO timestamp of the most recent admin "Mark as chased" action,
   *  or `null` when the booking has never been chased. Surfaced in the
   *  admin Awaiting-coordination queue alongside `createdAt` so an
   *  ops user can see *both* total wait time and time-since-last-touch
   *  ("Waiting 6d · last chased 1d ago" vs "never chased"). The
   *  matching audit trail entry lives on `serviceTimeline` so a chase
   *  is also visible in the per-booking history. */
  lastContactedAt: string | null;
};

// ─── Seeded buildings ───────────────────────────────────────────────────────

/**
 * Four buildings Taylr is currently rolling the AC service out to. The
 * existing 7 demo bookings (u1, u2, u4, u5, u6, u7 — u3 too) are
 * grouped under these so the Buildings view actually has something to
 * display per rollout. A handful of "unbooked" units sit alongside in
 * each building so the rollout view can show real "remaining" counts.
 */
export const SEEDED_BUILDINGS: readonly AdminBuilding[] = [
  {
    id: "bldg-aspen",
    name: "Aspen Village",
    addressLine1: "335 Aspen Boulevard",
    addressLine2: "Greenway ACT 2900",
  },
  {
    id: "bldg-marine",
    name: "Marine Parade Apartments",
    addressLine1: "88 Marine Parade",
    addressLine2: "Coogee NSW 2034",
  },
  {
    id: "bldg-bourke",
    name: "Bourke Street Residences",
    addressLine1: "21 Bourke Street",
    addressLine2: "Surry Hills NSW 2010",
  },
  {
    id: "bldg-anzac",
    name: "Anzac Parade Apartments",
    addressLine1: "142 Anzac Parade",
    addressLine2: "Kensington NSW 2033",
  },
];

// ─── Seeded units ───────────────────────────────────────────────────────────

/**
 * The 7 "anchor" units (u1..u7) keep their original IDs because the
 * seeded bookings reference them. Each one is now grouped under a
 * building, plus a handful of unbooked sibling units per building so
 * the rollout summary shows realistic "booked / remaining" splits.
 *
 * Note: u3, u6, u7 had originally-distinct addresses; they've been
 * relocated under existing buildings (Marine Parade, Bourke Street,
 * Anzac Parade) so the workspace fits cleanly into 4 rollouts. The
 * customer-side address registry in `bookingHelpers.ts` is a
 * separate dataset and is intentionally untouched.
 */
export const SEEDED_UNITS: readonly AdminUnit[] = [
  // ── Aspen Village (Greenway ACT) — flagship rollout, just kicking off
  {
    id: "u1",
    addressLine1: "G01 / 335 Aspen Boulevard",
    addressLine2: "Greenway ACT 2900",
    ac: { type: "ducted", systems: 1, additional: 1 },
    agentId: "ag-001",
    buildingId: "bldg-aspen",
  },
  {
    id: "u-aspen-02",
    addressLine1: "G02 / 335 Aspen Boulevard",
    addressLine2: "Greenway ACT 2900",
    ac: { type: "ducted", systems: 1, additional: 0 },
    agentId: "ag-001",
    buildingId: "bldg-aspen",
  },
  {
    id: "u-aspen-03",
    addressLine1: "101 / 335 Aspen Boulevard",
    addressLine2: "Greenway ACT 2900",
    ac: { type: "split", systems: 2, additional: 0 },
    agentId: "ag-001",
    buildingId: "bldg-aspen",
  },
  {
    id: "u-aspen-04",
    addressLine1: "102 / 335 Aspen Boulevard",
    addressLine2: "Greenway ACT 2900",
    ac: { type: "split", systems: 2, additional: 0 },
    agentId: "ag-001",
    buildingId: "bldg-aspen",
  },
  {
    id: "u-aspen-05",
    addressLine1: "201 / 335 Aspen Boulevard",
    addressLine2: "Greenway ACT 2900",
    ac: { type: "ducted", systems: 1, additional: 1 },
    agentId: "ag-001",
    buildingId: "bldg-aspen",
  },
  {
    id: "u-aspen-06",
    addressLine1: "202 / 335 Aspen Boulevard",
    addressLine2: "Greenway ACT 2900",
    ac: { type: "unknown", systems: 0, additional: 0 },
    agentId: "ag-001",
    buildingId: "bldg-aspen",
  },
  {
    id: "u-aspen-07",
    addressLine1: "301 / 335 Aspen Boulevard",
    addressLine2: "Greenway ACT 2900",
    ac: { type: "split", systems: 1, additional: 0 },
    agentId: "ag-001",
    buildingId: "bldg-aspen",
  },

  // ── Marine Parade Apartments (Coogee NSW) — mid-rollout
  {
    id: "u2",
    addressLine1: "12 / 88 Marine Parade",
    addressLine2: "Coogee NSW 2034",
    ac: { type: "split", systems: 2, additional: 0 },
    agentId: "ag-002",
    buildingId: "bldg-marine",
  },
  {
    id: "u3",
    addressLine1: "3 / 88 Marine Parade",
    addressLine2: "Coogee NSW 2034",
    ac: { type: "unknown", systems: 0, additional: 0 },
    agentId: null,
    buildingId: "bldg-marine",
  },
  {
    id: "u-marine-04",
    addressLine1: "8 / 88 Marine Parade",
    addressLine2: "Coogee NSW 2034",
    ac: { type: "split", systems: 1, additional: 0 },
    agentId: "ag-002",
    buildingId: "bldg-marine",
  },
  {
    id: "u-marine-05",
    addressLine1: "14 / 88 Marine Parade",
    addressLine2: "Coogee NSW 2034",
    ac: { type: "split", systems: 2, additional: 0 },
    agentId: "ag-002",
    buildingId: "bldg-marine",
  },
  {
    id: "u-marine-06",
    addressLine1: "21 / 88 Marine Parade",
    addressLine2: "Coogee NSW 2034",
    ac: { type: "split", systems: 1, additional: 1 },
    agentId: "ag-002",
    buildingId: "bldg-marine",
  },
  {
    id: "u-marine-07",
    addressLine1: "22 / 88 Marine Parade",
    addressLine2: "Coogee NSW 2034",
    ac: { type: "unknown", systems: 0, additional: 0 },
    agentId: null,
    buildingId: "bldg-marine",
  },

  // ── Bourke Street Residences (Surry Hills NSW) — early-stage rollout
  {
    id: "u4",
    addressLine1: "705 / 21 Bourke Street",
    addressLine2: "Surry Hills NSW 2010",
    ac: { type: "unknown", systems: 0, additional: 0 },
    agentId: "ag-001",
    buildingId: "bldg-bourke",
  },
  {
    id: "u6",
    addressLine1: "504 / 21 Bourke Street",
    addressLine2: "Surry Hills NSW 2010",
    ac: { type: "split", systems: 3, additional: 1 },
    agentId: "ag-002",
    buildingId: "bldg-bourke",
  },
  {
    id: "u-bourke-03",
    addressLine1: "302 / 21 Bourke Street",
    addressLine2: "Surry Hills NSW 2010",
    ac: { type: "split", systems: 2, additional: 0 },
    agentId: "ag-001",
    buildingId: "bldg-bourke",
  },
  {
    id: "u-bourke-04",
    addressLine1: "404 / 21 Bourke Street",
    addressLine2: "Surry Hills NSW 2010",
    ac: { type: "unknown", systems: 0, additional: 0 },
    agentId: null,
    buildingId: "bldg-bourke",
  },
  {
    id: "u-bourke-05",
    addressLine1: "606 / 21 Bourke Street",
    addressLine2: "Surry Hills NSW 2010",
    ac: { type: "split", systems: 1, additional: 0 },
    agentId: "ag-002",
    buildingId: "bldg-bourke",
  },

  // ── Anzac Parade Apartments (Kensington NSW) — nearly wrapped up
  {
    id: "u5",
    addressLine1: "18 / 142 Anzac Parade",
    addressLine2: "Kensington NSW 2033",
    ac: { type: "ducted", systems: 2, additional: 0 },
    agentId: "ag-003",
    buildingId: "bldg-anzac",
  },
  {
    id: "u7",
    addressLine1: "11 / 142 Anzac Parade",
    addressLine2: "Kensington NSW 2033",
    ac: { type: "split", systems: 1, additional: 0 },
    agentId: null,
    buildingId: "bldg-anzac",
  },
  {
    id: "u-anzac-03",
    addressLine1: "5 / 142 Anzac Parade",
    addressLine2: "Kensington NSW 2033",
    ac: { type: "split", systems: 1, additional: 0 },
    agentId: "ag-003",
    buildingId: "bldg-anzac",
  },
  {
    id: "u-anzac-04",
    addressLine1: "9 / 142 Anzac Parade",
    addressLine2: "Kensington NSW 2033",
    ac: { type: "ducted", systems: 1, additional: 0 },
    agentId: "ag-003",
    buildingId: "bldg-anzac",
  },
];

// ─── Seeded agents ──────────────────────────────────────────────────────────

export const SEEDED_AGENTS: readonly AdminAgent[] = [
  { id: "ag-001", company: "Vantage Strata Management" },
  { id: "ag-002", company: "City Edge Property Group" },
  { id: "ag-003", company: "Capital Realty & Co." },
];

// ─── Seeded bookings ───────────────────────────────────────────────────────

export const SEEDED_BOOKINGS: readonly AdminBooking[] = [
  {
    id: "bk-1042",
    unitId: "u1",
    customerName: "Henrik Olsen",
    customerEmail: "henrik.o@example.com",
    customerPhone: "0411 222 901",
    bookerRole: "owner",
    bookerAgencyId: null,
    bookerAgencyOtherName: "",
    accessMethod: "owner_live_at_unit",
    tenants: [],
    systems: 1,
    additional: 1,
    acType: "ducted",
    discrepancy: null,
    serviceDate: "2026-04-29",
    serviceSlot: "morning",
    paymentStatus: "paid",
    serviceStatus: "scheduled",
    totalAud: 218,
    paymentTimeline: [
      { status: "intent_created", label: "Payment intent created", at: "Apr 26 · 09:14", by: "System" },
      { status: "paid", label: "Card charged · $218.00", at: "Apr 26 · 09:15", by: "System" },
    ],
    serviceTimeline: [
      { status: "scheduled", label: "Slot booked · 29 Apr · Morning", at: "Apr 26 · 09:15", by: "System" },
    ],
    notes: "Buzzer on left. Lockbox code 4421.",
    rolloutId: "rl-ac-aspen",
    createdAt: "2026-04-26T09:14:00+10:00",
    lastContactedAt: null,
  },
  {
    id: "bk-1041",
    unitId: "u2",
    customerName: "Amal Khoury",
    customerEmail: "amal.k@example.com",
    customerPhone: "0422 014 778",
    bookerRole: "owner",
    bookerAgencyId: null,
    bookerAgencyOtherName: "",
    accessMethod: "owner_live_at_unit",
    tenants: [],
    systems: 3,
    additional: 0,
    acType: "split",
    discrepancy: {
      recorded: { type: "split", systems: 2, additional: 0 },
      customer: { type: "split", systems: 3, additional: 0 },
    },
    serviceDate: "2026-04-30",
    serviceSlot: "afternoon",
    paymentStatus: "paid",
    serviceStatus: "on_site",
    totalAud: 537,
    paymentTimeline: [
      { status: "paid", label: "Card charged · $537.00", at: "Apr 25 · 19:02", by: "System" },
    ],
    serviceTimeline: [
      { status: "scheduled", label: "Slot booked · 30 Apr · Afternoon", at: "Apr 25 · 19:02", by: "System" },
      { status: "on_site", label: "Arrived on site", at: "Apr 28 · 12:40", by: "Mia (admin)" },
    ],
    notes: "Customer reported 3 systems but we have 2 on record. Confirm head count on arrival.",
    rolloutId: "rl-ac-marine",
    createdAt: "2026-04-25T19:02:00+10:00",
    lastContactedAt: null,
  },
  {
    id: "bk-1040",
    unitId: "u5",
    customerName: "Eloise Tran",
    customerEmail: "eloise.tran@capitalrealty.com.au",
    customerPhone: "0455 802 614",
    bookerRole: "agent",
    bookerAgencyId: "agency-003",
    bookerAgencyOtherName: "",
    accessMethod: "agent_trade_key",
    tenants: [],
    systems: 2,
    additional: 0,
    acType: "ducted",
    discrepancy: null,
    serviceDate: "2026-04-30",
    serviceSlot: "morning",
    paymentStatus: "paid",
    serviceStatus: "on_site",
    totalAud: 358,
    paymentTimeline: [
      { status: "paid", label: "Card charged · $358.00", at: "Apr 24 · 14:11", by: "System" },
    ],
    serviceTimeline: [
      { status: "scheduled", label: "Slot booked · 30 Apr · Morning", at: "Apr 24 · 14:11", by: "System" },
      { status: "on_site", label: "Arrived at unit", at: "Apr 28 · 09:05", by: "Tech (Yusuf)" },
    ],
    notes: "Tenant authorised by agent. Concierge to provide trade key.",
    rolloutId: null,
    createdAt: "2026-04-24T14:11:00+10:00",
    lastContactedAt: null,
  },
  {
    id: "bk-1039",
    unitId: "u3",
    customerName: "Sophie Chen",
    customerEmail: "sophie.c@example.com",
    customerPhone: "0466 332 010",
    bookerRole: "owner",
    bookerAgencyId: null,
    bookerAgencyOtherName: "",
    accessMethod: "owner_live_at_unit",
    tenants: [],
    systems: 1,
    additional: 0,
    acType: "split",
    discrepancy: null, // u3 has no record on file → no discrepancy
    serviceDate: "2026-05-02",
    serviceSlot: "afternoon",
    paymentStatus: "pending",
    serviceStatus: "scheduled",
    totalAud: 179,
    paymentTimeline: [
      { status: "intent_created", label: "Payment intent created", at: "Apr 27 · 10:01", by: "System" },
      { status: "pending", label: "Awaiting customer card · 3D Secure pending", at: "Apr 27 · 10:01", by: "System" },
    ],
    serviceTimeline: [
      { status: "scheduled", label: "Slot booked · 2 May · Afternoon", at: "Apr 27 · 10:01", by: "System" },
    ],
    notes: "Customer is new — no AC record on file. Update unit catalog after first visit.",
    rolloutId: "rl-ac-marine",
    createdAt: "2026-04-27T10:01:00+10:00",
    lastContactedAt: null,
  },
  {
    id: "bk-1038",
    unitId: "u6",
    customerName: "Marcus Holloway",
    customerEmail: "marcus.h@cityedgeproperty.com.au",
    customerPhone: "0438 117 220",
    bookerRole: "agent",
    bookerAgencyId: "agency-002",
    bookerAgencyOtherName: "",
    accessMethod: "agent_tenant_taylr",
    tenants: [
      { first: "Liam", last: "Carter", email: "liam.c@example.com", phone: "0411 022 045" },
      { first: "Sienna", last: "Wong", email: "sienna.w@example.com", phone: "0419 887 142" },
      { first: "Noah", last: "Patel", email: "noah.p@example.com", phone: "0466 305 998" },
    ],
    systems: 3,
    additional: 1,
    acType: "split",
    discrepancy: null,
    serviceDate: null, // coordination flow
    serviceSlot: "to_be_coordinated",
    paymentStatus: "paid",
    serviceStatus: "scheduled",
    totalAud: 576,
    paymentTimeline: [
      { status: "paid", label: "Card charged · $576.00", at: "Apr 23 · 11:50", by: "System" },
    ],
    serviceTimeline: [
      { status: "scheduled", label: "Awaiting tenant coordination", at: "Apr 23 · 11:50", by: "System" },
    ],
    notes: "Tenants will provide access — Taylr to coordinate. 3 tenants on file.",
    rolloutId: "rl-ac-bourke",
    createdAt: "2026-04-23T11:50:00+10:00",
    // Intentionally never chased — 6 days waiting with no follow-up is
    // exactly the kind of row the new "last chased" hint should
    // surface to ops on the Awaiting-coordination queue.
    lastContactedAt: null,
  },
  {
    id: "bk-1037",
    unitId: "u4",
    customerName: "Ravi Patel",
    customerEmail: "ravi.p@example.com",
    customerPhone: "0477 660 113",
    bookerRole: "owner",
    bookerAgencyId: null,
    bookerAgencyOtherName: "",
    accessMethod: "owner_leased_tenant",
    tenants: [
      { first: "Hannah", last: "Singh", email: "hannah.s@example.com", phone: "0422 776 014" },
    ],
    systems: 1,
    additional: 0,
    acType: "unsure",
    discrepancy: null, // u4 has no record on file
    serviceDate: "2026-05-01",
    serviceSlot: "morning",
    paymentStatus: "pending",
    serviceStatus: "scheduled",
    totalAud: 179,
    paymentTimeline: [
      { status: "intent_created", label: "Payment intent created", at: "Apr 27 · 18:30", by: "System" },
      { status: "pending", label: "Awaiting customer card", at: "Apr 27 · 18:30", by: "System" },
    ],
    serviceTimeline: [
      { status: "scheduled", label: "Slot booked · 1 May · Morning", at: "Apr 27 · 18:30", by: "System" },
    ],
    notes: "Customer wasn't sure of AC type — tech to confirm on arrival and update catalog.",
    rolloutId: "rl-ac-bourke",
    createdAt: "2026-04-27T18:30:00+10:00",
    lastContactedAt: null,
  },
  {
    id: "bk-1036",
    unitId: "u2",
    customerName: "Jin Park",
    customerEmail: "jin.p@example.com",
    customerPhone: "0488 200 410",
    bookerRole: "owner",
    bookerAgencyId: null,
    bookerAgencyOtherName: "",
    accessMethod: "owner_live_leave_key",
    tenants: [],
    systems: 2,
    additional: 0,
    acType: "split",
    discrepancy: null,
    serviceDate: "2026-04-22",
    serviceSlot: "afternoon",
    paymentStatus: "paid",
    serviceStatus: "complete",
    totalAud: 358,
    paymentTimeline: [
      { status: "paid", label: "Card charged · $358.00", at: "Apr 18 · 13:00", by: "System" },
    ],
    serviceTimeline: [
      { status: "scheduled", label: "Slot booked · 22 Apr · Afternoon", at: "Apr 18 · 13:00", by: "System" },
      { status: "on_site", label: "Arrived at unit", at: "Apr 22 · 13:08", by: "Tech (Sam)" },
      { status: "complete", label: "Service complete · report sent", at: "Apr 22 · 14:45", by: "Tech (Sam)" },
    ],
    notes: "Filter replacement on system 2 — billed separately (see invoice adjustment).",
    rolloutId: "rl-ac-marine",
    createdAt: "2026-04-18T13:00:00+10:00",
    lastContactedAt: null,
  },
  {
    id: "bk-1035",
    unitId: "u7",
    customerName: "Alana Reyes",
    customerEmail: "alana.r@example.com",
    customerPhone: "0499 010 887",
    bookerRole: "owner",
    bookerAgencyId: null,
    bookerAgencyOtherName: "",
    accessMethod: "owner_live_at_unit",
    tenants: [],
    systems: 1,
    additional: 0,
    acType: "split",
    discrepancy: null,
    serviceDate: "2026-04-19",
    serviceSlot: "morning",
    paymentStatus: "refund_pending",
    serviceStatus: "complete",
    totalAud: 179,
    paymentTimeline: [
      { status: "paid", label: "Card charged · $179.00", at: "Apr 16 · 08:20", by: "System" },
      { status: "refund_pending", label: "Partial refund initiated · $40.00", at: "Apr 19 · 16:10", by: "Mia (admin)" },
    ],
    serviceTimeline: [
      { status: "scheduled", label: "Slot booked · 19 Apr · Morning", at: "Apr 16 · 08:20", by: "System" },
      { status: "complete", label: "Service complete (running short)", at: "Apr 19 · 11:20", by: "Tech (Yusuf)" },
    ],
    notes: "Tech finished 25 min early; goodwill refund applied for unused time.",
    rolloutId: null,
    createdAt: "2026-04-16T08:20:00+10:00",
    lastContactedAt: null,
  },
  {
    // Coordination booking on the slots-per-window Marine rollout.
    // Seeded so the success-toast undo e2e (Task #108) can exercise
    // the slots-per-window capacity branch in
    // `scheduleCoordinationBooking` (the other two coordination
    // bookings — bk-1038, bk-1043 — both live on time-budget
    // rollouts, so without this row only one capacity model would
    // ever get covered).
    //
    // u-marine-04 is currently unbooked, so adding a coordination
    // row against it doesn't disturb the seeded slot utilisation
    // counts that other tests assert on (rl-ac-marine 4/29 morning
    // is still 0/6, 4/30 afternoon is still 1/6, etc.).
    id: "bk-1044",
    unitId: "u-marine-04",
    customerName: "Mateo Alvarez",
    customerEmail: "mateo.a@example.com",
    customerPhone: "0413 661 802",
    bookerRole: "owner",
    bookerAgencyId: null,
    bookerAgencyOtherName: "",
    accessMethod: "owner_leased_tenant",
    tenants: [
      { first: "Hana", last: "Ito", email: "hana.i@example.com", phone: "0455 220 117" },
    ],
    systems: 1,
    additional: 0,
    acType: "split",
    discrepancy: null,
    serviceDate: null, // coordination flow
    serviceSlot: "to_be_coordinated",
    paymentStatus: "paid",
    serviceStatus: "scheduled",
    totalAud: 179,
    paymentTimeline: [
      { status: "paid", label: "Card charged · $179.00", at: "Apr 28 · 14:05", by: "System" },
    ],
    serviceTimeline: [
      { status: "scheduled", label: "Awaiting tenant coordination", at: "Apr 28 · 14:05", by: "System" },
    ],
    notes: "Owner asked Taylr to coordinate access with the tenant directly.",
    rolloutId: "rl-ac-marine",
    createdAt: "2026-04-28T14:05:00+10:00",
    lastContactedAt: null,
  },
  {
    // Owner-leased + "Arrange with agent" — Taylr is now waiting on the
    // managing agent (Vantage Strata) to come back with a service window.
    // Seeded so the Awaiting-coordination view always has at least one
    // awaiting-agent example alongside the awaiting-tenant ones.
    id: "bk-1043",
    unitId: "u-aspen-05",
    customerName: "Priya Kapoor",
    customerEmail: "priya.kapoor@example.com",
    customerPhone: "0407 314 502",
    bookerRole: "owner",
    bookerAgencyId: null,
    bookerAgencyOtherName: "",
    accessMethod: "owner_leased_agent",
    tenants: [],
    systems: 1,
    additional: 1,
    acType: "ducted",
    discrepancy: null,
    serviceDate: null, // coordination flow
    serviceSlot: "to_be_coordinated",
    paymentStatus: "paid",
    serviceStatus: "scheduled",
    totalAud: 218,
    paymentTimeline: [
      { status: "paid", label: "Card charged · $218.00", at: "Apr 28 · 09:30", by: "System" },
    ],
    serviceTimeline: [
      { status: "scheduled", label: "Awaiting agent coordination", at: "Apr 28 · 09:30", by: "System" },
    ],
    notes: "Owner asked us to arrange access via Vantage Strata Management. Agent contacted Apr 28 — awaiting reply.",
    rolloutId: "rl-ac-aspen",
    createdAt: "2026-04-28T09:30:00+10:00",
    // Matches the "Agent contacted Apr 28" line in the notes — gives
    // the Awaiting-coordination demo a row that already shows the
    // "last chased Xh ago" hint instead of every row reading "never
    // chased".
    lastContactedAt: "2026-04-28T11:00:00+10:00",
  },
];

// ─── Coordination kind ─────────────────────────────────────────────────────

/**
 * Who Taylr is currently waiting on for a coordination booking — used by
 * the admin "Awaiting coordination" view to group / filter the list.
 *
 *  - `"awaiting_agent"`  — owner asked us to arrange access through
 *                          their managing agent (`owner_leased_agent`).
 *  - `"awaiting_tenant"` — owner or agent asked us to coordinate the
 *                          appointment with the tenant directly
 *                          (`owner_leased_tenant`, `agent_tenant_taylr`).
 *  - `null`              — booking isn't in coordination (slot already
 *                          confirmed, or access method doesn't route
 *                          through coordination at all).
 *
 * Derived from the booking's access method rather than stored on the
 * row, so seed data and the live session row can never drift.
 */
export type CoordinationKind = "awaiting_agent" | "awaiting_tenant";

export function coordinationKindForBooking(
  b: AdminBooking,
): CoordinationKind | null {
  if (b.serviceSlot !== "to_be_coordinated") return null;
  if (b.accessMethod === "owner_leased_agent") return "awaiting_agent";
  if (
    b.accessMethod === "owner_leased_tenant" ||
    b.accessMethod === "agent_tenant_taylr"
  ) {
    return "awaiting_tenant";
  }
  return null;
}

/**
 * Structured "who is on the hook for letting us in?" data for a booking
 * — drives the admin "Coordinating with" panel (coordination bookings)
 * and the "Access on the day" panel (scheduled bookings).
 *
 *   - `tenant`  — Taylr is contacting the tenant(s) directly
 *                 (`owner_leased_tenant`, `agent_tenant_taylr`)
 *   - `agent`   — Owner has nominated their managing agent to coordinate
 *                 (`owner_leased_agent`); agency name is pulled from the
 *                 unit's `agentId` since `AdminBooking` doesn't capture
 *                 the chosen managing-agency id.
 *   - `booker`  — Whoever placed the booking is the contact: the owner
 *                 for owner-side methods, the agent for agent-side
 *                 methods. Most "be there" / "leave key" / "collect &
 *                 return" / "parcel locker" / "agent self / trade key"
 *                 methods land here.
 *
 *  Returns `null` only when the booking has no usable access method
 *  (`agent_tenant_pending` — a transient state that should never reach
 *  the admin), so the panel can be rendered conditionally.
 */
export type CoordinationContact =
  | {
      kind: "tenant";
      tenants: AdminBooking["tenants"];
    }
  | {
      kind: "agent";
      agency: string | null;
    }
  | {
      kind: "booker";
      role: AdminBooking["bookerRole"];
      name: string;
      email: string;
      phone: string;
      /** Agency name when the booker is an agent — surfaced above the
       *  contact name so it's clear which company is on the hook. */
      agency: string | null;
    };

export function coordinationContactForBooking(
  booking: AdminBooking,
  unit: AdminUnit | null,
  agents: readonly AdminAgent[],
): CoordinationContact | null {
  const m = booking.accessMethod;
  if (m === "owner_leased_tenant" || m === "agent_tenant_taylr") {
    return { kind: "tenant", tenants: booking.tenants };
  }
  if (m === "owner_leased_agent") {
    const agency =
      unit && unit.agentId
        ? agents.find((a) => a.id === unit.agentId)?.company ?? null
        : null;
    return { kind: "agent", agency };
  }
  if (m === "agent_tenant_pending") {
    return null;
  }
  return {
    kind: "booker",
    role: booking.bookerRole,
    name: booking.customerName,
    email: booking.customerEmail,
    phone: booking.customerPhone,
    agency:
      booking.bookerRole === "agent" ? bookerAgencyName(booking) : null,
  };
}

// ─── Coordination aging ────────────────────────────────────────────────────

/**
 * Severity buckets for a coordination booking's wait time. Drives the
 * "Waiting Xh / Xd" chip styling in the admin Awaiting-coordination
 * queue and on the booking detail. Thresholds are tuned to ops triage:
 * everything under a working-day is `fresh`; 24-48h is `warn` (chase
 * today); past 48h is `stale` (escalate). Pure data — no rendering.
 */
export type CoordinationWaitSeverity = "fresh" | "warn" | "stale";

const WAIT_WARN_HOURS = 24;
const WAIT_STALE_HOURS = 48;

/**
 * Format the time elapsed since a coordination booking landed. Used by
 * the admin Awaiting-coordination queue (per-row chip) and by the
 * booking detail Schedule card. Returns:
 *   - `label`    — short human string ("just now", "Xh", "Xd")
 *   - `severity` — bucket for chip colouring (see {@link CoordinationWaitSeverity})
 *   - `hours`    — raw hours waited (≥ 0), useful for tests / sorting
 *
 * Negative diffs (createdAt in the future, e.g. clock skew) clamp to
 * "just now" / `fresh` so the UI never shows a confusing negative time.
 */
export function formatCoordinationWaiting(
  createdAtIso: string,
  now: Date = new Date(),
): { label: string; severity: CoordinationWaitSeverity; hours: number } {
  const created = new Date(createdAtIso).getTime();
  // Guard against malformed / empty timestamps (Date parsing yields NaN).
  // Treat them as "just now / fresh" so the UI degrades gracefully instead
  // of rendering "Waiting NaNh" in red.
  if (!Number.isFinite(created)) {
    return { label: "just now", severity: "fresh", hours: 0 };
  }
  const diffMs = Math.max(0, now.getTime() - created);
  const hours = diffMs / (1000 * 60 * 60);
  let label: string;
  if (hours < 1) {
    label = "just now";
  } else if (hours < 24) {
    label = `${Math.floor(hours)}h`;
  } else {
    label = `${Math.floor(hours / 24)}d`;
  }
  let severity: CoordinationWaitSeverity;
  if (hours >= WAIT_STALE_HOURS) {
    severity = "stale";
  } else if (hours >= WAIT_WARN_HOURS) {
    severity = "warn";
  } else {
    severity = "fresh";
  }
  return { label, severity, hours };
}

/**
 * Severity buckets for "last chased" — mirrors {@link CoordinationWaitSeverity}
 * but adds a `never` bucket for bookings that haven't been chased at all.
 *
 *   - `never` — `lastContactedAt` is `null` → ops should chase
 *   - `fresh` — chased < 24h ago → no action needed
 *   - `stale` — chased ≥ 24h ago → maybe time for another nudge
 *
 * Kept narrow on purpose (no `warn` bucket) — the WaitingChip already
 * carries the urgency around total wait, this chip just answers "did
 * anyone touch this recently?".
 */
export type LastContactedSeverity = "never" | "fresh" | "stale";

const CONTACT_STALE_HOURS = 24;

/**
 * Format the time elapsed since a coordination booking was last
 * "chased" (an admin clicked Mark as chased). Used by the admin
 * Awaiting-coordination queue (per-row chip) and the booking detail
 * Schedule card. Returns:
 *   - `label`    — short human string ("never chased", "just now",
 *                  "Xh ago", "Xd ago")
 *   - `severity` — bucket for chip colouring (see {@link LastContactedSeverity})
 *   - `hours`    — raw hours since the chase (≥ 0); 0 when never
 *                  chased so callers can sort missing rows alongside
 *                  the freshly-chased ones if they want.
 *
 * Negative diffs (lastContactedAt in the future, e.g. clock skew)
 * clamp to "just now" / `fresh` so the UI never reads a negative time.
 * Malformed timestamps fall back to `never` so a corrupted seed row
 * still nudges ops to follow up.
 */
export function formatLastContacted(
  lastContactedAtIso: string | null,
  now: Date = new Date(),
): { label: string; severity: LastContactedSeverity; hours: number } {
  if (lastContactedAtIso === null) {
    return { label: "never chased", severity: "never", hours: 0 };
  }
  const contacted = new Date(lastContactedAtIso).getTime();
  if (!Number.isFinite(contacted)) {
    return { label: "never chased", severity: "never", hours: 0 };
  }
  const diffMs = Math.max(0, now.getTime() - contacted);
  const hours = diffMs / (1000 * 60 * 60);
  let label: string;
  if (hours < 1) {
    label = "just now";
  } else if (hours < 24) {
    label = `${Math.floor(hours)}h ago`;
  } else {
    label = `${Math.floor(hours / 24)}d ago`;
  }
  const severity: LastContactedSeverity =
    hours >= CONTACT_STALE_HOURS ? "stale" : "fresh";
  return { label, severity, hours };
}

/**
 * Structured outcome an admin selects when logging a phone-call
 * attempt from `BookingDetail`. Mirrored here (rather than imported
 * from `BookingDetail.tsx`) so non-React code paths — most notably
 * the Awaiting-coordination queue's outcome cell — can pattern-match
 * a call entry without pulling the detail screen into their bundle.
 */
export type CoordinationCallOutcome = "no_answer" | "spoke" | "voicemail";

/**
 * Compact descriptor for the most recent call/email entry in a
 * booking's service timeline. Surfaced by the Awaiting-coordination
 * queue so a team lead can tell at a glance whether the last attempt
 * actually got through ("spoke") or just hit voicemail / bounced.
 *
 * `label` is the short, ready-to-render string the queue cell can
 * drop straight into "Last attempt: …" — kept lowercase so it reads
 * naturally inline ("Last attempt: voicemail", "Last attempt:
 * email"). `callOutcome` / `emailSubject` carry the structured form
 * for consumers (and tests) that want to assert on the underlying
 * shape rather than the rendered string.
 */
export type LatestCoordinationAttempt = {
  kind: "call" | "email";
  label: string;
  /** When `kind === "call"` and the entry's label was produced by
   *  the structured `BookingDetail.logCall` flow, the outcome the
   *  admin picked. `null` for emails or for legacy call entries
   *  whose label can't be matched back to a known outcome. */
  callOutcome: CoordinationCallOutcome | null;
  /** When `kind === "email"`, the trimmed subject the admin captured
   *  (empty string when none was provided). `null` for calls. */
  emailSubject: string | null;
};

/** `BookingDetail.logCall` encodes the outcome in the entry label
 *  as "Logged call · {Outcome}"; this map walks that suffix back to
 *  the structured outcome value. Kept private to this module so the
 *  parsing surface stays small. */
const CALL_OUTCOME_LABEL_TO_VALUE: Record<string, CoordinationCallOutcome> = {
  "No answer": "no_answer",
  "Spoke to them": "spoke",
  "Left voicemail": "voicemail",
};

const CALL_OUTCOME_DISPLAY: Record<CoordinationCallOutcome, string> = {
  no_answer: "no answer",
  spoke: "spoke",
  voicemail: "voicemail",
};

/**
 * Walk `timeline` from newest to oldest and return a descriptor for
 * the most recent `kind: "call"` or `kind: "email"` entry, or `null`
 * when the booking has no logged attempts yet (e.g. it's only been
 * "Marked as chased" the old way, or hasn't been touched at all).
 *
 * The label of a `kind: "call"` entry is encoded as
 * `Logged call · {Outcome}` by `BookingDetail.logCall`, and the
 * label of a `kind: "email"` entry is `Logged email` or
 * `Logged email · {Subject}` by `BookingDetail.logEmail`. We parse
 * those back into structure here so the queue's "Coordinating with"
 * cell can render a clean outcome string without having to import
 * BookingDetail's private label maps.
 */
export function latestCoordinationAttempt(
  timeline: ReadonlyArray<TimelineEntry>,
): LatestCoordinationAttempt | null {
  for (let i = timeline.length - 1; i >= 0; i--) {
    const entry = timeline[i];
    if (entry.kind !== "call" && entry.kind !== "email") continue;
    // Subjects can themselves contain "·", so split on the first
    // separator only and keep the remainder verbatim.
    const sepIdx = entry.label.indexOf("·");
    const suffix = sepIdx >= 0 ? entry.label.slice(sepIdx + 1).trim() : "";
    if (entry.kind === "call") {
      const outcome = CALL_OUTCOME_LABEL_TO_VALUE[suffix] ?? null;
      return {
        kind: "call",
        callOutcome: outcome,
        emailSubject: null,
        label: outcome ? CALL_OUTCOME_DISPLAY[outcome] : "call",
      };
    }
    return {
      kind: "email",
      callOutcome: null,
      emailSubject: suffix,
      label: suffix.length > 0 ? `email · "${suffix}"` : "email",
    };
  }
  return null;
}

// ─── Slot calendar (next 14 days) ──────────────────────────────────────────

/**
 * Two ways an admin can run a service window.
 *
 * - `time_based` — the window has a wall-clock length (e.g. 8am–12pm =
 *   240 min). Each booking eats minutes proportional to the customer's
 *   service requirement (`getBookingDurationMinutes`). The window stays
 *   selectable for a customer iff the booking they're attempting fits
 *   in the remaining minutes; otherwise it shows as full.
 *
 * - `count_based` — the window has N booking slots regardless of how
 *   long each booking takes. Each confirmed booking eats one slot.
 *   When `bookedCount === slotCount` the window is full.
 *
 * Both modes are first-class: ops can mix and match per-window. The
 * customer-facing slot picker should only ever surface "available" or
 * "full" — the mode and capacity numbers are admin-only concerns.
 */
export type AdminSlotMode = "time_based" | "count_based";

export type AdminSlot = {
  id: string;
  window: "morning" | "afternoon";
  mode: AdminSlotMode;
  /** Wall-clock length of the window. Always meaningful (for the
   *  customer-visible "8am–12pm" label) even in count_based mode. */
  windowMinutes: number;
  /** Used by `time_based` mode. In `count_based` mode this is informational
   *  only (e.g. "2 bookings ≈ 90 min so far") and not enforced. */
  bookedMinutes: number;
  /** Used by `count_based` mode. */
  slotCount: number;
  bookedCount: number;
};

export type AdminCalendarDay = {
  isoDate: string; // YYYY-MM-DD
  /** Day-of-month label, e.g. "29". */
  dayLabel: string;
  /** Weekday short label, e.g. "Wed". */
  weekdayLabel: string;
  /** Month label, e.g. "Apr". */
  monthLabel: string;
  /** True when admin has marked the day open for service. */
  open: boolean;
  morning: AdminSlot;
  afternoon: AdminSlot;
};

/**
 * Returns true when a slot can accept a new booking of `jobMinutes`.
 *
 * - `time_based`: there must be enough remaining minutes in the window.
 * - `count_based`: there must be at least one slot left (the duration
 *   of the booking is not part of the gate — that's the whole point of
 *   count mode).
 *
 * Pass `jobMinutes = 0` (the default) when you only want a generic
 * "is this window completely full?" answer (e.g. for an admin overview
 * with no specific booking in mind).
 */
export function slotIsAvailable(slot: AdminSlot, jobMinutes: number = 0): boolean {
  if (slot.mode === "count_based") {
    return slot.bookedCount < slot.slotCount;
  }
  const remaining = slot.windowMinutes - slot.bookedMinutes;
  return remaining >= Math.max(jobMinutes, 1);
}

const MORNING_WINDOW_MINUTES = 240;
const AFTERNOON_WINDOW_MINUTES = 300;
const DEFAULT_MORNING_SLOT_COUNT = 4;
const DEFAULT_AFTERNOON_SLOT_COUNT = 5;

const SHORT_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

type SeedSlotPattern = {
  mode: AdminSlotMode;
  /** Booked minutes if `mode === "time_based"`. */
  bookedMinutes: number;
  /** Booked count if `mode === "count_based"`. */
  bookedCount: number;
};

/** Believable seeded usage per day. Mixes time-based and count-based
 *  windows so the calendar showcases both scheduling models side by
 *  side. */
const SEED_BOOKING_PATTERN: ReadonlyArray<{
  am: SeedSlotPattern;
  pm: SeedSlotPattern;
  open: boolean;
}> = [
  // Day 0 — both windows on time
  {
    am: { mode: "time_based", bookedMinutes: 75, bookedCount: 0 },
    pm: { mode: "time_based", bookedMinutes: 195, bookedCount: 0 },
    open: true,
  },
  // Day 1 — morning fully booked (time), afternoon on count (1/5 used)
  {
    am: { mode: "time_based", bookedMinutes: 240, bookedCount: 0 },
    pm: { mode: "count_based", bookedMinutes: 0, bookedCount: 1 },
    open: true,
  },
  // Day 2 — morning empty count, afternoon on time
  {
    am: { mode: "count_based", bookedMinutes: 0, bookedCount: 0 },
    pm: { mode: "time_based", bookedMinutes: 105, bookedCount: 0 },
    open: true,
  },
  // Day 3 — morning on time (heavy), afternoon count fully booked (5/5)
  {
    am: { mode: "time_based", bookedMinutes: 165, bookedCount: 0 },
    pm: { mode: "count_based", bookedMinutes: 0, bookedCount: 5 },
    open: true,
  },
  // Day 4 — both count, light usage
  {
    am: { mode: "count_based", bookedMinutes: 0, bookedCount: 1 },
    pm: { mode: "count_based", bookedMinutes: 0, bookedCount: 2 },
    open: true,
  },
  // Day 5 — Sunday closed
  {
    am: { mode: "time_based", bookedMinutes: 0, bookedCount: 0 },
    pm: { mode: "time_based", bookedMinutes: 0, bookedCount: 0 },
    open: false,
  },
  // Day 6 — both empty time
  {
    am: { mode: "time_based", bookedMinutes: 0, bookedCount: 0 },
    pm: { mode: "time_based", bookedMinutes: 60, bookedCount: 0 },
    open: true,
  },
  // Day 7 — morning full count, afternoon time partial
  {
    am: { mode: "count_based", bookedMinutes: 0, bookedCount: 4 },
    pm: { mode: "time_based", bookedMinutes: 30, bookedCount: 0 },
    open: true,
  },
  // Day 8 — both time, busy afternoon
  {
    am: { mode: "time_based", bookedMinutes: 105, bookedCount: 0 },
    pm: { mode: "time_based", bookedMinutes: 240, bookedCount: 0 },
    open: true,
  },
  // Day 9 — both empty
  {
    am: { mode: "count_based", bookedMinutes: 0, bookedCount: 0 },
    pm: { mode: "count_based", bookedMinutes: 0, bookedCount: 0 },
    open: true,
  },
  // Day 10 — light count, light time
  {
    am: { mode: "count_based", bookedMinutes: 0, bookedCount: 1 },
    pm: { mode: "time_based", bookedMinutes: 90, bookedCount: 0 },
    open: true,
  },
  // Day 11 — heavy time both
  {
    am: { mode: "time_based", bookedMinutes: 150, bookedCount: 0 },
    pm: { mode: "time_based", bookedMinutes: 300, bookedCount: 0 },
    open: true,
  },
  // Day 12 — closed
  {
    am: { mode: "time_based", bookedMinutes: 0, bookedCount: 0 },
    pm: { mode: "time_based", bookedMinutes: 0, bookedCount: 0 },
    open: false,
  },
  // Day 13 — light morning count
  {
    am: { mode: "count_based", bookedMinutes: 0, bookedCount: 1 },
    pm: { mode: "count_based", bookedMinutes: 0, bookedCount: 0 },
    open: true,
  },
];

/** Average booking length used to derive a believable value for the
 *  *inactive* utilization track when seeding (e.g. give a count-based
 *  slot a `bookedMinutes` figure even though its mode doesn't enforce
 *  it). Keeps demo realism when an admin toggles a slot between modes
 *  — the load doesn't visually evaporate. */
const AVG_BOOKING_MINUTES = 45;

function pairedSlotFields(
  pattern: SeedSlotPattern,
  windowMinutes: number,
  slotCount: number,
): { bookedMinutes: number; bookedCount: number } {
  if (pattern.mode === "time_based") {
    const bookedMinutes = pattern.bookedMinutes;
    const derivedCount = Math.min(
      slotCount,
      Math.ceil(bookedMinutes / AVG_BOOKING_MINUTES),
    );
    return { bookedMinutes, bookedCount: derivedCount };
  }
  const bookedCount = pattern.bookedCount;
  const derivedMinutes = Math.min(
    windowMinutes,
    bookedCount * AVG_BOOKING_MINUTES,
  );
  return { bookedMinutes: derivedMinutes, bookedCount };
}

/** Generates a 14-day calendar starting from today (admin day-zero). */
export function getCalendar(today: Date = new Date()): AdminCalendarDay[] {
  const out: AdminCalendarDay[] = [];
  for (let i = 0; i < SEED_BOOKING_PATTERN.length; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const pattern = SEED_BOOKING_PATTERN[i];
    const morningPaired = pairedSlotFields(
      pattern.am,
      MORNING_WINDOW_MINUTES,
      DEFAULT_MORNING_SLOT_COUNT,
    );
    const afternoonPaired = pairedSlotFields(
      pattern.pm,
      AFTERNOON_WINDOW_MINUTES,
      DEFAULT_AFTERNOON_SLOT_COUNT,
    );
    out.push({
      isoDate: isoDate(d),
      dayLabel: String(d.getDate()),
      weekdayLabel: SHORT_WEEKDAYS[d.getDay()],
      monthLabel: SHORT_MONTHS[d.getMonth()],
      open: pattern.open,
      morning: {
        id: `${isoDate(d)}-am`,
        window: "morning",
        mode: pattern.am.mode,
        windowMinutes: MORNING_WINDOW_MINUTES,
        bookedMinutes: pattern.open ? morningPaired.bookedMinutes : 0,
        slotCount: DEFAULT_MORNING_SLOT_COUNT,
        bookedCount: pattern.open ? morningPaired.bookedCount : 0,
      },
      afternoon: {
        id: `${isoDate(d)}-pm`,
        window: "afternoon",
        mode: pattern.pm.mode,
        windowMinutes: AFTERNOON_WINDOW_MINUTES,
        bookedMinutes: pattern.open ? afternoonPaired.bookedMinutes : 0,
        slotCount: DEFAULT_AFTERNOON_SLOT_COUNT,
        bookedCount: pattern.open ? afternoonPaired.bookedCount : 0,
      },
    });
  }
  return out;
}

// ─── Live session → admin booking ──────────────────────────────────────────

/**
 * Cache key for the live booking's "created at" timestamp. We persist
 * this separately from the BookingState so that:
 *   - the live row's age in the admin queue stays stable across React
 *     re-renders (otherwise `liveBookingFromSession` would re-stamp
 *     `new Date().toISOString()` on every memo recompute and the
 *     "Waiting Xh" chip would always read "just now");
 *   - it survives a tab refresh (sessionStorage) but is naturally
 *     scoped to the demo session — closing the tab clears it;
 *   - it auto-resets when the customer starts over (no `unit_id` →
 *     {@link clearLiveBookingCreatedAtCache} is called below).
 */
const LIVE_CREATED_AT_KEY = "taylr.liveBookingCreatedAt.v1";
let cachedLiveCreatedAt: string | null = null;

function readLiveCreatedAtFromStorage(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(LIVE_CREATED_AT_KEY);
  } catch {
    return null;
  }
}

function writeLiveCreatedAtToStorage(iso: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(LIVE_CREATED_AT_KEY, iso);
  } catch {
    /* sessionStorage may be blocked — caller still has the in-memory copy. */
  }
}

function clearLiveBookingCreatedAtCache(): void {
  cachedLiveCreatedAt = null;
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(LIVE_CREATED_AT_KEY);
  } catch {
    /* Best-effort — falling through is harmless. */
  }
}

function getOrInitLiveBookingCreatedAt(): string {
  if (cachedLiveCreatedAt) return cachedLiveCreatedAt;
  const persisted = readLiveCreatedAtFromStorage();
  if (persisted) {
    cachedLiveCreatedAt = persisted;
    return persisted;
  }
  const fresh = new Date().toISOString();
  cachedLiveCreatedAt = fresh;
  writeLiveCreatedAtToStorage(fresh);
  return fresh;
}

/**
 * Synthesise an `AdminBooking` from the customer's current sessionStorage
 * state, so the demo's "live" booking shows up alongside the seeded rows.
 *
 * Returns `null` when the session doesn't yet have enough committed data
 * to look like a booking (no unit, or no schedule + not in coordination).
 *
 * `paymentStatus` reads as "pending" until the cancellation acknowledgement
 * has been ticked (a stand-in for "ready to pay") — beyond that we don't
 * know whether the customer actually paid in this mockup, so we leave it
 * pending so the demo can show the admin "chase payment" flow.
 */
export function liveBookingFromSession(
  session: BookingState = getBookingSession(),
): AdminBooking | null {
  if (!session.unit_id) {
    // Customer cleared / hasn't started — drop any cached live age so
    // the next live booking starts fresh instead of inheriting the
    // previous one's "Waiting Xh" reading.
    clearLiveBookingCreatedAtCache();
    return null;
  }

  const isCoordination =
    session.access_method === "owner_leased_tenant" ||
    session.access_method === "owner_leased_agent" ||
    session.access_method === "agent_tenant_taylr";

  if (!isCoordination && !session.service_date) return null;

  const customerName =
    [session.contact_first_name, session.contact_last_name]
      .filter(Boolean)
      .join(" ") || "Customer (in progress)";

  const acType: AdminBooking["acType"] =
    session.ac_discrepancy?.customer.type === "unsure"
      ? "unsure"
      : (session.ac_discrepancy?.customer.type ??
        session.ac_discrepancy?.recorded.type ??
        "split");

  const totalAud =
    session.num_systems * 179 + session.num_additional_indoor * 39;

  const durationMin = getBookingDurationMinutes(session);

  return {
    id: "bk-live",
    unitId: session.unit_id,
    customerName,
    customerEmail: session.contact_email || "—",
    customerPhone: session.contact_phone || "—",
    bookerRole: session.role === "agent" ? "agent" : "owner",
    bookerAgencyId: session.role === "agent" ? session.agency_id : null,
    bookerAgencyOtherName:
      session.role === "agent" && session.agency_id === OTHER_AGENCY_ID
        ? session.agency_other_name
        : "",
    accessMethod: session.access_method,
    tenants: isTenantMethod(session.access_method) ? session.tenants : [],
    systems: session.num_systems,
    additional: session.num_additional_indoor,
    acType,
    discrepancy: session.ac_discrepancy,
    serviceDate: isCoordination ? null : session.service_date,
    serviceSlot: isCoordination
      ? "to_be_coordinated"
      : (session.service_slot as "morning" | "afternoon" | "evening" | null),
    paymentStatus: session.cancellation_acknowledged ? "paid" : "pending",
    serviceStatus: isCoordination ? "scheduled" : "scheduled",
    totalAud,
    paymentTimeline: [
      {
        status: "intent_created",
        label: "Payment intent created · live demo",
        at: "Just now",
        by: "System",
      },
      ...(session.cancellation_acknowledged
        ? [
            {
              status: "paid",
              label: `Card charged · $${totalAud.toFixed(2)}`,
              at: "Just now",
              by: "System",
            },
          ]
        : []),
    ],
    serviceTimeline: [
      {
        status: "scheduled",
        label: isCoordination
          ? "Awaiting coordination"
          : `Slot booked (${formatJobMinutesShort(durationMin)})`,
        at: "Just now",
        by: "System",
      },
    ],
    notes:
      "Live demo booking sourced from the customer's current session. Refresh the customer flow to update.",
    isLive: true,
    rolloutId: resolveLiveRolloutId(session.unit_id),
    createdAt: getOrInitLiveBookingCreatedAt(),
    // Live row is read-only in the admin shell (the customer flow owns
    // it), so it never carries a chase timestamp — the "Mark as chased"
    // affordance on BookingDetail is suppressed for this booking.
    lastContactedAt: null,
  };
}

/** Mirror of the customer-side rollout lookup so the live booking row in
 *  the admin UI shows the same rollout chip the customer was booking
 *  against. The customer flow is currently AC-only, so this hard-codes
 *  `svc-ac` — when more services land we'll route off the session's
 *  selected service. Returns `null` when the unit's building has no
 *  rollout (matches the empty-state branch in the customer pickers). */
function resolveLiveRolloutId(unitId: string | null): string | null {
  const rollout = findRolloutForBooking("svc-ac", unitId);
  return rollout ? rollout.id : null;
}

function formatJobMinutesShort(min: number): string {
  if (min <= 0) return "0m";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

// ─── Convenience joins ─────────────────────────────────────────────────────

export function getUnitById(id: string | null): AdminUnit | null {
  if (!id) return null;
  return SEEDED_UNITS.find((u) => u.id === id) ?? null;
}

export function getAgentById(id: string | null): AdminAgent | null {
  if (!id) return null;
  return SEEDED_AGENTS.find((a) => a.id === id) ?? null;
}

/**
 * Resolve the company name to display for the booker on an admin booking
 * row. Returns:
 *   - the free-text "Other / not listed" name when the agent picked
 *     "Other" and typed something in;
 *   - the canonical agency display name when they picked a known agency;
 *   - `null` for owners and for agent rows missing an agency selection
 *     (so the caller can decide what to show as a fallback).
 *
 * Pure / data-only — safe to import anywhere, no DOM access.
 */
export function bookerAgencyName(b: AdminBooking): string | null {
  if (b.bookerRole !== "agent") return null;
  if (!b.bookerAgencyId) return null;
  if (b.bookerAgencyId === OTHER_AGENCY_ID) {
    const trimmed = b.bookerAgencyOtherName.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  const match = DEMO_MANAGING_AGENCIES.find((a) => a.id === b.bookerAgencyId);
  return match ? match.name : null;
}

/**
 * True when the booking's access method requires Taylr to coordinate
 * scheduling with the unit's tenants — so the admin booking detail
 * should surface the captured tenant list.
 *
 * Wraps {@link isTenantMethod} so call-sites don't have to import the
 * access-method catalog directly.
 */
export function requiresTenantCoordination(b: AdminBooking): boolean {
  return isTenantMethod(b.accessMethod);
}

export function bookingDurationMinutes(b: AdminBooking): number {
  if (b.acType === "unsure") return UNSURE_FALLBACK_MINUTES;
  return (
    b.systems * MINUTES_PER_SYSTEM +
    b.additional * MINUTES_PER_ADDITIONAL_INDOOR
  );
}

// ─── Building joins / rollout summary ──────────────────────────────────────

/** Look a building up by id. Returns `null` for an unknown / null id. */
export function getBuildingById(id: string | null): AdminBuilding | null {
  if (!id) return null;
  return SEEDED_BUILDINGS.find((b) => b.id === id) ?? null;
}

/** Convenience: from a unit (or null), follow `buildingId` to its building. */
export function getBuildingForUnit(
  unit: AdminUnit | null,
): AdminBuilding | null {
  if (!unit) return null;
  return getBuildingById(unit.buildingId);
}

/** All units that belong to a given building, in their input order. */
export function getBuildingUnits(
  buildingId: string,
  units: readonly AdminUnit[],
): AdminUnit[] {
  return units.filter((u) => u.buildingId === buildingId);
}

/**
 * All bookings that touch a given building (i.e. their unit lives in
 * that building). Order is preserved from the input — callers can
 * sort however they need.
 */
export function getBuildingBookings(
  buildingId: string,
  units: readonly AdminUnit[],
  bookings: readonly AdminBooking[],
): AdminBooking[] {
  const unitIds = new Set(
    getBuildingUnits(buildingId, units).map((u) => u.id),
  );
  return bookings.filter((b) => unitIds.has(b.unitId));
}

/**
 * Build a `unitId → latest booking` map from a list of bookings.
 *
 * "Latest" here is the booking with the highest `id` per unit — the
 * seeded ids are monotonic (e.g. `bk-1042` is newer than `bk-1041`)
 * and the live row sorts above the seeded ones (`bk-live` > `bk-…`),
 * which is the precedence we want everywhere a unit's "current" booking
 * is shown. Centralised here so the rollout summary and the building
 * detail units panel can't disagree about which booking represents the
 * unit right now.
 */
export function latestBookingByUnit(
  bookings: readonly AdminBooking[],
): Map<string, AdminBooking> {
  const map = new Map<string, AdminBooking>();
  for (const b of bookings) {
    const existing = map.get(b.unitId);
    if (!existing || b.id > existing.id) {
      map.set(b.unitId, b);
    }
  }
  return map;
}

/**
 * Per-building rollout summary used by the Buildings list and the
 * building detail header. All counts are derived — no caching, no
 * stored state — so the summary always agrees with `units` /
 * `bookings` as they're updated by the rest of the admin shell.
 *
 * - `bookedUnits` counts a unit once even if it has multiple bookings
 *   (a re-booking still represents one occupied unit, not two).
 * - `completedUnits` is the subset of `bookedUnits` whose latest
 *   booking has reached `complete` or `invoice_adjusted`.
 * - `remainingUnits = totalUnits − bookedUnits` (units that haven't
 *   been booked at all yet — the rollout's "still to-do" list).
 * - `dateRange` is the earliest and latest scheduled `serviceDate`
 *   across this building's bookings (coordination bookings without a
 *   date are excluded). `null` when nothing is scheduled.
 * - `nextScheduled` is the next future booking (today or later) in
 *   `scheduled` status — what the admin should care about when
 *   planning the week.
 * - `coordinationCount` is bookings whose slot is `to_be_coordinated`,
 *   surfaced separately because they don't fit on the schedule strip.
 */
export type BuildingRolloutSummary = {
  totalUnits: number;
  bookedUnits: number;
  completedUnits: number;
  remainingUnits: number;
  totalBookings: number;
  dateRange: { from: string; to: string } | null;
  nextScheduled: {
    date: string;
    slot: "morning" | "afternoon" | "evening";
  } | null;
  coordinationCount: number;
};

function isoDayOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function summarizeBuildingRollout(
  buildingId: string,
  units: readonly AdminUnit[],
  bookings: readonly AdminBooking[],
  today: Date = new Date(),
): BuildingRolloutSummary {
  const buildingUnits = getBuildingUnits(buildingId, units);
  const buildingBookings = getBuildingBookings(buildingId, units, bookings);

  const bookedUnitIds = new Set(buildingBookings.map((b) => b.unitId));

  // A unit only counts as completed when *its latest* booking has
  // reached a completion status — so an old `complete` booking that
  // was superseded by a newer active re-booking no longer counts.
  // Uses the shared {@link latestBookingByUnit} helper so this matches
  // the per-unit status shown in the building detail panel.
  const completedUnitIds = new Set(
    Array.from(latestBookingByUnit(buildingBookings).values())
      .filter(
        (b) =>
          b.serviceStatus === "complete" ||
          b.serviceStatus === "invoice_adjusted",
      )
      .map((b) => b.unitId),
  );

  const dated = buildingBookings.filter(
    (b): b is AdminBooking & { serviceDate: string } => b.serviceDate !== null,
  );
  const sortedDates = dated.map((b) => b.serviceDate).sort();
  const dateRange =
    sortedDates.length > 0
      ? { from: sortedDates[0], to: sortedDates[sortedDates.length - 1] }
      : null;

  const todayIso = isoDayOf(today);
  const upcoming = dated
    .filter(
      (b) =>
        b.serviceDate >= todayIso &&
        b.serviceStatus === "scheduled" &&
        (b.serviceSlot === "morning" ||
          b.serviceSlot === "afternoon" ||
          b.serviceSlot === "evening"),
    )
    .sort((a, b) => {
      if (a.serviceDate !== b.serviceDate) {
        return a.serviceDate.localeCompare(b.serviceDate);
      }
      // morning < afternoon < evening
      const order = (s: AdminBooking["serviceSlot"]) =>
        s === "morning" ? 0 : s === "afternoon" ? 1 : s === "evening" ? 2 : 3;
      return order(a.serviceSlot) - order(b.serviceSlot);
    });
  const nextScheduled = upcoming[0]
    ? {
        date: upcoming[0].serviceDate,
        slot: upcoming[0].serviceSlot as "morning" | "afternoon" | "evening",
      }
    : null;

  const coordinationCount = buildingBookings.filter(
    (b) => b.serviceSlot === "to_be_coordinated",
  ).length;

  return {
    totalUnits: buildingUnits.length,
    bookedUnits: bookedUnitIds.size,
    completedUnits: completedUnitIds.size,
    remainingUnits: buildingUnits.length - bookedUnitIds.size,
    totalBookings: buildingBookings.length,
    dateRange,
    nextScheduled,
    coordinationCount,
  };
}

/**
 * Format the date range from a {@link BuildingRolloutSummary} into a
 * single short string for the rollout list (e.g. "29 Apr – 2 May",
 * "29 Apr" if both dates are equal). Returns the placeholder when
 * the building has no scheduled bookings.
 */
export function formatRolloutDateRange(
  range: { from: string; to: string } | null,
  placeholder: string = "—",
): string {
  if (!range) return placeholder;
  const fromShort = formatShortDate(range.from);
  const toShort = formatShortDate(range.to);
  return fromShort === toShort ? fromShort : `${fromShort} – ${toShort}`;
}

function formatShortDate(iso: string): string {
  // Hand-rolled to keep the output deterministic across timezones / locales —
  // the seeded data uses ISO YYYY-MM-DD and we only need day + month-short.
  const [y, m, d] = iso.split("-").map((s) => parseInt(s, 10));
  if (!y || !m || !d) return iso;
  const day = String(d);
  const month = SHORT_MONTHS[m - 1] ?? "";
  return `${day} ${month}`;
}

/**
 * Public re-export of the short-date formatter so view code can format
 * a chosen ISO date the same way the rollout list does (e.g. timeline
 * entries, modal summaries). Pure / locale-agnostic.
 */
export function formatBookingShortDate(iso: string): string {
  return formatShortDate(iso);
}

// ─── Admin-created bookings (phone bookings) ───────────────────────────────

/**
 * The admin user creating phone bookings in this mockup. Surfaced on the
 * service timeline of every admin-created booking so ops can always tell
 * who took the call.
 */
export const ADMIN_USER_LABEL = "Mia (admin)";

/**
 * Saved email templates for the bulk Log-email affordance on the
 * Awaiting-coordination queue. Most bulk email-outs are templated
 * ("Sent rebook link", "Sent parcel-locker instructions", "Sent agent
 * intro"), so a small picker lets ops pre-fill the subject + suggested
 * note in one click instead of retyping the same shared message every
 * time. Selecting a template prefills both inputs but leaves them
 * editable so ops can tweak per batch; the dropdown also exposes a
 * `Custom…` option (id `"custom"`) which clears both inputs for a
 * fully free-text entry — that's the default state when the form
 * opens, so the historical free-text behaviour is preserved.
 *
 * Keep this list short and intention-revealing — its main job is to
 * keep timeline labels consistent across batches so the Awaiting-
 * coordination "Last attempt" cell stays scannable. New templates
 * should follow the existing tone (a one-line subject + a 1-2
 * sentence suggested body) and be added in roughly the order ops
 * uses them.
 */
export type EmailTemplate = {
  id: string;
  /** Human-readable label shown in the dropdown and reflected in the
   *  bulk-log toast so ops can confirm which template landed. */
  name: string;
  /** Pre-filled subject line. Encoded in the timeline entry label
   *  ("Logged email · {subject}") on the booking's service timeline. */
  subject: string;
  /** Pre-filled shared note. Becomes the entry's `note` field on the
   *  service timeline (omitted when blank, matching the per-row
   *  `BookingDetail.logEmail` shape). */
  note: string;
};

export const EMAIL_TEMPLATES: ReadonlyArray<EmailTemplate> = [
  {
    id: "rebook_link",
    name: "Sent rebook link",
    subject: "Booking access — please pick a new window",
    note: "Sent rebook link so the tenant can grab a fresh appointment slot directly.",
  },
  {
    id: "parcel_locker",
    name: "Sent parcel-locker instructions",
    subject: "Building access — parcel-locker instructions",
    note: "Sent parcel-locker / building access instructions so the tech can let themselves in on the day.",
  },
  {
    id: "agent_intro",
    name: "Sent agent intro",
    subject: "Coordinating your AC service — quick intro",
    note: "Intro email to the managing agent with the booking summary and a request to confirm a window.",
  },
  {
    id: "awaiting_confirm",
    name: "Awaiting confirmation nudge",
    subject: "Quick nudge — please confirm your AC service window",
    note: "Polite nudge after no reply to the previous email — restated the proposed window and asked for a yes/no.",
  },
];

/** Sentinel id used by the bulk-log-email dropdown for the
 *  free-text "Custom…" option. Kept here so the view + helpers
 *  reference the same string. */
export const EMAIL_TEMPLATE_CUSTOM_ID = "custom";

/** Toast / audit label used when the admin submits the bulk-log-email
 *  form without picking a template (i.e. the `Custom…` dropdown
 *  option). Kept alongside `EMAIL_TEMPLATES` so the view and the
 *  AdminApp handler agree on what to show. */
export const EMAIL_TEMPLATE_CUSTOM_LABEL = "Custom";

/**
 * Per-system / per-extra prices used to compute `totalAud` for an
 * admin-created booking. Mirrors the customer-side total (see
 * `liveBookingFromSession` and the customer pricing card). Kept here so
 * the admin "Create booking" flow can quote the same total a customer
 * would have seen on Step 5.
 */
export const PRICE_PER_SYSTEM_AUD = 179;
export const PRICE_PER_ADDITIONAL_INDOOR_AUD = 39;

/**
 * Generate the next monotonic `bk-NNNN` id given the current bookings
 * list. The seeded ids count down from `bk-1042`, the live row uses the
 * sentinel `bk-live`, and any admin-created booking should be greater
 * than every existing seeded id so {@link latestBookingByUnit} treats it
 * as the unit's *current* booking on the very next render. Pure / data-only.
 *
 * Strategy: scan every id, keep only ones shaped `bk-<digits>`, take the
 * max numeric suffix, and return one above it. Falls back to `bk-1043`
 * when no numeric ids exist (so a freshly cleared store still produces
 * a sensible first id).
 */
export function nextBookingId(bookings: readonly AdminBooking[]): string {
  let max = 1042;
  for (const b of bookings) {
    const m = /^bk-(\d+)$/.exec(b.id);
    if (!m) continue;
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `bk-${max + 1}`;
}

/**
 * The schedule outcome captured on Step 3 of the admin "New booking"
 * flow — either a concrete day + window, or the "to be coordinated"
 * sibling option (no date, no slot, treated like the customer-side
 * coordination flows).
 */
export type AdminCreatedScheduleChoice =
  | { kind: "slot"; date: string; window: "morning" | "afternoon" | "evening" }
  | { kind: "to_be_coordinated" };

/**
 * Inputs the admin "New booking" flow collects across its 4 steps.
 *
 * Kept narrow on purpose — the flow is mockup-only and skips access
 * method / tenant capture (those are admin-followup concerns once the
 * tech is dispatched). The factory below fills the resulting
 * `AdminBooking` with the right pending-payment + admin-attribution
 * shape so the rest of the admin UI treats the row identically to a
 * seeded one.
 */
export type AdminCreatedBookingInput = {
  unit: AdminUnit;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  bookerRole: "owner" | "agent";
  /** When `bookerRole === "agent"`, the agency id picked on Step 1
   *  (matches one of `DEMO_MANAGING_AGENCIES`). `null` for owners. */
  bookerAgencyId: string | null;
  /** Free-text agency name when the agent picked "Other / not listed".
   *  Empty string otherwise. */
  bookerAgencyOtherName: string;
  /** AC config the admin captured on Step 2. */
  ac: { type: "split" | "ducted" | "unsure"; systems: number; additional: number };
  schedule: AdminCreatedScheduleChoice;
  /** Optional free-text notes (defaults to an admin-friendly stub). */
  notes?: string;
  /** Override timestamp for the timeline entry (used by tests for
   *  determinism). Defaults to "Just now". */
  timestamp?: string;
  /** Override ISO timestamp for the booking's `createdAt` (used by
   *  tests for determinism). Defaults to `new Date().toISOString()`
   *  so a real admin-created booking ages from the moment it lands. */
  createdAtIso?: string;
};

/**
 * Build a fully-formed {@link AdminBooking} for the admin "New booking"
 * (phone booking) flow.
 *
 * Pure function — no DOM, no clock, no random — so the factory can be
 * unit-tested directly and the calling component just appends the
 * result to its bookings array.
 *
 * Shape contract (validated by `adminCreatedBooking.test.ts`):
 *   - `paymentStatus` is always `"pending"` (admin will invoice
 *     separately — no card capture in this flow).
 *   - `serviceTimeline` carries an admin-created marker attributing the
 *     row to {@link ADMIN_USER_LABEL} so the booking detail timeline
 *     can render "Booking created by admin (phone)".
 *   - `paymentTimeline` carries a single "Awaiting invoice" entry, also
 *     attributed to the admin user.
 *   - `discrepancy` is computed by comparing the captured AC against
 *     the unit's record on file (matches the customer-side
 *     `ac_discrepancy` shape: type-mismatch OR a non-zero numeric
 *     difference, or `"unsure"` when the unit has a known type).
 *   - `totalAud` mirrors the customer-side pricing model
 *     ($179/system + $39/extra). For "unsure" we still bill at one
 *     system × $179 so the admin has a placeholder; the tech updates
 *     it on arrival.
 *   - `serviceDate` / `serviceSlot` mirror the schedule choice:
 *     `null + "to_be_coordinated"` for the coordination sibling, or
 *     the picked date + window otherwise.
 *   - `accessMethod` and `tenants` are intentionally left null/empty —
 *     the admin captures those later if needed.
 */
export function buildAdminCreatedBooking(
  input: AdminCreatedBookingInput,
  bookingId: string,
): AdminBooking {
  const at = input.timestamp ?? "Just now";

  const totalAud =
    input.ac.type === "unsure"
      ? PRICE_PER_SYSTEM_AUD
      : input.ac.systems * PRICE_PER_SYSTEM_AUD +
        input.ac.additional * PRICE_PER_ADDITIONAL_INDOOR_AUD;

  const discrepancy = computeAdminAcDiscrepancy(input.unit.ac, input.ac);

  // Discriminated-union narrowing for the schedule choice — avoids
  // unsafe casts when reading date/window off the slot variant.
  const serviceDate =
    input.schedule.kind === "slot" ? input.schedule.date : null;
  const serviceSlot: AdminBooking["serviceSlot"] =
    input.schedule.kind === "slot"
      ? input.schedule.window
      : "to_be_coordinated";

  // Tie the booking to whichever rollout is open on the unit's
  // building (mirrors how seeded bookings are anchored to a rollout).
  // `null` when no rollout exists for the (service, building) pair —
  // the admin flow forces the coordination branch in that case, but
  // we still capture the binding for future re-resolution.
  const rolloutId = findRolloutForBooking("svc-ac", input.unit.id)?.id ?? null;

  return {
    id: bookingId,
    unitId: input.unit.id,
    rolloutId,
    customerName: input.customerName,
    customerEmail: input.customerEmail,
    customerPhone: input.customerPhone,
    bookerRole: input.bookerRole,
    bookerAgencyId: input.bookerRole === "agent" ? input.bookerAgencyId : null,
    bookerAgencyOtherName:
      input.bookerRole === "agent" &&
      input.bookerAgencyId === OTHER_AGENCY_ID
        ? input.bookerAgencyOtherName
        : "",
    accessMethod: null,
    tenants: [],
    systems: input.ac.systems,
    additional: input.ac.additional,
    acType: input.ac.type,
    discrepancy,
    serviceDate,
    serviceSlot,
    paymentStatus: "pending",
    serviceStatus: "scheduled",
    totalAud,
    paymentTimeline: [
      {
        status: "pending",
        label: "Awaiting invoice · admin-created booking",
        at,
        by: ADMIN_USER_LABEL,
      },
    ],
    serviceTimeline: [
      {
        status: "scheduled",
        label: "Booking created by admin (phone)",
        at,
        by: ADMIN_USER_LABEL,
      },
    ],
    notes: input.notes ?? "Phone booking — captured by admin on the customer's behalf.",
    createdAt: input.createdAtIso ?? new Date().toISOString(),
    // A freshly admin-created booking has never been chased — the
    // creation itself isn't a follow-up, it's the booking landing.
    lastContactedAt: null,
  };
}

/**
 * Compare the unit's recorded AC config against what the admin captured
 * during the "New booking" flow. Mirrors the customer-side
 * `ac_discrepancy` shape so the bookings list / detail can render the
 * same "Mismatch" treatment whether the booking came from the customer
 * or from an admin phone call.
 *
 * Returns:
 *   - `null` when the unit has no record on file (`type === "unknown"`)
 *     — there's nothing to compare against, so no mismatch is surfaced.
 *   - `null` when the captured config matches the record exactly.
 *   - A populated discrepancy when types differ, numbers differ, or
 *     the admin captured "unsure" against a known recorded type.
 */
export function computeAdminAcDiscrepancy(
  recorded: AdminUnit["ac"],
  captured: { type: "split" | "ducted" | "unsure"; systems: number; additional: number },
): AcDiscrepancy | null {
  if (recorded.type === "unknown") return null;
  if (captured.type === "unsure") {
    return {
      recorded: {
        type: recorded.type,
        systems: recorded.systems,
        additional: recorded.additional,
      },
      customer: { type: "unsure" },
    };
  }
  if (
    captured.type === recorded.type &&
    captured.systems === recorded.systems &&
    captured.additional === recorded.additional
  ) {
    return null;
  }
  return {
    recorded: {
      type: recorded.type,
      systems: recorded.systems,
      additional: recorded.additional,
    },
    customer: {
      type: captured.type,
      systems: captured.systems,
      additional: captured.additional,
    },
  };
}
// ─── Services & per-rollout schedules ──────────────────────────────────────
//
// Earlier mockups carried a single "global" slot calendar and assumed that
// every building shared the same set of openable windows. That broke down
// the moment we started talking about real rollouts: each building sells
// itself to one body corporate at a time, on its own date range, with its
// own capacity rules (a few flagship rollouts run on a strict
// "X bookings per window" cap, others run on a "Y minutes of tech time
// per window" budget). The model below makes that explicit:
//
//   AdminService           → "Annual AC service" (we only seed one for now;
//                            more are on the roadmap but out of scope).
//   ServiceRollout         → one (service × building) pairing, with its
//                            own date range, capacity model, and per-day
//                            availability+capacity. Removing the rollout
//                            removes booking access for that combination.
//
// Every per-day window also carries an `openByAdmin` flag so admins can
// stage a rollout's calendar (publish the date range, then open windows
// progressively) without having to rebuild the day list. Closed windows
// surface to the customer as "Not yet open for booking" (distinct from
// "Full"), and the empty-state branch fires when the (service, building)
// pair has no rollout at all.
//
// Capacity is intentionally split into two shapes — `time_budget_per_window`
// (consumes minutes from the window, same as the legacy global calendar)
// and `slots_per_window` (consumes a discrete count) — because pricing &
// dispatch want to lock different rollouts to different mental models
// without anyone having to translate.

export type ServiceCapacityModel =
  | "time_budget_per_window"
  | "slots_per_window";

export type AdminService = {
  id: string;
  name: string;
  /** Default per-system minutes, used by the live booking → live
   *  rollout-slot math. Mirrors the customer-side AC defaults so the
   *  "remaining minutes" display matches what the customer sees. */
  defaultJobMinutes: number;
};

export const SEEDED_SERVICES: AdminService[] = [
  { id: "svc-ac", name: "Annual AC service", defaultJobMinutes: 45 },
];

/** One window within a {@link RolloutDay}. Carries the capacity counter
 *  matching the rollout's {@link ServiceCapacityModel} — `bookedMinutes`
 *  / `windowMinutes` for time-budget rollouts and `bookedCount` /
 *  `slotCount` for fixed-count rollouts. The "off" mode just leaves the
 *  unused fields at 0; the schedule editor enforces which fields you can
 *  edit. `openByAdmin=false` means the window is staged but not yet
 *  released to customers. */
export type RolloutSlot = {
  id: string;
  window: "morning" | "afternoon" | "evening";
  windowMinutes: number;
  bookedMinutes: number;
  /** Defined only for `slots_per_window` rollouts. */
  slotCount?: number;
  bookedCount?: number;
  openByAdmin: boolean;
};

export type RolloutDay = {
  isoDate: string;
  /** "27" — bare day-of-month for compact pills. */
  dayLabel: string;
  /** "Mon" / "Tue" / ... — short weekday name. */
  weekdayLabel: string;
  /** "Apr" / "May" / ... — short month name. */
  monthLabel: string;
  /** Day-level on/off — both windows are skipped when false (e.g.
   *  weekends, public holidays, scheduled tech leave). */
  open: boolean;
  morning: RolloutSlot;
  afternoon: RolloutSlot;
  /** Optional 5pm – 8pm window. Most days don't have one — admins
   *  opt-in per day for evening capacity. */
  evening?: RolloutSlot;
};

export type AdminRollout = {
  id: string;
  serviceId: string;
  buildingId: string;
  /** Short label shown in the rollouts list and on the booking detail
   *  chip — defaults to "<Service> · <Building>" but admins can edit
   *  it (e.g. "Aspen — Phase 1"). */
  name: string;
  /** Inclusive ISO date range — the rollout's "active" window, used
   *  for the schedule editor's date strip and to bound any new days
   *  the admin opens. */
  startDate: string;
  endDate: string;
  capacityModel: ServiceCapacityModel;
  /** Pre-seeded day rows — one per ISO date in the rollout's range
   *  (admins can't add days outside the range; they can only toggle
   *  the existing rows on/off). */
  days: RolloutDay[];
};

const MORNING_WINDOW_MIN = 240; // 8am – 12pm
const AFTERNOON_WINDOW_MIN = 300; // 12pm – 5pm
const EVENING_WINDOW_MIN = 180; // 5pm – 8pm

function makeTimeBudgetDay(
  isoDate: string,
  morningBooked: number,
  afternoonBooked: number,
  options: {
    open?: boolean;
    morningOpen?: boolean;
    afternoonOpen?: boolean;
    evening?: { booked: number; open?: boolean };
  } = {},
): RolloutDay {
  const [y, mo, d] = isoDate.split("-").map((s) => parseInt(s, 10));
  const date = new Date(Date.UTC(y, mo - 1, d));
  const weekdayLabel = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
    date.getUTCDay()
  ]!;
  const monthLabel = SHORT_MONTHS[mo - 1] ?? "";
  const day: RolloutDay = {
    isoDate,
    dayLabel: String(d),
    weekdayLabel,
    monthLabel,
    open: options.open ?? true,
    morning: {
      id: `${isoDate.replace(/-/g, "")}-am`,
      window: "morning",
      windowMinutes: MORNING_WINDOW_MIN,
      bookedMinutes: morningBooked,
      openByAdmin: options.morningOpen ?? true,
    },
    afternoon: {
      id: `${isoDate.replace(/-/g, "")}-pm`,
      window: "afternoon",
      windowMinutes: AFTERNOON_WINDOW_MIN,
      bookedMinutes: afternoonBooked,
      openByAdmin: options.afternoonOpen ?? true,
    },
  };
  if (options.evening !== undefined) {
    day.evening = {
      id: `${isoDate.replace(/-/g, "")}-ev`,
      window: "evening",
      windowMinutes: EVENING_WINDOW_MIN,
      bookedMinutes: options.evening.booked,
      openByAdmin: options.evening.open ?? true,
    };
  }
  return day;
}

function makeSlotCountDay(
  isoDate: string,
  slotCount: number,
  morningBookedCount: number,
  afternoonBookedCount: number,
  options: {
    open?: boolean;
    morningOpen?: boolean;
    afternoonOpen?: boolean;
    evening?: { booked: number; open?: boolean; bookedCount?: number };
  } = {},
): RolloutDay {
  const base = makeTimeBudgetDay(isoDate, 0, 0, options);
  const day: RolloutDay = {
    ...base,
    morning: {
      ...base.morning,
      slotCount,
      bookedCount: morningBookedCount,
    },
    afternoon: {
      ...base.afternoon,
      slotCount,
      bookedCount: afternoonBookedCount,
    },
  };
  if (base.evening) {
    day.evening = {
      ...base.evening,
      slotCount,
      bookedCount: options.evening?.bookedCount ?? 0,
    };
  }
  return day;
}

// Aspen flagship rollout — time-budget mode, all windows opened. Mirrors
// the day mix the customer-side picker has shown all along (so the visual
// regression for the existing unit-1 customer flow is zero), but anchors
// it to a rollout the admin can now actually edit. The 4/29 morning row
// reflects bk-1042 (1 system × 45 min).
const RL_ASPEN_DAYS: RolloutDay[] = [
  makeTimeBudgetDay("2026-04-27",  75, 195),
  makeTimeBudgetDay("2026-04-28", MORNING_WINDOW_MIN,  60),
  makeTimeBudgetDay("2026-04-29",  45, 105, { evening: { booked: 0 } }),
  makeTimeBudgetDay("2026-04-30", 165, 280),
  makeTimeBudgetDay("2026-05-01",  45,  90, { evening: { booked: 45 } }),
  makeTimeBudgetDay("2026-05-02", 120,   0),
  makeTimeBudgetDay("2026-05-04",   0,  60, { evening: { booked: 0 } }),
  makeTimeBudgetDay("2026-05-05", MORNING_WINDOW_MIN,  30),
  makeTimeBudgetDay("2026-05-06", 105, 240),
  makeTimeBudgetDay("2026-05-07",   0, AFTERNOON_WINDOW_MIN),
  makeTimeBudgetDay("2026-05-08",  60,  90, { evening: { booked: 0 } }),
  makeTimeBudgetDay("2026-05-09", 150, AFTERNOON_WINDOW_MIN),
];

// Marine — slots-per-window rollout. 6 jobs per window, with two seeded
// bookings (bk-1041 4/30 PM, bk-1039 5/2 PM) showing as bookedCount=1 and
// a deliberately-staged future window left closed so the customer-side
// picker exercises the "Not yet open for booking" branch. Day rows that
// fall outside the active range or on weekends are marked closed at the
// day level so the admin's "this day's off" toggle gets a real example.
const RL_MARINE_DAYS: RolloutDay[] = [
  makeSlotCountDay("2026-04-27", 6, 0, 1),
  makeSlotCountDay("2026-04-28", 6, 6, 0),
  makeSlotCountDay("2026-04-29", 6, 0, 2),
  makeSlotCountDay("2026-04-30", 6, 4, 1, { afternoonOpen: false }),
  makeSlotCountDay("2026-05-01", 6, 1, 2),
  makeSlotCountDay("2026-05-02", 6, 0, 1, { open: false }),
  makeSlotCountDay("2026-05-04", 6, 0, 0),
  makeSlotCountDay("2026-05-05", 6, 2, 0, { morningOpen: false }),
  makeSlotCountDay("2026-05-06", 6, 0, 3),
  makeSlotCountDay("2026-05-07", 6, 6, 6),
  makeSlotCountDay("2026-05-08", 6, 0, 0),
];

// Bourke early-stage rollout — time-budget mode, opens only Mon/Wed/Fri
// (typical for a smaller building where the tech only swings by a few
// days a week). bk-1037 lives on the 5/1 morning window.
const RL_BOURKE_DAYS: RolloutDay[] = [
  makeTimeBudgetDay("2026-04-29", 0, 0),
  makeTimeBudgetDay("2026-05-01", 45, 0),
  makeTimeBudgetDay("2026-05-04", 0, 0),
  makeTimeBudgetDay("2026-05-06", 0, 0, { afternoonOpen: false }),
  makeTimeBudgetDay("2026-05-08", 0, 0),
];

const SEEDED_ROLLOUTS: AdminRollout[] = [
  {
    id: "rl-ac-aspen",
    serviceId: "svc-ac",
    buildingId: "bldg-aspen",
    name: "Aspen — Phase 1",
    startDate: "2026-04-27",
    endDate: "2026-05-09",
    capacityModel: "time_budget_per_window",
    days: RL_ASPEN_DAYS,
  },
  {
    id: "rl-ac-marine",
    serviceId: "svc-ac",
    buildingId: "bldg-marine",
    name: "Marine Parade rollout",
    startDate: "2026-04-27",
    endDate: "2026-05-08",
    capacityModel: "slots_per_window",
    days: RL_MARINE_DAYS,
  },
  {
    id: "rl-ac-bourke",
    serviceId: "svc-ac",
    buildingId: "bldg-bourke",
    name: "Bourke St (Mon/Wed/Fri pilot)",
    startDate: "2026-04-29",
    endDate: "2026-05-08",
    capacityModel: "time_budget_per_window",
    days: RL_BOURKE_DAYS,
  },
];

// Mutable session-scoped store so admin actions (Create rollout / toggle
// day / edit capacity / reset utilization) survive across re-renders
// inside the mockup without persisting to disk. Mirrors the pattern used
// by the existing booking store.
let rollouts: AdminRollout[] = SEEDED_ROLLOUTS.map(cloneRollout);

function cloneRollout(r: AdminRollout): AdminRollout {
  return {
    ...r,
    days: r.days.map((d) => ({
      ...d,
      morning: { ...d.morning },
      afternoon: { ...d.afternoon },
      ...(d.evening ? { evening: { ...d.evening } } : {}),
    })),
  };
}

export function getServices(): AdminService[] {
  return SEEDED_SERVICES;
}

export function getServiceById(id: string | null): AdminService | null {
  if (!id) return null;
  return SEEDED_SERVICES.find((s) => s.id === id) ?? null;
}

export function getRollouts(): AdminRollout[] {
  return rollouts;
}

export function getRolloutById(id: string | null): AdminRollout | null {
  if (!id) return null;
  return rollouts.find((r) => r.id === id) ?? null;
}

export function getRolloutsForBuilding(buildingId: string): AdminRollout[] {
  return rollouts.filter((r) => r.buildingId === buildingId);
}

/**
 * Resolve which rollout a customer is booking against given the
 * (service, unit) pair from their session. Returns the rollout for the
 * unit's building, or `null` when no such rollout exists (which is the
 * admin's signal that this building hasn't been opened for bookings on
 * this service yet). Pure / data-only.
 */
export function findRolloutForBooking(
  serviceId: string,
  unitId: string | null,
): AdminRollout | null {
  if (!unitId) return null;
  const unit = getUnitById(unitId);
  if (!unit) return null;
  return (
    rollouts.find(
      (r) => r.serviceId === serviceId && r.buildingId === unit.buildingId,
    ) ?? null
  );
}

/**
 * Per-window classification used by both the customer-side slot picker
 * and the admin-side rollout schedule editor. Order matters — `closed`
 * (day off / window not yet opened) takes precedence over `full` so the
 * customer sees the most actionable reason first ("contact us" vs.
 * "pick another window").
 */
export type RolloutSlotStatus =
  | "available"
  | "not_enough_time"
  | "full"
  | "not_yet_open";

export function rolloutSlotStatus(
  day: RolloutDay,
  slot: RolloutSlot,
  capacityModel: ServiceCapacityModel,
  jobMinutes: number,
): RolloutSlotStatus {
  if (!day.open || !slot.openByAdmin) return "not_yet_open";
  if (capacityModel === "slots_per_window") {
    const total = slot.slotCount ?? 0;
    const booked = slot.bookedCount ?? 0;
    return booked >= total ? "full" : "available";
  }
  // time_budget_per_window
  const remaining = slot.windowMinutes - slot.bookedMinutes;
  if (remaining <= 0) return "full";
  if (jobMinutes > 0 && remaining < jobMinutes) return "not_enough_time";
  return "available";
}

/**
 * Return the active confirmed booking on a given unit (within the same
 * rollout) that should block a new customer from claiming the slot.
 *
 * Rules:
 *   - `serviceStatus === "cancelled"` rows never block (they're closed
 *     out and any payment has been released / will be refunded).
 *   - Only bookings on the same `rolloutId` count — different rollouts
 *     are different service rounds and a unit can be re-booked for each.
 *   - A `paid` booking is a hard block; the customer must pick another
 *     unit or wait for the admin to cancel.
 *   - An `invoice_pending` booking is a soft block; the new customer can
 *     proceed and the system will supersede the old row at submit time.
 *   - Pure / data-only — safe to call from both the customer flow and
 *     the admin shell with the same set of bookings.
 */
export type ActiveBookingForUnit =
  | { kind: "none" }
  | { kind: "paid"; booking: AdminBooking }
  | { kind: "invoice_pending"; booking: AdminBooking };

/**
 * Live-bookings source registration.
 *
 * Customer-side helpers (`alreadyScheduledByOther`, the unit picker
 * uniqueness check) used to read the static `SEEDED_BOOKINGS` constant
 * directly. That made cancel/reschedule/supersede mutations done in
 * the admin shell invisible to the customer flow, even though both run
 * in the same canvas process.
 *
 * `setLiveBookingsSource(getter)` lets the admin shell register a
 * getter that returns its current `seededBookings` React state. The
 * default returns `SEEDED_BOOKINGS` so the canvas-isolated mode
 * (no admin shell mounted) keeps working unchanged.
 *
 * Callers re-register on every mutation; the getter is cheap because
 * `seededBookings` is just the array reference.
 */
export type LiveBookingsSource = () => readonly AdminBooking[];
let liveBookingsSource: LiveBookingsSource = () => SEEDED_BOOKINGS;
let liveBookingsVersion = 0;
const liveBookingsListeners = new Set<() => void>();

export function setLiveBookingsSource(source: LiveBookingsSource | null): void {
  liveBookingsSource = source ?? (() => SEEDED_BOOKINGS);
  notifyLiveBookingsChanged();
}
export function getLiveBookings(): readonly AdminBooking[] {
  return liveBookingsSource();
}
/**
 * Bump the live-bookings version and notify subscribers. Called by the
 * admin shell after every cancel / reschedule / supersede mutation so
 * customer-side components reading `getLiveBookings()` re-render.
 *
 * Safe to call from canvas-isolated mode — there are no listeners and
 * the version counter is harmless.
 */
export function notifyLiveBookingsChanged(): void {
  liveBookingsVersion += 1;
  for (const fn of liveBookingsListeners) fn();
}
/**
 * Subscribe to live-bookings change notifications. Returns the
 * unsubscribe function. Designed to plug straight into React's
 * `useSyncExternalStore`.
 */
export function subscribeLiveBookings(listener: () => void): () => void {
  liveBookingsListeners.add(listener);
  return () => {
    liveBookingsListeners.delete(listener);
  };
}
export function getLiveBookingsVersion(): number {
  return liveBookingsVersion;
}

/**
 * Live-units source registration — same pattern as live-bookings above.
 *
 * Customer-side helpers (`getAcRecord`, `getAcType` in `bookingHelpers.ts`)
 * used to read a hardcoded AC catalog. That made admin-side unit edits
 * (single-unit editor + bulk CSV import) invisible to the customer's
 * AC step pre-fill, so an admin who fixed a unit's AC config never saw
 * that fix flow through to the customer flow.
 *
 * `setLiveUnitsSource(getter)` lets the admin shell register a getter
 * that returns its current `units` React state. The default returns
 * `SEEDED_UNITS` so the canvas-isolated mode (no admin shell mounted,
 * e.g. unit tests of the customer flow) keeps working unchanged.
 *
 * Callers re-register on every mutation; the getter is cheap because
 * `units` is just the array reference.
 */
export type LiveUnitsSource = () => readonly AdminUnit[];
let liveUnitsSource: LiveUnitsSource = () => SEEDED_UNITS;
let liveUnitsVersion = 0;
const liveUnitsListeners = new Set<() => void>();

export function setLiveUnitsSource(source: LiveUnitsSource | null): void {
  liveUnitsSource = source ?? (() => SEEDED_UNITS);
  notifyLiveUnitsChanged();
}
export function getLiveUnits(): readonly AdminUnit[] {
  return liveUnitsSource();
}
/**
 * Bump the live-units version and notify subscribers. Called by the
 * admin shell after every unit edit (single-unit editor + bulk CSV
 * import apply) so customer-side components reading `getLiveUnits()`
 * re-render.
 *
 * Safe to call from canvas-isolated mode — there are no listeners and
 * the version counter is harmless.
 */
export function notifyLiveUnitsChanged(): void {
  liveUnitsVersion += 1;
  for (const fn of liveUnitsListeners) fn();
}
/**
 * Subscribe to live-units change notifications. Returns the unsubscribe
 * function. Designed to plug straight into React's `useSyncExternalStore`.
 */
export function subscribeLiveUnits(listener: () => void): () => void {
  liveUnitsListeners.add(listener);
  return () => {
    liveUnitsListeners.delete(listener);
  };
}
export function getLiveUnitsVersion(): number {
  return liveUnitsVersion;
}

/**
 * Pick the service status a cancelled booking should be restored to
 * when an admin reverses the cancellation. Walks the booking's
 * service timeline backwards looking for the most recent entry whose
 * status isn't `cancelled` / `rescheduled` and returns that. Falls
 * back to `"scheduled"` when the booking was cancelled before any
 * other lifecycle event landed (the common case — most cancellations
 * happen straight after booking).
 *
 * Kept as a pure helper so the undo handler in `AdminApp` can call
 * it without spreading status-derivation logic across the UI layer.
 */
export function priorServiceStatusFromTimeline(
  booking: AdminBooking,
): ServiceStatus {
  for (let i = booking.serviceTimeline.length - 1; i >= 0; i--) {
    const status = booking.serviceTimeline[i].status;
    if (status === "cancelled") continue;
    if (status === "rescheduled") continue;
    if (
      status === "scheduled" ||
      status === "on_site" ||
      status === "complete" ||
      status === "invoice_adjusted"
    ) {
      return status;
    }
  }
  return "scheduled";
}

export function getActiveBookingForUnit(
  unitId: string,
  bookings: readonly AdminBooking[],
  rolloutId: string | null,
): ActiveBookingForUnit {
  if (!rolloutId) return { kind: "none" };
  let paid: AdminBooking | null = null;
  let pending: AdminBooking | null = null;
  for (const b of bookings) {
    if (b.unitId !== unitId) continue;
    if (b.rolloutId !== rolloutId) continue;
    if (b.serviceStatus === "cancelled") continue;
    if (b.paymentStatus === "paid") {
      // Latest paid booking wins (highest id) — see latestBookingByUnit.
      if (!paid || b.id > paid.id) paid = b;
    } else if (b.paymentStatus === "pending") {
      if (!pending || b.id > pending.id) pending = b;
    }
  }
  if (paid) return { kind: "paid", booking: paid };
  if (pending) return { kind: "invoice_pending", booking: pending };
  return { kind: "none" };
}

/**
 * Decrement the rollout slot capacity that `booking` was consuming.
 * No-op for coordination bookings, bookings with no rollout, bookings
 * with no concrete date/window, or when the rollout / day / slot has
 * since been removed. For `slots_per_window` rollouts we drop
 * `bookedCount` by 1 (clamped at 0); for `time_budget_per_window` we
 * subtract the booking's job duration in minutes (clamped at 0).
 *
 * Returns true when capacity was actually released so the caller can
 * decide whether to bump the rollouts refresh key.
 */
export function releaseBookingCapacity(booking: AdminBooking): boolean {
  if (!booking.rolloutId) return false;
  if (!booking.serviceDate) return false;
  if (
    booking.serviceSlot !== "morning" &&
    booking.serviceSlot !== "afternoon" &&
    booking.serviceSlot !== "evening"
  ) {
    return false;
  }
  const rollout = getRolloutById(booking.rolloutId);
  if (!rollout) return false;
  const day = rollout.days.find((d) => d.isoDate === booking.serviceDate);
  if (!day) return false;
  const slot =
    booking.serviceSlot === "morning"
      ? day.morning
      : booking.serviceSlot === "afternoon"
        ? day.afternoon
        : day.evening;
  if (!slot) return false;
  if (rollout.capacityModel === "slots_per_window") {
    const next = Math.max(0, (slot.bookedCount ?? 0) - 1);
    updateRolloutSlot(rollout.id, day.isoDate, booking.serviceSlot, {
      bookedCount: next,
    });
  } else {
    const jobMin = bookingDurationMinutes(booking);
    const next = Math.max(0, slot.bookedMinutes - jobMin);
    updateRolloutSlot(rollout.id, day.isoDate, booking.serviceSlot, {
      bookedMinutes: next,
    });
  }
  return true;
}

/**
 * Increment the rollout slot capacity at (`rolloutId`, `date`, `window`)
 * by the booking's footprint. Mirrors the capacity-mutation logic used
 * by `appendBooking`. Returns true when capacity was actually consumed.
 */
export function consumeBookingCapacity(
  booking: AdminBooking,
  rolloutId: string,
  date: string,
  window: "morning" | "afternoon" | "evening",
): boolean {
  const rollout = getRolloutById(rolloutId);
  if (!rollout) return false;
  const day = rollout.days.find((d) => d.isoDate === date);
  if (!day) return false;
  const slot =
    window === "morning"
      ? day.morning
      : window === "afternoon"
        ? day.afternoon
        : day.evening;
  if (!slot) return false;
  if (rollout.capacityModel === "slots_per_window") {
    updateRolloutSlot(rollout.id, day.isoDate, window, {
      bookedCount: (slot.bookedCount ?? 0) + 1,
    });
  } else {
    const jobMin = bookingDurationMinutes(booking);
    updateRolloutSlot(rollout.id, day.isoDate, window, {
      bookedMinutes: slot.bookedMinutes + jobMin,
    });
  }
  return true;
}

// ── Mutators (used by the rollouts admin views) ────────────────────────────

export function createRollout(input: {
  serviceId: string;
  buildingId: string;
  name: string;
  startDate: string;
  endDate: string;
  capacityModel: ServiceCapacityModel;
  defaultSlotCount?: number;
}): AdminRollout {
  const id = `rl-${Math.random().toString(36).slice(2, 8)}`;
  const days: RolloutDay[] = enumerateDates(input.startDate, input.endDate).map(
    (iso) =>
      input.capacityModel === "slots_per_window"
        ? makeSlotCountDay(iso, input.defaultSlotCount ?? 6, 0, 0, {
            open: !isWeekend(iso),
          })
        : makeTimeBudgetDay(iso, 0, 0, { open: !isWeekend(iso) }),
  );
  const rollout: AdminRollout = {
    id,
    serviceId: input.serviceId,
    buildingId: input.buildingId,
    name: input.name,
    startDate: input.startDate,
    endDate: input.endDate,
    capacityModel: input.capacityModel,
    days,
  };
  rollouts = [...rollouts, rollout];
  return rollout;
}

export function updateRolloutDay(
  rolloutId: string,
  isoDate: string,
  patch: Partial<Omit<RolloutDay, "isoDate" | "dayLabel" | "weekdayLabel" | "monthLabel" | "morning" | "afternoon" | "evening">>,
): void {
  rollouts = rollouts.map((r) =>
    r.id !== rolloutId
      ? r
      : {
          ...r,
          days: r.days.map((d) =>
            d.isoDate !== isoDate ? d : { ...d, ...patch },
          ),
        },
  );
}

export function updateRolloutSlot(
  rolloutId: string,
  isoDate: string,
  window: "morning" | "afternoon" | "evening",
  patch: Partial<RolloutSlot>,
): void {
  rollouts = rollouts.map((r) =>
    r.id !== rolloutId
      ? r
      : {
          ...r,
          days: r.days.map((d) => {
            if (d.isoDate !== isoDate) return d;
            const existing = d[window];
            if (!existing) return d;
            return { ...d, [window]: { ...existing, ...patch } };
          }),
        },
  );
}

/** Used by the "reset utilization" admin action — wipes bookedMinutes /
 *  bookedCount for a single window so the schedule editor can recover
 *  from a "I closed off the wrong day" mistake. The original undoable
 *  values are returned so the caller can implement the toast undo. */
export function resetRolloutSlotUtilization(
  rolloutId: string,
  isoDate: string,
  window: "morning" | "afternoon" | "evening",
): { bookedMinutes: number; bookedCount: number } | null {
  const r = getRolloutById(rolloutId);
  if (!r) return null;
  const day = r.days.find((d) => d.isoDate === isoDate);
  if (!day) return null;
  const slot = day[window];
  if (!slot) return null;
  const prev = {
    bookedMinutes: slot.bookedMinutes,
    bookedCount: slot.bookedCount ?? 0,
  };
  updateRolloutSlot(rolloutId, isoDate, window, {
    bookedMinutes: 0,
    bookedCount: slot.slotCount === undefined ? undefined : 0,
  });
  return prev;
}

/** TEST-ONLY helper — restores the seeded rollout list so unit tests are
 *  isolated from each other. Production code never calls this. */
export function __resetRolloutsForTests(): void {
  rollouts = SEEDED_ROLLOUTS.map(cloneRollout);
}

function enumerateDates(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  const [sy, sm, sd] = startIso.split("-").map((s) => parseInt(s, 10));
  const [ey, em, ed] = endIso.split("-").map((s) => parseInt(s, 10));
  const start = Date.UTC(sy, sm - 1, sd);
  const end = Date.UTC(ey, em - 1, ed);
  for (let t = start; t <= end; t += 24 * 60 * 60 * 1000) {
    const d = new Date(t);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    out.push(`${y}-${m}-${day}`);
  }
  return out;
}

function isWeekend(iso: string): boolean {
  const [y, m, d] = iso.split("-").map((s) => parseInt(s, 10));
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day === 0 || day === 6;
}

// ─── Coordination → scheduled conversion ──────────────────────────────────

/**
 * Build the patch that flips a coordination booking
 * (`serviceSlot === "to_be_coordinated"`) into a real scheduled
 * appointment. Used by the "Schedule appointment" action surfaced in
 * the awaiting-coordination queue and the booking detail's Schedule
 * card after ops has confirmed the date/window with the tenant or
 * managing agent.
 *
 * Returns the field-level patch only (`serviceDate`, `serviceSlot`, an
 * appended `serviceTimeline` entry). The caller is responsible for
 * actually applying the patch to the bookings store and for bumping
 * the matching rollout's per-window capacity (mirrors how
 * `appendBooking` handles a freshly-created phone booking).
 *
 * Pure / data-only — safe to import anywhere, no DOM access.
 */
export function convertCoordinationToScheduledPatch(
  b: AdminBooking,
  schedule: { date: string; window: "morning" | "afternoon" | "evening" },
  by: string = ADMIN_USER_LABEL,
  at: string = "Just now",
): Pick<AdminBooking, "serviceDate" | "serviceSlot" | "serviceTimeline"> {
  const windowLabel =
    schedule.window === "morning"
      ? "Morning"
      : schedule.window === "afternoon"
        ? "Afternoon"
        : "Evening";
  const entry: TimelineEntry = {
    status: "scheduled",
    label: `Coordinated · ${formatBookingShortDate(schedule.date)} · ${windowLabel}`,
    at,
    by,
  };
  return {
    serviceDate: schedule.date,
    serviceSlot: schedule.window,
    serviceTimeline: [...b.serviceTimeline, entry],
  };
}

/**
 * Build the timeline entry stamped on a booking when ops moves it
 * from one scheduled slot to another via the "Reschedule" action in
 * the BookingDetail Schedule card. Mirrors
 * {@link convertCoordinationToScheduledPatch}'s label format
 * ("Coordinated · {short date} · {window}") so the audit trail reads
 * consistently across the schedule and reschedule flows.
 *
 * Accepts an optional short `note` typed by ops on the reschedule
 * confirmation step (e.g. "tenant called back"). When present and
 * non-empty, it is appended to the label after the window so it is
 * visible inline on the Service timeline without requiring a
 * separate field on TimelineEntry. Pure / data-only — safe to import
 * anywhere, no DOM access.
 */
export function buildRescheduledTimelineEntry(
  schedule: { date: string; window: "morning" | "afternoon"; note?: string },
  by: string = ADMIN_USER_LABEL,
  at: string = "Just now",
): TimelineEntry {
  const windowLabel =
    schedule.window === "morning" ? "Morning" : "Afternoon";
  const trimmedNote = schedule.note?.trim() ?? "";
  const noteSuffix = trimmedNote.length > 0 ? ` · ${trimmedNote}` : "";
  return {
    status: "rescheduled",
    label: `Rescheduled · ${formatBookingShortDate(schedule.date)} · ${windowLabel}${noteSuffix}`,
    at,
    by,
  };
}

/**
 * Inverse of {@link convertCoordinationToScheduledPatch} — given the
 * booking *as it was before* it was scheduled, return the patch that
 * restores its prior shape.
 *
 * Used by the success-toast "Undo" affordance (Task #92) so ops can
 * revert a misclick without digging back into the booking detail. The
 * caller is responsible for the matching rollout-capacity rollback
 * (mirror of the consume in `AdminApp.scheduleCoordinationBooking`).
 *
 * Pure / data-only — safe to import anywhere, no DOM access.
 */
export function revertScheduledToCoordinationPatch(
  prior: AdminBooking,
): Pick<AdminBooking, "serviceDate" | "serviceSlot" | "serviceTimeline"> {
  return {
    serviceDate: prior.serviceDate,
    serviceSlot: prior.serviceSlot,
    serviceTimeline: prior.serviceTimeline,
  };
}

/**
 * Build the typed timeline entry for a bulk-logged email.
 *
 * Mirror of the per-row `BookingDetail.logEmail` shape so timeline
 * entries stay interchangeable regardless of whether the email was
 * logged one-at-a-time from the booking detail screen or in a batch
 * from the Awaiting-coordination bulk action bar.
 *
 * Subject is encoded in the entry label so the timeline reads as a
 * one-line summary; the optional shared note carries the body /
 * context. Both inputs are trimmed before they hit the entry so
 * stray whitespace from the form doesn't bleed into the audit
 * trail. When the trimmed note is empty we omit the `note` field
 * entirely (consistent with how `BookingDetail.logEmail` builds
 * the per-row entry).
 *
 * Pure / data-only — safe to import from tests or other helpers.
 */
export function buildBulkLogEmailEntry({
  subject,
  note,
  by = ADMIN_USER_LABEL,
  at = "Just now",
}: {
  subject: string;
  note: string;
  by?: string;
  at?: string;
}): TimelineEntry {
  const trimmedSubject = subject.trim();
  const trimmedNote = note.trim();
  return {
    kind: "email",
    status: "logged_email",
    label:
      trimmedSubject.length > 0
        ? `Logged email · ${trimmedSubject}`
        : "Logged email",
    at,
    by,
    ...(trimmedNote.length > 0 ? { note: trimmedNote } : {}),
  };
}

/**
 * Apply a bulk-logged email to a list of bookings, returning the new
 * list. Selected bookings get `lastContactedAt` stamped to `nowIso`
 * and the entry from {@link buildBulkLogEmailEntry} appended to their
 * service timeline; every other booking is returned unchanged. The
 * live demo row (`bk-live`) is silently skipped — it mirrors the
 * customer's session and isn't writable from the admin shell. Pure /
 * data-only — safe to call from tests.
 */
export function applyBulkLogEmail(
  bookings: readonly AdminBooking[],
  ids: readonly string[],
  subject: string,
  note: string,
  nowIso: string,
  by: string = ADMIN_USER_LABEL,
): AdminBooking[] {
  if (ids.length === 0) return [...bookings];
  const idSet = new Set(ids);
  const entry = buildBulkLogEmailEntry({ subject, note, by });
  return bookings.map((b) => {
    if (b.id === "bk-live") return b;
    if (!idSet.has(b.id)) return b;
    return {
      ...b,
      lastContactedAt: nowIso,
      serviceTimeline: [...b.serviceTimeline, entry],
    };
  });
}

