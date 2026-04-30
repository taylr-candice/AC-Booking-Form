// @vitest-environment happy-dom

/**
 * Tests for the per-row "Used in N bookings" badge surfaced on the
 * Call / Email templates panels (Task #160).
 *
 * Two layers, both pinned here:
 *  - Component-level: {@link LatestTouchBadge} renders the placeholder
 *    when count === 0, the static pill when interactive but no
 *    handler, and the click-through button when both count > 0 and
 *    `onOpenFilteredBookings` is wired. The button must invoke its
 *    handler with the template's *name* (not id), since BookingsView
 *    filters on the snapshot label.
 *  - AdminApp e2e: bulk-log a templated call / email through the
 *    Awaiting-coordination view, jump to the matching templates
 *    panel, confirm the badge reads "Used in N bookings", click it,
 *    and verify the bookings list shows the template-filter chip
 *    pre-applied with the template's name. This is the contract that
 *    keeps the count and the click-through in sync — both use the
 *    `latest.templateLabel === templateFilter` predicate.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminApp } from "./AdminApp";
import { LatestTouchBadge } from "./LatestTouchBadge";

afterEach(() => {
  cleanup();
});

// ─── Component behavior ────────────────────────────────────────────

describe("LatestTouchBadge · component behavior", () => {
  it("count === 0 renders the dim placeholder, not a button", () => {
    render(
      <LatestTouchBadge
        kind="email"
        templateId="tpl-empty"
        templateName="Sent rebook link"
        count={0}
        onOpenFilteredBookings={vi.fn()}
      />,
    );

    const node = screen.getByTestId("email-template-latest-touch-tpl-empty");
    expect(node.tagName.toLowerCase()).toBe("div");
    expect(node.getAttribute("data-count")).toBe("0");
    expect(node.textContent).toMatch(/not the latest touch on any booking/i);
  });

  it("count > 0 with no handler renders a static pill (not interactive)", () => {
    render(
      <LatestTouchBadge
        kind="call"
        templateId="tpl-static"
        templateName="No answer — left voicemail"
        count={3}
      />,
    );

    const node = screen.getByTestId("call-template-latest-touch-tpl-static");
    expect(node.tagName.toLowerCase()).toBe("div");
    expect(node.getAttribute("data-count")).toBe("3");
    expect(node.textContent).toMatch(/used in 3 bookings/i);
  });

  it("count > 0 with handler renders a button that invokes onOpenFilteredBookings with the template NAME", () => {
    const onOpen = vi.fn();
    render(
      <LatestTouchBadge
        kind="email"
        templateId="tpl-click"
        templateName="Sent rebook link"
        count={2}
        onOpenFilteredBookings={onOpen}
      />,
    );

    const button = screen.getByTestId(
      "email-template-latest-touch-tpl-click",
    );
    expect(button.tagName.toLowerCase()).toBe("button");
    expect(button.getAttribute("data-count")).toBe("2");
    expect(button.getAttribute("data-template-name")).toBe(
      "Sent rebook link",
    );
    expect(button.textContent).toMatch(/used in 2 bookings/i);

    fireEvent.click(button);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith("Sent rebook link");
  });

  it("count === 1 uses the singular 'booking' form", () => {
    const onOpen = vi.fn();
    render(
      <LatestTouchBadge
        kind="call"
        templateId="tpl-one"
        templateName="No answer — left voicemail"
        count={1}
        onOpenFilteredBookings={onOpen}
      />,
    );
    const button = screen.getByTestId("call-template-latest-touch-tpl-one");
    expect(button.textContent).toMatch(/used in 1 booking\b/i);
    expect(button.textContent).not.toMatch(/bookings/i);
  });
});

// ─── End-to-end via <AdminApp /> ───────────────────────────────────

describe("LatestTouchBadge · cross-view click-through (Task #160 e2e)", () => {
  it("bulk-logging a templated call surfaces a 'Used in 2 bookings' badge on the Call templates row; clicking it lands on the bookings list with the template-filter chip pre-applied", () => {
    render(<AdminApp />);

    // Seed two bookings whose latest call touch is the
    // "voicemail_left" template, by bulk-logging a templated call
    // through the Awaiting coordination view — same path
    // TemplateUsagePopover.test.tsx uses to land real
    // `templateLabel` snapshots on real timelines.
    fireEvent.click(
      screen.getByRole("button", { name: "Awaiting coordination" }),
    );
    const rowCheckboxes = screen
      .getAllByRole("checkbox")
      .filter((el) =>
        (el as HTMLInputElement)
          .getAttribute("data-testid")
          ?.startsWith("checkbox-coordination-row-"),
      );
    expect(rowCheckboxes.length).toBeGreaterThanOrEqual(2);
    fireEvent.click(rowCheckboxes[0]!);
    fireEvent.click(rowCheckboxes[1]!);

    fireEvent.click(screen.getByTestId("button-bulk-log-call"));
    fireEvent.change(
      screen.getByTestId("select-bulk-call-template") as HTMLSelectElement,
      { target: { value: "voicemail_left" } },
    );
    fireEvent.click(screen.getByTestId("button-bulk-confirm-log-call"));

    // Hop to the Call templates panel and pin the badge count.
    fireEvent.click(screen.getByRole("button", { name: "Call templates" }));
    const badge = screen.getByTestId(
      "call-template-latest-touch-voicemail_left",
    );
    expect(badge.tagName.toLowerCase()).toBe("button");
    expect(badge.getAttribute("data-count")).toBe("2");
    expect(badge.textContent).toMatch(/used in 2 bookings/i);

    // Capture the template name the badge will pivot on so we can
    // assert it round-trips into the BookingsView chip.
    const templateName = badge.getAttribute("data-template-name")!;
    expect(templateName.length).toBeGreaterThan(0);

    // Click-through.
    fireEvent.click(badge);

    // BookingsView mounted with the template filter pre-applied.
    const chip = screen.getByTestId("bookings-template-filter-chip");
    expect(chip.textContent).toContain(templateName);
  });

  it("bulk-logging a templated email surfaces the badge on the Email templates row; clicking it pivots into the bookings list filtered to that template", () => {
    render(<AdminApp />);

    fireEvent.click(
      screen.getByRole("button", { name: "Awaiting coordination" }),
    );
    const rowCheckboxes = screen
      .getAllByRole("checkbox")
      .filter((el) =>
        (el as HTMLInputElement)
          .getAttribute("data-testid")
          ?.startsWith("checkbox-coordination-row-"),
      );
    expect(rowCheckboxes.length).toBeGreaterThanOrEqual(2);
    fireEvent.click(rowCheckboxes[0]!);
    fireEvent.click(rowCheckboxes[1]!);

    fireEvent.click(screen.getByTestId("button-bulk-log-email"));
    fireEvent.change(
      screen.getByTestId("select-bulk-email-template") as HTMLSelectElement,
      { target: { value: "rebook_link" } },
    );
    fireEvent.click(screen.getByTestId("button-bulk-confirm-log-email"));

    fireEvent.click(screen.getByRole("button", { name: "Email templates" }));
    const badge = screen.getByTestId(
      "email-template-latest-touch-rebook_link",
    );
    expect(badge.tagName.toLowerCase()).toBe("button");
    expect(badge.getAttribute("data-count")).toBe("2");
    expect(badge.textContent).toMatch(/used in 2 bookings/i);

    const templateName = badge.getAttribute("data-template-name")!;
    fireEvent.click(badge);

    const chip = screen.getByTestId("bookings-template-filter-chip");
    expect(chip.textContent).toContain(templateName);
  });

  it("clearing the chip and re-clicking the same badge re-applies the filter (nonce-driven remount)", () => {
    render(<AdminApp />);

    // Seed.
    fireEvent.click(
      screen.getByRole("button", { name: "Awaiting coordination" }),
    );
    const rowCheckboxes = screen
      .getAllByRole("checkbox")
      .filter((el) =>
        (el as HTMLInputElement)
          .getAttribute("data-testid")
          ?.startsWith("checkbox-coordination-row-"),
      );
    fireEvent.click(rowCheckboxes[0]!);
    fireEvent.click(screen.getByTestId("button-bulk-log-call"));
    fireEvent.change(
      screen.getByTestId("select-bulk-call-template") as HTMLSelectElement,
      { target: { value: "voicemail_left" } },
    );
    fireEvent.click(screen.getByTestId("button-bulk-confirm-log-call"));

    // First pivot.
    fireEvent.click(screen.getByRole("button", { name: "Call templates" }));
    fireEvent.click(
      screen.getByTestId("call-template-latest-touch-voicemail_left"),
    );
    expect(screen.getByTestId("bookings-template-filter-chip")).toBeTruthy();

    // Clear the chip.
    fireEvent.click(
      screen.getByTestId("button-clear-bookings-template-filter"),
    );
    expect(screen.queryByTestId("bookings-template-filter-chip")).toBeNull();

    // Hop back to the templates panel and re-click the same badge —
    // the nonce bump on `bookingsTemplatePivot` must remount
    // BookingsView so the seed runs again.
    fireEvent.click(screen.getByRole("button", { name: "Call templates" }));
    fireEvent.click(
      screen.getByTestId("call-template-latest-touch-voicemail_left"),
    );
    expect(screen.getByTestId("bookings-template-filter-chip")).toBeTruthy();
  });
});
