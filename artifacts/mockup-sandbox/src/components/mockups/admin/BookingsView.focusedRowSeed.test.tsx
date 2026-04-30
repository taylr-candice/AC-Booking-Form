// @vitest-environment happy-dom

/**
 * Task #172 / #179: when the admin pivots into BookingsView from a
 * BookingDetail timeline entry's "View other bookings using this
 * template" link, the source booking row should be visually
 * distinguished on first paint so ops doesn't lose their starting
 * point in a long filtered list.
 *
 * Mirrors the focused-row pattern Call/EmailTemplatesView use when
 * arriving from a `From template: …` chip — `data-focused="true"`
 * plus a one-shot `template-row-focus-pulse` class on top of a
 * persistent BRAND_SOFT background tint.
 *
 * Exercised end-to-end via <AdminApp /> so we cover the full
 * BookingDetail (source) → AdminApp (state owner) → BookingsView
 * (consumer of `initialFocusedRowId`) seed handoff. The companion
 * `bookingsTemplateFilterSeed` flow already has its own coverage in
 * BookingDetailPivotToBookings.test.tsx — this file pins ONLY the
 * source-row highlight and its dismiss-on-first-interaction
 * lifecycle so a regression on either shows up surgically.
 *
 * Both the templated-call entry (Task #172) AND the templated-email
 * entry (Task #179) drive identical assertions: every BookingDetail
 * timeline pivot that lands on BookingsView must seed the same
 * source-row highlight, regardless of which template channel wrote
 * the entry. Driven via `describe.each` so any future channel
 * (SMS, status-change, …) can slot in by extending the fixture
 * table without copy-pasting the lifecycle expectations.
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
 * Stamp the `voicemail_left` call template onto the first
 * coordination row's timeline, then open that booking's detail.
 * Returns the booking id we landed on so callers can pin further
 * assertions.
 *
 * Re-uses the same shortest path through the bulk-log dropdown that
 * BookingDetailPivotToBookings.test.tsx and the TemplateUsagePopover
 * tests use — keeps the seed identical across the suite so any
 * change to the bulk-log shape breaks one place, not three.
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
  expect(screen.getByTestId(`booking-detail-${bookingId}`)).toBeTruthy();
  return bookingId;
}

/**
 * Email-channel companion to {@link seedTemplatedCallAndOpenBookingDetail}.
 *
 * The seeded `bk-1043` booking already carries a `Sent agent intro`
 * email entry on its service timeline (see `adminMockData.ts`), so
 * unlike the call path we don't need to bulk-log a fresh entry — we
 * can drill straight from the Email templates panel's usage popover
 * into that booking's detail. This keeps the email seed minimal and
 * decoupled from the bulk-log-email form's shape, which has its own
 * dedicated coverage.
 */
function seedTemplatedEmailAndOpenBookingDetail(): string {
  fireEvent.click(screen.getByRole("button", { name: "Email templates" }));
  fireEvent.click(screen.getByTestId("email-template-usage-agent_intro"));
  const popover = screen.getByTestId(
    "email-template-usage-popover-agent_intro",
  );
  const firstBookingRow = within(popover)
    .getAllByRole("button")
    .find((btn) =>
      btn
        .getAttribute("data-testid")
        ?.startsWith("email-template-usage-booking-agent_intro-"),
    )!;
  const bookingId = firstBookingRow
    .getAttribute("data-testid")!
    .replace("email-template-usage-booking-agent_intro-", "");
  fireEvent.click(firstBookingRow);
  expect(screen.getByTestId(`booking-detail-${bookingId}`)).toBeTruthy();
  return bookingId;
}

/**
 * Click the "View other bookings using this template" pivot button
 * for the timeline entry whose stamped template label matches
 * `templateLabel`. Looked up via the stable `data-template-label`
 * attribute so the assertion isn't sensitive to entry ordering or
 * which timeline (payment vs service) the entry landed on.
 */
function clickPivot(templateLabel: string) {
  const pivot = screen
    .getAllByRole("button")
    .find(
      (btn) =>
        btn
          .getAttribute("data-testid")
          ?.match(/^timeline-entry-\d+-pivot-bookings$/) &&
        btn.getAttribute("data-template-label") === templateLabel,
    )!;
  fireEvent.click(pivot);
}

/**
 * Per-channel fixture for the parameterized scenarios below. Adding
 * a future channel (SMS, status-change, …) is a one-line entry here
 * — the lifecycle expectations don't change.
 */
const PIVOT_CASES = [
  {
    channel: "call" as const,
    templateLabel: "No answer — left voicemail",
    seed: seedTemplatedCallAndOpenBookingDetail,
  },
  {
    channel: "email" as const,
    templateLabel: "Sent agent intro",
    seed: seedTemplatedEmailAndOpenBookingDetail,
  },
];

describe.each(PIVOT_CASES)(
  "BookingsView source-row highlight (Task #172 / #179) — $channel pivot",
  ({ templateLabel, seed }) => {
    it("marks the source booking row as focused on first paint after the pivot", () => {
      render(<AdminApp />);
      const sourceBookingId = seed();
      clickPivot(templateLabel);

      const row = screen.getByTestId(`bookings-row-${sourceBookingId}`);
      expect(row.getAttribute("data-focused")).toBe("true");
      // The one-shot pulse class is also present on first paint so the
      // landing row is unmistakable on long filtered lists. Checked via
      // className substring so the assertion isn't sensitive to the
      // existing hover/focus utility classes.
      expect(row.className).toContain("template-row-focus-pulse");
    });

    it("highlights ONLY the source row — other matching rows in the filtered list stay untinted", () => {
      render(<AdminApp />);
      const sourceBookingId = seed();
      clickPivot(templateLabel);

      // Every visible row exposes a `bookings-row-<id>` testid; grab
      // them all and assert exactly one carries the focus marker.
      const focusedRows = screen
        .getAllByRole("button")
        .filter(
          (el) =>
            el.getAttribute("data-testid")?.startsWith("bookings-row-") &&
            el.getAttribute("data-focused") === "true",
        );
      expect(focusedRows).toHaveLength(1);
      expect(focusedRows[0]!.getAttribute("data-testid")).toBe(
        `bookings-row-${sourceBookingId}`,
      );
    });

    it("dismisses the highlight on the admin's first interaction (mousedown)", () => {
      render(<AdminApp />);
      const sourceBookingId = seed();
      clickPivot(templateLabel);

      expect(
        screen
          .getByTestId(`bookings-row-${sourceBookingId}`)
          .getAttribute("data-focused"),
      ).toBe("true");

      // A mousedown anywhere is the canonical "first interaction" — we
      // dispatch on `document` so it bubbles up through the global
      // listener BookingsView attaches in its dismiss effect.
      fireEvent.mouseDown(document.body);

      expect(
        screen
          .getByTestId(`bookings-row-${sourceBookingId}`)
          .getAttribute("data-focused"),
      ).toBeNull();
    });

    it("does not re-apply the highlight on subsequent re-renders", () => {
      render(<AdminApp />);
      const sourceBookingId = seed();
      clickPivot(templateLabel);

      // Dismiss via mousedown first.
      fireEvent.mouseDown(document.body);
      expect(
        screen
          .getByTestId(`bookings-row-${sourceBookingId}`)
          .getAttribute("data-focused"),
      ).toBeNull();

      // Force a re-render via a benign filter change (typing in the
      // search input). The seed has already been consumed by the
      // parent so no fresh `initialFocusedRowId` should land — the
      // row must stay un-focused.
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
          .getByTestId(`bookings-row-${sourceBookingId}`)
          .getAttribute("data-focused"),
      ).toBeNull();
    });

    it("does not re-apply the highlight after sidebar nav away and back", () => {
      render(<AdminApp />);
      seed();
      clickPivot(templateLabel);

      // Sidebar nav clears any pending seed in the AdminApp shell, so
      // returning to BookingsView lands on a clean unhighlighted list.
      fireEvent.click(
        screen.getByRole("button", { name: "Awaiting coordination" }),
      );
      fireEvent.click(screen.getByRole("button", { name: "Bookings" }));

      const focusedRows = screen
        .getAllByRole("button")
        .filter(
          (el) =>
            el.getAttribute("data-testid")?.startsWith("bookings-row-") &&
            el.getAttribute("data-focused") === "true",
        );
      expect(focusedRows).toHaveLength(0);
    });
  },
);
