// @vitest-environment happy-dom

/**
 * Regression test for the agency↔unit single source of truth.
 *
 * After collapsing the relationship onto `AdminUnit.agentId` (and
 * removing `AdminAgent.unitIds`), it must be the case that
 * reassigning a unit from inside the Agents view immediately changes
 * `unit.agentId` so other views (Units view, Booking detail) see the
 * same agency. Likewise, an unmanaged unit (`agentId: null`) cannot
 * appear under any agency.
 */

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import type { AdminAgent, AdminUnit } from "@/state/adminMockData";

import { AgentsView } from "./AgentsView";

function makeUnits(): AdminUnit[] {
  return [
    {
      id: "u1",
      addressLine1: "10 / 25 Example Street",
      addressLine2: "Lot 10 · Suburb NSW 2000",
      ac: { type: "split", systems: 2, additional: 0 },
      agentId: "ag-001",
    },
    {
      id: "u2",
      addressLine1: "12 / 25 Example Street",
      addressLine2: "Lot 12 · Suburb NSW 2000",
      ac: { type: "split", systems: 1, additional: 0 },
      agentId: "ag-002",
    },
    {
      id: "u3",
      addressLine1: "5 / 100 Other Road",
      addressLine2: "Lot 5 · Other NSW 2000",
      ac: { type: "ducted", systems: 1, additional: 0 },
      agentId: null,
    },
  ];
}

function makeAgents(): AdminAgent[] {
  return [
    { id: "ag-001", company: "Vantage Strata Management" },
    { id: "ag-002", company: "City Edge Property Group" },
  ];
}

function Harness({
  initialUnits,
  initialAgents,
  onChange,
}: {
  initialUnits: AdminUnit[];
  initialAgents: AdminAgent[];
  onChange: (units: AdminUnit[], agents: AdminAgent[]) => void;
}) {
  // Real React state so AgentsView rerenders with the new units list
  // after each save — that matches how AdminApp wires the view, and
  // it's what makes the editor's `initialUnitIds` correct on a second
  // open. The `onChange` callback also lets the test read the latest
  // state without poking into React internals.
  const [units, setUnitsState] = useState<AdminUnit[]>(initialUnits);
  const [agents, setAgentsState] = useState<AdminAgent[]>(initialAgents);
  function setUnits(next: AdminUnit[]) {
    setUnitsState(next);
    onChange(next, agents);
  }
  function setAgents(next: AdminAgent[]) {
    setAgentsState(next);
    onChange(units, next);
  }
  return (
    <AgentsView
      agents={agents}
      setAgents={setAgents}
      units={units}
      setUnits={setUnits}
    />
  );
}

/**
 * Returns the unit checkbox inside the open editor modal (not the
 * managed-units badge that may also render the same address in the
 * agencies table behind the modal).
 */
function modalUnitCheckbox(addressLine1: string): HTMLInputElement {
  const dialog = document.querySelector(".fixed.inset-0") as HTMLElement;
  if (!dialog) {
    throw new Error("Editor modal is not open");
  }
  return within(dialog)
    .getByText(addressLine1)
    .closest("label")!
    .querySelector("input[type=checkbox]") as HTMLInputElement;
}

describe("AgentsView ↔ unit.agentId single source of truth", () => {
  afterEach(() => {
    cleanup();
  });

  it("derives 'units managed' from unit.agentId rather than a per-agent list", () => {
    render(
      <Harness
        initialUnits={makeUnits()}
        initialAgents={makeAgents()}
        onChange={() => {}}
      />,
    );

    // Vantage row should show u1 (which is the only unit pointing at ag-001).
    const vantageRow = screen
      .getByText("Vantage Strata Management")
      .closest("tr")!;
    expect(within(vantageRow).getByText("10 / 25 Example Street")).toBeTruthy();
    expect(within(vantageRow).queryByText("12 / 25 Example Street")).toBeNull();

    // City Edge row should show u2.
    const cityRow = screen
      .getByText("City Edge Property Group")
      .closest("tr")!;
    expect(within(cityRow).getByText("12 / 25 Example Street")).toBeTruthy();
  });

  it("editing 'units managed' on an agency mutates unit.agentId so other views see the same assignment", () => {
    let latestUnits: AdminUnit[] = [];
    let latestAgents: AdminAgent[] = [];
    render(
      <Harness
        initialUnits={makeUnits()}
        initialAgents={makeAgents()}
        onChange={(u, a) => {
          latestUnits = u;
          latestAgents = a;
        }}
      />,
    );

    // Open the editor for Vantage.
    const vantageRow = screen
      .getByText("Vantage Strata Management")
      .closest("tr")!;
    fireEvent.click(within(vantageRow).getByText("Edit"));

    // The editor should pre-check u1 only. We re-assign by adding u3
    // (currently owner-managed) and removing u1.
    const u1Checkbox = modalUnitCheckbox("10 / 25 Example Street");
    const u3Checkbox = modalUnitCheckbox("5 / 100 Other Road");
    expect(u1Checkbox.checked).toBe(true);
    expect(u3Checkbox.checked).toBe(false);
    fireEvent.click(u1Checkbox);
    fireEvent.click(u3Checkbox);

    fireEvent.click(screen.getByText("Save"));

    // Agent list itself is unchanged (no unitIds field exists).
    expect(latestAgents).toEqual(makeAgents());

    // unit.agentId reflects the new wiring — this is what UnitsView /
    // BookingDetail also read.
    const u1 = latestUnits.find((u) => u.id === "u1")!;
    const u2 = latestUnits.find((u) => u.id === "u2")!;
    const u3 = latestUnits.find((u) => u.id === "u3")!;
    expect(u1.agentId).toBeNull();
    expect(u2.agentId).toBe("ag-002");
    expect(u3.agentId).toBe("ag-001");
  });

  it("assigning a unit that was already managed by another agency reassigns it (one unit → at most one agency)", () => {
    let latestUnits: AdminUnit[] = [];
    render(
      <Harness
        initialUnits={makeUnits()}
        initialAgents={makeAgents()}
        onChange={(u) => {
          latestUnits = u;
        }}
      />,
    );

    // Edit Vantage and check u2 (currently under City Edge).
    const vantageRow = screen
      .getByText("Vantage Strata Management")
      .closest("tr")!;
    fireEvent.click(within(vantageRow).getByText("Edit"));
    const u2Checkbox = modalUnitCheckbox("12 / 25 Example Street");
    fireEvent.click(u2Checkbox);
    fireEvent.click(screen.getByText("Save"));

    // u2 now points at ag-001, not ag-002.
    const u2 = latestUnits.find((u) => u.id === "u2")!;
    expect(u2.agentId).toBe("ag-001");
  });
});
