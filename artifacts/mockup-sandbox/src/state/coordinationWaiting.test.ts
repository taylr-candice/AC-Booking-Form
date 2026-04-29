/**
 * Unit tests for {@link formatCoordinationWaiting}, the pure helper
 * that powers the "Waiting Xh / Xd" chip in the admin Awaiting-
 * coordination queue and the booking detail Schedule card. Locks down:
 *   - label shape ("just now" / "Xh" / "Xd")
 *   - severity buckets at the 24h / 48h boundaries
 *   - clamping of negative diffs (createdAt in the future)
 */

import { describe, expect, it } from "vitest";

import { formatCoordinationWaiting } from "./adminMockData";

const NOW = new Date("2026-04-29T12:00:00+10:00");

describe("formatCoordinationWaiting", () => {
  it("reads as 'just now' for diffs under an hour", () => {
    const r = formatCoordinationWaiting("2026-04-29T11:30:00+10:00", NOW);
    expect(r.label).toBe("just now");
    expect(r.severity).toBe("fresh");
  });

  it("formats sub-day diffs in hours and stays 'fresh' under 24h", () => {
    const r = formatCoordinationWaiting("2026-04-29T06:00:00+10:00", NOW);
    expect(r.label).toBe("6h");
    expect(r.severity).toBe("fresh");
  });

  it("flips to 'warn' at exactly 24h waited", () => {
    const r = formatCoordinationWaiting("2026-04-28T12:00:00+10:00", NOW);
    expect(r.label).toBe("1d");
    expect(r.severity).toBe("warn");
  });

  it("stays 'warn' between 24h and 48h", () => {
    const r = formatCoordinationWaiting("2026-04-27T18:00:00+10:00", NOW);
    expect(r.severity).toBe("warn");
  });

  it("flips to 'stale' at exactly 48h waited", () => {
    const r = formatCoordinationWaiting("2026-04-27T12:00:00+10:00", NOW);
    expect(r.label).toBe("2d");
    expect(r.severity).toBe("stale");
  });

  it("formats multi-day diffs in days and stays 'stale'", () => {
    const r = formatCoordinationWaiting("2026-04-23T11:50:00+10:00", NOW);
    expect(r.label).toBe("6d");
    expect(r.severity).toBe("stale");
  });

  it("clamps a future createdAt to 'just now' / 'fresh'", () => {
    const r = formatCoordinationWaiting("2026-04-30T00:00:00+10:00", NOW);
    expect(r.label).toBe("just now");
    expect(r.severity).toBe("fresh");
    expect(r.hours).toBe(0);
  });

  it("falls back to 'just now' / 'fresh' for malformed timestamps", () => {
    for (const bad of ["", "not-a-date", "2026-13-99T99:99:99Z"]) {
      const r = formatCoordinationWaiting(bad, NOW);
      expect(r.label).toBe("just now");
      expect(r.severity).toBe("fresh");
      expect(r.hours).toBe(0);
    }
  });
});
