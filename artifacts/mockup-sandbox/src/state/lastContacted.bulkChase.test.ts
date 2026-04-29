/**
 * Regression tests for {@link applyBulkChase} — the pure helper behind
 * the bulk "Mark as chased" action in the admin Awaiting-coordination
 * queue (`AdminApp.bulkMarkAsChased`).
 *
 * The per-booking "Mark as chased" affordance has since been replaced
 * by structured `logCall` / `logEmail` actions on BookingDetail, but
 * the bulk action still stamps the canonical generic "Marked as chased"
 * entry so ops can fast-track several rows in one go. Each row that
 * the bulk patch touches must:
 *   - get a new timeline entry whose shape is exactly the canonical
 *     {@link buildChasedTimelineEntry} (so audit reports stay stable
 *     and the entry shape can't drift behind the back of either path
 *     that builds it);
 *   - have `lastContactedAt` stamped with the supplied ISO time;
 *   - and the live demo row (`bk-live`) must be left untouched even
 *     when it appears in the id list (the customer flow owns it),
 *     while unselected bookings pass through referentially identical
 *     so React only re-renders the rows that actually changed.
 */

import { describe, expect, it } from "vitest";

import {
  ADMIN_USER_LABEL,
  applyBulkChase,
  buildChasedTimelineEntry,
  SEEDED_BOOKINGS,
  coordinationKindForBooking,
  type AdminBooking,
  type TimelineEntry,
} from "./adminMockData";

const NOW_ISO = "2026-04-29T12:00:00.000Z";

/**
 * Pick the seeded bookings that are actually in the coordination queue
 * (slot is `to_be_coordinated`). These are the rows the bulk action
 * targets in the admin UI.
 */
function seededCoordinationBookings(): AdminBooking[] {
  return SEEDED_BOOKINGS.filter(
    (b) => coordinationKindForBooking(b) !== null,
  );
}

/**
 * Synthesise a `bk-live` coordination booking and prepend it to the
 * seeded list, so we can assert the bulk patch silently skips it even
 * when it shows up in `ids`.
 */
function bookingsWithLiveRow(): AdminBooking[] {
  const template = seededCoordinationBookings()[0];
  if (!template) {
    throw new Error(
      "Seed data must include at least one coordination booking for this test.",
    );
  }
  const liveRow: AdminBooking = {
    ...template,
    id: "bk-live",
    isLive: true,
    lastContactedAt: null,
  };
  return [liveRow, ...SEEDED_BOOKINGS];
}

describe("applyBulkChase", () => {
  it("appends the canonical chased entry to every selected booking", () => {
    const bookings = seededCoordinationBookings();
    expect(bookings.length).toBeGreaterThanOrEqual(2);
    const ids = bookings.map((b) => b.id);

    const result = applyBulkChase(bookings, ids, NOW_ISO);

    const expectedEntry: TimelineEntry = buildChasedTimelineEntry();
    // Cross-check the canonical entry shape literally — this is the
    // contract the bulk path must stamp; if either side drifts the
    // assertion below blows up.
    expect(expectedEntry).toEqual({
      status: "chased",
      label: "Marked as chased",
      at: "Just now",
      by: ADMIN_USER_LABEL,
    });

    for (const before of bookings) {
      const after = result.find((b) => b.id === before.id);
      expect(after).toBeDefined();
      expect(after!.lastContactedAt).toBe(NOW_ISO);
      // Prior timeline entries are preserved in order; the new entry
      // is appended at the tail and exactly matches the per-booking
      // shape returned by buildChasedTimelineEntry().
      expect(after!.serviceTimeline.slice(0, -1)).toEqual(
        before.serviceTimeline,
      );
      expect(after!.serviceTimeline.at(-1)).toEqual(expectedEntry);
    }
  });

  it("stamps lastContactedAt identically across every selected booking", () => {
    const bookings = seededCoordinationBookings();
    const ids = bookings.map((b) => b.id);

    const result = applyBulkChase(bookings, ids, NOW_ISO);

    const stamps = result
      .filter((b) => ids.includes(b.id))
      .map((b) => b.lastContactedAt);
    expect(stamps.every((s) => s === NOW_ISO)).toBe(true);
  });

  it("leaves the bk-live row untouched even when its id is in the list", () => {
    const bookings = bookingsWithLiveRow();
    const liveBefore = bookings.find((b) => b.id === "bk-live");
    expect(liveBefore).toBeDefined();
    const ids = bookings
      .filter((b) => coordinationKindForBooking(b) !== null)
      .map((b) => b.id);
    expect(ids).toContain("bk-live");

    const result = applyBulkChase(bookings, ids, NOW_ISO);

    const liveAfter = result.find((b) => b.id === "bk-live");
    expect(liveAfter).toBeDefined();
    // Same reference — the row is passed through, not even shallow-copied.
    expect(liveAfter).toBe(liveBefore);
    expect(liveAfter!.lastContactedAt).toBeNull();
    expect(liveAfter!.serviceTimeline).toEqual(liveBefore!.serviceTimeline);
  });

  it("leaves unselected bookings unchanged (and referentially identical)", () => {
    const bookings = SEEDED_BOOKINGS.slice();
    const coordination = seededCoordinationBookings();
    // Select only the first coordination row; everything else must be
    // returned by reference so React skips re-rendering those rows.
    const selected = coordination.slice(0, 1);
    expect(selected.length).toBe(1);
    const selectedId = selected[0]!.id;

    const result = applyBulkChase(bookings, [selectedId], NOW_ISO);

    expect(result.length).toBe(bookings.length);
    for (let i = 0; i < bookings.length; i++) {
      const before = bookings[i]!;
      const after = result[i]!;
      if (before.id === selectedId) {
        expect(after).not.toBe(before);
        expect(after.lastContactedAt).toBe(NOW_ISO);
      } else {
        expect(after).toBe(before);
      }
    }
  });

  it("returns a fresh array and no-ops when ids is empty", () => {
    const bookings = SEEDED_BOOKINGS.slice();
    const result = applyBulkChase(bookings, [], NOW_ISO);
    expect(result).not.toBe(bookings);
    expect(result).toEqual(bookings);
    for (let i = 0; i < bookings.length; i++) {
      expect(result[i]).toBe(bookings[i]);
    }
  });
});
