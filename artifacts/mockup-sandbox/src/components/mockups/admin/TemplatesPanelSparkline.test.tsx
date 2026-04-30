// @vitest-environment happy-dom

/**
 * Pin the per-row 7-day usage sparkline + "+N this week" delta on the
 * Call/Email Templates management panels (Task #229). The same
 * affordance the bulk pickers (AwaitingCoordinationView) and per-row
 * Log call/Log email forms (BookingDetail) already render via
 * {@link TemplateUsageSparkline} now sits on each row of the
 * management panels too, so admins can spot a climbing template
 * without opening the picker on a booking.
 *
 * Two flavors of coverage:
 *
 *   - Standalone: render each view directly with a hand-built
 *     `usageTrends` map so the per-row testids
 *     (`{kind}-template-usage-sparkline-{tplId}` and the
 *     `{kind}-template-usage-sparkline-delta-{tplId}` companion) are
 *     pinned for both populated and zero-usage rows. The zero-usage
 *     row is the regression anchor for the "Custom templates and
 *     just-created templates (no usage yet) gracefully render an
 *     empty sparkline / no delta" criterion the task calls out.
 *
 *   - AdminApp-mounted: mount the full shell, drive a couple of bulk
 *     `Log call` / `Log email` submissions through a coordination row,
 *     then jump to the templates panel and assert the live sparkline
 *     delta moves accordingly. Catches a future refactor that wires
 *     the views' `usageTrends` prop to a stale snapshot or drops the
 *     `usageBookingsByDay` map entirely.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  CALL_TEMPLATES,
  EMAIL_TEMPLATES,
  type CallTemplate,
  type EmailTemplate,
  type TemplateUsageTrendPoint,
} from "@/state/adminMockData";

import { AdminApp } from "./AdminApp";
import { CallTemplatesView } from "./CallTemplatesView";
import { EmailTemplatesView } from "./EmailTemplatesView";

afterEach(cleanup);

const SEVEN_DAYS = [
  "2026-04-24",
  "2026-04-25",
  "2026-04-26",
  "2026-04-27",
  "2026-04-28",
  "2026-04-29",
  "2026-04-30",
];

function trendWithUsage(counts: number[]): TemplateUsageTrendPoint[] {
  return SEVEN_DAYS.map((date, i) => ({ date, count: counts[i] ?? 0 }));
}

function emptyTrend(): TemplateUsageTrendPoint[] {
  return SEVEN_DAYS.map((date) => ({ date, count: 0 }));
}

function makeCallTemplates(): CallTemplate[] {
  return [
    {
      id: "tpl-busy",
      name: "No answer — left voicemail",
      note: "Voicemail copy.",
    },
    {
      id: "tpl-quiet",
      name: "Spoke — confirmed window",
      note: "Confirmation copy.",
    },
  ];
}

function makeEmailTemplates(): EmailTemplate[] {
  return [
    {
      id: "tpl-busy",
      name: "Sent rebook link",
      subject: "Rebook your appointment",
      note: "Rebook copy.",
    },
    {
      id: "tpl-quiet",
      name: "Sent NSW Fair Trading explainer",
      subject: "About the inspection",
      note: "Explainer copy.",
    },
  ];
}

describe("CallTemplatesView · per-row usage sparkline (Task #229)", () => {
  it("renders the sparkline + '+N this week' delta beside each row when a trend is provided", () => {
    const templates = makeCallTemplates();
    const usageTrends = {
      "tpl-busy": trendWithUsage([0, 0, 1, 2, 3, 0, 0]),
      "tpl-quiet": emptyTrend(),
    };

    render(
      <CallTemplatesView
        templates={templates}
        usageTrends={usageTrends}
        onCreate={() => {}}
        onUpdate={() => {}}
        onRemove={() => {}}
        onSetDefault={() => {}}
      />,
    );

    // Each row gets a sparkline keyed by the template id (no
    // bulk-/row- prefix, matching the templates panel's renderer).
    for (const tpl of templates) {
      expect(
        screen.getByTestId(`call-template-usage-sparkline-${tpl.id}`),
      ).toBeTruthy();
    }

    // The busy row's delta says "+6 this week" — sums every bucket.
    const busyDelta = screen.getByTestId(
      "call-template-usage-sparkline-delta-tpl-busy",
    );
    expect(busyDelta.textContent).toBe("+6 this week");

    // Each per-day count is pinned on the bar's data attribute so a
    // future tweak to the renderer keeps the trend faithful.
    const expectedBusy: Record<string, string> = {
      "2026-04-24": "0",
      "2026-04-25": "0",
      "2026-04-26": "1",
      "2026-04-27": "2",
      "2026-04-28": "3",
      "2026-04-29": "0",
      "2026-04-30": "0",
    };
    for (const [date, count] of Object.entries(expectedBusy)) {
      const bar = screen.getByTestId(
        `call-template-usage-sparkline-bar-tpl-busy-${date}`,
      );
      expect(bar.getAttribute("data-count")).toBe(count);
    }
  });

  it("renders an empty 'no usage' placeholder (no delta) for templates without any usage in the trend window", () => {
    const templates = makeCallTemplates();
    const usageTrends = {
      "tpl-busy": emptyTrend(),
      "tpl-quiet": emptyTrend(),
    };

    render(
      <CallTemplatesView
        templates={templates}
        usageTrends={usageTrends}
        onCreate={() => {}}
        onUpdate={() => {}}
        onRemove={() => {}}
        onSetDefault={() => {}}
      />,
    );

    for (const tpl of templates) {
      const node = screen.getByTestId(
        `call-template-usage-sparkline-${tpl.id}`,
      );
      expect(node.getAttribute("data-total")).toBe("0");
      expect(node.textContent).toMatch(/no usage in the last 7 days/i);
      // The placeholder branch intentionally omits the delta testid so
      // empty rows stay visually quiet.
      expect(
        screen.queryByTestId(
          `call-template-usage-sparkline-delta-${tpl.id}`,
        ),
      ).toBeNull();
    }
  });

  it("omits the sparkline entirely when no usageTrends prop is supplied (legacy fallback)", () => {
    const templates = makeCallTemplates();

    render(
      <CallTemplatesView
        templates={templates}
        onCreate={() => {}}
        onUpdate={() => {}}
        onRemove={() => {}}
        onSetDefault={() => {}}
      />,
    );

    for (const tpl of templates) {
      expect(
        screen.queryByTestId(`call-template-usage-sparkline-${tpl.id}`),
      ).toBeNull();
    }
  });
});

describe("EmailTemplatesView · per-row usage sparkline (Task #229)", () => {
  it("renders the sparkline + '+N this week' delta beside each row when a trend is provided", () => {
    const templates = makeEmailTemplates();
    const usageTrends = {
      "tpl-busy": trendWithUsage([0, 1, 0, 2, 0, 0, 1]),
      "tpl-quiet": emptyTrend(),
    };

    render(
      <EmailTemplatesView
        templates={templates}
        usageTrends={usageTrends}
        onCreate={() => {}}
        onUpdate={() => {}}
        onRemove={() => {}}
        onSetDefault={() => {}}
      />,
    );

    for (const tpl of templates) {
      expect(
        screen.getByTestId(`email-template-usage-sparkline-${tpl.id}`),
      ).toBeTruthy();
    }

    const busyDelta = screen.getByTestId(
      "email-template-usage-sparkline-delta-tpl-busy",
    );
    expect(busyDelta.textContent).toBe("+4 this week");
  });

  it("renders an empty 'no usage' placeholder (no delta) for templates without any usage in the trend window", () => {
    const templates = makeEmailTemplates();
    const usageTrends = {
      "tpl-busy": emptyTrend(),
      "tpl-quiet": emptyTrend(),
    };

    render(
      <EmailTemplatesView
        templates={templates}
        usageTrends={usageTrends}
        onCreate={() => {}}
        onUpdate={() => {}}
        onRemove={() => {}}
        onSetDefault={() => {}}
      />,
    );

    for (const tpl of templates) {
      const node = screen.getByTestId(
        `email-template-usage-sparkline-${tpl.id}`,
      );
      expect(node.getAttribute("data-total")).toBe("0");
      expect(node.textContent).toMatch(/no usage in the last 7 days/i);
      expect(
        screen.queryByTestId(
          `email-template-usage-sparkline-delta-${tpl.id}`,
        ),
      ).toBeNull();
    }
  });
});

/**
 * Mounts the full AdminApp shell so we can prove the panel's
 * `usageTrends` prop is actually wired to the live `allBookings`
 * state — driving a bulk Log-call submission through a coordination
 * row should immediately bump the matching template's sparkline
 * delta on the Call templates panel without any extra plumbing
 * step. Catches a regression where AdminApp drops the memo or the
 * view stops threading the prop through.
 */
describe("Templates panel sparkline ↔ AdminApp wiring", () => {
  /** Read the integer N from a "+N this week" delta string. Returns
   *  0 when the delta is missing (the panel omits the testid for
   *  templates with no usage in the trend window). */
  function readDelta(testId: string): number {
    const node = screen.queryByTestId(testId);
    if (!node) return 0;
    const match = node.textContent?.match(/^\+(\d+) this week$/);
    if (!match) {
      throw new Error(
        `Unexpected delta text on ${testId}: ${node.textContent}`,
      );
    }
    return Number(match[1]);
  }

  it("a bulk Log-call submission bumps the matching template's sparkline delta by exactly one on the Call templates panel", () => {
    render(<AdminApp />);

    const tpl = CALL_TEMPLATES[0]!;
    const deltaTestId = `call-template-usage-sparkline-delta-${tpl.id}`;

    // Capture the pre-submit delta on the Call templates panel so the
    // assertion below pins the exact bump rather than just "is some
    // positive number" (which a stale-snapshot regression could
    // satisfy from the seeded baseline alone).
    fireEvent.click(screen.getByRole("button", { name: "Call templates" }));
    const before = readDelta(deltaTestId);

    // Drive a bulk Log-call submission through one coordination row.
    fireEvent.click(
      screen.getByRole("button", { name: "Awaiting coordination" }),
    );
    fireEvent.click(screen.getByTestId("checkbox-coordination-row-bk-1038"));
    fireEvent.click(screen.getByTestId("button-bulk-log-call"));
    fireEvent.change(screen.getByTestId("select-bulk-call-template"), {
      target: { value: tpl.id },
    });
    fireEvent.click(screen.getByTestId("button-bulk-confirm-log-call"));

    // Jump back to the Call templates panel — the delta on the
    // matching row must reflect exactly one new entry (we picked one
    // coordination row above, and "now" sits inside the rolling
    // 7-day window so the entry lands in the trend bucket).
    fireEvent.click(screen.getByRole("button", { name: "Call templates" }));
    const after = readDelta(deltaTestId);
    expect(after).toBe(before + 1);
  });

  it("a bulk Log-email submission bumps the matching template's sparkline delta by exactly one on the Email templates panel", () => {
    render(<AdminApp />);

    const tpl = EMAIL_TEMPLATES[0]!;
    const deltaTestId = `email-template-usage-sparkline-delta-${tpl.id}`;

    fireEvent.click(screen.getByRole("button", { name: "Email templates" }));
    const before = readDelta(deltaTestId);

    fireEvent.click(
      screen.getByRole("button", { name: "Awaiting coordination" }),
    );
    fireEvent.click(screen.getByTestId("checkbox-coordination-row-bk-1038"));
    fireEvent.click(screen.getByTestId("button-bulk-log-email"));
    fireEvent.change(screen.getByTestId("select-bulk-email-template"), {
      target: { value: tpl.id },
    });
    fireEvent.click(screen.getByTestId("button-bulk-confirm-log-email"));

    fireEvent.click(screen.getByRole("button", { name: "Email templates" }));
    const after = readDelta(deltaTestId);
    expect(after).toBe(before + 1);
  });
});
