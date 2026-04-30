// @vitest-environment happy-dom

/**
 * Regression for the Call / Email templates panels remembering their
 * Sort toggle choice across sidebar nav round-trips (Task #192).
 *
 * Task #170 originally parked the `sortMode` `useState` inside each
 * panel component, which meant every time ops popped over to Bookings
 * (or to the other channel's templates view) and back, the panel
 * silently re-rendered in default order. Admins comparing usage
 * across both channels had to re-click "Most used first" on every
 * return trip.
 *
 * Hoisting both slots into {@link AdminApp} (one per channel, so
 * flipping one doesn't move the other) fixes that. This test pins:
 *
 *   1. The Call panel remembers "Most used first" across a Bookings
 *      round-trip.
 *   2. The Call and Email panels remember independently — flipping
 *      the Email panel doesn't move the Call panel's choice.
 */

import {
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AdminApp } from "./AdminApp";

afterEach(() => {
  cleanup();
});

function gotoBookings() {
  fireEvent.click(screen.getByRole("button", { name: "Bookings" }));
}

function gotoCallTemplates() {
  fireEvent.click(screen.getByRole("button", { name: "Call templates" }));
}

function gotoEmailTemplates() {
  fireEvent.click(screen.getByRole("button", { name: "Email templates" }));
}

function callSortMode(): string | null {
  return screen
    .getByTestId("sort-toggle-call-templates")
    .getAttribute("data-sort-mode");
}

function emailSortMode(): string | null {
  return screen
    .getByTestId("sort-toggle-email-templates")
    .getAttribute("data-sort-mode");
}

describe("AdminApp · templates panel Sort choice survives nav (Task #192)", () => {
  it("remembers the Call panel's 'Most used first' across a Bookings round-trip", () => {
    render(<AdminApp />);

    // Open the Call templates panel and flip the toggle.
    gotoCallTemplates();
    expect(callSortMode()).toBe("default");
    fireEvent.click(
      screen.getByTestId("button-sort-call-templates-most-used"),
    );
    expect(callSortMode()).toBe("mostUsed");

    // Pop over to Bookings and back — the choice must still be there.
    gotoBookings();
    gotoCallTemplates();
    expect(callSortMode()).toBe("mostUsed");
    expect(
      screen
        .getByTestId("button-sort-call-templates-most-used")
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("remembers the Email panel's 'Most referenced overall' across a Bookings round-trip", () => {
    render(<AdminApp />);

    gotoEmailTemplates();
    expect(emailSortMode()).toBe("default");
    fireEvent.click(
      screen.getByTestId("button-sort-email-templates-most-referenced"),
    );
    expect(emailSortMode()).toBe("mostReferenced");

    gotoBookings();
    gotoEmailTemplates();
    expect(emailSortMode()).toBe("mostReferenced");
    expect(
      screen
        .getByTestId("button-sort-email-templates-most-referenced")
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("Call and Email panels remember independently — flipping one does not move the other", () => {
    render(<AdminApp />);

    // Set Call → Most used first.
    gotoCallTemplates();
    fireEvent.click(
      screen.getByTestId("button-sort-call-templates-most-used"),
    );
    expect(callSortMode()).toBe("mostUsed");

    // Switch to Email and pick a *different* mode there.
    gotoEmailTemplates();
    expect(emailSortMode()).toBe("default");
    fireEvent.click(
      screen.getByTestId("button-sort-email-templates-most-referenced"),
    );
    expect(emailSortMode()).toBe("mostReferenced");

    // Pop back to Call — its mode is still "Most used first", not the
    // Email panel's "Most referenced overall".
    gotoCallTemplates();
    expect(callSortMode()).toBe("mostUsed");

    // And vice versa: flipping back to Email finds the email panel
    // still on "Most referenced overall", not the call panel's
    // "Most used first".
    gotoEmailTemplates();
    expect(emailSortMode()).toBe("mostReferenced");
  });
});
