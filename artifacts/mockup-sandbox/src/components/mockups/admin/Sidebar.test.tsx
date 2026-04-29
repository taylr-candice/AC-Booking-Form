// @vitest-environment happy-dom

/**
 * Tests for the sidebar invoice-void badge.
 *
 * The dashboard banner ({@link InvoiceVoidAlerts}) only renders at the
 * top of the Bookings and Payments views, so an admin spending their
 * day in Awaiting coordination, Buildings, Rollouts, or Units would
 * never see outstanding voids. The sidebar badge surfaces the same
 * queue from any view.
 *
 * The badge must:
 *  - render only when the count is > 0 (no zero pills cluttering the rail)
 *  - render on both Bookings and Payments (the banner lives on both)
 *  - reuse the same selector as the banner so the count and the
 *    banner list never drift apart
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { AdminBooking } from "@/state/adminMockData";

import { selectPendingInvoiceVoids } from "./InvoiceVoidAlerts";
import { Sidebar } from "./Sidebar";

afterEach(() => {
  cleanup();
});

function bookingWithSupersede(
  id: string,
  supersededByBookingId: string | undefined,
): AdminBooking {
  return {
    id,
    unitId: "u-1",
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
    serviceStatus: supersededByBookingId ? "cancelled" : "scheduled",
    totalAud: 179,
    paymentTimeline: [],
    serviceTimeline: [],
    notes: "",
    rolloutId: null,
    createdAt: "2026-04-26T09:14:00+10:00",
    cancelledAt: supersededByBookingId ? "Just now" : undefined,
    cancelledBy: supersededByBookingId ? "System" : undefined,
    cancellationNote: supersededByBookingId
      ? `Superseded by paid booking ${supersededByBookingId}`
      : undefined,
    supersededByBookingId,
    lastContactedAt: null,
  };
}

describe("Sidebar invoice-void badge", () => {
  it("renders no badges when no view has a count", () => {
    render(<Sidebar activeView="bookings" onNav={() => {}} />);
    expect(screen.queryAllByTestId("sidebar-badge")).toHaveLength(0);
  });

  it("hides the badge when the count is zero", () => {
    render(
      <Sidebar
        activeView="bookings"
        onNav={() => {}}
        badges={{ bookings: 0, payments: 0 }}
      />,
    );
    expect(screen.queryAllByTestId("sidebar-badge")).toHaveLength(0);
  });

  it("renders a pink count badge on each view that has a positive count", () => {
    render(
      <Sidebar
        activeView="awaiting_coordination"
        onNav={() => {}}
        badges={{ bookings: 3, payments: 3 }}
      />,
    );
    const badges = screen.getAllByTestId("sidebar-badge");
    expect(badges).toHaveLength(2);
    const byView = Object.fromEntries(
      badges.map((b) => [b.getAttribute("data-view"), b.textContent]),
    );
    expect(byView.bookings).toBe("3");
    expect(byView.payments).toBe("3");
  });

  it("uses the same selector that drives the dashboard banner", () => {
    // Two superseded + one clean → selector should return the two.
    const bookings: AdminBooking[] = [
      bookingWithSupersede("bk-1", "bk-paid-a"),
      bookingWithSupersede("bk-2", undefined),
      bookingWithSupersede("bk-3", "bk-paid-b"),
    ];
    const pending = selectPendingInvoiceVoids(bookings);
    expect(pending.map((b) => b.id)).toEqual(["bk-1", "bk-3"]);

    render(
      <Sidebar
        activeView="rollouts"
        onNav={() => {}}
        badges={{ bookings: pending.length, payments: pending.length }}
      />,
    );
    const badge = screen
      .getAllByTestId("sidebar-badge")
      .find((b) => b.getAttribute("data-view") === "bookings");
    expect(badge?.textContent).toBe("2");
  });
});
