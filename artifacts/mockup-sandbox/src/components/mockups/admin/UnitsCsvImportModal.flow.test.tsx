// @vitest-environment happy-dom

/**
 * Regression test for the admin Units → Import CSV modal end-to-end
 * flow.
 *
 * Pinning down the *user-visible* behaviour (open modal → paste CSV →
 * see counts + diff + error gating → fix CSV → apply → see the table
 * update) catches regressions that the pure-parser unit tests can't,
 * e.g. broken wiring between the modal's local state, the counts bar,
 * the Apply button's disabled state, or the parent UnitsView's
 * `setUnits` callback.
 *
 * NOTE on test framework: the original task brief asked for a
 * Playwright spec, but the project does not have Playwright installed
 * and every other admin "UI test" already lives in this directory as a
 * `*.test.tsx` happy-dom + React Testing Library file (see
 * `AgentsView.crossViewConsistency.test.tsx`,
 * `SlotWindowEditor.test.tsx`). To "live alongside the existing UI
 * tests and run as part of the project's test suite … reliably with no
 * flake on CI", this test follows the same convention. It exercises
 * the same flow Playwright would, just without the browser binary.
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

import type {
  AdminAgent,
  AdminBuilding,
  AdminUnit,
} from "@/state/adminMockData";

import { UnitsView } from "./UnitsView";

// ─── Fixtures ──────────────────────────────────────────────────────────────

const AGENTS: AdminAgent[] = [
  { id: "ag-001", company: "Aspen Property" },
  { id: "ag-002", company: "Coogee Realty" },
];

const BUILDINGS: AdminBuilding[] = [
  {
    id: "bldg-test",
    name: "Test Building",
    addressLine1: "1 Test Street",
    addressLine2: "Testville NSW 2000",
  },
];

function makeUnits(): AdminUnit[] {
  return [
    {
      id: "u1",
      addressLine1: "G01 / 335 Aspen Boulevard",
      addressLine2: "Greenway ACT 2900",
      ac: { type: "ducted", systems: 1, additional: 1 },
      agentId: "ag-001",
      buildingId: "bldg-test",
    },
    {
      id: "u2",
      addressLine1: "12 / 88 Marine Parade",
      addressLine2: "Coogee NSW 2034",
      ac: { type: "split", systems: 2, additional: 0 },
      agentId: "ag-002",
      buildingId: "bldg-test",
    },
  ];
}

function Harness({ initial }: { initial: AdminUnit[] }) {
  // Real React state so the table re-renders after `Apply` calls
  // `setUnits` — that's the round-trip we want to assert on.
  const [units, setUnits] = useState<AdminUnit[]>(initial);
  return (
    <UnitsView
      units={units}
      setUnits={setUnits}
      agents={AGENTS}
      buildings={BUILDINGS}
    />
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function openImportModal() {
  fireEvent.click(screen.getByTestId("button-units-import"));
  return screen.getByTestId("modal-units-import");
}

function pasteCsv(modal: HTMLElement, csvText: string) {
  const textarea = within(modal).getByTestId(
    "textarea-units-import-csv",
  ) as HTMLTextAreaElement;
  // Clear first so a second paste fully replaces (rather than
  // accidentally appending to) the previous CSV.
  fireEvent.change(textarea, { target: { value: "" } });
  fireEvent.change(textarea, { target: { value: csvText } });
}

/**
 * Read the count for a given chip label (`New`, `Updates`, `Unchanged`,
 * `Errors`) out of the counts bar. Each chip renders as
 * `<span><span>{count}</span><span>{label}</span></span>` so we walk
 * from the label span up to its parent and pull the count out.
 */
function countFor(modal: HTMLElement, label: string): number {
  const counts = within(modal).getByTestId("text-units-import-counts");
  const labelEl = within(counts).getByText(label);
  const chip = labelEl.parentElement;
  if (!chip) throw new Error(`No chip wrapper for label "${label}"`);
  const text = (chip.textContent ?? "").replace(label, "").trim();
  const n = Number(text);
  if (!Number.isFinite(n)) {
    throw new Error(`Could not parse count for "${label}" from "${text}"`);
  }
  return n;
}

function assertCounts(
  modal: HTMLElement,
  expected: { new: number; update: number; unchanged: number; error: number },
) {
  expect(countFor(modal, "New")).toBe(expected.new);
  expect(countFor(modal, "Updates")).toBe(expected.update);
  expect(countFor(modal, "Unchanged")).toBe(expected.unchanged);
  expect(countFor(modal, "Errors")).toBe(expected.error);
}

function applyButton(modal: HTMLElement): HTMLButtonElement {
  return within(modal).getByTestId(
    "button-units-import-apply",
  ) as HTMLButtonElement;
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("Units → Import CSV modal: full flow", () => {
  afterEach(() => {
    cleanup();
  });

  it("opens the modal, previews a mixed CSV, gates Apply on errors, then applies the fixed CSV into the table", () => {
    render(<Harness initial={makeUnits()} />);

    // Sanity: the seeded u1 row currently shows AC type "ducted".
    const u1RowBefore = screen
      .getByText("G01 / 335 Aspen Boulevard")
      .closest("tr")!;
    expect(within(u1RowBefore).getByText("ducted")).toBeTruthy();

    // ── Open modal ──────────────────────────────────────────────────────
    const modal = openImportModal();
    expect(modal).toBeTruthy();

    // Apply is disabled before any CSV is pasted (no preview yet).
    expect(applyButton(modal).disabled).toBe(true);

    // ── Paste a mixed CSV: 1 update + 1 new + 1 error ───────────────────
    const mixedCsv = [
      "id,addressLine1,addressLine2,acType,systems,additional,agentId",
      // Update u1: ducted → split, systems 1 → 2
      "u1,G01 / 335 Aspen Boulevard,Greenway ACT 2900,split,2,1,ag-001",
      // New unit
      ",99 Brand New Lane,Lot 99,split,1,0,",
      // Error: unknown AC type "foo"
      ",30 Bad Lane,,foo,1,0,",
    ].join("\n");
    pasteCsv(modal, mixedCsv);

    // ── Counts bar ──────────────────────────────────────────────────────
    assertCounts(modal, { new: 1, update: 1, unchanged: 0, error: 1 });

    // ── Diff for the update row ─────────────────────────────────────────
    // The parser numbers rows from 1 (header), so the update row is row 2.
    const updateRow = within(modal).getByTestId("row-units-import-2");
    // Status chip says "Update".
    expect(within(updateRow).getByText("Update")).toBeTruthy();
    // The diff is rendered in the row's last cell (Notes column) as a
    // `<ul>` of "<field>: <before> → <after>" entries. Scope the
    // assertions there so we don't accidentally match the AC config
    // column (which echoes the new acType verbatim).
    const updateDiffCell = updateRow.querySelectorAll("td")[5] as HTMLElement;
    expect(within(updateDiffCell).getByText("acType:")).toBeTruthy();
    expect(within(updateDiffCell).getByText("ducted")).toBeTruthy();
    expect(within(updateDiffCell).getByText("split")).toBeTruthy();
    expect(within(updateDiffCell).getByText("systems:")).toBeTruthy();

    // ── Error row visible with its message ──────────────────────────────
    const errorRow = within(modal).getByTestId("row-units-import-4");
    expect(within(errorRow).getByText("Error")).toBeTruthy();
    expect(
      within(errorRow).getByText(/Unknown AC type "foo"/),
    ).toBeTruthy();

    // ── Apply gated by the error row ────────────────────────────────────
    expect(applyButton(modal).disabled).toBe(true);
    expect(
      within(modal).getByText(/Fix the error rows before applying/),
    ).toBeTruthy();

    // ── Fix the CSV: drop the bad row, keep the update + new ────────────
    const fixedCsv = [
      "id,addressLine1,addressLine2,acType,systems,additional,agentId",
      "u1,G01 / 335 Aspen Boulevard,Greenway ACT 2900,split,2,1,ag-001",
      ",99 Brand New Lane,Lot 99,split,1,0,",
    ].join("\n");
    pasteCsv(modal, fixedCsv);

    assertCounts(modal, { new: 1, update: 1, unchanged: 0, error: 0 });
    expect(applyButton(modal).disabled).toBe(false);
    // Apply button label reflects the count of changes.
    expect(applyButton(modal).textContent).toMatch(/Apply 2 changes/);

    // ── Apply ──────────────────────────────────────────────────────────
    fireEvent.click(applyButton(modal));

    // Modal closes (UnitsView flips importing → false → modal unmounts).
    expect(screen.queryByTestId("modal-units-import")).toBeNull();

    // ── Table reflects the changes ──────────────────────────────────────
    // u1's AC type is now "split" (it was "ducted" before).
    const u1RowAfter = screen
      .getByText("G01 / 335 Aspen Boulevard")
      .closest("tr")!;
    expect(within(u1RowAfter).getByText("split")).toBeTruthy();
    // The systems cell on the same row reads "2" now (was "1").
    // Just look up the row's cells: addr | ac type | systems | extras | agent | edit
    const cells = u1RowAfter.querySelectorAll("td");
    expect(cells[2].textContent).toBe("2"); // systems
    expect(cells[3].textContent).toBe("1"); // extras

    // The newly-created unit shows up as its own row.
    const newRow = screen
      .getByText("99 Brand New Lane")
      .closest("tr")!;
    expect(newRow).toBeTruthy();
    expect(within(newRow).getByText("split")).toBeTruthy();
  });

  it("flags an exact-match CSV as Unchanged and keeps Apply disabled", () => {
    render(<Harness initial={makeUnits()} />);

    const modal = openImportModal();

    // Paste a CSV that exactly matches u2 — no field changes at all.
    const matchingCsv = [
      "id,addressLine1,addressLine2,acType,systems,additional,agentId",
      "u2,12 / 88 Marine Parade,Coogee NSW 2034,split,2,0,ag-002",
    ].join("\n");
    pasteCsv(modal, matchingCsv);

    assertCounts(modal, { new: 0, update: 0, unchanged: 1, error: 0 });

    // The row's notes column reads "Already matches the record on file".
    const unchangedRow = within(modal).getByTestId("row-units-import-2");
    expect(within(unchangedRow).getByText("Unchanged")).toBeTruthy();
    expect(
      within(unchangedRow).getByText(/Already matches the record on file/),
    ).toBeTruthy();

    // Apply stays disabled — there's nothing to apply.
    expect(applyButton(modal).disabled).toBe(true);
    expect(within(modal).getByText(/Nothing to change/)).toBeTruthy();

    // Cancel closes the modal cleanly.
    fireEvent.click(within(modal).getByTestId("button-units-import-cancel"));
    expect(screen.queryByTestId("modal-units-import")).toBeNull();
  });
});
