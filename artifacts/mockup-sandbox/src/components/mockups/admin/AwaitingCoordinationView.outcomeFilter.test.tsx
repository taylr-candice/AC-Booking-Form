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
      acType: "split",
      acBrand: "Daikin",
    },
    {
      id: "bldg-b",
      name: "Tower B",
      addressLine1: "2 B St",
      addressLine2: "Suburb NSW 2000",
      acType: "split",
      acBrand: "Daikin",
    },
  ];
}

function makeUnits(): AdminUnit[] {
  return [
    {
      id: "u-a1",
      addressLine1: "1 / 1 A St",
      addressLine2: "Suburb NSW 2000",
      ac: { type: "split", brand: "", systems: 1, additional: 0 },
      agentId: null,
      buildingId: "bldg-a",
    },
    {
      id: "u-a2",
      addressLine1: "2 / 1 A St",
      addressLine2: "Suburb NSW 2000",
      ac: { type: "split", brand: "", systems: 1, additional: 0 },
      agentId: null,
      buildingId: "bldg-a",
    },
    {
      id: "u-a3",
      addressLine1: "3 / 1 A St",
      addressLine2: "Suburb NSW 2000",
      ac: { type: "split", brand: "", systems: 1, additional: 0 },
      agentId: null,
      buildingId: "bldg-a",
    },
    {
      id: "u-a4",
      addressLine1: "4 / 1 A St",
      addressLine2: "Suburb NSW 2000",
      ac: { type: "split", brand: "", systems: 1, additional: 0 },
      agentId: null,
      buildingId: "bldg-a",
    },
    {
      id: "u-a5",
      addressLine1: "5 / 1 A St",
      addressLine2: "Suburb NSW 2000",
      ac: { type: "split", brand: "", systems: 1, additional: 0 },
      agentId: null,
      buildingId: "bldg-a",
    },
    {
      id: "u-b1",
      addressLine1: "1 / 2 B St",
      addressLine2: "Suburb NSW 2000",
      ac: { type: "split", brand: "", systems: 1, additional: 0 },
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
  const [filter, setFilter] = useState<
    "all" | "awaiting_tenant" | "awaiting_agent" | "awaiting_scheduling"
  >(
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

/** Read the count rendered inside a specific outcome chip — the
 *  chips render as "Label (N)" so the count span carries its own
 *  testid suffix to keep the assertion tight. */
function chipCount(key: string): number {
  const text = screen.getByTestId(`chip-outcome-${key}-count`).textContent ?? "";
  const match = text.match(/\((\d+)\)/);
  if (!match) {
    throw new Error(`Could not parse count from chip "${key}": ${text}`);
  }
  return Number(match[1]);
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
    // Voicemail bucket is empty because the latest attempt was the
    // 'spoke' call — so the chip itself is disabled and counts zero.
    expect(chipCount("voicemail")).toBe(0);
    expect(
      (screen.getByTestId("chip-outcome-voicemail") as HTMLButtonElement)
        .disabled,
    ).toBe(true);
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

  it("renders an empty-state when the queue is empty under the active filters", () => {
    // Empty-bucket chips are disabled (see the "dims and disables"
    // case below), so the only way to land on the empty-state row is
    // for the non-outcome filters (here: a building filter that
    // matches nothing) to wipe the queue out entirely. The "Any
    // outcome" chip stays clickable on purpose so this state is
    // still reachable.
    const bookings = [
      makeBooking({
        id: "bk-spoke-b",
        unitId: "u-b1",
        serviceTimeline: [callEntry("Spoke to them")],
      }),
    ];
    render(<Harness initial={bookings} initialBuildingFilter="bldg-a" />);
    expect(renderedBookingIds()).toEqual([]);
    expect(
      screen.getByText(/No coordination bookings match these filters\./i),
    ).toBeTruthy();
  });

  describe("outcome chip counts", () => {
    // The counts surface the queue mix at a glance — "Voicemail (3),
    // Spoke (0)" tells a team lead exactly where to focus without
    // clicking through every chip. The cases below pin the count
    // for each branch the task calls out (spoke / voicemail / never
    // logged), plus the "Any outcome" total and the compose-with-
    // other-filters guarantee.
    it("renders a count beside every chip, including 'Any outcome' as the total visible", () => {
      render(<Harness initial={corpus()} />);
      // Total = 5 rows: spoke, no_answer, voicemail, email, never_logged.
      expect(chipCount("all")).toBe(5);
      expect(chipCount("spoke")).toBe(1);
      expect(chipCount("no_answer")).toBe(1);
      expect(chipCount("voicemail")).toBe(1);
      expect(chipCount("email")).toBe(1);
      expect(chipCount("never_logged")).toBe(1);
    });

    it("counts the 'Spoke' bucket against the latest call outcome of each row", () => {
      // Two rows whose latest call was 'spoke', plus a voicemail
      // row and an email row that should both stay out of the
      // spoke count. The older voicemail on the third row must
      // not bump the spoke count either — only the latest entry
      // counts.
      const bookings = [
        makeBooking({
          id: "bk-spoke-1",
          unitId: "u-a1",
          serviceTimeline: [callEntry("Spoke to them")],
        }),
        makeBooking({
          id: "bk-spoke-2",
          unitId: "u-a2",
          serviceTimeline: [callEntry("Spoke to them")],
        }),
        makeBooking({
          id: "bk-voicemail-then-spoke",
          unitId: "u-a3",
          serviceTimeline: [
            callEntry("Left voicemail"),
            callEntry("Spoke to them"),
          ],
        }),
        makeBooking({
          id: "bk-vm",
          unitId: "u-a4",
          serviceTimeline: [callEntry("Left voicemail")],
        }),
        makeBooking({
          id: "bk-email",
          unitId: "u-a5",
          serviceTimeline: [emailEntry("Window confirmation")],
        }),
      ];
      render(<Harness initial={bookings} />);
      expect(chipCount("spoke")).toBe(3);
      expect(chipCount("voicemail")).toBe(1);
      expect(chipCount("email")).toBe(1);
      expect(chipCount("all")).toBe(5);
    });

    it("counts the 'Voicemail' bucket independently of which chip is active", () => {
      const bookings = [
        makeBooking({
          id: "bk-vm-1",
          unitId: "u-a1",
          serviceTimeline: [callEntry("Left voicemail")],
        }),
        makeBooking({
          id: "bk-vm-2",
          unitId: "u-a2",
          serviceTimeline: [callEntry("Left voicemail")],
        }),
        makeBooking({
          id: "bk-vm-3",
          unitId: "u-a3",
          serviceTimeline: [callEntry("Left voicemail")],
        }),
        makeBooking({
          id: "bk-spoke",
          unitId: "u-a4",
          serviceTimeline: [callEntry("Spoke to them")],
        }),
      ];
      render(<Harness initial={bookings} />);
      // Default chip ("all") active — voicemail count stays at 3.
      expect(chipCount("voicemail")).toBe(3);
      expect(chipCount("spoke")).toBe(1);
      // Activating Spoke must not change the voicemail tally —
      // counts honour the *non-outcome* filters only.
      clickChip("spoke");
      expect(chipCount("voicemail")).toBe(3);
      expect(chipCount("spoke")).toBe(1);
    });

    it("counts the 'Never logged' bucket against rows with no call/email entries", () => {
      const bookings = [
        // Two bookings that have only non-attempt entries (a status
        // line) — these should land in the "Never logged" bucket.
        makeBooking({
          id: "bk-fresh-1",
          unitId: "u-a1",
          serviceTimeline: [
            { status: "scheduled", label: "Scheduled", at: "Just now", by: "System" },
          ],
        }),
        makeBooking({
          id: "bk-fresh-2",
          unitId: "u-a2",
          serviceTimeline: [],
        }),
        makeBooking({
          id: "bk-spoke",
          unitId: "u-a3",
          serviceTimeline: [callEntry("Spoke to them")],
        }),
      ];
      render(<Harness initial={bookings} />);
      expect(chipCount("never_logged")).toBe(2);
      expect(chipCount("spoke")).toBe(1);
      expect(chipCount("all")).toBe(3);
    });

    it("dims and disables chips with a count of zero so empty buckets fade into the background", () => {
      // Only voicemail rows in the queue — every other outcome chip
      // (Spoke, No answer, Email, Never logged) should mute itself
      // visually and refuse clicks. The "Any outcome" chip stays
      // active styling-wise because it always represents the visible
      // total.
      const bookings = [
        makeBooking({
          id: "bk-vm-1",
          unitId: "u-a1",
          serviceTimeline: [callEntry("Left voicemail")],
        }),
        makeBooking({
          id: "bk-vm-2",
          unitId: "u-a2",
          serviceTimeline: [callEntry("Left voicemail")],
        }),
      ];
      render(<Harness initial={bookings} />);

      // Sanity: the buckets we expect to be empty really are zero.
      expect(chipCount("spoke")).toBe(0);
      expect(chipCount("no_answer")).toBe(0);
      expect(chipCount("email")).toBe(0);
      expect(chipCount("never_logged")).toBe(0);
      expect(chipCount("voicemail")).toBe(2);
      expect(chipCount("all")).toBe(2);

      // Empty chips: disabled + muted (lower opacity, lighter ring,
      // muted text).
      for (const key of ["spoke", "no_answer", "email", "never_logged"]) {
        const chip = screen.getByTestId(`chip-outcome-${key}`) as HTMLButtonElement;
        expect(chip.disabled).toBe(true);
        expect(chip.className).toMatch(/opacity-50/);
        expect(chip.className).toMatch(/cursor-not-allowed/);
        expect(chip.className).toMatch(/text-slate-400/);
        expect(chip.className).toMatch(/ring-slate-100/);
      }

      // Non-empty chip stays clickable and uses full-strength styling.
      const voicemail = screen.getByTestId("chip-outcome-voicemail") as HTMLButtonElement;
      expect(voicemail.disabled).toBe(false);
      expect(voicemail.className).not.toMatch(/opacity-50/);
      expect(voicemail.className).toMatch(/text-slate-700/);

      // The "Any outcome" chip is never muted, even when its bucket is
      // somehow zero — it must always be the toolbar's reset
      // affordance.
      const anyOutcome = screen.getByTestId("chip-outcome-all") as HTMLButtonElement;
      expect(anyOutcome.disabled).toBe(false);
      expect(anyOutcome.className).not.toMatch(/opacity-50/);
      expect(anyOutcome.className).not.toMatch(/cursor-not-allowed/);

      // Clicking a muted chip must not flip the active filter — the
      // queue stays on "Any outcome".
      clickChip("spoke");
      expect(
        screen.getByTestId("chip-outcome-all").getAttribute("aria-pressed"),
      ).toBe("true");
      expect(
        screen.getByTestId("chip-outcome-spoke").getAttribute("aria-pressed"),
      ).toBe("false");
    });

    it("keeps 'Any outcome' un-muted even when the queue is completely empty", () => {
      // Building filter that matches nothing — every chip count is
      // zero, but the "Any outcome" chip must still render as a
      // live, clickable reset affordance.
      const bookings: AdminBooking[] = [];
      render(<Harness initial={bookings} initialBuildingFilter="bldg-a" />);
      expect(chipCount("all")).toBe(0);
      const anyOutcome = screen.getByTestId("chip-outcome-all") as HTMLButtonElement;
      expect(anyOutcome.disabled).toBe(false);
      expect(anyOutcome.className).not.toMatch(/opacity-50/);
    });

    it("counts honour the building filter so the queue mix matches the visible rows", () => {
      // bldg-a has 1 voicemail + 1 spoke + 1 never-logged; bldg-b has
      // an extra voicemail that the building filter must hide from
      // the chip counts as well as from the table.
      const bookings = [
        makeBooking({
          id: "bk-vm-a",
          unitId: "u-a1",
          serviceTimeline: [callEntry("Left voicemail")],
        }),
        makeBooking({
          id: "bk-spoke-a",
          unitId: "u-a2",
          serviceTimeline: [callEntry("Spoke to them")],
        }),
        makeBooking({
          id: "bk-fresh-a",
          unitId: "u-a3",
          serviceTimeline: [],
        }),
        makeBooking({
          id: "bk-vm-b",
          unitId: "u-b1",
          serviceTimeline: [callEntry("Left voicemail")],
        }),
      ];
      render(<Harness initial={bookings} initialBuildingFilter="bldg-a" />);
      expect(chipCount("all")).toBe(3);
      expect(chipCount("voicemail")).toBe(1);
      expect(chipCount("spoke")).toBe(1);
      expect(chipCount("never_logged")).toBe(1);
    });
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
