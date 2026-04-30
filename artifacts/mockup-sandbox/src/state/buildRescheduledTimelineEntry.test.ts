/**
 * Unit tests for {@link buildRescheduledTimelineEntry} — the pure
 * helper behind the admin "Reschedule" action surfaced from the
 * BookingDetail Schedule card. Stamps the timeline entry that
 * accompanies a slot swap.
 */

import { describe, expect, it } from "vitest";

import {
  ADMIN_USER_LABEL,
  buildRescheduledTimelineEntry,
} from "./adminMockData";

describe("buildRescheduledTimelineEntry", () => {
  it("encodes the picked morning window with a short, locale-agnostic date", () => {
    const entry = buildRescheduledTimelineEntry({
      date: "2026-05-04",
      window: "morning",
    });
    expect(entry.status).toBe("rescheduled");
    expect(entry.label).toBe("Rescheduled · 4 May · Morning");
    expect(entry.by).toBe(ADMIN_USER_LABEL);
    expect(entry.at).toBe("Just now");
  });

  it("uses the Afternoon label when the window is afternoon", () => {
    const entry = buildRescheduledTimelineEntry({
      date: "2026-05-04",
      window: "afternoon",
    });
    expect(entry.label).toBe("Rescheduled · 4 May · Afternoon");
  });

  it("uses the Evening label when the window is evening", () => {
    const entry = buildRescheduledTimelineEntry({
      date: "2026-05-04",
      window: "evening",
    });
    expect(entry.label).toBe("Rescheduled · 4 May · Evening");
  });

  it("appends a trimmed note to the Evening label too", () => {
    const entry = buildRescheduledTimelineEntry({
      date: "2026-05-04",
      window: "evening",
      note: "  customer prefers after-work  ",
    });
    expect(entry.label).toBe(
      "Rescheduled · 4 May · Evening · customer prefers after-work",
    );
  });

  it("respects an explicit actor + timestamp override", () => {
    const entry = buildRescheduledTimelineEntry(
      { date: "2026-05-06", window: "morning" },
      "System",
      "2 minutes ago",
    );
    expect(entry.by).toBe("System");
    expect(entry.at).toBe("2 minutes ago");
  });

  it("appends a trimmed note to the label when ops adds a reason", () => {
    const entry = buildRescheduledTimelineEntry({
      date: "2026-05-04",
      window: "afternoon",
      note: "  tenant called back  ",
    });
    expect(entry.label).toBe(
      "Rescheduled · 4 May · Afternoon · tenant called back",
    );
  });

  it("ignores a blank / whitespace-only note", () => {
    const entry = buildRescheduledTimelineEntry({
      date: "2026-05-04",
      window: "morning",
      note: "   ",
    });
    expect(entry.label).toBe("Rescheduled · 4 May · Morning");
  });
});
