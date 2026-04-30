// @vitest-environment happy-dom

/**
 * URL persistence for the active sidebar view (Task #208). Pins the
 * `?view=…` round-trip and its composition with the Task #195
 * `?template=…` round-trip on the same URL.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import "@testing-library/jest-dom/vitest";

import { AdminApp, readViewFromURL } from "./AdminApp";

const SEEDED_TEMPLATE_NAME = "Sent agent intro";

function setUrl(search: string) {
  window.history.replaceState(null, "", `/${search}`);
}

function readViewParam(): string | null {
  return new URLSearchParams(window.location.search).get("view");
}

afterEach(() => {
  cleanup();
  setUrl("");
});

beforeEach(() => {
  setUrl("");
});

describe("AdminApp · sidebar view URL round-trip (Task #208)", () => {
  it("restores Awaiting-coordination on first paint when `?view=awaiting_coordination` is in the URL", () => {
    setUrl("?view=awaiting_coordination");
    render(<AdminApp />);

    expect(
      screen.getByRole("heading", { name: "Awaiting coordination" }),
    ).toBeInTheDocument();
  });

  it("composes with `?template=…`: a single refresh restores both view and chip on first paint", () => {
    setUrl(
      `?view=awaiting_coordination&template=${encodeURIComponent(
        `email::${SEEDED_TEMPLATE_NAME}`,
      )}`,
    );
    render(<AdminApp />);

    expect(
      screen.getByRole("heading", { name: "Awaiting coordination" }),
    ).toBeInTheDocument();
    const chip = screen.getByTestId("coordination-template-filter-chip");
    expect(chip.textContent).toContain(SEEDED_TEMPLATE_NAME);
  });

  it("writes the encoded view to the URL on sidebar nav, and removes it when navigating back to the default", () => {
    render(<AdminApp />);
    expect(readViewParam()).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Buildings" }));
    expect(readViewParam()).toBe("buildings");

    fireEvent.click(screen.getByRole("button", { name: "Rollouts" }));
    expect(readViewParam()).toBe("rollouts");

    fireEvent.click(screen.getByRole("button", { name: "Bookings" }));
    expect(readViewParam()).toBeNull();
  });

  it("falls back to Bookings when `?view=…` is unrecognised", () => {
    setUrl("?view=not_a_real_view");
    expect(readViewFromURL()).toBe("bookings");

    render(<AdminApp />);
    expect(screen.getByTestId("bookings-filter-template")).toBeInTheDocument();
  });

  it("normalises the URL on first paint when `?view=bookings` (the default) is explicitly set", () => {
    setUrl("?view=bookings");
    render(<AdminApp />);
    expect(readViewParam()).toBeNull();
  });
});
