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
export type ServiceStatus =
  | "scheduled"
  | "en_route"
  | "on_site"
  | "complete"
  | "invoice_adjusted";

export const SERVICE_STATUS_FLOW: readonly ServiceStatus[] = [
  "scheduled",
  "en_route",
  "on_site",
  "complete",
  "invoice_adjusted",
];

export type TimelineEntry = {
  status: string;
  label: string;
  at: string; // human-readable timestamp
  by: string; // who did it ("System", "Mia (admin)", etc.)
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
  serviceSlot: "morning" | "afternoon" | "to_be_coordinated" | null;
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
    serviceStatus: "en_route",
    totalAud: 537,
    paymentTimeline: [
      { status: "paid", label: "Card charged · $537.00", at: "Apr 25 · 19:02", by: "System" },
    ],
    serviceTimeline: [
      { status: "scheduled", label: "Slot booked · 30 Apr · Afternoon", at: "Apr 25 · 19:02", by: "System" },
      { status: "en_route", label: "Technician dispatched", at: "Apr 28 · 12:40", by: "Mia (admin)" },
    ],
    notes: "Customer reported 3 systems but we have 2 on record. Confirm head count on arrival.",
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
      { status: "en_route", label: "Technician dispatched", at: "Apr 28 · 08:22", by: "System" },
      { status: "on_site", label: "Arrived at unit", at: "Apr 28 · 09:05", by: "Tech (Yusuf)" },
    ],
    notes: "Tenant authorised by agent. Concierge to provide trade key.",
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
      { status: "en_route", label: "Technician dispatched", at: "Apr 22 · 12:40", by: "System" },
      { status: "on_site", label: "Arrived at unit", at: "Apr 22 · 13:08", by: "Tech (Sam)" },
      { status: "complete", label: "Service complete · report sent", at: "Apr 22 · 14:45", by: "Tech (Sam)" },
    ],
    notes: "Filter replacement on system 2 — billed separately (see invoice adjustment).",
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
  },
];

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
  if (!session.unit_id) return null;

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
      : (session.service_slot as "morning" | "afternoon" | null),
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
  };
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
 *   `scheduled` / `en_route` status — what the admin should care
 *   about when planning the week.
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
    slot: "morning" | "afternoon";
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

  // Per-unit "latest" booking is the one with the highest booking id
  // (seed ids are monotonic — `bk-1042` is newer than `bk-1041`). A
  // unit only counts as completed when *its latest* booking has reached
  // a completion status, so an old `complete` booking superseded by a
  // newer active re-booking no longer counts.
  const latestBookingByUnit = new Map<string, AdminBooking>();
  for (const b of buildingBookings) {
    const existing = latestBookingByUnit.get(b.unitId);
    if (!existing || b.id > existing.id) {
      latestBookingByUnit.set(b.unitId, b);
    }
  }
  const completedUnitIds = new Set(
    Array.from(latestBookingByUnit.values())
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
        (b.serviceStatus === "scheduled" || b.serviceStatus === "en_route") &&
        (b.serviceSlot === "morning" || b.serviceSlot === "afternoon"),
    )
    .sort((a, b) => {
      if (a.serviceDate !== b.serviceDate) {
        return a.serviceDate.localeCompare(b.serviceDate);
      }
      // morning before afternoon
      const aSlot = a.serviceSlot === "morning" ? 0 : 1;
      const bSlot = b.serviceSlot === "morning" ? 0 : 1;
      return aSlot - bSlot;
    });
  const nextScheduled = upcoming[0]
    ? {
        date: upcoming[0].serviceDate,
        slot: upcoming[0].serviceSlot as "morning" | "afternoon",
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
