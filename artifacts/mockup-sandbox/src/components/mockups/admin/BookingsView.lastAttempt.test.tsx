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

/**
 * Stale-vs-fresh styling. The row's "Last attempt: …" line flips into
 * an amber warning style once the most recent call/email entry crosses
 * `LAST_ATTEMPT_STALE_HOURS` (48h) — same idea the existing
 * `lastContactedAt` severity buckets already use, applied to the
 * per-row last-attempt line. The threshold lives in
 * `adminMockData.ts` so all admin-side staleness rules stay in one
 * place.
 */
describe("BookingsView last-attempt staleness", () => {
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
        at: "Earlier",
        by: "Mia (admin)",
        loggedAt: loggedAtIso,
      },
    ];
  }

  function lastAttemptNode(): HTMLElement {
    return screen.getByTestId("bookings-row-last-attempt");
  }

  it("renders the line in muted slate when the latest touch is still fresh (< 48h)", () => {
    // 2h before "now" → well inside the fresh window.
    const loggedAt = "2026-04-29T08:00:00+10:00";
    renderView(
      makeBooking({ id: "bk-fresh", serviceTimeline: callAt(loggedAt) }),
    );
    const node = lastAttemptNode();
    expect(node.dataset.stale).toBe("false");
    expect(node.className).toContain("text-slate-500");
    expect(node.className).not.toContain("text-amber-700");
  });

  it("flips the line into amber warning text when the latest touch is stale (≥ 48h)", () => {
    // 3 days before "now" → past the 48h staleness threshold.
    const loggedAt = "2026-04-26T10:00:00+10:00";
    renderView(
      makeBooking({ id: "bk-stale", serviceTimeline: callAt(loggedAt) }),
    );
    const node = lastAttemptNode();
    expect(node.dataset.stale).toBe("true");
    expect(node.className).toContain("text-amber-700");
    expect(node.className).not.toContain("text-slate-500");
    // Label still reads naturally — only the colour changes.
    expect(attemptText()).toBe("Last attempt: spoke · 3d ago");
  });

  it("treats a row whose latest entry has no loggedAt as fresh (no warning style)", () => {
    // Without a structured timestamp we can't decide staleness, so the
    // safe fallback is to leave the line in its default muted style
    // rather than yelling at an admin for a row we just don't have
    // recency data for.
    const timeline: TimelineEntry[] = [
      {
        kind: "call",
        status: "logged_call",
        label: "Logged call · Spoke to them",
        at: "Just now",
        by: "Mia (admin)",
      },
    ];
    renderView(
      makeBooking({ id: "bk-no-logged-at", serviceTimeline: timeline }),
    );
    const node = lastAttemptNode();
    expect(node.dataset.stale).toBe("false");
    expect(node.className).toContain("text-slate-500");
  });
});

/**
 * Email-template suffix on the row's "Last attempt: …" line. Task
 * #138 made `BookingDetail.logEmail` persist the picked template's
 * name onto the resulting timeline entry as `templateLabel`; Task
 * #141 surfaces that name as a small grey suffix on the bookings
 * list so ops can triage the queue at a glance without opening each
 * booking. Custom / legacy entries (`templateLabel` absent) keep
 * the existing label-only rendering.
 */
describe("BookingsView last-attempt template suffix", () => {
  function templateNode(): HTMLElement | null {
    return screen.queryByTestId("bookings-row-last-attempt-template");
  }

  it("appends the picked template name when the latest email entry carries one", () => {
    const timeline: TimelineEntry[] = [
      {
        kind: "email",
        status: "logged_email",
        label: "Logged email · Booking access — please confirm window",
        at: "Just now",
        by: "Mia (admin)",
        templateLabel: "Sent rebook link",
      },
    ];
    renderView(
      makeBooking({ id: "bk-tpl", serviceTimeline: timeline }),
    );
    expect(attemptText()).toBe(
      'Last attempt: email · "Booking access — please confirm window" · Sent rebook link',
    );
    // The suffix is rendered in its own muted span so it stays
    // visually distinct from the bolded label.
    const suffix = templateNode();
    expect(suffix).not.toBeNull();
    expect(suffix!.textContent).toContain("Sent rebook link");
    expect(suffix!.className).toContain("text-slate-500");
  });

  it("omits the suffix when the latest email entry has no templateLabel (Custom / legacy)", () => {
    const timeline: TimelineEntry[] = [
      {
        kind: "email",
        status: "logged_email",
        label: "Logged email · Booking access — please confirm window",
        at: "Just now",
        by: "Mia (admin)",
      },
    ];
    renderView(
      makeBooking({ id: "bk-no-tpl", serviceTimeline: timeline }),
    );
    expect(attemptText()).toBe(
      'Last attempt: email · "Booking access — please confirm window"',
    );
    expect(templateNode()).toBeNull();
  });

  it("appends the picked call template name when the latest call entry carries one (Task #149)", () => {
    // Call entries snapshot the picked Call template's name onto
    // `templateLabel` the same way email entries do (Task #138 → #149),
    // so the row-level "Last attempt" suffix surfaces it inline so a
    // team lead can triage the queue at a glance without opening
    // each booking.
    const timeline: TimelineEntry[] = [
      {
        kind: "call",
        status: "logged_call",
        label: "Logged call · Spoke to them",
        at: "Just now",
        by: "Mia (admin)",
        templateLabel: "Spoke — confirmed window",
      },
    ];
    renderView(
      makeBooking({ id: "bk-call-tpl", serviceTimeline: timeline }),
    );
    expect(attemptText()).toBe(
      "Last attempt: spoke · Spoke — confirmed window",
    );
    const suffix = templateNode();
    expect(suffix).not.toBeNull();
    expect(suffix!.textContent).toContain("Spoke — confirmed window");
    expect(suffix!.className).toContain("text-slate-500");
  });

  it("omits the suffix when the latest call entry has no templateLabel (Custom / legacy) (Task #149)", () => {
    // Custom / pre-Task-149 call entries don't carry `templateLabel`
    // — the suffix must stay hidden so legacy rows keep the existing
    // label-only line.
    const timeline: TimelineEntry[] = [
      {
        kind: "call",
        status: "logged_call",
        label: "Logged call · Spoke to them",
        at: "Just now",
        by: "Mia (admin)",
      },
    ];
    renderView(
      makeBooking({ id: "bk-call-no-tpl", serviceTimeline: timeline }),
    );
    expect(attemptText()).toBe("Last attempt: spoke");
    expect(templateNode()).toBeNull();
  });

  it("uses the latest entry's template when an email follows an older email", () => {
    // Older "Sent rebook link" email then a fresher "Awaiting access"
    // email — the cell must surface the newer template, not the
    // older one, so ops can see what's currently in flight.
    const timeline: TimelineEntry[] = [
      {
        kind: "email",
        status: "logged_email",
        label: "Logged email · Please rebook",
        at: "Yesterday",
        by: "Mia (admin)",
        templateLabel: "Sent rebook link",
      },
      {
        kind: "email",
        status: "logged_email",
        label: "Logged email · Awaiting access",
        at: "Just now",
        by: "Mia (admin)",
        templateLabel: "Awaiting access info",
      },
    ];
    renderView(
      makeBooking({ id: "bk-tpl-newer", serviceTimeline: timeline }),
    );
    expect(attemptText()).toBe(
      'Last attempt: email · "Awaiting access" · Awaiting access info',
    );
  });
});
