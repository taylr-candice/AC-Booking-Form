// @vitest-environment happy-dom

/**
 * Tests for the per-template 7-day usage sparkline surfaced next to
 * the "Used in N bookings" badge on the Call / Email templates
 * panels (Task #171).
 *
 * Three layers, all pinned here:
 *  - Pure helper: {@link getTemplateUsageTrend} returns a dense,
 *    fixed-length window of `{ date, count }` buckets that respects
 *    the snapshot-on-use `templateLabel` match, the `kind` filter,
 *    and quietly drops entries whose `loggedAt` is missing,
 *    unparseable, or outside the window.
 *  - Pure helper: {@link findUsageBookingsForTemplateOnDay} returns
 *    the bookings whose timeline touched the template on a given
 *    UTC day — the day-scoped sibling that drives the click-to-
 *    filter drill-down (Task #197).
 *  - Component: {@link TemplateUsageSparkline} renders the dim
 *    placeholder when total === 0, draws one bar per day with
 *    its count + per-day tooltip when there's usage, surfaces
 *    a hover `title` listing the underlying numbers per day, and
 *    — when wired with `bookingsByDay` + `onOpenBooking` — turns
 *    each non-zero bar into a real button that opens a day-scoped
 *    drill-down popover.
 */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  findUsageBookingsForTemplateOnDay,
  getTemplateUsageTrend,
  type AdminBooking,
  type TemplateUsageBooking,
  type TimelineEntry,
} from "@/state/adminMockData";

import {
  buildSparklineTooltip,
  TemplateUsageSparkline,
} from "./TemplateUsageSparkline";

afterEach(() => {
  cleanup();
});

// ─── Pure helper ─────────────────────────────────────────────────

function makeBooking(
  id: string,
  serviceTimeline: TimelineEntry[],
): AdminBooking {
  return {
    id,
    unitId: "u-1",
    customerName: "Eloise Tran",
    customerEmail: `${id}@example.com`,
    customerPhone: "0400 000 000",
    bookerRole: "owner",
    bookerAgencyId: null,
    bookerAgencyOtherName: "",
    accessMethod: null,
    tenants: [],
    systems: 1,
    additional: 0,
    acType: "split",
    discrepancy: null,
    serviceDate: "2026-04-30",
    serviceSlot: "morning",
    paymentStatus: "paid",
    serviceStatus: "scheduled",
    totalAud: 218,
    paymentTimeline: [],
    serviceTimeline,
    notes: "",
    rolloutId: null,
    createdAt: "2026-04-26T09:14:00.000Z",
    lastContactedAt: null,
  };
}

function entry(
  kind: "call" | "email",
  loggedAt: string | undefined,
  templateLabel: string | undefined,
): TimelineEntry {
  return {
    kind,
    status: kind === "call" ? "logged_call" : "logged_email",
    label: kind === "call" ? "Logged call · No answer" : "Logged email",
    at: "Apr 28 · 11:00",
    by: "Mia (admin)",
    ...(loggedAt !== undefined ? { loggedAt } : {}),
    ...(templateLabel !== undefined ? { templateLabel } : {}),
  };
}

describe("getTemplateUsageTrend · helper", () => {
  // Pin the window to a fixed UTC anchor so the seeded `loggedAt`
  // values land on predictable buckets regardless of the test
  // machine's timezone.
  const NOW = new Date("2026-04-30T12:00:00Z");

  it("returns a dense, oldest-first window of the requested length, full of zeros when no entries match", () => {
    const trend = getTemplateUsageTrend([], "call", "voicemail", { now: NOW });
    expect(trend.length).toBe(7);
    expect(trend.map((p) => p.date)).toEqual([
      "2026-04-24",
      "2026-04-25",
      "2026-04-26",
      "2026-04-27",
      "2026-04-28",
      "2026-04-29",
      "2026-04-30",
    ]);
    expect(trend.every((p) => p.count === 0)).toBe(true);
  });

  it("buckets timeline entries by the UTC day of their loggedAt timestamp", () => {
    const bookings = [
      makeBooking("bk-1", [
        // Apr 26, 27, 28 — three days of voicemail use, climbing.
        entry("call", "2026-04-26T03:00:00Z", "voicemail"),
        entry("call", "2026-04-27T05:00:00Z", "voicemail"),
        entry("call", "2026-04-27T11:00:00Z", "voicemail"),
        entry("call", "2026-04-28T08:00:00Z", "voicemail"),
        entry("call", "2026-04-28T09:00:00Z", "voicemail"),
        entry("call", "2026-04-28T10:00:00Z", "voicemail"),
      ]),
      makeBooking("bk-2", [
        // Same template on the email channel — must NOT be counted
        // against the call-side trend.
        entry("email", "2026-04-28T09:00:00Z", "voicemail"),
        // Different template, same day — also ignored.
        entry("call", "2026-04-28T10:30:00Z", "spoke"),
      ]),
    ];

    const trend = getTemplateUsageTrend(bookings, "call", "voicemail", {
      now: NOW,
    });
    expect(trend).toEqual([
      { date: "2026-04-24", count: 0 },
      { date: "2026-04-25", count: 0 },
      { date: "2026-04-26", count: 1 },
      { date: "2026-04-27", count: 2 },
      { date: "2026-04-28", count: 3 },
      { date: "2026-04-29", count: 0 },
      { date: "2026-04-30", count: 0 },
    ]);
  });

  it("trims the templateName before matching but keeps the snapshot-on-use literal compare for entries", () => {
    const bookings = [
      makeBooking("bk-1", [entry("call", "2026-04-28T09:00:00Z", "voicemail")]),
    ];
    const trend = getTemplateUsageTrend(bookings, "call", "  voicemail  ", {
      now: NOW,
    });
    const apr28 = trend.find((p) => p.date === "2026-04-28")!;
    expect(apr28.count).toBe(1);
  });

  it("ignores entries with missing or unparseable loggedAt, and entries outside the window", () => {
    const bookings = [
      makeBooking("bk-1", [
        entry("call", undefined, "voicemail"),
        entry("call", "not-a-date", "voicemail"),
        // Outside the 7-day window — Apr 20 < Apr 24.
        entry("call", "2026-04-20T09:00:00Z", "voicemail"),
        // Inside the window.
        entry("call", "2026-04-29T09:00:00Z", "voicemail"),
      ]),
    ];
    const trend = getTemplateUsageTrend(bookings, "call", "voicemail", {
      now: NOW,
    });
    const total = trend.reduce((sum, p) => sum + p.count, 0);
    expect(total).toBe(1);
    expect(trend.find((p) => p.date === "2026-04-29")!.count).toBe(1);
  });

  it("returns the all-zero window when the templateName is blank", () => {
    const bookings = [
      makeBooking("bk-1", [entry("call", "2026-04-28T09:00:00Z", "voicemail")]),
    ];
    const trend = getTemplateUsageTrend(bookings, "call", "   ", { now: NOW });
    expect(trend.length).toBe(7);
    expect(trend.every((p) => p.count === 0)).toBe(true);
  });

  it("respects a custom `days` window length", () => {
    const trend = getTemplateUsageTrend([], "email", "rebook", {
      days: 14,
      now: NOW,
    });
    expect(trend.length).toBe(14);
    expect(trend[0]!.date).toBe("2026-04-17");
    expect(trend[trend.length - 1]!.date).toBe("2026-04-30");
  });
});

// ─── Component ───────────────────────────────────────────────────

describe("TemplateUsageSparkline · component", () => {
  const SEEDED_TREND = [
    { date: "2026-04-24", count: 0 },
    { date: "2026-04-25", count: 0 },
    { date: "2026-04-26", count: 1 },
    { date: "2026-04-27", count: 2 },
    { date: "2026-04-28", count: 3 },
    { date: "2026-04-29", count: 0 },
    { date: "2026-04-30", count: 0 },
  ];

  it("renders the dim placeholder when the trend is all zeros", () => {
    const trend = [
      { date: "2026-04-24", count: 0 },
      { date: "2026-04-25", count: 0 },
      { date: "2026-04-26", count: 0 },
      { date: "2026-04-27", count: 0 },
      { date: "2026-04-28", count: 0 },
      { date: "2026-04-29", count: 0 },
      { date: "2026-04-30", count: 0 },
    ];
    render(
      <TemplateUsageSparkline kind="call" templateId="tpl-empty" trend={trend} />,
    );
    const node = screen.getByTestId("call-template-usage-sparkline-tpl-empty");
    expect(node.getAttribute("data-total")).toBe("0");
    expect(node.getAttribute("data-trend-days")).toBe("7");
    expect(node.textContent).toMatch(/no usage in the last 7 days/i);
    // Per-day numbers still surface in the tooltip so the empty
    // state is auditable.
    expect(node.getAttribute("title")).toContain("Apr 30 · 0");
    // No bars rendered — the placeholder branch has no <rect>s.
    expect(
      screen.queryByTestId(
        "call-template-usage-sparkline-bar-tpl-empty-2026-04-28",
      ),
    ).toBeNull();
  });

  it("renders one bar per day, pins each bar's data-count, and shows the +N this week delta when the trend has usage", () => {
    render(
      <TemplateUsageSparkline
        kind="call"
        templateId="voicemail"
        trend={SEEDED_TREND}
      />,
    );

    const node = screen.getByTestId("call-template-usage-sparkline-voicemail");
    expect(node.getAttribute("data-total")).toBe("6");
    expect(node.getAttribute("data-trend-days")).toBe("7");

    // Pin each bar's data-count so a future tweak to the renderer
    // still keeps the per-day numbers correct.
    const expectedCounts: Record<string, string> = {
      "2026-04-24": "0",
      "2026-04-25": "0",
      "2026-04-26": "1",
      "2026-04-27": "2",
      "2026-04-28": "3",
      "2026-04-29": "0",
      "2026-04-30": "0",
    };
    for (const [date, count] of Object.entries(expectedCounts)) {
      const bar = screen.getByTestId(
        `call-template-usage-sparkline-bar-voicemail-${date}`,
      );
      expect(bar.getAttribute("data-count")).toBe(count);
    }

    // Delta copy is the headline for at-a-glance scans.
    const delta = screen.getByTestId(
      "call-template-usage-sparkline-delta-voicemail",
    );
    expect(delta.textContent).toBe("+6 this week");

    // Tooltip lists every day so a hover on the delta label reveals
    // the underlying numbers without opening a separate analytics
    // view. The bars themselves don't carry the chart-level tooltip
    // — zero bars must stay non-interactive (Task #197).
    expect(delta.getAttribute("title")).toBe(
      buildSparklineTooltip(SEEDED_TREND),
    );
    expect(delta.getAttribute("title")).toContain("Apr 26 · 1");
    expect(delta.getAttribute("title")).toContain("Apr 28 · 3");
    expect(node.getAttribute("title")).toBeNull();
  });

  it("matches the seeded trend rendering byte-for-byte (regression pin)", () => {
    render(
      <TemplateUsageSparkline
        kind="email"
        templateId="rebook_link"
        trend={SEEDED_TREND}
      />,
    );

    expect(buildSparklineTooltip(SEEDED_TREND)).toBe(
      [
        "Apr 24 · 0",
        "Apr 25 · 0",
        "Apr 26 · 1",
        "Apr 27 · 2",
        "Apr 28 · 3",
        "Apr 29 · 0",
        "Apr 30 · 0",
      ].join("\n"),
    );

    const delta = screen.getByTestId(
      "email-template-usage-sparkline-delta-rebook_link",
    );
    expect(delta.textContent).toBe("+6 this week");
  });
});

// ─── Day-scoped drill-down helper ────────────────────────────────

describe("findUsageBookingsForTemplateOnDay · helper", () => {
  it("returns only the bookings whose timeline touched the template on the given UTC day", () => {
    const bookings = [
      makeBooking("bk-on-day-1", [
        entry("call", "2026-04-28T03:00:00Z", "voicemail"),
      ]),
      makeBooking("bk-on-day-2", [
        // Multiple matching entries on the same day → still
        // included exactly once.
        entry("call", "2026-04-28T07:00:00Z", "voicemail"),
        entry("call", "2026-04-28T08:00:00Z", "voicemail"),
      ]),
      makeBooking("bk-other-day", [
        entry("call", "2026-04-27T10:00:00Z", "voicemail"),
      ]),
      makeBooking("bk-other-template", [
        entry("call", "2026-04-28T10:30:00Z", "spoke"),
      ]),
      makeBooking("bk-other-channel", [
        entry("email", "2026-04-28T09:00:00Z", "voicemail"),
      ]),
    ];
    const matched = findUsageBookingsForTemplateOnDay(
      bookings,
      "call",
      "voicemail",
      "2026-04-28",
    );
    expect(matched.map((b) => b.id)).toEqual(["bk-on-day-1", "bk-on-day-2"]);
  });

  it("trims the templateName and ignores entries with missing or unparseable loggedAt", () => {
    const bookings = [
      makeBooking("bk-1", [
        entry("call", "2026-04-28T09:00:00Z", "voicemail"),
        entry("call", undefined, "voicemail"),
        entry("call", "not-a-date", "voicemail"),
      ]),
    ];
    const matched = findUsageBookingsForTemplateOnDay(
      bookings,
      "call",
      "  voicemail  ",
      "2026-04-28",
    );
    expect(matched.map((b) => b.id)).toEqual(["bk-1"]);
  });

  it("returns an empty list when the templateName or dayKey is blank", () => {
    const bookings = [
      makeBooking("bk-1", [entry("call", "2026-04-28T09:00:00Z", "voicemail")]),
    ];
    expect(
      findUsageBookingsForTemplateOnDay(bookings, "call", "  ", "2026-04-28"),
    ).toEqual([]);
    expect(
      findUsageBookingsForTemplateOnDay(bookings, "call", "voicemail", ""),
    ).toEqual([]);
  });
});

// ─── Sparkline click → drill-down filter ─────────────────────────

describe("TemplateUsageSparkline · click-to-filter (Task #197)", () => {
  const SEEDED_TREND = [
    { date: "2026-04-24", count: 0 },
    { date: "2026-04-25", count: 0 },
    { date: "2026-04-26", count: 1 },
    { date: "2026-04-27", count: 2 },
    { date: "2026-04-28", count: 3 },
    { date: "2026-04-29", count: 0 },
    { date: "2026-04-30", count: 0 },
  ];

  function makeSummary(
    bookingId: string,
    customerName: string,
  ): TemplateUsageBooking {
    return {
      bookingId,
      customerName,
      addressLine1: "12 Marine Parade, Apt 5",
      whenLabel: "30 Apr · Morning",
    };
  }

  // Pre-seed only the days that have non-zero counts — mirrors the
  // shape AdminApp builds (`if (point.count === 0) continue`).
  const BOOKINGS_BY_DAY: Record<string, TemplateUsageBooking[]> = {
    "2026-04-26": [makeSummary("bk-aaa", "Eloise Tran")],
    "2026-04-27": [
      makeSummary("bk-bbb", "Mia Holland"),
      makeSummary("bk-ccc", "Noah Reyes"),
    ],
    "2026-04-28": [
      makeSummary("bk-ddd", "Priya Kapoor"),
      makeSummary("bk-eee", "Quinn Walsh"),
      makeSummary("bk-fff", "Rohan Singh"),
    ],
  };

  it("renders zero-count bars as inert spans and non-zero bars as buttons that announce the day & booking count", () => {
    render(
      <TemplateUsageSparkline
        kind="call"
        templateId="voicemail"
        trend={SEEDED_TREND}
        templateName="Voicemail"
        bookingsByDay={BOOKINGS_BY_DAY}
        onOpenBooking={() => {}}
      />,
    );

    // Zero-count bar → not interactive, no popup affordance.
    const zeroBar = screen.getByTestId(
      "call-template-usage-sparkline-bar-voicemail-2026-04-25",
    );
    expect(zeroBar.tagName).toBe("SPAN");
    expect(zeroBar.getAttribute("data-interactive")).toBe("false");

    // Non-zero bar → real button with aria-haspopup + clear label.
    const liveBar = screen.getByTestId(
      "call-template-usage-sparkline-bar-voicemail-2026-04-28",
    );
    expect(liveBar.tagName).toBe("BUTTON");
    expect(liveBar.getAttribute("data-interactive")).toBe("true");
    expect(liveBar.getAttribute("aria-haspopup")).toBe("dialog");
    expect(liveBar.getAttribute("aria-expanded")).toBe("false");
    expect(liveBar.getAttribute("aria-label")).toBe(
      "Apr 28 · 3 · open 3 bookings",
    );
  });

  it("keeps zero-count bars free of any hover affordance and never nests interactive bars inside an aria-hidden subtree", () => {
    render(
      <TemplateUsageSparkline
        kind="call"
        templateId="voicemail"
        trend={SEEDED_TREND}
        templateName="Voicemail"
        bookingsByDay={BOOKINGS_BY_DAY}
        onOpenBooking={() => {}}
      />,
    );

    // Zero-count bars must have no `title` (no tooltip on hover) so
    // they read as truly inert per Task #197 spec.
    const zeroBar = screen.getByTestId(
      "call-template-usage-sparkline-bar-voicemail-2026-04-25",
    );
    expect(zeroBar.getAttribute("title")).toBeNull();

    // The interactive button must not sit inside an aria-hidden
    // ancestor, otherwise assistive tech would skip it despite the
    // aria-label.
    const liveBar = screen.getByTestId(
      "call-template-usage-sparkline-bar-voicemail-2026-04-28",
    );
    let cursor: HTMLElement | null = liveBar.parentElement;
    while (cursor) {
      expect(cursor.getAttribute("aria-hidden")).not.toBe("true");
      cursor = cursor.parentElement;
    }
  });

  it("clicking a non-zero bar opens the day-scoped popover with exactly the bookings whose timeline touched the template that day", () => {
    render(
      <TemplateUsageSparkline
        kind="call"
        templateId="voicemail"
        trend={SEEDED_TREND}
        templateName="Voicemail"
        bookingsByDay={BOOKINGS_BY_DAY}
        onOpenBooking={() => {}}
      />,
    );

    const apr27Bar = screen.getByTestId(
      "call-template-usage-sparkline-bar-voicemail-2026-04-27",
    );
    expect(
      screen.queryByTestId(
        "call-template-usage-sparkline-popover-voicemail",
      ),
    ).toBeNull();

    fireEvent.click(apr27Bar);

    const popover = screen.getByTestId(
      "call-template-usage-sparkline-popover-voicemail",
    );
    // The popover is scoped to the clicked day, not the full window.
    expect(popover.getAttribute("data-day")).toBe("2026-04-27");
    expect(popover.getAttribute("aria-label")).toContain("Voicemail");
    expect(popover.getAttribute("aria-label")).toContain("Apr 27");
    expect(popover.textContent).toContain("Apr 27");
    expect(popover.textContent).toContain("2 bookings");

    // Only the Apr 27 bookings are listed — no leakage from the
    // adjacent (non-zero) Apr 26 / Apr 28 buckets.
    expect(
      screen.getByTestId(
        "call-template-usage-sparkline-booking-voicemail-2026-04-27-bk-bbb",
      ),
    ).toBeTruthy();
    expect(
      screen.getByTestId(
        "call-template-usage-sparkline-booking-voicemail-2026-04-27-bk-ccc",
      ),
    ).toBeTruthy();
    expect(
      screen.queryByTestId(
        "call-template-usage-sparkline-booking-voicemail-2026-04-27-bk-aaa",
      ),
    ).toBeNull();
    expect(
      screen.queryByTestId(
        "call-template-usage-sparkline-booking-voicemail-2026-04-27-bk-ddd",
      ),
    ).toBeNull();

    expect(apr27Bar.getAttribute("aria-expanded")).toBe("true");
  });

  it("clicking a booking row inside the popover invokes onOpenBooking and closes the popover", () => {
    const onOpenBooking = vi.fn();
    render(
      <TemplateUsageSparkline
        kind="email"
        templateId="rebook_link"
        trend={SEEDED_TREND}
        templateName="Rebook link"
        bookingsByDay={BOOKINGS_BY_DAY}
        onOpenBooking={onOpenBooking}
      />,
    );

    fireEvent.click(
      screen.getByTestId(
        "email-template-usage-sparkline-bar-rebook_link-2026-04-28",
      ),
    );

    fireEvent.click(
      screen.getByTestId(
        "email-template-usage-sparkline-booking-rebook_link-2026-04-28-bk-eee",
      ),
    );

    expect(onOpenBooking).toHaveBeenCalledTimes(1);
    expect(onOpenBooking).toHaveBeenCalledWith("bk-eee");
    expect(
      screen.queryByTestId(
        "email-template-usage-sparkline-popover-rebook_link",
      ),
    ).toBeNull();
  });

  it("re-clicking the same bar toggles the popover closed without firing onOpenBooking", () => {
    const onOpenBooking = vi.fn();
    render(
      <TemplateUsageSparkline
        kind="call"
        templateId="voicemail"
        trend={SEEDED_TREND}
        templateName="Voicemail"
        bookingsByDay={BOOKINGS_BY_DAY}
        onOpenBooking={onOpenBooking}
      />,
    );

    const bar = screen.getByTestId(
      "call-template-usage-sparkline-bar-voicemail-2026-04-26",
    );
    fireEvent.click(bar);
    expect(
      screen.getByTestId("call-template-usage-sparkline-popover-voicemail"),
    ).toBeTruthy();
    fireEvent.click(bar);
    expect(
      screen.queryByTestId("call-template-usage-sparkline-popover-voicemail"),
    ).toBeNull();
    expect(onOpenBooking).not.toHaveBeenCalled();
  });

  it("Escape closes an open popover", () => {
    render(
      <TemplateUsageSparkline
        kind="call"
        templateId="voicemail"
        trend={SEEDED_TREND}
        templateName="Voicemail"
        bookingsByDay={BOOKINGS_BY_DAY}
        onOpenBooking={() => {}}
      />,
    );
    fireEvent.click(
      screen.getByTestId(
        "call-template-usage-sparkline-bar-voicemail-2026-04-28",
      ),
    );
    expect(
      screen.getByTestId("call-template-usage-sparkline-popover-voicemail"),
    ).toBeTruthy();
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape" }),
      );
    });
    expect(
      screen.queryByTestId("call-template-usage-sparkline-popover-voicemail"),
    ).toBeNull();
  });

  it("leaves bars non-interactive when bookingsByDay or onOpenBooking is omitted", () => {
    render(
      <TemplateUsageSparkline
        kind="call"
        templateId="voicemail"
        trend={SEEDED_TREND}
      />,
    );
    const liveBar = screen.getByTestId(
      "call-template-usage-sparkline-bar-voicemail-2026-04-28",
    );
    // Falls back to the inert span renderer — no click affordance.
    expect(liveBar.tagName).toBe("SPAN");
    expect(liveBar.getAttribute("data-interactive")).toBe("false");
  });
});
