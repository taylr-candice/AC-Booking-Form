// @vitest-environment happy-dom

/**
 * Outcome chip filter on the Awaiting-coordination toolbar.
 *
 * Each chip narrows the queue to the rows whose most recent
 * `kind: "call" | "email"` timeline entry matches the chip's
 * outcome — or to rows with no logged attempts at all when
 * "Never logged" is picked.
 *
 * Composes with the existing waiting-on chip, building filter, and
 * search so a team lead can drill in without losing the rest of
 * their context.
 */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import type {
  AdminBooking,
  AdminBuilding,
  AdminUnit,
  TimelineEntry,
} from "@/state/adminMockData";

import { AwaitingCoordinationView } from "./AwaitingCoordinationView";

afterEach(cleanup);

function makeBuildings(): AdminBuilding[] {
  return [
    {
      id: "bldg-a",
      name: "Tower A",
      addressLine1: "1 A St",
      addressLine2: "Suburb NSW 2000",
    },
    {
      id: "bldg-b",
      name: "Tower B",
      addressLine1: "2 B St",
      addressLine2: "Suburb NSW 2000",
    },
  ];
}

function makeUnits(): AdminUnit[] {
  return [
    {
      id: "u-a1",
      addressLine1: "1 / 1 A St",
      addressLine2: "Suburb NSW 2000",
      ac: { type: "split", systems: 1, additional: 0 },
      agentId: null,
      buildingId: "bldg-a",
    },
    {
      id: "u-a2",
      addressLine1: "2 / 1 A St",
      addressLine2: "Suburb NSW 2000",
      ac: { type: "split", systems: 1, additional: 0 },
      agentId: null,
      buildingId: "bldg-a",
    },
    {
      id: "u-a3",
      addressLine1: "3 / 1 A St",
      addressLine2: "Suburb NSW 2000",
      ac: { type: "split", systems: 1, additional: 0 },
      agentId: null,
      buildingId: "bldg-a",
    },
    {
      id: "u-a4",
      addressLine1: "4 / 1 A St",
      addressLine2: "Suburb NSW 2000",
      ac: { type: "split", systems: 1, additional: 0 },
      agentId: null,
      buildingId: "bldg-a",
    },
    {
      id: "u-a5",
      addressLine1: "5 / 1 A St",
      addressLine2: "Suburb NSW 2000",
      ac: { type: "split", systems: 1, additional: 0 },
      agentId: null,
      buildingId: "bldg-a",
    },
    {
      id: "u-b1",
      addressLine1: "1 / 2 B St",
      addressLine2: "Suburb NSW 2000",
      ac: { type: "split", systems: 1, additional: 0 },
      agentId: null,
      buildingId: "bldg-b",
    },
  ];
}

function makeBooking(overrides: Partial<AdminBooking>): AdminBooking {
  return {
    id: "bk-x",
    unitId: "u-a1",
    customerName: "Test Customer",
    customerEmail: "test@example.com",
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
    serviceTimeline: [],
    notes: "",
    rolloutId: null,
    createdAt: "2026-04-20T09:00:00+10:00",
    // Pin lastContactedAt so every row sits in the same priority
    // bucket — the test asserts on the outcome filter, not the
    // priority sort.
    lastContactedAt: "2026-04-28T09:00:00+10:00",
    ...overrides,
  };
}

function callEntry(
  outcome: "Spoke to them" | "No answer" | "Left voicemail",
): TimelineEntry {
  return {
    kind: "call",
    status: "logged_call",
    label: `Logged call · ${outcome}`,
    at: "Just now",
    by: "Mia (admin)",
  };
}

function emailEntry(subject: string): TimelineEntry {
  return {
    kind: "email",
    status: "logged_email",
    label: `Logged email · ${subject}`,
    at: "Just now",
    by: "Mia (admin)",
  };
}

/**
 * The view is exclusively controlled for `filter`, `buildingFilter`,
 * and `search`; the harness wires those to local state so the
 * existing chips compose correctly with the new outcome chips.
 */
function Harness({
  initial,
  initialBuildingFilter = "all",
  initialSearch = "",
}: {
  initial: AdminBooking[];
  initialBuildingFilter?: string;
  initialSearch?: string;
}) {
  const [filter, setFilter] = useState<"all" | "awaiting_tenant" | "awaiting_agent">(
    "all",
  );
  const [buildingFilter, setBuildingFilter] = useState(initialBuildingFilter);
  const [search, setSearch] = useState(initialSearch);
  return (
    <AwaitingCoordinationView
      bookings={initial}
      units={makeUnits()}
      buildings={makeBuildings()}
      filter={filter}
      onFilter={setFilter}
      buildingFilter={buildingFilter}
      onBuildingFilter={setBuildingFilter}
      search={search}
      onSearch={setSearch}
      onOpen={() => {}}
    />
  );
}

/** Read the booking IDs in the order they're rendered in the table. */
function renderedBookingIds(): string[] {
  const table = screen.getByRole("table");
  const rows = within(table).queryAllByRole("button");
  return rows.map((row) => {
    const idDiv = row.querySelector("td > div");
    const text = idDiv?.textContent?.trim() ?? "";
    return text.replace(/\s*Live\s*$/i, "").trim();
  });
}

function clickChip(key: string) {
  fireEvent.click(screen.getByTestId(`chip-outcome-${key}`));
}

describe("AwaitingCoordinationView outcome filter", () => {
  // A fixed corpus that covers every outcome bucket, so each branch
  // test below can assert exactly which rows survive its filter.
  function corpus(): AdminBooking[] {
    return [
      makeBooking({
        id: "bk-spoke",
        unitId: "u-a1",
        serviceTimeline: [callEntry("Spoke to them")],
      }),
      makeBooking({
        id: "bk-no-answer",
        unitId: "u-a2",
        serviceTimeline: [callEntry("No answer")],
      }),
      makeBooking({
        id: "bk-voicemail",
        unitId: "u-a3",
        serviceTimeline: [callEntry("Left voicemail")],
      }),
      makeBooking({
        id: "bk-email",
        unitId: "u-a4",
        serviceTimeline: [emailEntry("Booking access — please confirm")],
      }),
      makeBooking({
        id: "bk-never-logged",
        unitId: "u-a5",
        // No call/email entries — only a status entry that should
        // not be mistaken for an outcome.
        serviceTimeline: [
          { status: "scheduled", label: "Scheduled", at: "Just now", by: "System" },
        ],
      }),
    ];
  }

  it("defaults to 'Any outcome' so every row is visible", () => {
    render(<Harness initial={corpus()} />);
    expect(new Set(renderedBookingIds())).toEqual(
      new Set([
        "bk-spoke",
        "bk-no-answer",
        "bk-voicemail",
        "bk-email",
        "bk-never-logged",
      ]),
    );
    // The "Any outcome" chip is selected to start.
    expect(
      screen.getByTestId("chip-outcome-all").getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("'Spoke' keeps only rows whose latest call outcome was 'spoke'", () => {
    render(<Harness initial={corpus()} />);
    clickChip("spoke");
    expect(renderedBookingIds()).toEqual(["bk-spoke"]);
  });

  it("'No answer' keeps only rows whose latest call outcome was 'no_answer'", () => {
    render(<Harness initial={corpus()} />);
    clickChip("no_answer");
    expect(renderedBookingIds()).toEqual(["bk-no-answer"]);
  });

  it("'Voicemail' keeps only rows whose latest call outcome was 'voicemail'", () => {
    render(<Harness initial={corpus()} />);
    clickChip("voicemail");
    expect(renderedBookingIds()).toEqual(["bk-voicemail"]);
  });

  it("'Email' keeps only rows whose latest attempt was an email", () => {
    render(<Harness initial={corpus()} />);
    clickChip("email");
    expect(renderedBookingIds()).toEqual(["bk-email"]);
  });

  it("'Never logged' keeps only rows with no call/email attempts logged yet", () => {
    render(<Harness initial={corpus()} />);
    clickChip("never_logged");
    expect(renderedBookingIds()).toEqual(["bk-never-logged"]);
  });

  it("uses the most recent attempt — older voicemail then a 'spoke' call lands in 'Spoke', not 'Voicemail'", () => {
    // The latest attempt is what matters, otherwise ops would
    // re-chase rows that just got through.
    const bookings = [
      makeBooking({
        id: "bk-voicemail-then-spoke",
        unitId: "u-a1",
        serviceTimeline: [
          callEntry("Left voicemail"),
          callEntry("Spoke to them"),
        ],
      }),
    ];
    render(<Harness initial={bookings} />);
    clickChip("voicemail");
    expect(renderedBookingIds()).toEqual([]);
    clickChip("spoke");
    expect(renderedBookingIds()).toEqual(["bk-voicemail-then-spoke"]);
  });

  it("composes with the building filter — 'Voicemail' inside Tower A excludes a voicemail row in Tower B", () => {
    const bookings = [
      makeBooking({
        id: "bk-vm-a",
        unitId: "u-a1",
        serviceTimeline: [callEntry("Left voicemail")],
      }),
      makeBooking({
        id: "bk-vm-b",
        unitId: "u-b1",
        serviceTimeline: [callEntry("Left voicemail")],
      }),
      makeBooking({
        id: "bk-spoke-a",
        unitId: "u-a2",
        serviceTimeline: [callEntry("Spoke to them")],
      }),
    ];
    render(<Harness initial={bookings} initialBuildingFilter="bldg-a" />);
    clickChip("voicemail");
    expect(renderedBookingIds()).toEqual(["bk-vm-a"]);
  });

  it("composes with search — 'Email' + a customer-name query narrows to one row", () => {
    const bookings = [
      makeBooking({
        id: "bk-email-jones",
        unitId: "u-a1",
        customerName: "Jones",
        serviceTimeline: [emailEntry("Window confirmation")],
      }),
      makeBooking({
        id: "bk-email-smith",
        unitId: "u-a2",
        customerName: "Smith",
        serviceTimeline: [emailEntry("Window confirmation")],
      }),
      makeBooking({
        id: "bk-spoke-jones",
        unitId: "u-a3",
        customerName: "Jones",
        serviceTimeline: [callEntry("Spoke to them")],
      }),
    ];
    render(<Harness initial={bookings} initialSearch="jones" />);
    clickChip("email");
    expect(renderedBookingIds()).toEqual(["bk-email-jones"]);
  });

  it("renders an empty-state when the active outcome chip matches no rows", () => {
    const bookings = [
      makeBooking({
        id: "bk-spoke-only",
        unitId: "u-a1",
        serviceTimeline: [callEntry("Spoke to them")],
      }),
    ];
    render(<Harness initial={bookings} />);
    clickChip("voicemail");
    expect(renderedBookingIds()).toEqual([]);
    expect(
      screen.getByText(/No coordination bookings match these filters\./i),
    ).toBeTruthy();
  });

  it("clicking 'Any outcome' restores every row after a narrow filter", () => {
    render(<Harness initial={corpus()} />);
    clickChip("voicemail");
    expect(renderedBookingIds()).toEqual(["bk-voicemail"]);
    clickChip("all");
    expect(new Set(renderedBookingIds())).toEqual(
      new Set([
        "bk-spoke",
        "bk-no-answer",
        "bk-voicemail",
        "bk-email",
        "bk-never-logged",
      ]),
    );
  });
});
