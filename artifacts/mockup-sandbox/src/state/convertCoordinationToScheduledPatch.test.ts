/**
 * Unit tests for {@link convertCoordinationToScheduledPatch} — the
 * pure helper behind the admin "Schedule appointment" action that
 * flips a coordination booking onto a real date + window.
 */

import { describe, expect, it } from "vitest";

import {
  ADMIN_USER_LABEL,
  convertCoordinationToScheduledPatch,
  SEEDED_BOOKINGS,
  type AdminBooking,
} from "./adminMockData";

function findCoordinationBooking(): AdminBooking {
  const b = SEEDED_BOOKINGS.find((x) => x.serviceSlot === "to_be_coordinated");
  if (!b) throw new Error("Expected a seeded coordination booking");
  return b;
}

describe("convertCoordinationToScheduledPatch", () => {
  it("flips the slot fields and appends a timeline entry", () => {
    const b = findCoordinationBooking();
    const patch = convertCoordinationToScheduledPatch(
      b,
      { date: "2026-05-04", window: "morning" },
      ADMIN_USER_LABEL,
      "Just now",
    );

    expect(patch.serviceDate).toBe("2026-05-04");
    expect(patch.serviceSlot).toBe("morning");

    expect(patch.serviceTimeline.length).toBe(b.serviceTimeline.length + 1);
    const last = patch.serviceTimeline[patch.serviceTimeline.length - 1];
    expect(last.status).toBe("scheduled");
    expect(last.by).toBe(ADMIN_USER_LABEL);
    expect(last.at).toBe("Just now");
    // Label encodes the picked window + a short, locale-agnostic date.
    expect(last.label).toBe("Coordinated · 4 May · Morning");
  });

  it("uses the Afternoon label when the window is afternoon", () => {
    const b = findCoordinationBooking();
    const patch = convertCoordinationToScheduledPatch(b, {
      date: "2026-05-04",
      window: "afternoon",
    });

    expect(patch.serviceSlot).toBe("afternoon");
    const last = patch.serviceTimeline[patch.serviceTimeline.length - 1];
    expect(last.label).toBe("Coordinated · 4 May · Afternoon");
  });

  it("uses the Evening label when the window is evening (Task #187)", () => {
    const b = findCoordinationBooking();
    const patch = convertCoordinationToScheduledPatch(b, {
      date: "2026-05-04",
      window: "evening",
    });

    expect(patch.serviceSlot).toBe("evening");
    const last = patch.serviceTimeline[patch.serviceTimeline.length - 1];
    expect(last.label).toBe("Coordinated · 4 May · Evening");
  });

  it("does not mutate the source booking's timeline", () => {
    const b = findCoordinationBooking();
    const before = b.serviceTimeline.length;
    convertCoordinationToScheduledPatch(b, {
      date: "2026-05-05",
      window: "morning",
    });
    expect(b.serviceTimeline.length).toBe(before);
  });

  it("defaults the actor to the admin label", () => {
    const b = findCoordinationBooking();
    const patch = convertCoordinationToScheduledPatch(b, {
      date: "2026-05-06",
      window: "morning",
    });
    const last = patch.serviceTimeline[patch.serviceTimeline.length - 1];
    expect(last.by).toBe(ADMIN_USER_LABEL);
  });
});
