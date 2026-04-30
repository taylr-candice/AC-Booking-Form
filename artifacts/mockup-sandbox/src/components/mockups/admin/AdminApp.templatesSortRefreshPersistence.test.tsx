// @vitest-environment happy-dom

/**
 * Regression for the Call / Email templates panels remembering
 * their Sort toggle choice across a *full page reload* (Task #215).
 *
 * Task #192 lifted both `sortMode` slots into AdminApp shell state
 * so the choice survived sidebar nav round-trips, but the state was
 * still in-memory only — refreshing the tab dropped both panels back
 * to "Default order". Admins comparing usage trends across both
 * channels then had to re-click "Most used first" / "Most referenced
 * overall" every morning.
 *
 * Task #215 fixed that by mirroring each slot into `localStorage`
 * (one key per channel, so flipping one doesn't move the other).
 * This test pins:
 *
 *   1. The Call panel's "Most used first" choice is restored from
 *      `localStorage` after a fresh `<AdminApp />` mount (the test's
 *      stand-in for a page reload — happy-dom's `localStorage`
 *      survives unmount/re-mount the same way real browser storage
 *      survives a refresh).
 *   2. The Email panel restores independently.
 *   3. A garbage `localStorage` value (older build, hand-edit) falls
 *      back to "Default order" instead of poisoning shell state with
 *      an unknown sort mode.
 */

import {
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AdminApp } from "./AdminApp";

beforeEach(() => {
  // Each test owns the localStorage namespace so a previous test's
  // persisted "mostUsed" can't bleed into the next test's "fresh
  // visit" assertion.
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

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

describe("AdminApp · templates panel Sort choice survives refresh (Task #215)", () => {
  it("restores the Call panel's 'Most used first' after a full-page reload", () => {
    // First "session": flip the Call panel Sort to "Most used first".
    const first = render(<AdminApp />);
    gotoCallTemplates();
    expect(callSortMode()).toBe("default");
    fireEvent.click(
      screen.getByTestId("button-sort-call-templates-most-used"),
    );
    expect(callSortMode()).toBe("mostUsed");

    // "Reload" the tab — unmounting and re-mounting `<AdminApp />`
    // exercises exactly the same code path a real refresh hits
    // (the lazy `useState` initialiser re-reads localStorage on
    // first paint). happy-dom's localStorage survives the unmount.
    first.unmount();
    render(<AdminApp />);

    // Without flipping anything, opening Call templates shows the
    // panel already on "Most used first" and the toggle pressed.
    gotoCallTemplates();
    expect(callSortMode()).toBe("mostUsed");
    expect(
      screen
        .getByTestId("button-sort-call-templates-most-used")
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("restores the Email panel's 'Most referenced overall' after a full-page reload", () => {
    const first = render(<AdminApp />);
    gotoEmailTemplates();
    expect(emailSortMode()).toBe("default");
    fireEvent.click(
      screen.getByTestId("button-sort-email-templates-most-referenced"),
    );
    expect(emailSortMode()).toBe("mostReferenced");

    first.unmount();
    render(<AdminApp />);

    gotoEmailTemplates();
    expect(emailSortMode()).toBe("mostReferenced");
    expect(
      screen
        .getByTestId("button-sort-email-templates-most-referenced")
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("restores Call and Email panels independently across a reload", () => {
    // First session: Call → Most used, Email → Most referenced.
    const first = render(<AdminApp />);
    gotoCallTemplates();
    fireEvent.click(
      screen.getByTestId("button-sort-call-templates-most-used"),
    );
    expect(callSortMode()).toBe("mostUsed");
    gotoEmailTemplates();
    fireEvent.click(
      screen.getByTestId("button-sort-email-templates-most-referenced"),
    );
    expect(emailSortMode()).toBe("mostReferenced");

    first.unmount();
    render(<AdminApp />);

    // After the reload each channel restores its own choice — the
    // Call panel didn't pick up Email's "mostReferenced" and vice
    // versa, mirroring the per-channel split the in-memory shell
    // already enforces.
    gotoCallTemplates();
    expect(callSortMode()).toBe("mostUsed");
    gotoEmailTemplates();
    expect(emailSortMode()).toBe("mostReferenced");
  });

  it("ignores a garbage persisted value and falls back to 'Default order'", () => {
    // Simulate a stale entry from an older build (or a hand-edit).
    // The shell must reject it instead of letting an unknown string
    // smuggle into typed `CallTemplateSortMode` / `EmailTemplateSortMode`
    // state — a panel rendering with an unknown sort mode would
    // silently fall through every comparison branch and look broken.
    window.localStorage.setItem(
      "admin.callTemplatesSortMode",
      "not-a-real-mode",
    );
    window.localStorage.setItem(
      "admin.emailTemplatesSortMode",
      "{}",
    );

    render(<AdminApp />);

    gotoCallTemplates();
    expect(callSortMode()).toBe("default");
    gotoEmailTemplates();
    expect(emailSortMode()).toBe("default");
  });
});
