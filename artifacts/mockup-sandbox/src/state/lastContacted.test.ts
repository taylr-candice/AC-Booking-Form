/**
 * Unit tests for {@link formatLastContacted}, the pure helper that
 * powers the "Last chased Xh/Xd ago" / "Never chased" chip in the
 * admin Awaiting-coordination queue and the booking detail Schedule
 * card. Locks down:
 *   - null / malformed timestamps fall back to "never chased"
 *   - label shape ("just now" / "Xh ago" / "Xd ago")
 *   - severity flip at the 24h boundary
 *   - clamping of negative diffs (lastContactedAt in the future)
 */

import { describe, expect, it } from "vitest";

import { formatLastContacted } from "./adminMockData";

const NOW = new Date("2026-04-29T12:00:00+10:00");

describe("formatLastContacted", () => {
  it("returns 'never chased' / 'never' when lastContactedAt is null", () => {
    const r = formatLastContacted(null, NOW);
    expect(r.label).toBe("never chased");
    expect(r.severity).toBe("never");
    expect(r.hours).toBe(0);
  });

  it("falls back to 'never chased' for malformed timestamps", () => {
    for (const bad of ["", "not-a-date", "2026-13-99T99:99:99Z"]) {
      const r = formatLastContacted(bad, NOW);
      expect(r.label).toBe("never chased");
      expect(r.severity).toBe("never");
      expect(r.hours).toBe(0);
    }
  });

  it("reads as 'just now' for diffs under an hour", () => {
    const r = formatLastContacted("2026-04-29T11:30:00+10:00", NOW);
    expect(r.label).toBe("just now");
    expect(r.severity).toBe("fresh");
  });

  it("formats sub-day diffs in hours and stays 'fresh' under 24h", () => {
    const r = formatLastContacted("2026-04-29T06:00:00+10:00", NOW);
    expect(r.label).toBe("6h ago");
    expect(r.severity).toBe("fresh");
  });

  it("flips to 'stale' at exactly 24h since chase", () => {
    const r = formatLastContacted("2026-04-28T12:00:00+10:00", NOW);
    expect(r.label).toBe("1d ago");
    expect(r.severity).toBe("stale");
  });

  it("formats multi-day diffs in days and stays 'stale'", () => {
    const r = formatLastContacted("2026-04-23T11:50:00+10:00", NOW);
    expect(r.label).toBe("6d ago");
    expect(r.severity).toBe("stale");
  });

  it("clamps a future lastContactedAt to 'just now' / 'fresh'", () => {
    const r = formatLastContacted("2026-04-30T00:00:00+10:00", NOW);
    expect(r.label).toBe("just now");
    expect(r.severity).toBe("fresh");
    expect(r.hours).toBe(0);
  });
});
