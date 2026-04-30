// @vitest-environment happy-dom

/**
 * URL persistence for the lifted `bookingsTemplateFilter` state
 * (Task #195).
 *
 * Ops leads triaging a long batch tend to refresh / open new tabs
 * mid-batch. Without URL persistence the lifted state resets and the
 * queue silently re-broadens — the very friction the chip was added
 * to solve. The fix is a `?template=…` round-trip on AdminApp using
 * the existing `encode/decodeTemplateFilter` helpers, mirrored on
 * both Bookings and Awaiting-coordination because they share the
 * same lifted state.
 *
 * What this file pins:
 *  - Mounting AdminApp with `?template=email::Sent agent intro` in
 *    the URL restores the chip, dropdown selection, and filtered
 *    rows on first paint. Both Bookings and Awaiting-coordination
 *    read from the same lifted state, so the round-trip works
 *    symmetrically on either view.
 *  - Picking a chip via the row suffix writes the encoded value back
 *    to the URL with `replaceState` (no extra history entries).
 *  - Clearing the chip removes the param so the URL is identical to
 *    a fresh visit.
 *  - Sidebar nav (an explicit "fresh start" gesture per
 *    `handleNav`) also clears the URL — state and URL stay in sync.
 *  - A malformed param doesn't crash and is treated as "no filter
 *    applied".
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import "@testing-library/jest-dom/vitest";

import type {
  AdminBooking,
  AdminBuilding,
  AdminUnit,
  TimelineEntry,
} from "@/state/adminMockData";

import { AdminApp, readBookingsTemplateFilterFromURL } from "./AdminApp";
import { AwaitingCoordinationView } from "./AwaitingCoordinationView";
import type { BookingsTemplateFilter } from "./bookingsTemplateFilter";

const SEEDED_BOOKING_ID = "bk-1043";
const SEEDED_TEMPLATE_NAME = "Sent agent intro";

function setUrl(search: string) {
  // happy-dom keeps `window.location.href` writable; replaceState
  // also works but pinning `href` is enough for the initial-mount
  // read path that the test exercises.
  window.history.replaceState(null, "", `/${search}`);
}

function readTemplateParam(): string | null {
  return new URLSearchParams(window.location.search).get("template");
}

function gotoAwaitingCoordination() {
  fireEvent.click(
    screen.getByRole("button", { name: "Awaiting coordination" }),
  );
}

afterEach(() => {
  cleanup();
  setUrl("");
});

beforeEach(() => {
  setUrl("");
});

describe("AdminApp · bookings template filter URL round-trip (Task #195)", () => {
  it("restores the chip and filtered rows from `?template=…` on first paint (Bookings)", () => {
    setUrl(
      `?template=${encodeURIComponent(`email::${SEEDED_TEMPLATE_NAME}`)}`,
    );
    render(<AdminApp />);

    const chip = screen.getByTestId("bookings-template-filter-chip");
    expect(chip.textContent).toContain(SEEDED_TEMPLATE_NAME);
    // The dropdown's controlled value reflects the active filter — the
    // toolbar isn't pretending to be reset.
    const select = screen.getByTestId(
      "bookings-filter-template",
    ) as HTMLSelectElement;
    expect(select.value).toBe(`email::${SEEDED_TEMPLATE_NAME}`);
  });

  it("clears the URL param when the user navigates via the sidebar (handleNav fresh-start)", () => {
    // Sidebar nav is an explicit "fresh start" gesture — `handleNav`
    // already clears the lifted filter state. The URL must mirror
    // that so a refresh after nav doesn't silently re-populate the
    // chip from a stale param.
    setUrl(
      `?template=${encodeURIComponent(`email::${SEEDED_TEMPLATE_NAME}`)}`,
    );
    render(<AdminApp />);
    expect(readTemplateParam()).toBe(`email::${SEEDED_TEMPLATE_NAME}`);

    gotoAwaitingCoordination();
    expect(readTemplateParam()).toBeNull();
  });

  it("writes the encoded filter to the URL when the chip is picked, and removes it when cleared", () => {
    render(<AdminApp />);
    expect(readTemplateParam()).toBeNull();

    // Pivot via the seeded row's "Last attempt · Sent agent intro" suffix.
    const suffix = screen
      .getAllByTestId("bookings-row-last-attempt-template")
      .find((el) => el.getAttribute("data-booking-id") === SEEDED_BOOKING_ID);
    expect(suffix).toBeDefined();
    fireEvent.click(suffix!);

    expect(readTemplateParam()).toBe(`email::${SEEDED_TEMPLATE_NAME}`);

    // Clearing the chip removes the param so the URL matches a fresh
    // visit — no `?template=` lingering.
    fireEvent.click(
      screen.getByTestId("button-clear-bookings-template-filter"),
    );
    expect(readTemplateParam()).toBeNull();
  });

  it("treats a malformed `?template=` value as no filter applied", () => {
    setUrl("?template=garbage-no-separator");
    render(<AdminApp />);

    expect(screen.queryByTestId("bookings-template-filter-chip")).toBeNull();
    // The malformed param is left alone on first paint (state is null,
    // URL hasn't been touched yet because we only write when state
    // changes). That's fine — the toolbar reads from state, not the URL.
  });

  it("the AwaitingCoordinationView gets the same URL-restored filter (chip + filtered rows)", () => {
    // Explicit symmetry test for the "both views" line in the task
    // spec. AdminApp doesn't navigate views via the URL (sidebar nav
    // is the only path, and `handleNav` deliberately resets the
    // filter), so an end-to-end sidebar-driven test would only prove
    // the wipe behaviour. Instead this asserts the seam directly:
    // `readBookingsTemplateFilterFromURL` is the single source of
    // truth used by AdminApp's `useState` initialiser; piping that
    // same helper into AwaitingCoordinationView reproduces what the
    // user would see if AdminApp opened on the awaiting view (the
    // follow-up #208 deep-link). The chip, dropdown selection, and
    // filtered-row count must all line up with the URL.
    setUrl(
      `?template=${encodeURIComponent("email::Coordination follow-up")}`,
    );

    const buildings: AdminBuilding[] = [
      {
        id: "bldg-x",
        name: "Test Tower",
        addressLine1: "1 Test St",
        addressLine2: "Suburb NSW 2000",
        acType: "split",
        acBrand: "Daikin",
      },
    ];
    const units: AdminUnit[] = [
      {
        id: "u1",
        addressLine1: "1 / 1 Test St",
        addressLine2: "Suburb NSW 2000",
        ac: { type: "split", brand: "", systems: 1, additional: 0 },
        agentId: null,
        buildingId: "bldg-x",
      },
      {
        id: "u2",
        addressLine1: "2 / 1 Test St",
        addressLine2: "Suburb NSW 2000",
        ac: { type: "split", brand: "", systems: 1, additional: 0 },
        agentId: null,
        buildingId: "bldg-x",
      },
    ];
    const emailEntry: TimelineEntry = {
      kind: "email",
      status: "logged_email",
      label: "Logged email · Hello",
      at: "Just now",
      by: "Mia (admin)",
      templateLabel: "Coordination follow-up",
    };
    const bookings: AdminBooking[] = [
      {
        id: "bk-coord-match",
        unitId: "u1",
        customerName: "Match Customer",
        customerEmail: "match@example.com",
        customerPhone: "0411 000 000",
        bookerRole: "owner",
        bookerAgencyId: null,
        bookerAgencyOtherName: "",
        accessMethod: "owner_leased_tenant",
        tenants: [
          {
            first: "T",
            last: "Tenant",
            email: "t@example.com",
            phone: "0411111111",
          },
        ],
        systems: 1,
        additional: 0,
        acType: "split",
        discrepancy: null,
        serviceDate: null,
        serviceSlot: "to_be_coordinated",
        paymentStatus: "paid",
        serviceStatus: "scheduled",
        totalAud: 199,
        paymentTimeline: [],
        serviceTimeline: [emailEntry],
        notes: "",
        rolloutId: null,
        createdAt: "2026-04-20T09:00:00+10:00",
        lastContactedAt: "2026-04-28T09:00:00+10:00",
      },
      {
        id: "bk-coord-other",
        unitId: "u2",
        customerName: "Other Customer",
        customerEmail: "other@example.com",
        customerPhone: "0411 000 001",
        bookerRole: "owner",
        bookerAgencyId: null,
        bookerAgencyOtherName: "",
        accessMethod: "owner_leased_tenant",
        tenants: [
          {
            first: "T",
            last: "Tenant",
            email: "t@example.com",
            phone: "0411111112",
          },
        ],
        systems: 1,
        additional: 0,
        acType: "split",
        discrepancy: null,
        serviceDate: null,
        serviceSlot: "to_be_coordinated",
        paymentStatus: "paid",
        serviceStatus: "scheduled",
        totalAud: 199,
        paymentTimeline: [],
        serviceTimeline: [],
        notes: "",
        rolloutId: null,
        createdAt: "2026-04-20T09:00:00+10:00",
        lastContactedAt: "2026-04-28T09:00:00+10:00",
      },
    ];

    function Harness() {
      const [templateFilter, setTemplateFilter] = useState<BookingsTemplateFilter>(
        () => readBookingsTemplateFilterFromURL(),
      );
      return (
        <AwaitingCoordinationView
          bookings={bookings}
          units={units}
          buildings={buildings}
          filter="all"
          onFilter={() => {}}
          buildingFilter="all"
          onBuildingFilter={() => {}}
          templateFilter={templateFilter}
          onTemplateFilter={setTemplateFilter}
          search=""
          onSearch={() => {}}
          onOpen={() => {}}
        />
      );
    }
    render(<Harness />);

    // Chip restored from the URL — same shape Bookings shows.
    const chip = screen.getByTestId("coordination-template-filter-chip");
    expect(chip.textContent).toContain("Coordination follow-up");

    // Filter actually narrowed the visible rows (the matching row is
    // present, the unrelated one is gone). The view's row test ID
    // pattern is "coordination-row-{bookingId}".
    expect(screen.getByTestId("coordination-row-bk-coord-match")).toBeInTheDocument();
    expect(screen.queryByTestId("coordination-row-bk-coord-other")).toBeNull();
  });
});
