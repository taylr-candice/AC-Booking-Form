// @vitest-environment happy-dom

/**
 * Task #216: when the admin pivots back into the buildings list from
 * a per-building {@link BuildingDetail} (via the detail screen's
 * "Back to buildings" button), the source building row should be
 * visually distinguished on first paint so ops doesn't lose its
 * starting point on a long buildings list.
 *
 * Mirrors the source-row highlight Task #172 introduced for the
 * bookings/payments list (see `BookingsView.focusedRowSeed.test.tsx`),
 * Task #180 mirrored to the awaiting-coordination list (see
 * `AwaitingCoordinationView.focusedRowSeed.test.tsx`), and Task #190
 * mirrored to the rollouts list (see
 * `RolloutsView.focusedRowSeed.test.tsx`) —
 * `data-focused="true"` plus a one-shot `template-row-focus-pulse`
 * class on top of a persistent BRAND_SOFT background tint, dismissed
 * on the admin's first interaction, never re-applied on subsequent
 * re-renders or sidebar nav round-trips.
 *
 * Exercised end-to-end via <AdminApp /> so we cover the full
 * BuildingsView (source row click) → AdminApp
 * (`returnToBuildingsListWithSource` seed handoff) → BuildingsView
 * (consumer of `initialFocusedRowId`) round-trip.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AdminApp } from "./AdminApp";

afterEach(() => {
  cleanup();
});

/**
 * Open the buildings view, grab the first building row's testid, and
 * click into it to land on the {@link BuildingDetail}. Returns the
 * building id so callers can pin assertions on the same row after
 * the round-trip.
 *
 * Uses the `buildings-row-<id>` testid the highlight machinery
 * itself adds, which keeps the seed identical to the row attribute
 * we assert against.
 */
function openBuildingsListAndDriveIntoFirstRowDetail(): string {
  fireEvent.click(screen.getByRole("button", { name: "Buildings" }));
  const firstRow = screen
    .getAllByRole("button")
    .find((el) =>
      el.getAttribute("data-testid")?.startsWith("buildings-row-"),
    )!;
  expect(firstRow).toBeTruthy();
  const buildingId = firstRow
    .getAttribute("data-testid")!
    .replace("buildings-row-", "");
  fireEvent.click(firstRow);
  // The detail screen renders a "Back to buildings" button — its
  // presence is our signal that we successfully drilled into the
  // per-building detail.
  expect(
    screen.getAllByRole("button", { name: /back to buildings/i }).length,
  ).toBeGreaterThan(0);
  return buildingId;
}

function clickBackToBuildings() {
  // BuildingDetail renders the "Back to buildings" affordance twice
  // (header + footer) — clicking the first one is enough to pivot
  // back to the list.
  const backButtons = screen.getAllByRole("button", {
    name: /back to buildings/i,
  });
  fireEvent.click(backButtons[0]!);
}

describe("BuildingsView source-row highlight (Task #216)", () => {
  it("marks the source building row as focused on first paint after the back-pivot", () => {
    render(<AdminApp />);
    const sourceBuildingId = openBuildingsListAndDriveIntoFirstRowDetail();
    clickBackToBuildings();

    const row = screen.getByTestId(`buildings-row-${sourceBuildingId}`);
    expect(row.getAttribute("data-focused")).toBe("true");
    // The one-shot pulse class is also present on first paint so the
    // landing row is unmistakable on long building lists. Checked via
    // className substring so the assertion isn't sensitive to the
    // existing hover/focus utility classes.
    expect(row.className).toContain("template-row-focus-pulse");
  });

  it("highlights ONLY the source row — other building rows stay untinted", () => {
    render(<AdminApp />);
    const sourceBuildingId = openBuildingsListAndDriveIntoFirstRowDetail();
    clickBackToBuildings();

    const focusedRows = screen
      .getAllByRole("button")
      .filter(
        (el) =>
          el.getAttribute("data-testid")?.startsWith("buildings-row-") &&
          el.getAttribute("data-focused") === "true",
      );
    expect(focusedRows).toHaveLength(1);
    expect(focusedRows[0]!.getAttribute("data-testid")).toBe(
      `buildings-row-${sourceBuildingId}`,
    );
  });

  it("dismisses the highlight on the admin's first interaction (mousedown)", () => {
    render(<AdminApp />);
    const sourceBuildingId = openBuildingsListAndDriveIntoFirstRowDetail();
    clickBackToBuildings();

    expect(
      screen
        .getByTestId(`buildings-row-${sourceBuildingId}`)
        .getAttribute("data-focused"),
    ).toBe("true");

    // A mousedown anywhere is the canonical "first interaction" — we
    // dispatch on `document.body` so it bubbles up through the
    // global listener BuildingsView attaches in its dismiss effect.
    fireEvent.mouseDown(document.body);

    expect(
      screen
        .getByTestId(`buildings-row-${sourceBuildingId}`)
        .getAttribute("data-focused"),
    ).toBeNull();
  });

  it("does not re-apply the highlight after sidebar nav away and back", () => {
    render(<AdminApp />);
    openBuildingsListAndDriveIntoFirstRowDetail();
    clickBackToBuildings();

    // Sidebar nav clears any pending seed in the AdminApp shell, so
    // returning to the buildings list lands on a clean unhighlighted
    // list.
    fireEvent.click(screen.getByRole("button", { name: "Bookings" }));
    fireEvent.click(screen.getByRole("button", { name: "Buildings" }));

    const focusedRows = screen
      .getAllByRole("button")
      .filter(
        (el) =>
          el.getAttribute("data-testid")?.startsWith("buildings-row-") &&
          el.getAttribute("data-focused") === "true",
      );
    expect(focusedRows).toHaveLength(0);
  });
});
