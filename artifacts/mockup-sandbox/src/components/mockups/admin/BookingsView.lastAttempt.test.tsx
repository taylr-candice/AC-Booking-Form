// @vitest-environment happy-dom

/**
 * Regression test for the "Last attempt: …" helper line on the main
 * bookings list (mirrors the same line on the Awaiting-coordination
 * queue). The helper reads the most recent structured call/email
 * entry off `serviceTimeline` via `latestCoordinationAttempt` so the
 * label format ("spoke" / "no answer" / "voicemail" / `email · "<subject>"`)
 * stays consistent across both views without having to re-implement
 * the parsing here.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

function renderView(booking: AdminBooking) {
  render(
    <BookingsView
      bookings={[booking]}
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

function attemptText(): string | null {
  const node = screen.queryByTestId("bookings-row-last-attempt");
  return node ? node.textContent?.replace(/\s+/g, " ").trim() ?? "" : null;
}

describe("BookingsView last-attempt helper", () => {
  it("renders the call outcome on a row whose latest entry is a logged call", () => {
    const timeline: TimelineEntry[] = [
      {
        kind: "call",
        status: "logged_call",
        label: "Logged call · Spoke to them",
        at: "Just now",
        by: "Mia (admin)",
      },
    ];
    renderView(makeBooking({ id: "bk-call", serviceTimeline: timeline }));
    expect(attemptText()).toBe("Last attempt: spoke");
  });

  it("renders the email subject on a row whose latest entry is a logged email", () => {
    const timeline: TimelineEntry[] = [
      {
        kind: "email",
        status: "logged_email",
        label: "Logged email · Booking access — please confirm window",
        at: "Just now",
        by: "Mia (admin)",
      },
    ];
    renderView(makeBooking({ id: "bk-email", serviceTimeline: timeline }));
    expect(attemptText()).toBe(
      'Last attempt: email · "Booking access — please confirm window"',
    );
  });

  it("omits the helper line when no call or email has been logged yet", () => {
    // A plain status entry (e.g. "Scheduled") must not be mistaken for
    // a coordination attempt — otherwise every row would surface a
    // bogus "Last attempt" line.
    const timeline: TimelineEntry[] = [
      {
        status: "scheduled",
        label: "Scheduled",
        at: "Just now",
        by: "System",
      },
    ];
    renderView(makeBooking({ id: "bk-no-touch", serviceTimeline: timeline }));
    expect(attemptText()).toBeNull();
  });
});

/**
 * Recency suffix on the "Last attempt: …" helper. Pulled from each
 * call/email entry's own `loggedAt` ISO timestamp so that logging an
 * email after a call surfaces the email's age rather than the older
 * call's, and so that a row reads correctly as "spoke just now" /
 * "spoke 2h ago" / "spoke yesterday" without an admin needing to
 * open the booking.
 *
 * Uses fake timers so the diff between `loggedAt` and "now" is fully
 * deterministic — the formatter buckets are h/d-grained, so any
 * real-clock drift in CI would be enough to flip "2h ago" to
 * "1h ago".
 */
describe("BookingsView last-attempt recency", () => {
  const NOW_ISO = "2026-04-29T10:00:00+10:00";

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW_ISO));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

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

  it("appends 'just now' when the call landed less than an hour ago", () => {
    // 12 minutes before "now" → "just now" bucket.
    const loggedAt = "2026-04-29T09:48:00+10:00";
    renderView(
      makeBooking({ id: "bk-call-now", serviceTimeline: callAt(loggedAt) }),
    );
    expect(attemptText()).toBe("Last attempt: spoke · just now");
  });

  it("appends 'Xh ago' when the call landed earlier today", () => {
    // 2h 5m before "now" → "2h ago" bucket (floored).
    const loggedAt = "2026-04-29T07:55:00+10:00";
    renderView(
      makeBooking({ id: "bk-call-2h", serviceTimeline: callAt(loggedAt) }),
    );
    expect(attemptText()).toBe("Last attempt: spoke · 2h ago");
  });

  it("appends 'yesterday' when the call landed roughly a day ago", () => {
    // ~26h before "now" → past the 24h boundary, still inside 48h → "yesterday".
    const loggedAt = "2026-04-28T08:00:00+10:00";
    renderView(
      makeBooking({
        id: "bk-call-yesterday",
        serviceTimeline: callAt(loggedAt),
      }),
    );
    expect(attemptText()).toBe("Last attempt: spoke · yesterday");
  });

  it("uses the latest entry's timestamp when an email follows a call", () => {
    // A call from yesterday followed by an email logged 30 minutes ago.
    // The recency must reflect the email (the latest touch) — not the
    // older call — otherwise ops would re-chase a row that just got an
    // email out the door.
    const timeline: TimelineEntry[] = [
      {
        kind: "call",
        status: "logged_call",
        label: "Logged call · Left voicemail",
        at: "Yesterday",
        by: "Mia (admin)",
        loggedAt: "2026-04-28T08:00:00+10:00",
      },
      {
        kind: "email",
        status: "logged_email",
        label: "Logged email · Booking access — please confirm window",
        at: "Just now",
        by: "Mia (admin)",
        loggedAt: "2026-04-29T09:30:00+10:00",
      },
    ];
    renderView(
      makeBooking({ id: "bk-email-after-call", serviceTimeline: timeline }),
    );
    expect(attemptText()).toBe(
      'Last attempt: email · "Booking access — please confirm window" · just now',
    );
  });

  it("omits the recency suffix when the entry has no loggedAt timestamp", () => {
    // Legacy entries (or hand-built test fixtures) without `loggedAt`
    // should still render the outcome — just without a misleading "·
    // NaNh ago" suffix.
    const timeline: TimelineEntry[] = [
      {
        kind: "call",
        status: "logged_call",
        label: "Logged call · Spoke to them",
        at: "Just now",
        by: "Mia (admin)",
      },
    ];
    renderView(makeBooking({ id: "bk-call-legacy", serviceTimeline: timeline }));
    expect(attemptText()).toBe("Last attempt: spoke");
  });
});
