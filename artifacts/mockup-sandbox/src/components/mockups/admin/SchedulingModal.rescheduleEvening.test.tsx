// @vitest-environment happy-dom

/**
 * Evening coverage for the shared SchedulingModal in `mode="reschedule"`.
 *
 * Companion to {@link ./SchedulingModal.evening.test.tsx}, which pins
 * down the `mode="schedule"` (coordination → scheduled) Evening path.
 * Reschedule is the third SchedulingModal entry point and wires
 * through a different patch helper ({@link buildRescheduledTimelineEntry}
 * instead of `convertCoordinationToScheduledPatch`) plus a two-step
 * pick → confirm flow inside the same modal, so an Evening regression
 * here would slip past the existing schedule-mode test.
 *
 * We render the modal in `mode="reschedule"` for an already-scheduled
 * morning booking on the Aspen rollout (bk-1042 — 2026-04-29 morning,
 * 60-min job), pick the Evening window on a different day that has
 * Evening capacity, advance through the confirm step, and assert the
 * `onConfirm` args carry `window: "evening"`. We then run the captured
 * (date, window) through {@link buildRescheduledTimelineEntry} — the
 * same helper the AdminApp shell uses to append the timeline entry —
 * and assert the resulting label includes "Evening" and the status is
 * `"rescheduled"`. A future regression that drops Evening from the
 * reschedule picker, or that maps an Evening pick back onto Afternoon
 * at the timeline-entry step, would now fail this test.
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
  buildRescheduledTimelineEntry,
} from "@/state/adminMockData";

import { SchedulingModal } from "./SchedulingModal";

afterEach(() => {
  cleanup();
  __resetRolloutsForTests();
});

describe("SchedulingModal — Evening pick (reschedule)", () => {
  it("rescheduling onto Evening confirms with window 'evening' and an 'Evening' rescheduled timeline label", () => {
    // bk-1042 is the seeded scheduled booking on the Aspen rollout
    // (rl-ac-aspen): 2026-04-29 morning, 1 system + 1 additional ducted
    // (45 + 15 = 60-min job). Aspen's 2026-05-04 day exposes an Evening
    // window with full 240-min capacity (and morning=0/afternoon=60),
    // so the 60-min job comfortably fits and the picked slot differs
    // from the current (date, window) — required for the "Review
    // reschedule" button to enable.
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
        mode="reschedule"
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    // Sanity: the modal renders the reschedule variant so this test is
    // exercising the scheduled → rescheduled path (not the coordination
    // schedule path covered by SchedulingModal.evening.test.tsx).
    expect(screen.getByTestId("modal-reschedule-booking")).toBeTruthy();

    const eveningPick = screen.getByTestId(
      "rollout-pick-slot-2026-05-04__evening",
    );
    expect(eveningPick).toBeTruthy();
    act(() => {
      fireEvent.click(eveningPick);
    });

    // Step 1 → Step 2: advance from the picker to the confirm summary.
    act(() => {
      fireEvent.click(screen.getByTestId("button-review-reschedule"));
    });

    // The confirm summary should be visible now (sanity check that the
    // two-step flow actually advanced rather than firing onConfirm
    // straight from the pick step).
    expect(screen.getByTestId("reschedule-summary")).toBeTruthy();

    // Step 2: confirm the reschedule.
    act(() => {
      fireEvent.click(screen.getByTestId("button-confirm-reschedule"));
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const [bookingId, date, window, note] = onConfirm.mock.calls[0];
    expect(bookingId).toBe("bk-1042");
    expect(date).toBe("2026-05-04");
    expect(window).toBe("evening");
    // We didn't type a reason note, so the trimmed note is empty and
    // the modal must omit it (undefined) rather than send an empty
    // string, matching the AdminApp's reschedule contract.
    expect(note).toBeUndefined();

    // Run the captured args through the same helper the AdminApp uses
    // to append the "Rescheduled · …" entry to the booking's service
    // timeline. The entry must encode the Evening window in its label
    // and carry status "rescheduled" so the booking detail and bookings
    // list both show "Evening" in the audit trail.
    const entry = buildRescheduledTimelineEntry({ date, window });
    expect(entry.status).toBe("rescheduled");
    expect(entry.label).toContain("Evening");
  });
});
