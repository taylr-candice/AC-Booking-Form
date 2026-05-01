// @vitest-environment happy-dom

/**
 * Regression: opening the SchedulingModal in `mode="reschedule"` for a
 * booking that already has a date+window selected must still let the
 * admin click a *different* day in the rollout calendar and see that
 * day's window panel — i.e. the preselection should not lock the
 * visible window panel to the original date.
 *
 * Earlier the picker computed `focusedDate = pickedDate ?? clickedDay`,
 * which meant any click on another day was visually ignored while a
 * preselection existed. The fix flipped the precedence so the user's
 * most recent click wins, and added a reset-on-pickedDate-change
 * effect so a parent-driven snap (open/undo) still takes over.
 *
 * This test pins down that behaviour at the SchedulingModal layer so a
 * future refactor of the precedence rule fails loudly.
 */

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
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

describe("SchedulingModal — reschedule, click another day after preselection", () => {
  it("clicking a different available day swaps the visible window panel to that day", () => {
    // bk-1042 is the seeded scheduled booking on the Aspen rollout
    // (rl-ac-aspen): 2026-04-29 morning. The picker treats any day
    // before today as non-clickable, so we target 2026-05-04 (Aspen's
    // open Monday in May) and step the month forward once to bring
    // that cell into view.
    const booking = SEEDED_BOOKINGS.find((b) => b.id === "bk-1042");
    if (!booking) throw new Error("seed booking bk-1042 missing");

    render(
      <SchedulingModal
        booking={booking}
        units={SEEDED_UNITS.slice()}
        mode="reschedule"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    // The picker keeps a hidden mirror of every (date, window) button to
    // satisfy a wider test-id contract, so document-scoped queries find
    // both the visible panel and the mirror. Scope to the visible
    // `rollout-window-panel` so we only see the focused day's buttons.
    const initialPanel = screen.getByTestId("rollout-window-panel");
    expect(
      within(initialPanel).queryByTestId(
        "rollout-pick-slot-2026-04-29__morning",
      ),
    ).not.toBeNull();
    expect(
      within(initialPanel).queryByTestId(
        "rollout-pick-slot-2026-05-04__afternoon",
      ),
    ).toBeNull();

    // Step the visible month forward so 2026-05-04 enters the rendered
    // grid (the modal opens on April for the preselected 2026-04-29).
    act(() => {
      fireEvent.click(screen.getByTestId("rollout-calendar-next-month"));
    });

    // Click the day cell for 2026-05-04 in the calendar grid.
    act(() => {
      fireEvent.click(screen.getByTestId("rollout-day-2026-05-04"));
    });

    // The visible window panel must now reflect 2026-05-04 — exposing
    // that day's slot buttons while no longer rendering the preselected
    // day's morning button in the visible panel.
    const swappedPanel = screen.getByTestId("rollout-window-panel");
    expect(
      within(swappedPanel).queryByTestId(
        "rollout-pick-slot-2026-05-04__afternoon",
      ),
    ).not.toBeNull();
    expect(
      within(swappedPanel).queryByTestId(
        "rollout-pick-slot-2026-04-29__morning",
      ),
    ).toBeNull();
  });
});
