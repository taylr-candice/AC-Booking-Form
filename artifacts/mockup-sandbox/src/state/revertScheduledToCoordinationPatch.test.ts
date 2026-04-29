/**
 * Unit tests for {@link revertScheduledToCoordinationPatch} — the
 * pure inverse of `convertCoordinationToScheduledPatch` used by the
 * success-toast Undo affordance (Task #92).
 */

import { describe, expect, it } from "vitest";

import {
  convertCoordinationToScheduledPatch,
  revertScheduledToCoordinationPatch,
  SEEDED_BOOKINGS,
  type AdminBooking,
} from "./adminMockData";

function findCoordinationBooking(): AdminBooking {
  const b = SEEDED_BOOKINGS.find((x) => x.serviceSlot === "to_be_coordinated");
  if (!b) throw new Error("Expected a seeded coordination booking");
  return b;
}

describe("revertScheduledToCoordinationPatch", () => {
  it("restores the prior date, slot and timeline of the booking", () => {
    const prior = findCoordinationBooking();
    const revert = revertScheduledToCoordinationPatch(prior);

    expect(revert.serviceDate).toBe(prior.serviceDate);
    expect(revert.serviceSlot).toBe(prior.serviceSlot);
    expect(revert.serviceTimeline).toBe(prior.serviceTimeline);
  });

  it("inverts a forward conversion when the patches are composed", () => {
    const prior = findCoordinationBooking();
    const forward = convertCoordinationToScheduledPatch(prior, {
      date: "2026-05-04",
      window: "morning",
    });
    const scheduled: AdminBooking = { ...prior, ...forward };
    const revert = revertScheduledToCoordinationPatch(prior);

    // Applying revert on top of the scheduled row reproduces the
    // exact pre-scheduling shape (slot, date, timeline length).
    const restored: AdminBooking = { ...scheduled, ...revert };
    expect(restored.serviceSlot).toBe(prior.serviceSlot);
    expect(restored.serviceDate).toBe(prior.serviceDate);
    expect(restored.serviceTimeline.length).toBe(prior.serviceTimeline.length);
  });

  it("does not mutate the source booking's timeline", () => {
    const prior = findCoordinationBooking();
    const before = prior.serviceTimeline.length;
    revertScheduledToCoordinationPatch(prior);
    expect(prior.serviceTimeline.length).toBe(before);
  });
});
