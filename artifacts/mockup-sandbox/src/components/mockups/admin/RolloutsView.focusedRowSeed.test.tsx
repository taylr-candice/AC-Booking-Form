// @vitest-environment happy-dom

/**
 * Task #190: when the admin pivots back into the rollouts list from
 * a per-rollout {@link RolloutScheduleEditor} (via the editor's
 * "Back to rollouts" button), the source rollout row should be
 * visually distinguished on first paint so ops doesn't lose its
 * starting point on a long rollouts list.
 *
 * Mirrors the source-row highlight Task #172 introduced for the
 * bookings/payments list (see `BookingsView.focusedRowSeed.test.tsx`)
 * and Task #180 mirrored to the awaiting-coordination list (see
 * `AwaitingCoordinationView.focusedRowSeed.test.tsx`) —
 * `data-focused="true"` plus a one-shot `template-row-focus-pulse`
 * class on top of a persistent BRAND_SOFT background tint, dismissed
 * on the admin's first interaction, never re-applied on subsequent
 * re-renders or sidebar nav round-trips.
 *
 * Exercised end-to-end via <AdminApp /> so we cover the full
 * RolloutsView (source row click) → AdminApp
 * (`returnToRolloutsListWithSource` seed handoff) → RolloutsView
 * (consumer of `initialFocusedRowId`) round-trip.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AdminApp } from "./AdminApp";

afterEach(() => {
  cleanup();
});

/**
 * Open the rollouts view, grab the first rollout row's testid, and
 * click into it to land on the {@link RolloutScheduleEditor}.
 * Returns the rollout id so callers can pin assertions on the same
 * row after the round-trip.
 *
 * Uses the `rollouts-row-<id>` testid the highlight machinery
 * itself adds, which keeps the seed identical to the row attribute
 * we assert against.
 */
function openRolloutsListAndDriveIntoFirstRowEditor(): string {
  fireEvent.click(screen.getByRole("button", { name: "Rollouts" }));
  const firstRow = screen
    .getAllByRole("button")
    .find((el) =>
      el.getAttribute("data-testid")?.startsWith("rollouts-row-"),
    )!;
  expect(firstRow).toBeTruthy();
  const rolloutId = firstRow
    .getAttribute("data-testid")!
    .replace("rollouts-row-", "");
  fireEvent.click(firstRow);
  // The editor renders a "Back to rollouts" button — its presence
  // is our signal that we successfully drilled into the per-rollout
  // editor.
  expect(
    screen.getByRole("button", { name: /back to rollouts/i }),
  ).toBeTruthy();
  return rolloutId;
}

function clickBackToRollouts() {
  fireEvent.click(
    screen.getByRole("button", { name: /back to rollouts/i }),
  );
}

describe("RolloutsView source-row highlight (Task #190)", () => {
  it("marks the source rollout row as focused on first paint after the back-pivot", () => {
    render(<AdminApp />);
    const sourceRolloutId = openRolloutsListAndDriveIntoFirstRowEditor();
    clickBackToRollouts();

    const row = screen.getByTestId(`rollouts-row-${sourceRolloutId}`);
    expect(row.getAttribute("data-focused")).toBe("true");
    // The one-shot pulse class is also present on first paint so the
    // landing row is unmistakable on long rollout lists. Checked via
    // className substring so the assertion isn't sensitive to the
    // existing hover/focus utility classes.
    expect(row.className).toContain("template-row-focus-pulse");
  });

  it("highlights ONLY the source row — other rollout rows stay untinted", () => {
    render(<AdminApp />);
    const sourceRolloutId = openRolloutsListAndDriveIntoFirstRowEditor();
    clickBackToRollouts();

    const focusedRows = screen
      .getAllByRole("button")
      .filter(
        (el) =>
          el.getAttribute("data-testid")?.startsWith("rollouts-row-") &&
          el.getAttribute("data-focused") === "true",
      );
    expect(focusedRows).toHaveLength(1);
    expect(focusedRows[0]!.getAttribute("data-testid")).toBe(
      `rollouts-row-${sourceRolloutId}`,
    );
  });

  it("dismisses the highlight on the admin's first interaction (mousedown)", () => {
    render(<AdminApp />);
    const sourceRolloutId = openRolloutsListAndDriveIntoFirstRowEditor();
    clickBackToRollouts();

    expect(
      screen
        .getByTestId(`rollouts-row-${sourceRolloutId}`)
        .getAttribute("data-focused"),
    ).toBe("true");

    // A mousedown anywhere is the canonical "first interaction" — we
    // dispatch on `document.body` so it bubbles up through the
    // global listener RolloutsView attaches in its dismiss effect.
    fireEvent.mouseDown(document.body);

    expect(
      screen
        .getByTestId(`rollouts-row-${sourceRolloutId}`)
        .getAttribute("data-focused"),
    ).toBeNull();
  });

  it("does not re-apply the highlight on subsequent re-renders", () => {
    render(<AdminApp />);
    const sourceRolloutId = openRolloutsListAndDriveIntoFirstRowEditor();
    clickBackToRollouts();

    fireEvent.mouseDown(document.body);
    expect(
      screen
        .getByTestId(`rollouts-row-${sourceRolloutId}`)
        .getAttribute("data-focused"),
    ).toBeNull();

    // Force a re-render via a benign affordance toggle on the list
    // (open the New rollout form). The seed has already been
    // consumed by the parent so no fresh `initialFocusedRowId`
    // should land — the row must stay un-focused even after the
    // list rebuilds with the form mounted alongside it.
    fireEvent.click(
      screen.getByRole("button", { name: /new rollout/i }),
    );

    expect(
      screen
        .getByTestId(`rollouts-row-${sourceRolloutId}`)
        .getAttribute("data-focused"),
    ).toBeNull();
  });

  it("does not re-apply the highlight after sidebar nav away and back", () => {
    render(<AdminApp />);
    openRolloutsListAndDriveIntoFirstRowEditor();
    clickBackToRollouts();

    // Sidebar nav clears any pending seed in the AdminApp shell, so
    // returning to the rollouts list lands on a clean unhighlighted
    // list.
    fireEvent.click(screen.getByRole("button", { name: "Bookings" }));
    fireEvent.click(screen.getByRole("button", { name: "Rollouts" }));

    const focusedRows = screen
      .getAllByRole("button")
      .filter(
        (el) =>
          el.getAttribute("data-testid")?.startsWith("rollouts-row-") &&
          el.getAttribute("data-focused") === "true",
      );
    expect(focusedRows).toHaveLength(0);
  });
});
