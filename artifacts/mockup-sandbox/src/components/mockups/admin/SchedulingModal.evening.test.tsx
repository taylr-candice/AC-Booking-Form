// @vitest-environment happy-dom

/**
 * Evening coverage for the shared SchedulingModal (formerly
 * ScheduleCoordinationModal — now used for both scheduling a
 * coordination booking and rescheduling an already-scheduled one).
 *
 * Task #187 wired the Evening window through every admin scheduling
 * path. The rollout schedule editor and the New booking wizard each
 * have their own Evening regression now; this file pins down the
 * third entry point. We render the modal in `mode="schedule"` for a
 * coordination booking on the Aspen rollout, pick the Evening window
 * on a day that has one, confirm, and then run the captured
 * (date, window) through {@link convertCoordinationToScheduledPatch}
 * — the same helper the AdminApp shell uses — to assert the patch
 * carries `serviceSlot: "evening"` and a "Coordinated · … · Evening"
 * timeline label. A future regression that drops Evening from the
 * shared picker, or that maps an Evening pick back onto Afternoon at
 * the patch step, would now fail this test.
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
  convertCoordinationToScheduledPatch,
} from "@/state/adminMockData";

import { SchedulingModal } from "./SchedulingModal";

afterEach(() => {
  cleanup();
  __resetRolloutsForTests();
});

describe("SchedulingModal — Evening pick", () => {
  it("picking Evening from a coordination booking confirms with serviceSlot 'evening' and an 'Evening' timeline label", () => {
    // bk-1043 is the seeded coordination booking on the Aspen rollout
    // (rl-ac-aspen). Its rollout day 2026-04-29 exposes an Evening
    // window with full 180-minute capacity, so the booking's 60-min
    // job (1 system + 1 additional indoor → 45 + 15) fits.
    const booking = SEEDED_BOOKINGS.find((b) => b.id === "bk-1043");
    if (!booking) throw new Error("seed booking bk-1043 missing");

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
        mode="schedule"
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    // Sanity: the modal renders the schedule (not reschedule) variant
    // so this test is exercising the coordination → scheduled path.
    expect(screen.getByTestId("modal-schedule-booking")).toBeTruthy();

    const eveningPick = screen.getByTestId(
      "rollout-pick-slot-2026-04-29__evening",
    );
    expect(eveningPick).toBeTruthy();
    act(() => {
      fireEvent.click(eveningPick);
    });

    act(() => {
      fireEvent.click(screen.getByTestId("button-confirm-schedule"));
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const [bookingId, date, window, note] = onConfirm.mock.calls[0];
    expect(bookingId).toBe("bk-1043");
    expect(date).toBe("2026-04-29");
    expect(window).toBe("evening");
    // Schedule mode never carries a reschedule note.
    expect(note).toBeUndefined();

    // Run the captured args through the same helper the AdminApp uses
    // to flip a coordination booking into a scheduled one. The patch
    // must set `serviceSlot: "evening"` and append a timeline entry
    // whose label encodes the Evening window so the booking detail
    // and bookings list both show "Evening" in the audit trail.
    const patch = convertCoordinationToScheduledPatch(booking, {
      date,
      window,
    });
    expect(patch.serviceSlot).toBe("evening");
    expect(patch.serviceDate).toBe("2026-04-29");
    const newEntry = patch.serviceTimeline.at(-1);
    expect(newEntry).toBeTruthy();
    expect(newEntry!.label).toContain("Evening");
    expect(newEntry!.status).toBe("scheduled");
  });
});
