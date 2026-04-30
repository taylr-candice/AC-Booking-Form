// @vitest-environment happy-dom

/**
 * Evening coverage for the admin "+ New booking" wizard.
 *
 * Task #187 wired the Evening window through every admin scheduling
 * path; the rollout schedule editor already has a regression test
 * pinning Evening (see {@link RolloutScheduleEditor.evening.test.tsx}),
 * but the two main scheduling entry points were untested. This file
 * locks down the happy path on `NewBookingFlow`: an admin walks the
 * wizard against a building whose rollout day exposes an Evening
 * window, picks Evening, and the resulting `AdminBooking` carries
 * `serviceSlot === "evening"`. A future regression that drops Evening
 * from the wizard's slot picker — or silently maps it back onto
 * Afternoon at the build step — would now fail this test.
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
  SEEDED_BUILDINGS,
  SEEDED_UNITS,
  __resetRolloutsForTests,
  type AdminBooking,
  type AdminCreatedScheduleChoice,
} from "@/state/adminMockData";

import { NewBookingFlow } from "./NewBookingFlow";

afterEach(() => {
  cleanup();
  __resetRolloutsForTests();
});

describe("NewBookingFlow — Evening pick", () => {
  it("walks the wizard, picks an Evening slot, and emits a booking with serviceSlot === 'evening'", () => {
    const onConfirm =
      vi.fn<(booking: AdminBooking, schedule: AdminCreatedScheduleChoice) => void>();
    const onCancel = vi.fn();

    render(
      <NewBookingFlow
        units={SEEDED_UNITS.slice()}
        buildings={SEEDED_BUILDINGS.slice()}
        bookings={[]}
        rolloutsRefreshKey={0}
        presetBuildingId={null}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    // ── Step 1: Unit + customer ──────────────────────────────────────
    // Narrow the unit list to a single Aspen unit (split / 2 systems →
    // 90-minute job) so we know which row the click targets without
    // depending on the seed list ordering. The Aspen rollout's 4/29
    // day exposes an Evening window with full capacity (180 min), so a
    // 90-minute job comfortably fits.
    const search = screen.getByPlaceholderText(/search by address/i);
    act(() => {
      fireEvent.change(search, { target: { value: "u-aspen-03" } });
    });
    const unitButton = screen.getByText(/101 \/ 335 Aspen Boulevard/);
    act(() => {
      fireEvent.click(unitButton);
    });

    // Customer details — bare minimum to satisfy step1Valid (name +
    // valid email + non-empty phone).
    act(() => {
      fireEvent.change(screen.getByPlaceholderText(/Sam Patel/), {
        target: { value: "Avery Owner" },
      });
      fireEvent.change(screen.getByPlaceholderText(/name@example\.com/), {
        target: { value: "avery@example.com" },
      });
      fireEvent.change(screen.getByPlaceholderText(/0411 222 333/), {
        target: { value: "0400 100 200" },
      });
    });

    act(() => {
      fireEvent.click(screen.getByText(/^Continue$/));
    });

    // ── Step 2: AC config — pre-fill from the unit is fine. ──────────
    // u-aspen-03 is split / 2 systems / 0 additional → 90 min job.
    act(() => {
      fireEvent.click(screen.getByText(/^Continue$/));
    });

    // ── Step 3: Schedule — pick the Evening slot on 4/29. ───────────
    // The rollout day cell exposes per-window picks via test ids of
    // the form `rollout-pick-slot-{isoDate}__{window}`; this is the
    // contract the slot picker shares with every admin scheduling
    // surface (NewBookingFlow + SchedulingModal).
    const eveningPick = screen.getByTestId(
      "rollout-pick-slot-2026-04-29__evening",
    );
    expect(eveningPick).toBeTruthy();
    act(() => {
      fireEvent.click(eveningPick);
    });

    act(() => {
      fireEvent.click(screen.getByText(/^Continue$/));
    });

    // ── Step 4: Review → Create. ────────────────────────────────────
    act(() => {
      fireEvent.click(screen.getByText(/Create booking/));
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const [booking, schedule] = onConfirm.mock.calls[0];
    expect(booking.serviceSlot).toBe("evening");
    expect(booking.serviceDate).toBe("2026-04-29");
    expect(booking.unitId).toBe("u-aspen-03");
    // Schedule choice flows alongside the booking so the AdminApp shell
    // can bump the matching rollout's evening capacity. The wizard
    // must propagate the same `evening` window on both surfaces — the
    // booking row and the schedule choice — so capacity bumping and
    // the booking's `serviceSlot` can never disagree.
    expect(schedule.kind).toBe("slot");
    if (schedule.kind === "slot") {
      expect(schedule.window).toBe("evening");
      expect(schedule.date).toBe("2026-04-29");
    }
  });
});
