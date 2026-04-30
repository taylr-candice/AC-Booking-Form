// @vitest-environment happy-dom

/**
 * Evening rendering and add/remove behavior for the per-rollout
 * schedule editor. Days that opt into an Evening window (`day.evening`
 * is set) surface a third SlotCell alongside Morning/Afternoon. Days
 * without an Evening window show an "Add EV" button that creates the
 * slot via {@link addRolloutEveningWindow} and offers undo.
 */

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import {
  SEEDED_BUILDINGS,
  __resetRolloutsForTests,
  getRolloutById,
} from "@/state/adminMockData";

import { RolloutScheduleEditor } from "./RolloutScheduleEditor";

afterEach(() => {
  cleanup();
  __resetRolloutsForTests();
});

function Harness() {
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <RolloutScheduleEditor
      rolloutId="rl-ac-aspen"
      buildings={SEEDED_BUILDINGS.slice()}
      refreshKey={refreshKey}
      bumpRefreshKey={() => setRefreshKey((n) => n + 1)}
      onBack={() => {}}
    />
  );
}

describe("RolloutScheduleEditor — Evening windows", () => {
  it("renders an Evening SlotCell for days where day.evening is set", () => {
    render(<Harness />);
    const dayWithEvening = screen.getByTestId("rollout-day-2026-04-29");
    expect(within(dayWithEvening).getByText("AM")).toBeTruthy();
    expect(within(dayWithEvening).getByText("PM")).toBeTruthy();
    expect(within(dayWithEvening).getByText("EV")).toBeTruthy();
  });

  it("offers an Add EV affordance for days without an evening window", () => {
    render(<Harness />);
    const dayWithoutEvening = screen.getByTestId("rollout-day-2026-04-27");
    expect(within(dayWithoutEvening).getByText("AM")).toBeTruthy();
    expect(within(dayWithoutEvening).getByText("PM")).toBeTruthy();
    expect(within(dayWithoutEvening).queryByText("EV")).toBeNull();
    expect(
      screen.getByTestId("rollout-add-evening-2026-04-27"),
    ).toBeTruthy();
  });

  it("clicking Add EV creates the evening slot and shows an undo toast", () => {
    render(<Harness />);
    const addBtn = screen.getByTestId("rollout-add-evening-2026-04-27");
    act(() => {
      fireEvent.click(addBtn);
    });
    // EV cell now appears in that day, the Add button is gone.
    const day = screen.getByTestId("rollout-day-2026-04-27");
    expect(within(day).getByText("EV")).toBeTruthy();
    expect(
      screen.queryByTestId("rollout-add-evening-2026-04-27"),
    ).toBeNull();
    // Mutator updated the underlying rollout store with a staged slot.
    const stored = getRolloutById("rl-ac-aspen")!;
    const dayRow = stored.days.find((d) => d.isoDate === "2026-04-27")!;
    expect(dayRow.evening).toBeDefined();
    expect(dayRow.evening!.openByAdmin).toBe(false);
    expect(dayRow.evening!.windowMinutes).toBe(180);
    // Undo toast is offered.
    expect(screen.getByText("Evening window added.")).toBeTruthy();
  });

  it("undoing the add removes the evening slot again", () => {
    render(<Harness />);
    act(() => {
      fireEvent.click(screen.getByTestId("rollout-add-evening-2026-04-27"));
    });
    act(() => {
      fireEvent.click(screen.getByText("Undo"));
    });
    const stored = getRolloutById("rl-ac-aspen")!;
    const dayRow = stored.days.find((d) => d.isoDate === "2026-04-27")!;
    expect(dayRow.evening).toBeUndefined();
    expect(
      screen.getByTestId("rollout-add-evening-2026-04-27"),
    ).toBeTruthy();
  });
});
