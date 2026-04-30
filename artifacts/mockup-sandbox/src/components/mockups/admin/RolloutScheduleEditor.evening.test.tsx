// @vitest-environment happy-dom

/**
 * Evening rendering for the per-rollout schedule editor.
 *
 * Days that opt into an Evening window (`day.evening` is set on the
 * seeded {@link RolloutDay}) should surface a third SlotCell in the
 * grid alongside Morning/Afternoon. Days without an Evening window
 * keep the original two-cell layout.
 *
 * Smoke-covers Task #107 — widening the window-type union to include
 * "evening" across the admin scheduling code paths.
 */

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  SEEDED_BUILDINGS,
  __resetRolloutsForTests,
} from "@/state/adminMockData";

import { RolloutScheduleEditor } from "./RolloutScheduleEditor";

afterEach(() => {
  cleanup();
  __resetRolloutsForTests();
});

function renderEditor() {
  // rl-ac-aspen / RL_ASPEN_DAYS seeds Evening windows on a handful of
  // dates — see adminMockData.ts. We pick one with Evening set
  // (2026-04-29) and one without (2026-04-27) to assert both shapes.
  return render(
    <RolloutScheduleEditor
      rolloutId="rl-ac-aspen"
      buildings={SEEDED_BUILDINGS.slice()}
      refreshKey={0}
      bumpRefreshKey={() => {}}
      onBack={() => {}}
    />,
  );
}

describe("RolloutScheduleEditor — Evening window rendering", () => {
  it("renders an Evening SlotCell for days where day.evening is set", () => {
    renderEditor();
    const dayWithEvening = screen.getByTestId("rollout-day-2026-04-29");
    // Reuse the within() helper so we only look inside the day's cell.
    expect(within(dayWithEvening).getByText("AM")).toBeTruthy();
    expect(within(dayWithEvening).getByText("PM")).toBeTruthy();
    expect(within(dayWithEvening).getByText("EV")).toBeTruthy();
  });

  it("omits the Evening SlotCell for days without an evening window", () => {
    renderEditor();
    const dayWithoutEvening = screen.getByTestId("rollout-day-2026-04-27");
    expect(within(dayWithoutEvening).getByText("AM")).toBeTruthy();
    expect(within(dayWithoutEvening).getByText("PM")).toBeTruthy();
    expect(within(dayWithoutEvening).queryByText("EV")).toBeNull();
  });
});
