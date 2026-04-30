// @vitest-environment happy-dom

/**
 * Task #159: from a templated call/email entry inside a booking's
 * timeline, the "View other bookings using this template" link
 * should leave the detail screen and land in BookingsView with the
 * matching template filter active and the clear chip showing.
 *
 * Mirrors the BookingsView "Last attempt: …" suffix flow tested in
 * BookingsView.templateFilter.test.tsx, but exercised end-to-end
 * via <AdminApp /> so we cover the actual seed handoff between
 * BookingDetail (source), AdminApp (state owner), and BookingsView
 * (consumer of `initialTemplateFilter`).
 *
 * The seed-and-consume pattern (one-shot `bookingsTemplateFilterSeed`
 * applied on first render and cleared via `onTemplateFilterConsumed`)
 * is the bit most likely to regress, so the test also confirms the
 * chip can still be cleared by the admin and that re-entering
 * BookingsView via the sidebar opens unfiltered.
 */

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AdminApp } from "./AdminApp";

afterEach(() => {
  cleanup();
});

/**
 * Stamp the `voicemail_left` call template onto the first coordination
 * row's timeline, then open that booking's detail. Returns the
 * booking id we landed on so callers can pin further assertions.
 *
 * Reuses the bulk-log path from the existing TemplateUsagePopover
 * end-to-end tests — same shortest path to a real `templateLabel` on
 * a real booking timeline without having to seed fixtures by hand.
 */
function seedTemplatedCallAndOpenBookingDetail(): string {
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
  expect(rowCheckboxes.length).toBeGreaterThanOrEqual(1);
  fireEvent.click(rowCheckboxes[0]!);

  fireEvent.click(screen.getByTestId("button-bulk-log-call"));
  fireEvent.change(
    screen.getByTestId("select-bulk-call-template") as HTMLSelectElement,
    { target: { value: "voicemail_left" } },
  );
  fireEvent.click(screen.getByTestId("button-bulk-confirm-log-call"));

  // Drill through the Call templates popover so we land on a
  // BookingDetail whose timeline carries the snapshot we just
  // stamped.
  fireEvent.click(screen.getByRole("button", { name: "Call templates" }));
  fireEvent.click(screen.getByTestId("call-template-usage-voicemail_left"));
  const popover = screen.getByTestId(
    "call-template-usage-popover-voicemail_left",
  );
  const firstBookingRow = within(popover)
    .getAllByRole("button")
    .find((btn) =>
      btn
        .getAttribute("data-testid")
        ?.startsWith("call-template-usage-booking-voicemail_left-"),
    )!;
  const bookingId = firstBookingRow
    .getAttribute("data-testid")!
    .replace("call-template-usage-booking-voicemail_left-", "");
  fireEvent.click(firstBookingRow);

  // Pin the landing — we should now be on that booking's detail.
  expect(screen.getByTestId(`booking-detail-${bookingId}`)).toBeTruthy();
  return bookingId;
}

describe("BookingDetail timeline → BookingsView template filter pivot (Task #159)", () => {
  it("clicking 'View other bookings using this template' on a templated call entry lands on BookingsView with the matching filter active and chip showing", () => {
    render(<AdminApp />);

    const sourceBookingId = seedTemplatedCallAndOpenBookingDetail();

    // Find the pivot link sibling of the existing "From template:"
    // chip — it carries the template label as a stable data attr so
    // we don't have to guess at the entry index ordering.
    const pivotLinks = screen
      .getAllByRole("button")
      .filter((btn) =>
        btn
          .getAttribute("data-testid")
          ?.match(/^timeline-entry-\d+-pivot-bookings$/),
      );
    expect(pivotLinks.length).toBeGreaterThanOrEqual(1);
    const voicemailPivot = pivotLinks.find(
      (b) =>
        b.getAttribute("data-template-label") === "No answer — left voicemail",
    );
    expect(voicemailPivot).toBeTruthy();
    expect(voicemailPivot!.textContent).toMatch(
      /view other bookings using this template/i,
    );

    fireEvent.click(voicemailPivot!);

    // BookingDetail should be unmounted — we left the detail screen.
    expect(
      screen.queryByTestId(`booking-detail-${sourceBookingId}`),
    ).toBeNull();

    // The bookings list is now mounted with the template filter chip
    // visible and labelled with the seeded template name.
    const chip = screen.getByTestId("bookings-template-filter-chip");
    expect(chip.textContent).toMatch(/no answer\s*—\s*left voicemail/i);
    expect(
      screen.getByTestId("button-clear-bookings-template-filter"),
    ).toBeTruthy();

    // Sanity: the source booking row is among the visible matches —
    // the seed only filters bookings whose latest templated touch
    // was this template, and we just stamped that template onto it.
    // Rows expose themselves as role="button" with an aria-label of
    // `Open booking ${id} for ${customer}`.
    expect(
      screen.getByRole("button", {
        name: new RegExp(`^Open booking ${sourceBookingId} for `),
      }),
    ).toBeTruthy();
  });

  it("clears the seed after first render so re-entering BookingsView via the sidebar opens unfiltered", () => {
    render(<AdminApp />);

    seedTemplatedCallAndOpenBookingDetail();

    const voicemailPivot = screen
      .getAllByRole("button")
      .find(
        (btn) =>
          btn
            .getAttribute("data-testid")
            ?.match(/^timeline-entry-\d+-pivot-bookings$/) &&
          btn.getAttribute("data-template-label") ===
            "No answer — left voicemail",
      )!;
    fireEvent.click(voicemailPivot);

    // Chip is on first.
    expect(screen.getByTestId("bookings-template-filter-chip")).toBeTruthy();

    // Navigate elsewhere then back via the sidebar — the seed must
    // not re-apply on subsequent BookingsView mounts (otherwise we'd
    // clobber any manual chip-clear the admin made).
    fireEvent.click(
      screen.getByRole("button", { name: "Awaiting coordination" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Bookings" }));

    expect(screen.queryByTestId("bookings-template-filter-chip")).toBeNull();
  });

  it("clearing the chip restores the unfiltered list (handoff doesn't lock the filter on)", () => {
    render(<AdminApp />);

    seedTemplatedCallAndOpenBookingDetail();

    fireEvent.click(
      screen
        .getAllByRole("button")
        .find(
          (btn) =>
            btn
              .getAttribute("data-testid")
              ?.match(/^timeline-entry-\d+-pivot-bookings$/) &&
            btn.getAttribute("data-template-label") ===
              "No answer — left voicemail",
        )!,
    );

    expect(screen.getByTestId("bookings-template-filter-chip")).toBeTruthy();

    fireEvent.click(screen.getByTestId("button-clear-bookings-template-filter"));

    expect(screen.queryByTestId("bookings-template-filter-chip")).toBeNull();
  });
});
