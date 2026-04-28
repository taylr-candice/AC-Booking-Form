/**
 * Taylr Admin (mockup).
 *
 * Single-page mockup of the admin-side ops UI: bookings list + detail,
 * slot calendar, units & AC config, agents, payments. No real DB, no
 * real auth — all data is seeded and any "edits" live in component
 * state for the demo session only.
 *
 * The customer's current sessionStorage booking is folded into the
 * bookings list as a "Live demo" row so the customer can demo the
 * customer flow and see it appear here in real time.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Calendar,
  ChevronLeft,
  CreditCard,
  Download,
  Edit3,
  FileUp,
  Home,
  Plus,
  Search,
  Snowflake,
  Sparkles,
  TriangleAlert,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";

import {
  bookingDurationMinutes,
  getCalendar,
  liveBookingFromSession,
  SEEDED_AGENTS,
  SEEDED_BOOKINGS,
  SEEDED_UNITS,
  SERVICE_STATUS_FLOW,
  type AdminAgent,
  type AdminBooking,
  type AdminCalendarDay,
  type AdminSlot,
  type AdminUnit,
  type PaymentStatus,
  type ServiceStatus,
} from "@/state/adminMockData";
import { formatDurationMinutes } from "@/state/bookingDerived";
import { useBookingSession } from "@/state/bookingSession";
import { formatUnitsCsv, unitsCsvTemplate } from "@/state/unitsCsv";

import { UnitsCsvImportModal } from "./UnitsCsvImportModal";

// ─── Brand ─────────────────────────────────────────────────────────────────

const BRAND = "#ED017F";
const BRAND_SOFT = "#FCE7F1";
const BRAND_DEEP = "#A30058";

// ─── View identifiers ──────────────────────────────────────────────────────

type ViewId = "bookings" | "payments" | "calendar" | "units" | "agents";

const NAV_ITEMS: ReadonlyArray<{ id: ViewId; label: string; icon: LucideIcon }> = [
  { id: "bookings", label: "Bookings", icon: Calendar },
  { id: "payments", label: "Payments", icon: CreditCard },
  { id: "calendar", label: "Slot calendar", icon: Sparkles },
  { id: "units", label: "Units", icon: Home },
  { id: "agents", label: "Agents", icon: Users },
];

// ─── Root ──────────────────────────────────────────────────────────────────

export function AdminApp() {
  // Mutable working copies of the seeded data (so admin "edits" stick
  // for the demo session).
  const [units, setUnits] = useState<AdminUnit[]>([...SEEDED_UNITS]);
  const [agents, setAgents] = useState<AdminAgent[]>([...SEEDED_AGENTS]);
  const [seededBookings, setSeededBookings] =
    useState<AdminBooking[]>([...SEEDED_BOOKINGS]);
  const [calendar, setCalendar] = useState<AdminCalendarDay[]>(() => getCalendar());

  // Live customer booking pulled from sessionStorage.
  const session = useBookingSession();
  const liveBooking = useMemo(() => liveBookingFromSession(session), [session]);
  const allBookings: AdminBooking[] = liveBooking
    ? [liveBooking, ...seededBookings]
    : seededBookings;

  const [view, setView] = useState<ViewId>("bookings");
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);

  // When jumping to Payments, default the bookings list to the payments filter.
  const [bookingsStatusFilter, setBookingsStatusFilter] =
    useState<"all" | ServiceStatus | PaymentStatus>("all");
  const [search, setSearch] = useState("");

  function handleNav(id: ViewId) {
    setView(id);
    setSelectedBookingId(null);
    if (id === "payments") {
      setBookingsStatusFilter("pending");
    } else if (id === "bookings") {
      setBookingsStatusFilter("all");
    }
    setSearch("");
  }

  // Service-status advance / payment status / notes edits flow back into
  // the local seeded list (live booking is read-only in this mockup).
  function updateBooking(id: string, patch: Partial<AdminBooking>) {
    if (id === "bk-live") return; // can't mutate the session-derived row here
    setSeededBookings((prev) =>
      prev.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 font-['Inter'] text-slate-900">
      <Sidebar activeView={view} onNav={handleNav} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar view={view} selectedBookingId={selectedBookingId} bookings={allBookings} />
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
              />
            ) : (
              <BookingsList
                bookings={allBookings}
                units={units}
                statusFilter={bookingsStatusFilter}
                onStatusFilter={setBookingsStatusFilter}
                search={search}
                onSearch={setSearch}
                onOpen={setSelectedBookingId}
                paymentMode={view === "payments"}
              />
            )
          ) : null}

          {view === "calendar" && (
            <SlotCalendar calendar={calendar} setCalendar={setCalendar} />
          )}

          {view === "units" && (
            <UnitsView units={units} setUnits={setUnits} agents={agents} />
          )}

          {view === "agents" && (
            <AgentsView agents={agents} setAgents={setAgents} units={units} />
          )}
        </main>
      </div>
    </div>
  );
}

// ─── Sidebar ───────────────────────────────────────────────────────────────

function Sidebar({
  activeView,
  onNav,
}: {
  activeView: ViewId;
  onNav: (id: ViewId) => void;
}) {
  return (
    <aside className="flex w-60 flex-col border-r border-slate-200 bg-white">
      <div className="flex items-center gap-2 px-5 pb-4 pt-5">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-xl text-white"
          style={{ backgroundColor: BRAND }}
        >
          <Snowflake className="h-5 w-5" />
        </div>
        <div>
          <div className="text-[15px] font-semibold leading-tight">Taylr</div>
          <div className="text-[11px] uppercase tracking-wider text-slate-500">
            Admin · Ops
          </div>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 px-3 pt-3">
        {NAV_ITEMS.map((item) => {
          const isActive = activeView === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNav(item.id)}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition ${
                isActive
                  ? "text-white"
                  : "text-slate-700 hover:bg-slate-100"
              }`}
              style={isActive ? { backgroundColor: BRAND } : undefined}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </button>
          );
        })}
      </nav>
      <div className="border-t border-slate-200 px-5 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-[11px] font-semibold text-slate-700">
            MK
          </div>
          <div className="leading-tight">
            <div className="text-[13px] font-semibold text-slate-900">Mia Khan</div>
            <div className="text-[11px] text-slate-500">Operations lead</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

// ─── Top bar ───────────────────────────────────────────────────────────────

function TopBar({
  view,
  selectedBookingId,
  bookings,
}: {
  view: ViewId;
  selectedBookingId: string | null;
  bookings: AdminBooking[];
}) {
  let title = "";
  let crumb = "";
  if (view === "bookings") {
    title = selectedBookingId ? "Booking detail" : "Bookings";
    const b = bookings.find((x) => x.id === selectedBookingId);
    crumb = selectedBookingId
      ? `Bookings / ${b?.id ?? selectedBookingId}`
      : "All bookings across the workspace";
  } else if (view === "payments") {
    title = selectedBookingId ? "Booking detail" : "Payments";
    crumb = selectedBookingId
      ? `Payments / ${selectedBookingId}`
      : "Bookings filtered by payment status";
  } else if (view === "calendar") {
    title = "Slot calendar";
    crumb = "Open / close days, edit windows";
  } else if (view === "units") {
    title = "Units";
    crumb = "AC config on file (the source of customer pre-fill)";
  } else if (view === "agents") {
    title = "Agents";
    crumb = "Leasing agents and the units they manage";
  }
  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-8 py-4">
      <div>
        <div className="text-[12px] font-medium uppercase tracking-wider text-slate-500">
          {crumb}
        </div>
        <h1 className="text-[20px] font-semibold leading-tight text-slate-900">
          {title}
        </h1>
      </div>
      <div className="flex items-center gap-2">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider"
          style={{ backgroundColor: BRAND_SOFT, color: BRAND_DEEP }}
        >
          <Sparkles className="h-3 w-3" />
          Mockup mode · seeded data
        </span>
      </div>
    </header>
  );
}

// ─── Bookings list ─────────────────────────────────────────────────────────

function BookingsList({
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

function SlotCell({ booking }: { booking: AdminBooking }) {
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

function PaymentChip({ status }: { status: PaymentStatus }) {
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

function ServiceChip({ status }: { status: ServiceStatus }) {
  const map: Record<ServiceStatus, { label: string; bg: string; fg: string }> = {
    scheduled: { label: "Scheduled", bg: "#E2E8F0", fg: "#334155" },
    en_route: { label: "En route", bg: "#DBEAFE", fg: "#1D4ED8" },
    on_site: { label: "On site", bg: "#E0E7FF", fg: "#3730A3" },
    complete: { label: "Complete", bg: "#DCFCE7", fg: "#166534" },
    invoice_adjusted: { label: "Invoice adjusted", bg: "#FEF3C7", fg: "#92400E" },
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

// ─── Booking detail ────────────────────────────────────────────────────────

function BookingDetail({
  bookingId,
  bookings,
  units,
  agents,
  onBack,
  onUpdate,
}: {
  bookingId: string;
  bookings: AdminBooking[];
  units: AdminUnit[];
  agents: AdminAgent[];
  onBack: () => void;
  onUpdate: (id: string, patch: Partial<AdminBooking>) => void;
}) {
  const booking = bookings.find((b) => b.id === bookingId);
  const [notes, setNotes] = useState(booking?.notes ?? "");

  // Whenever the selected booking changes, pull the freshest notes value.
  useEffect(() => {
    setNotes(booking?.notes ?? "");
  }, [booking?.id, booking?.notes]);

  if (!booking) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="text-slate-700">
          That booking is no longer available.{" "}
          <button
            type="button"
            onClick={onBack}
            className="font-semibold underline"
            style={{ color: BRAND }}
          >
            Back to list
          </button>
        </div>
      </div>
    );
  }

  const unit = units.find((u) => u.id === booking.unitId) ?? null;
  const agent = unit?.agentId ? agents.find((a) => a.id === unit.agentId) ?? null : null;
  const currentIdx = SERVICE_STATUS_FLOW.indexOf(booking.serviceStatus);
  const nextStatus =
    currentIdx >= 0 && currentIdx < SERVICE_STATUS_FLOW.length - 1
      ? SERVICE_STATUS_FLOW[currentIdx + 1]
      : null;

  function advanceStatus() {
    if (!nextStatus || !booking) return;
    const newEntry = {
      status: nextStatus,
      label: nextStatusLabel(nextStatus),
      at: "Just now",
      by: "Mia (admin)",
    };
    onUpdate(booking.id, {
      serviceStatus: nextStatus,
      serviceTimeline: [...booking.serviceTimeline, newEntry],
    });
  }

  function saveNotes() {
    if (!booking) return;
    onUpdate(booking.id, { notes });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-600 hover:text-slate-900"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to list
        </button>
        <div className="flex items-center gap-2">
          {booking.isLive && (
            <span
              className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider"
              style={{ backgroundColor: BRAND, color: "white" }}
            >
              Live demo
            </span>
          )}
          {nextStatus ? (
            <button
              type="button"
              onClick={advanceStatus}
              disabled={booking.isLive}
              className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white transition ${
                booking.isLive ? "cursor-not-allowed opacity-50" : "hover:brightness-110"
              }`}
              style={{ backgroundColor: BRAND }}
              title={booking.isLive ? "Live demo row is read-only" : ""}
            >
              Advance to "{nextStatusLabel(nextStatus)}"
            </button>
          ) : (
            <span className="text-[12px] font-semibold text-slate-500">
              Service complete
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Left column: customer, unit, agent, AC config */}
        <div className="col-span-2 flex flex-col gap-4">
          <Card>
            <div className="grid grid-cols-3 gap-4">
              <Field label="Booking ID" value={booking.id} />
              <Field
                label="Booker"
                value={booking.bookerRole === "agent" ? "Agent" : "Owner"}
              />
              <Field label="Total" value={`$${booking.totalAud.toFixed(2)}`} />
              <Field label="Customer" value={booking.customerName} />
              <Field label="Email" value={booking.customerEmail} />
              <Field label="Phone" value={booking.customerPhone} />
            </div>
          </Card>

          <Card title="Unit">
            {unit ? (
              <div>
                <div className="text-[14px] font-semibold text-slate-900">
                  {unit.addressLine1}
                </div>
                <div className="text-[12px] text-slate-500">{unit.addressLine2}</div>
                {agent && (
                  <div className="mt-3 rounded-lg bg-slate-50 p-3 text-[12px] text-slate-700">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">
                      Managing agent
                    </div>
                    <div className="font-medium">
                      {agent.firstName} {agent.lastName} · {agent.company}
                    </div>
                    <div className="text-slate-500">
                      {agent.email} · {agent.phone}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-slate-500">Unit not found.</div>
            )}
          </Card>

          <Card
            title="AC config"
            subtitle="What's on record vs what the customer chose"
          >
            <AcDiscrepancyBlock booking={booking} unit={unit} />
          </Card>

          <Card title="Notes">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={saveNotes}
              disabled={booking.isLive}
              rows={3}
              placeholder="Add internal notes for the technician or future bookings…"
              className="w-full rounded-lg border border-slate-200 bg-white p-3 text-[13px] text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
            />
            <div className="mt-1 text-[11px] text-slate-400">
              {booking.isLive
                ? "Live demo row — notes are read-only."
                : "Saves on blur (mockup only)."}
            </div>
          </Card>
        </div>

        {/* Right column: timelines */}
        <div className="flex flex-col gap-4">
          <Card title="Schedule">
            <SlotCell booking={booking} />
          </Card>
          <Card title="Payment timeline">
            <Timeline
              entries={booking.paymentTimeline}
              accent={booking.paymentStatus === "paid" ? "#16A34A" : BRAND}
            />
            <div className="mt-3">
              <PaymentChip status={booking.paymentStatus} />
            </div>
          </Card>
          <Card title="Service timeline">
            <Timeline entries={booking.serviceTimeline} accent={BRAND} />
            <div className="mt-3">
              <ServiceChip status={booking.serviceStatus} />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function nextStatusLabel(s: ServiceStatus): string {
  switch (s) {
    case "scheduled":
      return "Scheduled";
    case "en_route":
      return "En route";
    case "on_site":
      return "On site";
    case "complete":
      return "Complete";
    case "invoice_adjusted":
      return "Invoice adjusted";
  }
}

function AcDiscrepancyBlock({
  booking,
  unit,
}: {
  booking: AdminBooking;
  unit: AdminUnit | null;
}) {
  const recordedSummary = unit
    ? unit.ac.type === "unknown"
      ? "No record on file"
      : `${unit.ac.type} · ${unit.ac.systems} system${unit.ac.systems === 1 ? "" : "s"}${
          unit.ac.additional > 0 ? ` + ${unit.ac.additional} extra` : ""
        }`
    : "—";
  const customerSummary =
    booking.acType === "unsure"
      ? "Customer wasn't sure"
      : `${booking.acType} · ${booking.systems} system${booking.systems === 1 ? "" : "s"}${
          booking.additional > 0 ? ` + ${booking.additional} extra` : ""
        }`;
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="text-[10px] uppercase tracking-wider text-slate-500">
          On record
        </div>
        <div className="mt-1 text-[13px] font-medium capitalize text-slate-900">
          {recordedSummary}
        </div>
      </div>
      <div
        className="rounded-lg border p-3"
        style={
          booking.discrepancy
            ? { borderColor: BRAND, backgroundColor: BRAND_SOFT }
            : { borderColor: "#E2E8F0", backgroundColor: "#F8FAFC" }
        }
      >
        <div
          className="flex items-center justify-between text-[10px] uppercase tracking-wider"
          style={{ color: booking.discrepancy ? BRAND_DEEP : "#64748B" }}
        >
          <span>Customer chose</span>
          {booking.discrepancy && (
            <span className="inline-flex items-center gap-1 font-bold">
              <TriangleAlert className="h-2.5 w-2.5" />
              Mismatch
            </span>
          )}
        </div>
        <div
          className="mt-1 text-[13px] font-medium capitalize"
          style={{ color: booking.discrepancy ? BRAND_DEEP : "#0F172A" }}
        >
          {customerSummary}
        </div>
      </div>
      {booking.discrepancy && (
        <div
          className="col-span-2 rounded-lg border p-3 text-[12px]"
          style={{ borderColor: BRAND, backgroundColor: "white", color: BRAND_DEEP }}
        >
          <strong>Action:</strong> confirm head count on arrival and update the
          unit's AC record so future pre-fill is accurate.
        </div>
      )}
    </div>
  );
}

function Timeline({
  entries,
  accent,
}: {
  entries: { status: string; label: string; at: string; by: string }[];
  accent: string;
}) {
  if (entries.length === 0) {
    return <div className="text-[12px] text-slate-500">No events yet.</div>;
  }
  return (
    <ol className="flex flex-col gap-3">
      {entries.map((e, i) => (
        <li key={i} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span
              className="block h-2 w-2 rounded-full"
              style={{ backgroundColor: accent }}
            />
            {i < entries.length - 1 && (
              <span className="mt-0.5 flex-1 w-px bg-slate-200" />
            )}
          </div>
          <div className="-mt-0.5 flex-1 pb-1">
            <div className="text-[12px] font-medium text-slate-900">{e.label}</div>
            <div className="text-[11px] text-slate-500">
              {e.at} · {e.by}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

// ─── Slot calendar view ────────────────────────────────────────────────────

function SlotCalendar({
  calendar,
  setCalendar,
}: {
  calendar: AdminCalendarDay[];
  setCalendar: (next: AdminCalendarDay[]) => void;
}) {
  const [editingSlot, setEditingSlot] = useState<{
    dayIso: string;
    window: "morning" | "afternoon";
  } | null>(null);

  function toggleOpen(dayIso: string) {
    setCalendar(
      calendar.map((d) => (d.isoDate === dayIso ? { ...d, open: !d.open } : d)),
    );
  }

  function patchSlot(
    dayIso: string,
    window: "morning" | "afternoon",
    patch: Partial<AdminSlot>,
  ) {
    setCalendar(
      calendar.map((d) =>
        d.isoDate === dayIso
          ? { ...d, [window]: { ...d[window], ...patch } }
          : d,
      ),
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-[12px] text-slate-600">
        <div className="font-semibold text-slate-900">
          Two ways to run a window
        </div>
        <div className="mt-1.5 grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-slate-50 p-2.5">
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: BRAND }}
              />
              <strong className="text-slate-900">Time-based</strong>
            </div>
            <div className="mt-1 text-slate-600">
              Window has a wall-clock length (e.g. 8am–12pm). Each booking
              eats minutes based on how long the service takes. The window
              stays open for a customer until their job no longer fits.
            </div>
          </div>
          <div className="rounded-lg bg-slate-50 p-2.5">
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: "#3B82F6" }}
              />
              <strong className="text-slate-900">Count-based</strong>
            </div>
            <div className="mt-1 text-slate-600">
              Window has a fixed number of booking slots, regardless of
              how long each booking takes. One booking uses one slot.
              Window goes full when all slots are taken.
            </div>
          </div>
        </div>
        <div className="mt-2.5 text-slate-500">
          Customers only ever see "available" or "full" — the mode and the
          numbers below stay on this page.
        </div>
      </div>

      <div className="grid grid-cols-7 gap-3">
        {calendar.map((day) => (
          <div
            key={day.isoDate}
            className={`flex flex-col gap-2 rounded-xl border bg-white p-3 ${
              day.open ? "border-slate-200" : "border-slate-200 opacity-70"
            }`}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  {day.weekdayLabel} · {day.monthLabel}
                </div>
                <div className="text-[18px] font-semibold leading-tight text-slate-900">
                  {day.dayLabel}
                </div>
              </div>
              <button
                type="button"
                onClick={() => toggleOpen(day.isoDate)}
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  day.open ? "text-emerald-700" : "text-slate-500"
                }`}
                style={{ backgroundColor: day.open ? "#DCFCE7" : "#F1F5F9" }}
              >
                {day.open ? "Open" : "Closed"}
              </button>
            </div>
            <CalendarSlot
              slot={day.morning}
              label="Morning"
              onEdit={() =>
                setEditingSlot({ dayIso: day.isoDate, window: "morning" })
              }
              disabled={!day.open}
            />
            <CalendarSlot
              slot={day.afternoon}
              label="Afternoon"
              onEdit={() =>
                setEditingSlot({ dayIso: day.isoDate, window: "afternoon" })
              }
              disabled={!day.open}
            />
          </div>
        ))}
      </div>

      {editingSlot && (
        <SlotWindowEditor
          dayIso={editingSlot.dayIso}
          window={editingSlot.window}
          calendar={calendar}
          onPatch={(patch) =>
            patchSlot(editingSlot.dayIso, editingSlot.window, patch)
          }
          onClose={() => setEditingSlot(null)}
        />
      )}
    </div>
  );
}

function modeColor(mode: "time_based" | "count_based"): string {
  return mode === "count_based" ? "#3B82F6" : BRAND;
}

function CalendarSlot({
  slot,
  label,
  onEdit,
  disabled,
}: {
  slot: AdminSlot;
  label: string;
  onEdit: () => void;
  disabled: boolean;
}) {
  const isCount = slot.mode === "count_based";
  const fillPct = isCount
    ? Math.min(100, Math.round((slot.bookedCount / Math.max(slot.slotCount, 1)) * 100))
    : Math.min(100, Math.round((slot.bookedMinutes / slot.windowMinutes) * 100));
  const accent = disabled ? "#cbd5e1" : modeColor(slot.mode);
  const headlineLabel = isCount
    ? `${slot.bookedCount} / ${slot.slotCount} booked`
    : `${formatDurationMinutes(slot.bookedMinutes)} / ${formatDurationMinutes(slot.windowMinutes)}`;
  const subLabel = isCount ? "Count-based" : "Time-based";
  return (
    <div
      className={`rounded-lg border p-2 ${
        disabled ? "border-slate-200 bg-slate-50" : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1 text-[11px] font-medium text-slate-700">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: accent }}
          />
          {label}
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="text-[10px] font-semibold text-slate-500 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={disabled}
        >
          Edit
        </button>
      </div>
      <div className="mt-1 text-[11px] font-semibold text-slate-900">
        {headlineLabel}
      </div>
      <div className="text-[10px] text-slate-500">{subLabel}</div>
      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full"
          style={{ width: `${fillPct}%`, backgroundColor: accent }}
        />
      </div>
    </div>
  );
}

function SlotWindowEditor({
  dayIso,
  window: win,
  calendar,
  onPatch,
  onClose,
}: {
  dayIso: string;
  window: "morning" | "afternoon";
  calendar: AdminCalendarDay[];
  onPatch: (patch: Partial<AdminSlot>) => void;
  onClose: () => void;
}) {
  const day = calendar.find((d) => d.isoDate === dayIso);
  if (!day) return null;
  const slot = day[win];

  function setMode(nextMode: "time_based" | "count_based") {
    if (nextMode === slot.mode) return;
    onPatch({ mode: nextMode });
  }

  function setWindowMinutes(next: number) {
    const clamped = Math.max(60, Math.min(540, next));
    onPatch({
      windowMinutes: clamped,
      bookedMinutes: Math.min(slot.bookedMinutes, clamped),
    });
  }

  function setSlotCount(next: number) {
    const clamped = Math.max(1, Math.min(20, Math.round(next)));
    onPatch({
      slotCount: clamped,
      bookedCount: Math.min(slot.bookedCount, clamped),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-500">
              {day.weekdayLabel} {day.dayLabel} {day.monthLabel}
            </div>
            <div className="text-[16px] font-semibold capitalize text-slate-900">
              {win} window
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Mode toggle */}
        <div className="mt-4">
          <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
            How this window fills up
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <ModePill
              active={slot.mode === "time_based"}
              accent={modeColor("time_based")}
              title="Time-based"
              subtitle="Bookings eat minutes"
              onClick={() => setMode("time_based")}
            />
            <ModePill
              active={slot.mode === "count_based"}
              accent={modeColor("count_based")}
              title="Count-based"
              subtitle="Bookings eat slots"
              onClick={() => setMode("count_based")}
            />
          </div>
        </div>

        {slot.mode === "time_based" ? (
          <div className="mt-4">
            <label className="text-[12px] font-medium text-slate-700">
              Window length
            </label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="range"
                min={60}
                max={540}
                step={15}
                value={slot.windowMinutes}
                onChange={(e) => setWindowMinutes(Number(e.target.value))}
                className="flex-1"
                style={{ accentColor: BRAND }}
              />
              <div className="w-20 text-right text-[13px] font-semibold text-slate-900">
                {formatDurationMinutes(slot.windowMinutes)}
              </div>
            </div>
            <div className="mt-3 rounded-lg bg-slate-50 p-3 text-[12px] text-slate-600">
              Already booked:{" "}
              <strong>{formatDurationMinutes(slot.bookedMinutes)}</strong> (will
              be capped if you shrink the window).
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <label className="text-[12px] font-medium text-slate-700">
              Number of booking slots
            </label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="range"
                min={1}
                max={20}
                step={1}
                value={slot.slotCount}
                onChange={(e) => setSlotCount(Number(e.target.value))}
                className="flex-1"
                style={{ accentColor: "#3B82F6" }}
              />
              <input
                type="number"
                min={1}
                max={20}
                value={slot.slotCount}
                onChange={(e) => setSlotCount(Number(e.target.value))}
                className="w-16 rounded-md border border-slate-200 px-2 py-1 text-right text-[13px] font-semibold text-slate-900 focus:border-slate-400 focus:outline-none"
              />
            </div>
            <div className="mt-3 rounded-lg bg-slate-50 p-3 text-[12px] text-slate-600">
              Already booked: <strong>{slot.bookedCount}</strong> of{" "}
              <strong>{slot.slotCount}</strong> (will be capped if you shrink
              the count).
            </div>
            <div className="mt-2 text-[11px] text-slate-500">
              The wall-clock window is still {formatDurationMinutes(slot.windowMinutes)}{" "}
              — bookings just don't have to add up to it.
            </div>
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-[13px] font-semibold text-white"
            style={{ backgroundColor: BRAND }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function ModePill({
  active,
  accent,
  title,
  subtitle,
  onClick,
}: {
  active: boolean;
  accent: string;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-lg border p-2.5 text-left transition ${
        active ? "border-transparent text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      }`}
      style={active ? { backgroundColor: accent } : undefined}
    >
      <div className="text-[12px] font-semibold leading-tight">{title}</div>
      <div className={`mt-0.5 text-[10px] ${active ? "opacity-90" : "text-slate-500"}`}>
        {subtitle}
      </div>
    </button>
  );
}

// ─── Units view ────────────────────────────────────────────────────────────

function UnitsView({
  units,
  setUnits,
  agents,
}: {
  units: AdminUnit[];
  setUnits: (next: AdminUnit[]) => void;
  agents: AdminAgent[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);

  function saveUnit(next: AdminUnit) {
    setUnits(units.map((u) => (u.id === next.id ? next : u)));
    setEditingId(null);
  }

  function createUnit(next: AdminUnit) {
    setUnits([...units, next]);
    setCreating(false);
  }

  function downloadCsv(filename: string, body: string) {
    const blob = new Blob([body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 rounded-xl border border-slate-200 bg-white p-4 text-[12px] text-slate-600">
          Units carry the AC config <strong>on file</strong>. When a customer
          starts a booking, this is what pre-fills their AC step. Keeping
          these accurate reduces customer mismatches.
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() =>
              downloadCsv("taylr-units-template.csv", unitsCsvTemplate())
            }
            data-testid="button-units-template"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-4 w-4" />
            Download template
          </button>
          <button
            type="button"
            onClick={() =>
              downloadCsv(
                `taylr-units-${new Date().toISOString().slice(0, 10)}.csv`,
                formatUnitsCsv(units),
              )
            }
            data-testid="button-units-export"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-4 w-4" />
            Export current units
          </button>
          <button
            type="button"
            onClick={() => setImporting(true)}
            data-testid="button-units-import"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            <FileUp className="h-4 w-4" />
            Import CSV
          </button>
          <button
            type="button"
            onClick={() => setCreating(true)}
            data-testid="button-units-add"
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold text-white"
            style={{ backgroundColor: BRAND }}
          >
            <Plus className="h-4 w-4" />
            Add unit
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-[13px]">
          <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Address</th>
              <th className="px-4 py-3 font-semibold">AC type</th>
              <th className="px-4 py-3 font-semibold">Systems</th>
              <th className="px-4 py-3 font-semibold">Extras</th>
              <th className="px-4 py-3 font-semibold">Managing agent</th>
              <th className="px-4 py-3 font-semibold"></th>
            </tr>
          </thead>
          <tbody>
            {units.map((u) => {
              const agent = u.agentId ? agents.find((a) => a.id === u.agentId) ?? null : null;
              return (
                <tr key={u.id} className="border-b border-slate-100 last:border-b-0">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{u.addressLine1}</div>
                    <div className="text-[11px] text-slate-500">{u.addressLine2}</div>
                  </td>
                  <td className="px-4 py-3 capitalize">
                    {u.ac.type === "unknown" ? (
                      <span className="text-slate-500">No record</span>
                    ) : (
                      u.ac.type
                    )}
                  </td>
                  <td className="px-4 py-3">{u.ac.systems || "—"}</td>
                  <td className="px-4 py-3">{u.ac.additional || "—"}</td>
                  <td className="px-4 py-3">
                    {agent ? (
                      <div>
                        <div className="font-medium text-slate-900">
                          {agent.firstName} {agent.lastName}
                        </div>
                        <div className="text-[11px] text-slate-500">{agent.company}</div>
                      </div>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setEditingId(u.id)}
                      className="inline-flex items-center gap-1 text-[12px] font-semibold text-slate-600 hover:text-slate-900"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      Edit
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {(editingId || creating) && (
        <UnitEditor
          unit={
            editingId
              ? units.find((u) => u.id === editingId)!
              : {
                  id: `u${Date.now()}`,
                  addressLine1: "",
                  addressLine2: "",
                  ac: { type: "split", systems: 1, additional: 0 },
                  agentId: null,
                }
          }
          agents={agents}
          onSave={editingId ? saveUnit : createUnit}
          onCancel={() => {
            setEditingId(null);
            setCreating(false);
          }}
          isCreate={creating}
        />
      )}

      {importing && (
        <UnitsCsvImportModal
          units={units}
          agents={agents}
          onApply={(next) => {
            setUnits(next);
            setImporting(false);
          }}
          onClose={() => setImporting(false)}
        />
      )}
    </div>
  );
}

function UnitEditor({
  unit,
  agents,
  onSave,
  onCancel,
  isCreate,
}: {
  unit: AdminUnit;
  agents: AdminAgent[];
  onSave: (next: AdminUnit) => void;
  onCancel: () => void;
  isCreate: boolean;
}) {
  const [draft, setDraft] = useState<AdminUnit>(unit);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-500">
              {isCreate ? "New unit" : "Edit unit"}
            </div>
            <div className="text-[16px] font-semibold text-slate-900">
              AC config on file
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 flex flex-col gap-3">
          <FormField label="Address line 1">
            <input
              type="text"
              value={draft.addressLine1}
              onChange={(e) => setDraft({ ...draft, addressLine1: e.target.value })}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] focus:border-slate-400 focus:outline-none"
            />
          </FormField>
          <FormField label="Address line 2">
            <input
              type="text"
              value={draft.addressLine2}
              onChange={(e) => setDraft({ ...draft, addressLine2: e.target.value })}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] focus:border-slate-400 focus:outline-none"
            />
          </FormField>
          <div className="grid grid-cols-3 gap-3">
            <FormField label="AC type">
              <select
                value={draft.ac.type}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    ac: {
                      ...draft.ac,
                      type: e.target.value as AdminUnit["ac"]["type"],
                    },
                  })
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] focus:border-slate-400 focus:outline-none"
              >
                <option value="split">Split</option>
                <option value="ducted">Ducted</option>
                <option value="unknown">No record</option>
              </select>
            </FormField>
            <FormField label="Systems">
              <input
                type="number"
                min={0}
                max={10}
                value={draft.ac.systems}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    ac: { ...draft.ac, systems: Number(e.target.value) },
                  })
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] focus:border-slate-400 focus:outline-none"
              />
            </FormField>
            <FormField label="Extras">
              <input
                type="number"
                min={0}
                max={29}
                value={draft.ac.additional}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    ac: { ...draft.ac, additional: Number(e.target.value) },
                  })
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] focus:border-slate-400 focus:outline-none"
              />
            </FormField>
          </div>
          <FormField label="Managing agent">
            <select
              value={draft.agentId ?? ""}
              onChange={(e) =>
                setDraft({ ...draft, agentId: e.target.value || null })
              }
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] focus:border-slate-400 focus:outline-none"
            >
              <option value="">— Owner-managed —</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.firstName} {a.lastName} · {a.company}
                </option>
              ))}
            </select>
          </FormField>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave(draft)}
            disabled={!draft.addressLine1.trim()}
            className="rounded-lg px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: BRAND }}
          >
            {isCreate ? "Create" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Agents view ───────────────────────────────────────────────────────────

function AgentsView({
  agents,
  setAgents,
  units,
}: {
  agents: AdminAgent[];
  setAgents: (next: AdminAgent[]) => void;
  units: AdminUnit[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  function saveAgent(next: AdminAgent) {
    setAgents(agents.map((a) => (a.id === next.id ? next : a)));
    setEditingId(null);
  }

  function createAgent(next: AdminAgent) {
    setAgents([...agents, next]);
    setCreating(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-[12px] text-slate-600">
          Agents are the leasing contacts on file. They show up on the
          customer-side dropdown when a booker says they're an agent. Each
          agent can be associated with one or more units they manage.
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold text-white"
          style={{ backgroundColor: BRAND }}
        >
          <Plus className="h-4 w-4" />
          Add agent
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-[13px]">
          <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Agent</th>
              <th className="px-4 py-3 font-semibold">Company</th>
              <th className="px-4 py-3 font-semibold">Contact</th>
              <th className="px-4 py-3 font-semibold">Units managed</th>
              <th className="px-4 py-3 font-semibold"></th>
            </tr>
          </thead>
          <tbody>
            {agents.map((a) => (
              <tr key={a.id} className="border-b border-slate-100 last:border-b-0">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-700">
                      {a.firstName[0]}
                      {a.lastName[0]}
                    </div>
                    <div className="font-medium text-slate-900">
                      {a.firstName} {a.lastName}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">{a.company}</td>
                <td className="px-4 py-3">
                  <div className="text-[12px] text-slate-700">{a.email}</div>
                  <div className="text-[11px] text-slate-500">{a.phone}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {a.unitIds.length === 0 ? (
                      <span className="text-slate-500">—</span>
                    ) : (
                      a.unitIds.map((uid) => {
                        const u = units.find((x) => x.id === uid) ?? null;
                        return (
                          <span
                            key={uid}
                            className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-700"
                          >
                            {u?.addressLine1 ?? uid}
                          </span>
                        );
                      })
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => setEditingId(a.id)}
                    className="inline-flex items-center gap-1 text-[12px] font-semibold text-slate-600 hover:text-slate-900"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(editingId || creating) && (
        <AgentEditor
          agent={
            editingId
              ? agents.find((a) => a.id === editingId)!
              : {
                  id: `ag-${Date.now()}`,
                  firstName: "",
                  lastName: "",
                  company: "",
                  email: "",
                  phone: "",
                  unitIds: [],
                }
          }
          units={units}
          onSave={editingId ? saveAgent : createAgent}
          onCancel={() => {
            setEditingId(null);
            setCreating(false);
          }}
          isCreate={creating}
        />
      )}
    </div>
  );
}

function AgentEditor({
  agent,
  units,
  onSave,
  onCancel,
  isCreate,
}: {
  agent: AdminAgent;
  units: AdminUnit[];
  onSave: (next: AdminAgent) => void;
  onCancel: () => void;
  isCreate: boolean;
}) {
  const [draft, setDraft] = useState<AdminAgent>(agent);

  function toggleUnit(uid: string) {
    setDraft((d) =>
      d.unitIds.includes(uid)
        ? { ...d, unitIds: d.unitIds.filter((x) => x !== uid) }
        : { ...d, unitIds: [...d.unitIds, uid] },
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-500">
              {isCreate ? "New agent" : "Edit agent"}
            </div>
            <div className="text-[16px] font-semibold text-slate-900">
              Agent contact + assigned units
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="First name">
              <input
                type="text"
                value={draft.firstName}
                onChange={(e) => setDraft({ ...draft, firstName: e.target.value })}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] focus:border-slate-400 focus:outline-none"
              />
            </FormField>
            <FormField label="Last name">
              <input
                type="text"
                value={draft.lastName}
                onChange={(e) => setDraft({ ...draft, lastName: e.target.value })}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] focus:border-slate-400 focus:outline-none"
              />
            </FormField>
          </div>
          <FormField label="Company">
            <input
              type="text"
              value={draft.company}
              onChange={(e) => setDraft({ ...draft, company: e.target.value })}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] focus:border-slate-400 focus:outline-none"
            />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Email">
              <input
                type="email"
                value={draft.email}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] focus:border-slate-400 focus:outline-none"
              />
            </FormField>
            <FormField label="Phone">
              <input
                type="tel"
                value={draft.phone}
                onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] focus:border-slate-400 focus:outline-none"
              />
            </FormField>
          </div>
          <FormField label="Units managed">
            <div className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-white p-2 max-h-40 overflow-y-auto">
              {units.map((u) => {
                const checked = draft.unitIds.includes(u.id);
                return (
                  <label
                    key={u.id}
                    className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleUnit(u.id)}
                      className="mt-0.5"
                      style={{ accentColor: BRAND }}
                    />
                    <div className="flex-1 leading-tight">
                      <div className="text-[12px] font-medium text-slate-900">
                        {u.addressLine1}
                      </div>
                      <div className="text-[11px] text-slate-500">{u.addressLine2}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          </FormField>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave(draft)}
            disabled={
              !draft.firstName.trim() || !draft.lastName.trim() || !draft.company.trim()
            }
            className="rounded-lg px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: BRAND }}
          >
            {isCreate ? "Create" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Shared atoms ──────────────────────────────────────────────────────────

function Card({
  title,
  subtitle,
  children,
}: {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      {(title || subtitle) && (
        <div className="mb-3">
          {title && (
            <div className="text-[14px] font-semibold text-slate-900">{title}</div>
          )}
          {subtitle && <div className="text-[11px] text-slate-500">{subtitle}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-[13px] font-medium text-slate-900">{value}</div>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-500">
        {label}
      </label>
      {children}
    </div>
  );
}
