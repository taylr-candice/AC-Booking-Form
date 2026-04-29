// @vitest-environment happy-dom

/**
 * Regression test for the Awaiting-coordination queue priority sort.
 *
 * Rows must render in this order regardless of seed order:
 *   1. `never chased` (lastContactedAt === null), oldest createdAt first.
 *   2. `stale` (chased ≥ 24h ago), oldest chase first.
 *   3. `fresh` (chased < 24h ago), oldest chase first.
 *
 * The order must also be stable across re-renders, and clicking
 * "Mark as chased" (i.e. flipping `lastContactedAt` to ~now) must
 * push the row down to the bottom of the queue.
 */

import { cleanup, render, screen, within } from "@testing-library/react";
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
    {
      id: "u2",
      addressLine1: "2 / 1 Test St",
      addressLine2: "Suburb NSW 2000",
      ac: { type: "split", systems: 1, additional: 0 },
      agentId: null,
      buildingId: "bldg-test",
    },
    {
      id: "u3",
      addressLine1: "3 / 1 Test St",
      addressLine2: "Suburb NSW 2000",
      ac: { type: "split", systems: 1, additional: 0 },
      agentId: null,
      buildingId: "bldg-test",
    },
    {
      id: "u4",
      addressLine1: "4 / 1 Test St",
      addressLine2: "Suburb NSW 2000",
      ac: { type: "split", systems: 1, additional: 0 },
      agentId: null,
      buildingId: "bldg-test",
    },
    {
      id: "u5",
      addressLine1: "5 / 1 Test St",
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
    lastContactedAt: null,
    ...overrides,
  };
}

/** Read the booking IDs in the order they're rendered in the table. */
function renderedBookingIds(): string[] {
  // Each row's first cell renders the booking id in its first <div>.
  // The hint banner sits outside the <table>, so scoping to <table>
  // avoids mismatching it.
  const table = screen.getByRole("table");
  const rows = within(table).getAllByRole("button");
  return rows.map((row) => {
    const idDiv = row.querySelector("td > div");
    const text = idDiv?.textContent?.trim() ?? "";
    // The cell can also contain a "Live" badge — strip it.
    return text.replace(/\s*Live\s*$/i, "").trim();
  });
}

function Harness({ initial }: { initial: AdminBooking[] }) {
  const [bookings, setBookings] = useState(initial);
  return (
    <div>
      <button
        type="button"
        data-testid="chase-bk-never-old"
        onClick={() =>
          setBookings((prev) =>
            prev.map((b) =>
              b.id === "bk-never-old"
                ? { ...b, lastContactedAt: new Date().toISOString() }
                : b,
            ),
          )
        }
      >
        Mark bk-never-old as chased
      </button>
      <AwaitingCoordinationView
        bookings={bookings}
        units={makeUnits()}
        buildings={makeBuildings()}
        filter="all"
        onFilter={() => {}}
        buildingFilter="all"
        onBuildingFilter={() => {}}
        search=""
        onSearch={() => {}}
        onOpen={() => {}}
      />
    </div>
  );
}

describe("AwaitingCoordinationView priority sort", () => {
  it("orders rows by never-chased → stale → fresh, oldest chase first within each bucket", () => {
    const now = Date.now();
    const hoursAgo = (h: number) =>
      new Date(now - h * 60 * 60 * 1000).toISOString();

    // Intentionally seed in a scrambled order to prove the sort is
    // doing the work (not just preserving input order).
    const bookings: AdminBooking[] = [
      makeBooking({
        id: "bk-fresh-recent",
        unitId: "u1",
        // Chased 1h ago — fresh, should sink to the bottom.
        lastContactedAt: hoursAgo(1),
      }),
      makeBooking({
        id: "bk-stale-old",
        unitId: "u2",
        // Chased 72h ago — most-stale row, should beat the 30h one.
        lastContactedAt: hoursAgo(72),
      }),
      makeBooking({
        id: "bk-never-recent",
        unitId: "u3",
        createdAt: "2026-04-25T09:00:00+10:00",
        lastContactedAt: null,
      }),
      makeBooking({
        id: "bk-stale-recent",
        unitId: "u4",
        // Chased 30h ago — still stale but newer than 72h.
        lastContactedAt: hoursAgo(30),
      }),
      makeBooking({
        id: "bk-never-old",
        unitId: "u5",
        createdAt: "2026-04-20T09:00:00+10:00",
        lastContactedAt: null,
      }),
    ];

    render(<Harness initial={bookings} />);

    expect(renderedBookingIds()).toEqual([
      // Never chased, oldest createdAt first.
      "bk-never-old",
      "bk-never-recent",
      // Stale, oldest chase first (72h beats 30h).
      "bk-stale-old",
      "bk-stale-recent",
      // Fresh sinks to the bottom.
      "bk-fresh-recent",
    ]);
  });

  it("renders the ordering hint so ops aren't surprised", () => {
    render(<Harness initial={[makeBooking({ id: "bk-1" })]} />);
    const hint = screen.getByTestId("awaiting-coordination-sort-hint");
    expect(hint).toBeTruthy();
    expect(hint.textContent ?? "").toMatch(/never chased/i);
    expect(hint.textContent ?? "").toMatch(/stale/i);
  });

  it("drops a row down the list when it's marked as chased", async () => {
    const now = Date.now();
    const hoursAgo = (h: number) =>
      new Date(now - h * 60 * 60 * 1000).toISOString();

    const bookings: AdminBooking[] = [
      makeBooking({
        id: "bk-never-old",
        unitId: "u1",
        createdAt: "2026-04-20T09:00:00+10:00",
        lastContactedAt: null,
      }),
      makeBooking({
        id: "bk-stale",
        unitId: "u2",
        lastContactedAt: hoursAgo(48),
      }),
      makeBooking({
        id: "bk-fresh",
        unitId: "u3",
        lastContactedAt: hoursAgo(1),
      }),
    ];

    render(<Harness initial={bookings} />);

    // Before chasing: the never-chased row floats to the top.
    expect(renderedBookingIds()).toEqual(["bk-never-old", "bk-stale", "bk-fresh"]);

    // Simulate "Mark as chased" by setting lastContactedAt to now.
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.click(screen.getByTestId("chase-bk-never-old"));

    // After chasing: the now-fresh row drops to the bottom; the stale
    // row floats up because nothing is unchased anymore.
    expect(renderedBookingIds()).toEqual(["bk-stale", "bk-fresh", "bk-never-old"]);
  });
});

/**
 * The "Coordinating with" cell surfaces the most recent structured
 * call/email entry on a row so a team lead scanning the queue can
 * tell whether the previous touch got through, just hit voicemail,
 * or was an email — without opening each booking. The label format
 * matches what `BookingDetail.logCall` / `logEmail` write into the
 * service timeline (see `latestCoordinationAttempt`).
 */
describe("AwaitingCoordinationView last-attempt outcome", () => {
  /** Render a single booking and return the text of its
   *  "Last attempt: …" cell line, or `null` when the cell didn't
   *  render one (i.e. no logged call/email yet). */
  function renderAttemptText(timeline: TimelineEntry[]): string | null {
    const booking = makeBooking({
      id: "bk-outcome",
      unitId: "u1",
      // A pinned `lastContactedAt` keeps the row out of the
      // never-chased bucket and stops the test from being timing-
      // sensitive — we only care about the outcome line here.
      lastContactedAt: "2026-04-28T09:00:00+10:00",
      serviceTimeline: timeline,
    });
    render(<Harness initial={[booking]} />);
    const node = screen.queryByTestId("coordinating-with-last-attempt");
    return node ? node.textContent?.replace(/\s+/g, " ").trim() ?? "" : null;
  }

  it("renders 'spoke' for a logged call whose outcome was 'spoke'", () => {
    expect(
      renderAttemptText([
        {
          kind: "call",
          status: "logged_call",
          label: "Logged call · Spoke to them",
          at: "Just now",
          by: "Mia (admin)",
        },
      ]),
    ).toBe("Last attempt: spoke");
  });

  it("renders 'no answer' for a logged call whose outcome was 'no_answer'", () => {
    expect(
      renderAttemptText([
        {
          kind: "call",
          status: "logged_call",
          label: "Logged call · No answer",
          at: "Just now",
          by: "Mia (admin)",
        },
      ]),
    ).toBe("Last attempt: no answer");
  });

  it("renders 'email · \"<subject>\"' for a logged email", () => {
    expect(
      renderAttemptText([
        {
          kind: "email",
          status: "logged_email",
          label: "Logged email · Booking access — please confirm window",
          at: "Just now",
          by: "Mia (admin)",
        },
      ]),
    ).toBe('Last attempt: email · "Booking access — please confirm window"');
  });

  it("uses the most recent call/email entry when multiple have been logged", () => {
    // Older voicemail ⇒ then an actual conversation: the cell must
    // surface the conversation, not the older voicemail, otherwise
    // ops would re-chase a row that just got through.
    expect(
      renderAttemptText([
        {
          kind: "call",
          status: "logged_call",
          label: "Logged call · Left voicemail",
          at: "Yesterday",
          by: "Mia (admin)",
        },
        {
          kind: "call",
          status: "logged_call",
          label: "Logged call · Spoke to them",
          at: "Just now",
          by: "Mia (admin)",
        },
      ]),
    ).toBe("Last attempt: spoke");
  });

  it("omits the line when no call or email has been logged yet", () => {
    expect(
      renderAttemptText([
        // A plain status entry (e.g. "Scheduled") should not be
        // mistaken for a coordination attempt.
        {
          status: "scheduled",
          label: "Scheduled",
          at: "Just now",
          by: "System",
        },
      ]),
    ).toBeNull();
  });
});

/**
 * Stale-vs-fresh styling on the queue's "Last attempt: …" cell line.
 * Mirrors the same switch covered for `BookingsView` in
 * `BookingsView.lastAttempt.test.tsx` so both row renderers stay
 * locked to the shared `LAST_ATTEMPT_STALE_HOURS` (48h) threshold —
 * if either view stops applying the warning style, this test will
 * catch it before an admin's queue starts under-flagging stale rows.
 */
describe("AwaitingCoordinationView last-attempt staleness", () => {
  function renderAttemptCell(loggedAtIso: string | undefined): HTMLElement {
    const timeline: TimelineEntry[] = [
      {
        kind: "call",
        status: "logged_call",
        label: "Logged call · Spoke to them",
        at: "Earlier",
        by: "Mia (admin)",
        ...(loggedAtIso ? { loggedAt: loggedAtIso } : {}),
      },
    ];
    const booking = makeBooking({
      id: "bk-staleness",
      unitId: "u1",
      // Pin lastContactedAt so the row's bucket placement is
      // deterministic — we only care about the "Last attempt" cell
      // styling here.
      lastContactedAt: "2026-04-28T09:00:00+10:00",
      serviceTimeline: timeline,
    });
    render(<Harness initial={[booking]} />);
    return screen.getByTestId("coordinating-with-last-attempt");
  }

  it("renders muted slate text when the latest touch is fresh (< 48h)", () => {
    // 2h before "now" → fresh.
    const loggedAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const node = renderAttemptCell(loggedAt);
    expect(node.dataset.stale).toBe("false");
    expect(node.className).toContain("text-slate-500");
    expect(node.className).not.toContain("text-amber-700");
  });

  it("flips to amber warning text once the latest touch is stale (≥ 48h)", () => {
    // 72h before "now" → past the 48h threshold.
    const loggedAt = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
    const node = renderAttemptCell(loggedAt);
    expect(node.dataset.stale).toBe("true");
    expect(node.className).toContain("text-amber-700");
    expect(node.className).not.toContain("text-slate-500");
  });

  it("falls back to fresh styling when the entry has no loggedAt timestamp", () => {
    const node = renderAttemptCell(undefined);
    expect(node.dataset.stale).toBe("false");
    expect(node.className).toContain("text-slate-500");
  });
});
