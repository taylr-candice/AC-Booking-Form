// @vitest-environment happy-dom

/**
 * Task #180: when the admin pivots back into the awaiting-
 * coordination list from a coordination-mode BookingDetail (via the
 * detail screen's "Back to list" button), the source booking row
 * should be visually distinguished on first paint so ops doesn't
 * lose its starting point on a long queue.
 *
 * Mirrors the source-row highlight Task #172 introduced for the
 * bookings/payments list (see `BookingsView.focusedRowSeed.test.tsx`)
 * — `data-focused="true"` plus a one-shot `template-row-focus-pulse`
 * class on top of a persistent BRAND_SOFT background tint, dismissed
 * on the admin's first interaction, never re-applied on subsequent
 * re-renders or sidebar nav round-trips.
 *
 * Exercised end-to-end via <AdminApp /> so we cover the full
 * AwaitingCoordinationView (source row click) → AdminApp
 * (`returnToCoordinationListWithSource` seed handoff) →
 * AwaitingCoordinationView (consumer of `initialFocusedRowId`)
 * round-trip. The bookings-list highlight already has its own
 * coverage in BookingsView.focusedRowSeed.test.tsx — this file pins
 * ONLY the coordination-list source-row highlight + dismiss
 * lifecycle so a regression on either shows up surgically.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AdminApp } from "./AdminApp";

afterEach(() => {
  cleanup();
});

/**
 * Open the awaiting-coordination view, grab the first coordination
 * row's testid, and click into it to land on the BookingDetail
 * screen. Returns the booking id so callers can pin assertions on
 * the same row after the round-trip.
 *
 * Uses the `coordination-row-<id>` testid the highlight machinery
 * itself adds, which keeps the seed identical to the row attribute
 * we assert against.
 */
function openCoordinationListAndDriveIntoFirstRowDetail(): string {
  fireEvent.click(
    screen.getByRole("button", { name: "Awaiting coordination" }),
  );
  const firstRow = screen
    .getAllByRole("button")
    .find((el) =>
      el.getAttribute("data-testid")?.startsWith("coordination-row-"),
    )!;
  expect(firstRow).toBeTruthy();
  const bookingId = firstRow
    .getAttribute("data-testid")!
    .replace("coordination-row-", "");
  fireEvent.click(firstRow);
  expect(screen.getByTestId(`booking-detail-${bookingId}`)).toBeTruthy();
  return bookingId;
}

function clickBackToList() {
  // Two "Back to list" buttons render in the detail (sticky header +
  // inline) — clicking either should work. Pick the first.
  const backBtn = screen.getAllByRole("button", { name: /back to list/i })[0]!;
  fireEvent.click(backBtn);
}

describe("AwaitingCoordinationView source-row highlight (Task #180)", () => {
  it("marks the source booking row as focused on first paint after the back-pivot", () => {
    render(<AdminApp />);
    const sourceBookingId = openCoordinationListAndDriveIntoFirstRowDetail();
    clickBackToList();

    const row = screen.getByTestId(`coordination-row-${sourceBookingId}`);
    expect(row.getAttribute("data-focused")).toBe("true");
    // The one-shot pulse class is also present on first paint so the
    // landing row is unmistakable on long coordination queues. Checked
    // via className substring so the assertion isn't sensitive to the
    // existing hover/focus utility classes.
    expect(row.className).toContain("template-row-focus-pulse");
  });

  it("highlights ONLY the source row — other coordination rows stay untinted", () => {
    render(<AdminApp />);
    const sourceBookingId = openCoordinationListAndDriveIntoFirstRowDetail();
    clickBackToList();

    const focusedRows = screen
      .getAllByRole("button")
      .filter(
        (el) =>
          el.getAttribute("data-testid")?.startsWith("coordination-row-") &&
          el.getAttribute("data-focused") === "true",
      );
    expect(focusedRows).toHaveLength(1);
    expect(focusedRows[0]!.getAttribute("data-testid")).toBe(
      `coordination-row-${sourceBookingId}`,
    );
  });

  it("dismisses the highlight on the admin's first interaction (mousedown)", () => {
    render(<AdminApp />);
    const sourceBookingId = openCoordinationListAndDriveIntoFirstRowDetail();
    clickBackToList();

    expect(
      screen
        .getByTestId(`coordination-row-${sourceBookingId}`)
        .getAttribute("data-focused"),
    ).toBe("true");

    // A mousedown anywhere is the canonical "first interaction" — we
    // dispatch on `document.body` so it bubbles up through the global
    // listener AwaitingCoordinationView attaches in its dismiss
    // effect.
    fireEvent.mouseDown(document.body);

    expect(
      screen
        .getByTestId(`coordination-row-${sourceBookingId}`)
        .getAttribute("data-focused"),
    ).toBeNull();
  });

  it("does not re-apply the highlight on subsequent re-renders", () => {
    render(<AdminApp />);
    const sourceBookingId = openCoordinationListAndDriveIntoFirstRowDetail();
    clickBackToList();

    fireEvent.mouseDown(document.body);
    expect(
      screen
        .getByTestId(`coordination-row-${sourceBookingId}`)
        .getAttribute("data-focused"),
    ).toBeNull();

    // Force a re-render via a benign filter change (typing in the
    // search input). The seed has already been consumed by the
    // parent so no fresh `initialFocusedRowId` should land — the row
    // must stay un-focused.
    fireEvent.change(
      screen.getByPlaceholderText(/search by customer/i),
      { target: { value: "x" } },
    );
    fireEvent.change(
      screen.getByPlaceholderText(/search by customer/i),
      { target: { value: "" } },
    );

    expect(
      screen
        .getByTestId(`coordination-row-${sourceBookingId}`)
        .getAttribute("data-focused"),
    ).toBeNull();
  });

  it("does not re-apply the highlight after sidebar nav away and back", () => {
    render(<AdminApp />);
    openCoordinationListAndDriveIntoFirstRowDetail();
    clickBackToList();

    // Sidebar nav clears any pending seed in the AdminApp shell, so
    // returning to the coordination list lands on a clean
    // unhighlighted queue.
    fireEvent.click(screen.getByRole("button", { name: "Bookings" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Awaiting coordination" }),
    );

    const focusedRows = screen
      .getAllByRole("button")
      .filter(
        (el) =>
          el.getAttribute("data-testid")?.startsWith("coordination-row-") &&
          el.getAttribute("data-focused") === "true",
      );
    expect(focusedRows).toHaveLength(0);
  });
});
