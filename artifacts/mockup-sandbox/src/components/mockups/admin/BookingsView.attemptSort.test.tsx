// @vitest-environment happy-dom

/**
 * Regression test for the "Last attempt" sort affordance on the main
 * bookings list. The Awaiting-coordination queue already prioritises
 * stale touches in its composite sort, but the broader bookings list
 * previously had no equivalent — so a freshly emailed-in customer
 * sat wherever their `createdAt` happened to put them. Surfacing
 * "stalest first" / "freshest first" here lets a team lead float
 * the rows that need attention to the top in one click.
 *
 * The covered cases are the three the task brief calls out plus a
 * "freshest first" check, so we exercise both directions and the
 * never-touched pinning rule together:
 *
 *   - never-touched row stays last in BOTH sort directions (no
 *     recency signal to compare it by, so it shouldn't be sorted in
 *     amongst rows that DO have a touch)
 *   - recent touch + stale touch order correctly under both modes
 *   - default sort leaves the upstream order untouched (so existing
 *     callers and tests don't see surprise reorderings)
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type {
  AdminBooking,
  AdminBuilding,
  AdminUnit,
  TimelineEntry,
} from "@/state/adminMockData";

import { BookingsView } from "./BookingsView";

afterEach(cleanup);

function makeBuildings(): AdminBuilding[] {
  return [
    {
      id: "bldg-test",
      name: "Test Tower",
      addressLine1: "1 Test St",
      addressLine2: "Suburb NSW 2000",
    },
  ];
}

function makeUnits(): AdminUnit[] {
  return [
    {
      id: "u1",
      addressLine1: "1 / 1 Test St",
      addressLine2: "Suburb NSW 2000",
      ac: { type: "split", systems: 1, additional: 0 },
      agentId: null,
      buildingId: "bldg-test",
    },
  ];
}

function makeBooking(overrides: Partial<AdminBooking>): AdminBooking {
  return {
    id: "bk-x",
    unitId: "u1",
    customerName: "Test Customer",
    customerEmail: "test@example.com",
    customerPhone: "0411 000 000",
    bookerRole: "owner",
    bookerAgencyId: null,
    bookerAgencyOtherName: "",
    accessMethod: "owner_live_at_unit",
    tenants: [],
    systems: 1,
    additional: 0,
    acType: "split",
    discrepancy: null,
    serviceDate: "2026-05-10",
    serviceSlot: "morning",
    paymentStatus: "paid",
    serviceStatus: "scheduled",
    totalAud: 199,
    paymentTimeline: [],
    serviceTimeline: [],
    notes: "",
    rolloutId: null,
    createdAt: "2026-04-20T09:00:00+10:00",
    lastContactedAt: null,
    ...overrides,
  };
}

function callAt(loggedAtIso: string): TimelineEntry[] {
  return [
    {
      kind: "call",
      status: "logged_call",
      label: "Logged call · Spoke to them",
      at: "Just now",
      by: "Mia (admin)",
      loggedAt: loggedAtIso,
    },
  ];
}

function renderViewWith(bookings: AdminBooking[]) {
  return render(
    <BookingsView
      bookings={bookings}
      units={makeUnits()}
      buildings={makeBuildings()}
      statusFilter="all"
      onStatusFilter={() => {}}
      buildingFilter="all"
      onBuildingFilter={() => {}}
      search=""
      onSearch={() => {}}
      onOpen={() => {}}
      onNewBooking={() => {}}
      paymentMode={false}
      onAcknowledgeSupersede={() => {}}
    />,
  );
}

/** Read the visible booking IDs in row order from the rendered table. */
function visibleBookingIds(): string[] {
  // Each row's aria-label is `Open booking ${b.id} for ${b.customerName}`,
  // so the booking id is the third whitespace-separated token. Pulling
  // them out this way is more robust than scraping cell text (which
  // can change as columns are added) and the labels themselves are
  // already part of the row's a11y contract.
  return screen
    .getAllByRole("button", { name: /^Open booking/ })
    .map((row) => {
      const label = row.getAttribute("aria-label") ?? "";
      return label.split(" ")[2] ?? "";
    });
}

describe("BookingsView 'Last attempt' sort", () => {
  // Three bookings deliberately seeded in the OPPOSITE order to what
  // either sort mode would produce, so a default-render assertion can
  // prove the upstream order is preserved before we change the
  // dropdown.
  const bookings: AdminBooking[] = [
    makeBooking({
      id: "bk-fresh",
      // ~1h ago — the freshest of the three.
      serviceTimeline: callAt(new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString()),
    }),
    makeBooking({
      id: "bk-never",
      // No call/email entries — never been touched.
      serviceTimeline: [],
    }),
    makeBooking({
      id: "bk-stale",
      // ~5 days ago — the stalest of the three.
      serviceTimeline: callAt(
        new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      ),
    }),
  ];

  it("preserves the upstream order while the sort is in its default mode", () => {
    renderViewWith(bookings);
    expect(visibleBookingIds()).toEqual(["bk-fresh", "bk-never", "bk-stale"]);
  });

  it("floats the stalest touch to the top and pins never-touched rows last", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    renderViewWith(bookings);

    await user.selectOptions(
      screen.getByTestId("bookings-sort-last-attempt"),
      "stalest_first",
    );

    // Stale (5 days) → fresh (1h) → never-touched at the bottom.
    expect(visibleBookingIds()).toEqual(["bk-stale", "bk-fresh", "bk-never"]);
  });

  it("floats the freshest touch to the top and still pins never-touched rows last", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    renderViewWith(bookings);

    await user.selectOptions(
      screen.getByTestId("bookings-sort-last-attempt"),
      "freshest_first",
    );

    // Fresh (1h) → stale (5 days) → never-touched still last (no
    // recency signal to compare it by, so it can't legitimately
    // claim either end of the order).
    expect(visibleBookingIds()).toEqual(["bk-fresh", "bk-stale", "bk-never"]);
  });
});
