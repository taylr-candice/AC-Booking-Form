// @vitest-environment happy-dom

/**
 * Tests for the "invoices need cancelling" dashboard surface.
 *
 * Two surfaces:
 *
 * 1. {@link InvoiceVoidAlerts} — the banner at the top of the Bookings
 *    and Payments views. Should appear iff at least one booking still
 *    has `supersededByBookingId` set, list each one with quick "Open"
 *    + "Record void" actions, and disappear when the queue is empty.
 *
 * 2. The "Record invoice void" alert on {@link BookingDetail} that an
 *    admin lands on after clicking through from the banner. Should
 *    show when `supersededByBookingId` is set, hide when it isn't,
 *    and call back so AdminApp can stamp the timeline + clear the
 *    flag.
 *
 * These two surfaces together close the loop the task spelled out:
 * admins see superseded invoices on the dashboard (not just a hidden
 * pill on a hidden cancelled row), can jump to the affected booking,
 * and can record the void in one click — at which point the row
 * drops off the list.
 */

import {
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  AdminAgent,
  AdminBooking,
  AdminBuilding,
  AdminUnit,
} from "@/state/adminMockData";

import { BookingDetail } from "./BookingDetail";
import { BookingsView } from "./BookingsView";

afterEach(() => {
  cleanup();
});

const UNIT: AdminUnit = {
  id: "u-test-1",
  addressLine1: "G01 / 1 Test Street",
  addressLine2: "Testville NSW 2000",
  ac: { type: "split", systems: 1, additional: 0 },
  agentId: null,
  buildingId: "bldg-test",
};

const BUILDING: AdminBuilding = {
  id: "bldg-test",
  name: "Test Building",
  addressLine1: "1 Test Street",
  addressLine2: "Testville NSW 2000",
};

const AGENTS: AdminAgent[] = [];

function makeBooking(overrides: Partial<AdminBooking> = {}): AdminBooking {
  return {
    id: "bk-9001",
    unitId: UNIT.id,
    customerName: "Pat Customer",
    customerEmail: "pat@example.com",
    customerPhone: "0400 000 000",
    bookerRole: "owner",
    bookerAgencyId: null,
    bookerAgencyOtherName: "",
    accessMethod: "owner_live_at_unit",
    tenants: [],
    systems: 1,
    additional: 0,
    acType: "split",
    discrepancy: null,
    serviceDate: null,
    serviceSlot: null,
    paymentStatus: "pending",
    serviceStatus: "cancelled",
    totalAud: 179,
    paymentTimeline: [],
    serviceTimeline: [],
    notes: "",
    rolloutId: null,
    createdAt: "2026-04-26T09:14:00+10:00",
    cancelledAt: "Just now",
    cancelledBy: "System",
    cancellationNote: "Superseded by paid booking bk-9999",
    supersededByBookingId: "bk-9999",
    lastContactedAt: null,
    ...overrides,
  };
}

function renderBookingsView(
  bookings: AdminBooking[],
  handlers: Partial<React.ComponentProps<typeof BookingsView>> = {},
) {
  const noop = () => {};
  return render(
    <BookingsView
      bookings={bookings}
      units={[UNIT]}
      buildings={[BUILDING]}
      statusFilter="all"
      onStatusFilter={noop}
      buildingFilter="all"
      onBuildingFilter={noop}
      search=""
      onSearch={noop}
      onOpen={noop}
      onNewBooking={noop}
      paymentMode={false}
      onAcknowledgeSupersede={noop}
      {...handlers}
    />,
  );
}

describe("Invoice void dashboard banner", () => {
  it("does not render when no bookings need voiding", () => {
    renderBookingsView([
      makeBooking({
        id: "bk-clean",
        supersededByBookingId: undefined,
        serviceStatus: "scheduled",
        cancelledAt: undefined,
        cancelledBy: undefined,
        cancellationNote: undefined,
      }),
    ]);
    expect(screen.queryByTestId("banner-invoice-voids")).toBeNull();
  });

  it("lists every booking with supersededByBookingId still set, with the right pluralisation", () => {
    renderBookingsView([
      makeBooking({ id: "bk-9001", supersededByBookingId: "bk-9999" }),
      makeBooking({
        id: "bk-9002",
        supersededByBookingId: "bk-9998",
        unitId: UNIT.id,
      }),
    ]);
    const banner = screen.getByTestId("banner-invoice-voids");
    // Pluralised headline.
    expect(banner.textContent).toContain("2 invoices need cancelling");
    // Each row exposes a stable testid + data-booking-id so e2e and
    // future tests can target them precisely.
    const rows = screen.getAllByTestId("banner-invoice-row");
    expect(rows.map((r) => r.getAttribute("data-booking-id"))).toEqual([
      "bk-9001",
      "bk-9002",
    ]);
  });

  it("shows even when the per-row pill is hidden by the 'Show cancelled' toggle (cancelled rows hidden by default)", () => {
    // The seeded list filter hides cancelled rows by default — that's
    // exactly what made superseded invoices invisible before. The
    // banner must surface them anyway.
    renderBookingsView([makeBooking()]);
    expect(screen.getByTestId("banner-invoice-voids")).toBeTruthy();
    // Confirm the cancelled row itself is hidden — i.e. without the
    // banner the admin would see nothing.
    expect(screen.queryByTestId("pill-supersede")).toBeNull();
  });

  it("'Open' invokes onOpen with the booking id; 'Record void' invokes onAcknowledge", () => {
    const onOpen = vi.fn();
    const onAcknowledge = vi.fn();
    renderBookingsView([makeBooking()], {
      onOpen,
      onAcknowledgeSupersede: onAcknowledge,
    });
    fireEvent.click(screen.getByTestId("banner-open"));
    expect(onOpen).toHaveBeenCalledWith("bk-9001");
    fireEvent.click(screen.getByTestId("banner-acknowledge"));
    expect(onAcknowledge).toHaveBeenCalledWith("bk-9001");
  });
});

describe("BookingDetail supersede alert", () => {
  function renderDetail(
    booking: AdminBooking,
    handlers: Partial<React.ComponentProps<typeof BookingDetail>> = {},
  ) {
    const noop = () => {};
    return render(
      <BookingDetail
        bookingId={booking.id}
        bookings={[booking]}
        units={[UNIT]}
        agents={AGENTS}
        onBack={noop}
        onUpdate={noop}
        onCancelBooking={noop}
        {...handlers}
      />,
    );
  }

  it("hides the alert when supersededByBookingId is not set", () => {
    renderDetail(
      makeBooking({
        supersededByBookingId: undefined,
        serviceStatus: "scheduled",
      }),
      { onAcknowledgeSupersede: () => {} },
    );
    expect(screen.queryByTestId("alert-supersede")).toBeNull();
  });

  it("shows the alert with the winning booking id and outstanding amount", () => {
    renderDetail(
      makeBooking({ supersededByBookingId: "bk-9999", totalAud: 218 }),
      { onAcknowledgeSupersede: () => {} },
    );
    const alert = screen.getByTestId("alert-supersede");
    expect(alert.textContent).toContain("bk-9999");
    expect(alert.textContent).toContain("$218.00");
  });

  it("'Record invoice void' invokes onAcknowledgeSupersede with the booking id", () => {
    const onAcknowledgeSupersede = vi.fn();
    renderDetail(makeBooking(), { onAcknowledgeSupersede });
    fireEvent.click(screen.getByTestId("alert-supersede-acknowledge"));
    expect(onAcknowledgeSupersede).toHaveBeenCalledWith("bk-9001");
  });
});
