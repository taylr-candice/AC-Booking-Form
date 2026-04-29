/**
 * Unit tests for {@link formatAttemptRecency}, the pure helper that
 * powers the row-level "Last attempt: spoke · 2h ago" line on the
 * bookings list and Awaiting-coordination queue. Locks down:
 *   - null / malformed / future timestamps return null so callers
 *     can omit the suffix instead of rendering "NaNh ago"
 *   - label shape ("just now" / "Xh ago" / "yesterday" / "Xd ago")
 *   - severity flip at exactly the {@link LAST_ATTEMPT_STALE_HOURS}
 *     boundary (48h), which is the threshold both views use to
 *     switch the line into amber warning text
 */

import { describe, expect, it } from "vitest";

import {
  formatAttemptRecency,
  LAST_ATTEMPT_STALE_HOURS,
} from "./adminMockData";

const NOW = new Date("2026-04-29T12:00:00+10:00");

describe("formatAttemptRecency", () => {
  it("returns null when loggedAt is null", () => {
    expect(formatAttemptRecency(null, NOW)).toBeNull();
  });

  it("returns null for malformed timestamps", () => {
    for (const bad of ["", "not-a-date", "2026-13-99T99:99:99Z"]) {
      expect(formatAttemptRecency(bad, NOW)).toBeNull();
    }
  });

  it("returns null for future-dated timestamps (clock skew)", () => {
    expect(
      formatAttemptRecency("2026-04-30T00:00:00+10:00", NOW),
    ).toBeNull();
  });

  it("reads as 'just now' / fresh for diffs under an hour", () => {
    expect(formatAttemptRecency("2026-04-29T11:30:00+10:00", NOW)).toEqual({
      label: "just now",
      severity: "fresh",
    });
  });

  it("formats sub-day diffs in hours and stays fresh", () => {
    expect(formatAttemptRecency("2026-04-29T06:00:00+10:00", NOW)).toEqual({
      label: "6h ago",
      severity: "fresh",
    });
  });

  it("reads as 'yesterday' between 24h and 48h, still fresh", () => {
    // 26h before NOW → past 24h, still inside 48h → label "yesterday",
    // severity "fresh" (the staleness threshold is the upper edge).
    expect(formatAttemptRecency("2026-04-28T10:00:00+10:00", NOW)).toEqual({
      label: "yesterday",
      severity: "fresh",
    });
  });

  it("flips to 'stale' at exactly LAST_ATTEMPT_STALE_HOURS (48h)", () => {
    // Pin "now" to exactly 48h after the logged time so the boundary
    // semantics are unambiguous regardless of how the constant is
    // tuned in the future. The label at the 48h mark is "2d ago"
    // (24h ≤ diff stops being "yesterday" once days ≥ 2).
    const loggedAt = "2026-04-27T12:00:00+10:00";
    const result = formatAttemptRecency(loggedAt, NOW);
    expect(result).toEqual({ label: "2d ago", severity: "stale" });
    // Sanity check: the constant is what we think it is — guards
    // against an accidental retune that would silently shift the
    // visual flip on every booking row.
    expect(LAST_ATTEMPT_STALE_HOURS).toBe(48);
  });

  it("formats multi-day diffs in days and stays stale", () => {
    expect(formatAttemptRecency("2026-04-22T12:10:00+10:00", NOW)).toEqual({
      label: "6d ago",
      severity: "stale",
    });
  });
});
