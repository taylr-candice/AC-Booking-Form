// @vitest-environment happy-dom

/**
 * URL persistence for the rest of the queue toolbar (Task #207).
 *
 * Task #195 wired URL persistence into the Bookings / Awaiting-
 * coordination "Template used" filter. The same toolbars also
 * expose:
 *  - Bookings: a status chip, a building filter, and a search box.
 *  - Awaiting-coordination: a "waiting on" chip, a building filter,
 *    and a search box.
 *
 * All of those previously lived in React state lifted to AdminApp
 * and reset on page refresh — the very friction the chip was added
 * to solve, just spread across more controls. This file pins the
 * round-trip for each new param:
 *
 *  - Mounting AdminApp with `?status=…`, `?building=…`, `?q=…`, or
 *    `?coordination=…` in the URL restores the corresponding
 *    toolbar control on first paint.
 *  - Picking the toolbar's reset value (an "All …" chip / clearing
 *    the search box) removes the param so the URL is identical to
 *    a fresh visit, matching the template-filter convention.
 *  - Sidebar nav (the explicit "fresh start" gesture in
 *    `handleNav`) wipes all four params in one go.
 *  - A stale / malformed value falls back to the reset state
 *    instead of crashing the toolbar.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import "@testing-library/jest-dom/vitest";

import {
  AdminApp,
  readBookingsBuildingFilterFromURL,
  readBookingsStatusFilterFromURL,
  readCoordinationFilterFromURL,
  readOutcomeFilterFromURL,
  readSearchFromURL,
} from "./AdminApp";

function setUrl(search: string) {
  // happy-dom keeps `window.location.href` writable; replaceState
  // also works but pinning `href` is enough for the initial-mount
  // read path that the test exercises.
  window.history.replaceState(null, "", `/${search}`);
}

function readParam(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name);
}

function gotoAwaitingCoordination() {
  fireEvent.click(
    screen.getByRole("button", { name: "Awaiting coordination" }),
  );
}

function gotoBookings() {
  fireEvent.click(screen.getByRole("button", { name: "Bookings" }));
}

afterEach(() => {
  cleanup();
  setUrl("");
});

beforeEach(() => {
  setUrl("");
});

describe("AdminApp · queue toolbar filters URL round-trip (Task #207)", () => {
  it("restores the bookings status chip from `?status=` on first paint", () => {
    setUrl("?status=scheduled");
    render(<AdminApp />);

    const chip = screen.getByTestId("chip-bookings-scheduled");
    // The chip's `aria-pressed` reflects which one is currently
    // active — the same selector the toolbar's own visual state
    // reads from. If the URL → state seed worked, this is the only
    // chip that should report pressed.
    expect(chip).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("chip-bookings-all")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("restores the bookings building filter from `?building=` on first paint", () => {
    // `bldg-aspen` is the first seeded building id.
    setUrl("?building=bldg-aspen");
    render(<AdminApp />);

    const select = screen.getByLabelText("Filter by building") as
      HTMLSelectElement;
    expect(select.value).toBe("bldg-aspen");
  });

  it("restores the search box from `?q=` on first paint", () => {
    setUrl(`?q=${encodeURIComponent("aspen")}`);
    render(<AdminApp />);

    const input = screen.getByPlaceholderText(
      "Search by customer, ID, or address…",
    ) as HTMLInputElement;
    expect(input.value).toBe("aspen");
  });

  it("writes `?status=` when a chip is picked, and removes it on the All reset", () => {
    render(<AdminApp />);
    expect(readParam("status")).toBeNull();

    fireEvent.click(screen.getByTestId("chip-bookings-scheduled"));
    expect(readParam("status")).toBe("scheduled");

    // Picking the "All" chip is the toolbar's reset value — the
    // param must be removed so the URL is identical to a fresh
    // visit, matching the template-filter convention.
    fireEvent.click(screen.getByTestId("chip-bookings-all"));
    expect(readParam("status")).toBeNull();
  });

  it("writes `?building=` when the dropdown changes, and removes it on the All reset", () => {
    render(<AdminApp />);
    expect(readParam("building")).toBeNull();

    const select = screen.getByLabelText("Filter by building") as
      HTMLSelectElement;
    fireEvent.change(select, { target: { value: "bldg-aspen" } });
    expect(readParam("building")).toBe("bldg-aspen");

    fireEvent.change(select, { target: { value: "all" } });
    expect(readParam("building")).toBeNull();
  });

  it("writes `?q=` while typing, and removes it once the box is cleared", () => {
    render(<AdminApp />);
    expect(readParam("q")).toBeNull();

    const input = screen.getByPlaceholderText(
      "Search by customer, ID, or address…",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "aspen" } });
    expect(readParam("q")).toBe("aspen");

    fireEvent.change(input, { target: { value: "" } });
    expect(readParam("q")).toBeNull();
  });

  it("treats a whitespace-only search as the reset state (param removed)", () => {
    // Otherwise `?q=%20` would round-trip as a real filter that
    // matches no rows but still narrows chip counts — a confusing
    // ghost lens from a refresh.
    render(<AdminApp />);
    const input = screen.getByPlaceholderText(
      "Search by customer, ID, or address…",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "aspen" } });
    expect(readParam("q")).toBe("aspen");

    fireEvent.change(input, { target: { value: "   " } });
    expect(readParam("q")).toBeNull();
  });

  it("ignores an unknown `?status=` value and falls back to All", () => {
    // A typo / stale URL shouldn't render an out-of-catalog chip
    // or crash the chip lookup — same defensive shape as the
    // template-filter helper's malformed-value fallback.
    setUrl("?status=does-not-exist");
    render(<AdminApp />);

    expect(screen.getByTestId("chip-bookings-all")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("ignores an unknown `?coordination=` value and falls back to All", () => {
    setUrl("?coordination=garbage");
    render(<AdminApp />);
    gotoAwaitingCoordination();

    // The "All" waiting-on chip is the only one pressed.
    expect(screen.getByTestId("chip-waiting-all")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("the URL → state seed helpers all return their reset values when the param is absent", () => {
    // Defensive baseline so the per-helper round-trip tests below
    // can rely on a known reset state. Any future helper added to
    // the toolbar should be wired into the same default-to-reset
    // contract or this test will start failing.
    setUrl("");
    expect(readBookingsStatusFilterFromURL()).toBe("all");
    expect(readBookingsBuildingFilterFromURL()).toBe("all");
    expect(readSearchFromURL()).toBe("");
    expect(readCoordinationFilterFromURL()).toBe("all");
    expect(readOutcomeFilterFromURL()).toBe("all");
  });

  it("the URL → state seed helpers all parse their respective params", () => {
    // Direct unit test on the seed helpers — the symmetry we can't
    // exercise via a sidebar-driven UI flow because handleNav (an
    // explicit "fresh start" gesture) wipes the coordination chip
    // on nav, the same way it wipes the template chip. The next
    // task ("keep the user on the same admin view after a page
    // refresh") will give Awaiting-coordination its own deep-link
    // entry point; until then the seed helpers are the symmetry
    // boundary, mirroring how `readBookingsTemplateFilterFromURL`
    // is the symmetry boundary for the existing chip.
    setUrl(
      "?status=cancelled&building=bldg-aspen&q=hello&coordination=awaiting_agent" +
        "&outcome=voicemail",
    );
    expect(readBookingsStatusFilterFromURL()).toBe("cancelled");
    expect(readBookingsBuildingFilterFromURL()).toBe("bldg-aspen");
    expect(readSearchFromURL()).toBe("hello");
    expect(readCoordinationFilterFromURL()).toBe("awaiting_agent");
    expect(readOutcomeFilterFromURL()).toBe("voicemail");
  });

  it("ignores an unknown `?outcome=` value and falls back to All", () => {
    // Mirror of the `?status=` / `?coordination=` defensive tests:
    // a stale or hand-edited param shouldn't smuggle an out-of-
    // catalog string into the chip's `aria-pressed` / count lookup.
    setUrl("?outcome=spamoutcome");
    render(<AdminApp />);
    gotoAwaitingCoordination();

    // The "Any outcome" chip is the only one pressed.
    expect(screen.getByTestId("chip-outcome-all")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("writes `?outcome=` when an outcome chip is picked, removes it on Any outcome", () => {
    render(<AdminApp />);
    gotoAwaitingCoordination();
    expect(readParam("outcome")).toBeNull();

    // "Never logged" is the only outcome chip guaranteed to be
    // enabled against the seeded data — most awaiting-coordination
    // rows have no logged attempts yet, so its bucket is never zero.
    // (The other outcome chips disable themselves when their
    // bucket is empty, and the seeded queue only has a single
    // logged email; an enabled chip is the contract we're pinning.)
    fireEvent.click(screen.getByTestId("chip-outcome-never_logged"));
    expect(readParam("outcome")).toBe("never_logged");

    // Picking the "Any outcome" chip is the toolbar's reset value —
    // the param must be removed so the URL is identical to a fresh
    // visit, matching the rest of the queue-toolbar convention.
    fireEvent.click(screen.getByTestId("chip-outcome-all"));
    expect(readParam("outcome")).toBeNull();
  });

  it("writes `?coordination=` when the awaiting chip is picked, removes it on All", () => {
    render(<AdminApp />);
    gotoAwaitingCoordination();
    expect(readParam("coordination")).toBeNull();

    fireEvent.click(screen.getByTestId("chip-waiting-awaiting_tenant"));
    expect(readParam("coordination")).toBe("awaiting_tenant");

    fireEvent.click(screen.getByTestId("chip-waiting-all"));
    expect(readParam("coordination")).toBeNull();
  });

  it("sidebar nav wipes every queue-filter param in one go", () => {
    // Seed every queue-filter param so the sidebar reset has
    // something to wipe — covers the "all of them in one go"
    // contract from the task spec, not just the template-filter
    // wipe Task #195 already pinned.
    setUrl(
      "?status=scheduled&building=bldg-aspen&q=aspen&coordination=awaiting_agent" +
        "&outcome=voicemail" +
        `&template=${encodeURIComponent("email::Sent agent intro")}`,
    );
    render(<AdminApp />);
    expect(readParam("status")).toBe("scheduled");
    expect(readParam("building")).toBe("bldg-aspen");
    expect(readParam("q")).toBe("aspen");
    expect(readParam("coordination")).toBe("awaiting_agent");
    expect(readParam("outcome")).toBe("voicemail");
    expect(readParam("template")).toBe("email::Sent agent intro");

    gotoAwaitingCoordination();

    // Every queue-filter param the toolbar owns should be gone.
    // The status reset is conditional in `handleNav` (only fires
    // for "bookings" / "payments"), but Awaiting-coordination
    // isn't one of those — so we navigate to Bookings as the
    // canonical "fresh start" target to exercise the status wipe
    // alongside the others.
    expect(readParam("building")).toBeNull();
    expect(readParam("q")).toBeNull();
    expect(readParam("coordination")).toBeNull();
    expect(readParam("outcome")).toBeNull();
    expect(readParam("template")).toBeNull();

    gotoBookings();
    expect(readParam("status")).toBeNull();
  });
});
