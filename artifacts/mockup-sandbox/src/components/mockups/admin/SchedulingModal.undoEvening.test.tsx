// @vitest-environment happy-dom

/**
 * Evening coverage for the shared SchedulingModal in `mode="undo"`.
 *
 * Companion to {@link ./SchedulingModal.evening.test.tsx} (the
 * `mode="schedule"` coordination → scheduled path) and
 * {@link ./SchedulingModal.rescheduleEvening.test.tsx} (the
 * `mode="reschedule"` scheduled → rescheduled path). Undo is the
 * third SchedulingModal entry point — surfaced as the "Restore
 * booking — pick a new slot" modal when the original slot was given
 * to another booking and the admin needs to pick a new one. It uses
 * its own primary-button testid (`button-confirm-undo-reschedule`)
 * and a single-step pick → apply flow (no review summary), so an
 * Evening regression here would slip past both existing tests.
 *
 * We render the modal in `mode="undo"` for a seeded booking on the
 * Aspen rollout (bk-1042 — 60-min job that comfortably fits Aspen's
 * 2026-04-29 Evening window with full 180-min capacity), pick the
 * Evening window, click the undo confirm button, and assert the
 * `onConfirm` args carry `window: "evening"`. A future regression
 * that drops Evening from the restore picker, or that maps an
 * Evening pick back onto Afternoon at the modal step, would now
 * fail this test.
 */

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SEEDED_BOOKINGS,
  SEEDED_UNITS,
  __resetRolloutsForTests,
} from "@/state/adminMockData";

import { SchedulingModal } from "./SchedulingModal";

afterEach(() => {
  cleanup();
  __resetRolloutsForTests();
});

describe("SchedulingModal — Evening pick (undo)", () => {
  it("restoring onto Evening confirms with window 'evening' from the undo flow", () => {
    // bk-1042 is the seeded scheduled booking on the Aspen rollout
    // (rl-ac-aspen): 1 system + 1 additional ducted (45 + 15 = 60-min
    // job). Aspen's 2026-04-29 day exposes an Evening window with
    // full 180-min capacity, so the 60-min job fits. The undo flow
    // pre-selects nothing (unlike reschedule), so any seeded Aspen
    // booking with a fitting job duration would do — bk-1042 keeps
    // this test aligned with the reschedule-evening fixture.
    const booking = SEEDED_BOOKINGS.find((b) => b.id === "bk-1042");
    if (!booking) throw new Error("seed booking bk-1042 missing");

    const onConfirm = vi.fn<
      (
        bookingId: string,
        date: string,
        window: "morning" | "afternoon" | "evening",
        note?: string,
      ) => void
    >();
    const onCancel = vi.fn();

    render(
      <SchedulingModal
        booking={booking}
        units={SEEDED_UNITS.slice()}
        mode="undo"
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    // Sanity: the modal renders the undo variant — the explainer
    // banner is unique to undo (not present in schedule or
    // reschedule mode), so its presence proves we're exercising the
    // restore-after-undo path and not one of the other two.
    expect(screen.getByTestId("undo-reschedule-explainer")).toBeTruthy();

    const eveningPick = screen.getByTestId(
      "rollout-pick-slot-2026-04-29__evening",
    );
    expect(eveningPick).toBeTruthy();
    act(() => {
      fireEvent.click(eveningPick);
    });

    // Undo is a single-step flow (pick → apply); the confirm button
    // uses its own testid so a regression that wires the undo
    // primary action back to the schedule or reschedule button
    // would surface here as a missing element.
    act(() => {
      fireEvent.click(screen.getByTestId("button-confirm-undo-reschedule"));
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const [bookingId, date, window, note] = onConfirm.mock.calls[0];
    expect(bookingId).toBe("bk-1042");
    expect(date).toBe("2026-04-29");
    expect(window).toBe("evening");
    // Undo mode never carries a reschedule note — the note input is
    // only rendered on the reschedule confirm step.
    expect(note).toBeUndefined();
  });
});
