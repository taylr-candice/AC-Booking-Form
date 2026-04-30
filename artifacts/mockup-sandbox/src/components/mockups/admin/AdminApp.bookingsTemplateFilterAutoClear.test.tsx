// @vitest-environment happy-dom

/**
 * Regression for the BookingsView "Template used" filter staying
 * sensible across rename + remove (Task #162).
 *
 * The filter snapshots a template's `name`, the same way every
 * timeline entry snapshots `templateLabel`. If an admin renames or
 * removes a template via the Templates panel after picking it as a
 * filter, the lens would otherwise dangle: the dropdown options
 * reflect the new name, the chip is stuck on the old name, and the
 * "Showing X of Y" line lies about why rows are missing.
 *
 * Two safety nets cover this:
 *   1. {@link AdminApp}'s `removeEmailTemplate` / `updateEmailTemplate`
 *      (and call mirrors) auto-clear the filter when the bound
 *      template is renamed or removed.
 *   2. Sidebar nav also clears the filter as part of its "fresh
 *      start" cleanup (see {@link AdminApp.handleNav}).
 *
 * Either path is correct — what the admin sees is what the test
 * pins: after rename / remove, the chip is gone, the dropdown's
 * synthetic "(no longer in catalog)" option does not appear, and
 * the count line reports the unfiltered total.
 *
 * Fixture: seeded `bk-1043` carries `templateLabel: "Sent agent intro"`
 * matching the seeded `EMAIL_TEMPLATES["agent_intro"]` row, so the
 * template filter's chip lands cleanly on a real catalog row before
 * the rename / remove flow kicks in.
 */

import {
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminApp } from "./AdminApp";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const SEEDED_BOOKING_ID = "bk-1043";
const SEEDED_TEMPLATE_NAME = "Sent agent intro";
const SEEDED_TEMPLATE_ROW_ID = "agent_intro";

function gotoBookings() {
  fireEvent.click(screen.getByRole("button", { name: "Bookings" }));
}

function gotoEmailTemplates() {
  fireEvent.click(screen.getByRole("button", { name: "Email templates" }));
}

function pivotToBookingsTemplateFilter() {
  // Find the seeded `bk-1043` row's "Last attempt · Sent agent intro"
  // suffix and click it — that's the same pivot the filter test
  // harness uses, but going through the real AdminApp shell so the
  // bookings-template-filter state lands in the right slot.
  gotoBookings();
  const suffix = screen
    .getAllByTestId("bookings-row-last-attempt-template")
    .find((el) => el.getAttribute("data-booking-id") === SEEDED_BOOKING_ID);
  expect(suffix).toBeDefined();
  fireEvent.click(suffix!);
  // Sanity: the chip is up and named for the seeded template.
  const chip = screen.getByTestId("bookings-template-filter-chip");
  expect(chip.textContent).toContain(SEEDED_TEMPLATE_NAME);
}

function showingCountText(): string {
  // The "Showing X of Y bookings." line sits under the table; we read
  // its text instead of asserting a specific number so the test is
  // robust to seeding tweaks (only the relationship matters: filtered
  // == total when the filter has cleared).
  const all = screen.getAllByText(/Showing \d+ of \d+ booking/);
  return all[all.length - 1].textContent ?? "";
}

function parseShowing(text: string): { shown: number; total: number } {
  const m = text.match(/Showing (\d+) of (\d+) booking/);
  if (!m) throw new Error(`Unexpected count line: ${text}`);
  return { shown: Number(m[1]), total: Number(m[2]) };
}

describe("AdminApp · BookingsView template filter — rename + remove (Task #162)", () => {
  it("clears the BookingsView template filter when its template is removed from the catalog", () => {
    render(<AdminApp />);

    pivotToBookingsTemplateFilter();
    // While filtered, "Showing X of Y" must report fewer rows than total.
    const filtered = parseShowing(showingCountText());
    expect(filtered.shown).toBeLessThan(filtered.total);

    // Remove the template the filter is bound to.
    gotoEmailTemplates();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(
      screen.getByTestId(
        `button-remove-email-template-${SEEDED_TEMPLATE_ROW_ID}`,
      ),
    );

    // Pop back to the bookings list — the chip should be gone, the
    // dropdown's synthetic "no longer in catalog" option should NOT
    // appear (the filter cleared, so there's nothing stale to flag),
    // and the count line should match the unfiltered total.
    gotoBookings();
    expect(screen.queryByTestId("bookings-template-filter-chip")).toBeNull();
    expect(
      screen.queryByTestId("bookings-template-filter-missing-hint"),
    ).toBeNull();
    expect(
      screen.queryByTestId("bookings-filter-template-missing-option"),
    ).toBeNull();
    const after = parseShowing(showingCountText());
    expect(after.shown).toBe(after.total);
  });

  it("clears the BookingsView template filter when its template is renamed in the catalog", () => {
    render(<AdminApp />);

    pivotToBookingsTemplateFilter();
    const filtered = parseShowing(showingCountText());
    expect(filtered.shown).toBeLessThan(filtered.total);

    // Rename the template — same id, new name (no longer matches the
    // snapshot the filter was bound to).
    gotoEmailTemplates();
    fireEvent.click(
      screen.getByTestId(
        `button-edit-email-template-${SEEDED_TEMPLATE_ROW_ID}`,
      ),
    );
    fireEvent.change(screen.getByTestId("input-email-template-name"), {
      target: { value: "Renamed agent intro" },
    });
    fireEvent.click(screen.getByTestId("button-save-email-template"));
    expect(
      screen.getByTestId(`email-template-row-${SEEDED_TEMPLATE_ROW_ID}`),
    ).toBeTruthy();

    gotoBookings();
    expect(screen.queryByTestId("bookings-template-filter-chip")).toBeNull();
    expect(
      screen.queryByTestId("bookings-template-filter-missing-hint"),
    ).toBeNull();
    expect(
      screen.queryByTestId("bookings-filter-template-missing-option"),
    ).toBeNull();
    const after = parseShowing(showingCountText());
    expect(after.shown).toBe(after.total);
  });
});
