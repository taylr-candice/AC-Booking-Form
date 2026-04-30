// @vitest-environment happy-dom

/**
 * Tests for the "Bookings using this template" drill-down popover
 * surfaced from the Call / Email templates panels. Covers:
 *  - the shared {@link TemplateUsagePopover} component (toggle,
 *    close-on-outside-click, close-on-escape, row click).
 *  - the data helpers {@link findUsageBookingsForTemplate} and
 *    {@link summarizeTemplateUsageBooking}.
 *  - an end-to-end AdminApp flow: bulk-log a call through a seeded
 *    template, drill from the templates panel, and confirm the click
 *    lands on the booking detail.
 */

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  findUsageBookingsForTemplate,
  summarizeTemplateUsageBooking,
  type AdminBooking,
  type AdminUnit,
  type TemplateUsageBooking,
  type TimelineEntry,
} from "@/state/adminMockData";

import { AdminApp } from "./AdminApp";
import { TemplateUsagePopover } from "./TemplateUsagePopover";

afterEach(() => {
  cleanup();
});

const SAMPLE_BOOKINGS: TemplateUsageBooking[] = [
  {
    bookingId: "bk-101",
    customerName: "Eloise Tran",
    addressLine1: "12 Marine Parade, Apt 5",
    whenLabel: "30 Apr · Morning",
  },
  {
    bookingId: "bk-202",
    customerName: "Jordan Pham",
    addressLine1: "9 Aspen Boulevard, Apt 2",
    whenLabel: "To be coordinated",
  },
];

describe("TemplateUsagePopover · component behavior", () => {
  it("usage === 0 renders the reassuring copy as plain text (no toggle button)", () => {
    render(
      <TemplateUsagePopover
        kind="email"
        testIdSuffix="tpl-empty"
        templateName="Sent rebook link"
        usage={0}
        bookings={[]}
      />,
    );

    const usageNode = screen.getByTestId("email-template-usage-tpl-empty");
    expect(usageNode.textContent).toBe(
      "No timeline entries reference this template",
    );
    // The line is intentionally NOT a button when there's nothing to
    // drill into — a click affordance would just be noise.
    expect(usageNode.tagName.toLowerCase()).toBe("div");
    expect(
      screen.queryByTestId("email-template-usage-popover-tpl-empty"),
    ).toBeNull();
  });

  it("usage > 0 renders a toggle that opens the popover with the per-template booking list", () => {
    render(
      <TemplateUsagePopover
        kind="call"
        testIdSuffix="tpl-1"
        templateName="No answer — left voicemail"
        usage={2}
        bookings={SAMPLE_BOOKINGS}
      />,
    );

    const toggle = screen.getByTestId("call-template-usage-tpl-1");
    expect(toggle.tagName.toLowerCase()).toBe("button");
    expect(toggle.textContent).toBe("Referenced by 2 timeline entries");
    // Popover starts closed.
    expect(
      screen.queryByTestId("call-template-usage-popover-tpl-1"),
    ).toBeNull();

    fireEvent.click(toggle);
    const popover = screen.getByTestId("call-template-usage-popover-tpl-1");
    const utils = within(popover);
    expect(utils.getByText("Eloise Tran")).toBeTruthy();
    expect(utils.getByText("12 Marine Parade, Apt 5")).toBeTruthy();
    expect(utils.getByText("30 Apr · Morning")).toBeTruthy();
    expect(utils.getByText("Jordan Pham")).toBeTruthy();
    expect(utils.getByText("To be coordinated")).toBeTruthy();
    // Header reflects the channel + booking count (plural).
    expect(utils.getByText("Call template · 2 bookings")).toBeTruthy();
  });

  it("singular header copy when only one booking references the template", () => {
    render(
      <TemplateUsagePopover
        kind="email"
        testIdSuffix="tpl-solo"
        templateName="Sent agent intro"
        usage={1}
        bookings={[SAMPLE_BOOKINGS[0]!]}
      />,
    );

    expect(
      screen.getByTestId("email-template-usage-tpl-solo").textContent,
    ).toBe("Referenced by 1 timeline entry");
    fireEvent.click(screen.getByTestId("email-template-usage-tpl-solo"));
    expect(
      within(
        screen.getByTestId("email-template-usage-popover-tpl-solo"),
      ).getByText("Email template · 1 booking"),
    ).toBeTruthy();
  });

  it("clicking a booking row fires onOpenBooking with the booking id and closes the popover", () => {
    const onOpenBooking = vi.fn();
    render(
      <TemplateUsagePopover
        kind="call"
        testIdSuffix="tpl-1"
        templateName="No answer — left voicemail"
        usage={2}
        bookings={SAMPLE_BOOKINGS}
        onOpenBooking={onOpenBooking}
      />,
    );

    fireEvent.click(screen.getByTestId("call-template-usage-tpl-1"));
    fireEvent.click(
      screen.getByTestId("call-template-usage-booking-tpl-1-bk-202"),
    );

    expect(onOpenBooking).toHaveBeenCalledTimes(1);
    expect(onOpenBooking).toHaveBeenCalledWith("bk-202");
    // Popover closes on row click — the admin's about to navigate
    // away anyway, leaving it open would just flash on the next
    // screen.
    expect(
      screen.queryByTestId("call-template-usage-popover-tpl-1"),
    ).toBeNull();
  });

  it("click on the toggle button while open closes the popover (no nav handler called)", () => {
    const onOpenBooking = vi.fn();
    render(
      <TemplateUsagePopover
        kind="call"
        testIdSuffix="tpl-1"
        templateName="No answer — left voicemail"
        usage={2}
        bookings={SAMPLE_BOOKINGS}
        onOpenBooking={onOpenBooking}
      />,
    );

    const toggle = screen.getByTestId("call-template-usage-tpl-1");
    fireEvent.click(toggle);
    expect(
      screen.getByTestId("call-template-usage-popover-tpl-1"),
    ).toBeTruthy();
    fireEvent.click(toggle);
    expect(
      screen.queryByTestId("call-template-usage-popover-tpl-1"),
    ).toBeNull();
    expect(onOpenBooking).not.toHaveBeenCalled();
  });

  it("Escape key closes the popover", () => {
    render(
      <TemplateUsagePopover
        kind="call"
        testIdSuffix="tpl-1"
        templateName="No answer — left voicemail"
        usage={1}
        bookings={[SAMPLE_BOOKINGS[0]!]}
      />,
    );

    fireEvent.click(screen.getByTestId("call-template-usage-tpl-1"));
    expect(
      screen.getByTestId("call-template-usage-popover-tpl-1"),
    ).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(
      screen.queryByTestId("call-template-usage-popover-tpl-1"),
    ).toBeNull();
  });

  it("clicking outside the popover closes it; an unrelated click after is a no-op", () => {
    render(
      <div>
        <button data-testid="outside-button">Elsewhere</button>
        <TemplateUsagePopover
          kind="email"
          testIdSuffix="tpl-1"
          templateName="Sent rebook link"
          usage={1}
          bookings={[SAMPLE_BOOKINGS[0]!]}
        />
      </div>,
    );

    fireEvent.click(screen.getByTestId("email-template-usage-tpl-1"));
    expect(
      screen.getByTestId("email-template-usage-popover-tpl-1"),
    ).toBeTruthy();

    // Outside click closes.
    fireEvent.mouseDown(screen.getByTestId("outside-button"));
    expect(
      screen.queryByTestId("email-template-usage-popover-tpl-1"),
    ).toBeNull();
  });

  it("onOpenBooking is optional — row click still closes the popover when no handler is wired", () => {
    render(
      <TemplateUsagePopover
        kind="call"
        testIdSuffix="tpl-1"
        templateName="No answer — left voicemail"
        usage={1}
        bookings={[SAMPLE_BOOKINGS[0]!]}
      />,
    );

    fireEvent.click(screen.getByTestId("call-template-usage-tpl-1"));
    fireEvent.click(
      screen.getByTestId("call-template-usage-booking-tpl-1-bk-101"),
    );
    // No throw; popover dismissed.
    expect(
      screen.queryByTestId("call-template-usage-popover-tpl-1"),
    ).toBeNull();
  });
});

// ─── Pure-helper coverage ──────────────────────────────────────────

const TEST_UNITS: AdminUnit[] = [
  {
    id: "u-1",
    addressLine1: "12 Marine Parade, Apt 5",
    addressLine2: "Coogee NSW 2034",
    ac: { type: "split", systems: 1, additional: 0 },
    agentId: null,
    buildingId: "b-1",
  },
  {
    id: "u-2",
    addressLine1: "9 Aspen Boulevard, Apt 2",
    addressLine2: "Greenway ACT 2900",
    ac: { type: "ducted", systems: 2, additional: 1 },
    agentId: null,
    buildingId: "b-2",
  },
];

function makeBooking(
  id: string,
  unitId: string,
  customerName: string,
  serviceTimeline: TimelineEntry[],
  overrides: Partial<AdminBooking> = {},
): AdminBooking {
  return {
    id,
    unitId,
    customerName,
    customerEmail: `${id}@example.com`,
    customerPhone: "0400 000 000",
    bookerRole: "owner",
    bookerAgencyId: null,
    bookerAgencyOtherName: "",
    accessMethod: null,
    tenants: [],
    systems: 1,
    additional: 0,
    acType: "split",
    discrepancy: null,
    serviceDate: "2026-04-30",
    serviceSlot: "morning",
    paymentStatus: "paid",
    serviceStatus: "scheduled",
    totalAud: 218,
    paymentTimeline: [],
    serviceTimeline,
    notes: "",
    rolloutId: null,
    createdAt: "2026-04-26T09:14:00.000Z",
    lastContactedAt: null,
    ...overrides,
  };
}

describe("findUsageBookingsForTemplate", () => {
  it("returns only bookings whose timeline references the template name (snapshot-on-use match)", () => {
    const bookings = [
      makeBooking("bk-1", "u-1", "Eloise Tran", [
        {
          kind: "call",
          status: "logged_call",
          label: "Logged call · No answer",
          at: "Apr 27 · 10:00",
          by: "Mia (admin)",
          templateLabel: "No answer — left voicemail",
        },
      ]),
      makeBooking("bk-2", "u-2", "Jordan Pham", [
        {
          kind: "call",
          status: "logged_call",
          label: "Logged call · Spoke",
          at: "Apr 27 · 11:00",
          by: "Mia (admin)",
          templateLabel: "Spoke to them — confirmed window",
        },
      ]),
      makeBooking("bk-3", "u-1", "Sam Chen", [
        {
          kind: "email",
          status: "logged_email",
          label: "Sent rebook link",
          at: "Apr 27 · 12:00",
          by: "Mia (admin)",
          templateLabel: "No answer — left voicemail",
        },
      ]),
    ];

    const result = findUsageBookingsForTemplate(
      bookings,
      "call",
      "No answer — left voicemail",
    );
    // Only bk-1 — bk-2 references a different template, bk-3
    // references the same NAME but on the email channel.
    expect(result.map((b) => b.id)).toEqual(["bk-1"]);
  });

  it("deduplicates: a booking referencing the same template multiple times appears once", () => {
    const bookings = [
      makeBooking("bk-dup", "u-1", "Eloise Tran", [
        {
          kind: "call",
          status: "logged_call",
          label: "Logged call · No answer",
          at: "Apr 27 · 10:00",
          by: "Mia (admin)",
          templateLabel: "No answer — left voicemail",
        },
        {
          kind: "call",
          status: "logged_call",
          label: "Logged call · No answer",
          at: "Apr 28 · 10:00",
          by: "Mia (admin)",
          templateLabel: "No answer — left voicemail",
        },
      ]),
    ];

    const result = findUsageBookingsForTemplate(
      bookings,
      "call",
      "No answer — left voicemail",
    );
    expect(result.map((b) => b.id)).toEqual(["bk-dup"]);
  });

  it("returns [] for a blank / whitespace-only template name", () => {
    const bookings = [
      makeBooking("bk-1", "u-1", "Eloise Tran", [
        {
          kind: "call",
          status: "logged_call",
          label: "Logged call · No answer",
          at: "Apr 27 · 10:00",
          by: "Mia (admin)",
        },
      ]),
    ];
    expect(findUsageBookingsForTemplate(bookings, "call", "")).toEqual([]);
    expect(findUsageBookingsForTemplate(bookings, "call", "   ")).toEqual([]);
  });
});

describe("summarizeTemplateUsageBooking", () => {
  it("formats a scheduled booking with a date + capitalised slot label", () => {
    const summary = summarizeTemplateUsageBooking(
      makeBooking("bk-1", "u-1", "Eloise Tran", [], {
        serviceDate: "2026-04-30",
        serviceSlot: "morning",
      }),
      TEST_UNITS,
    );
    expect(summary).toEqual({
      bookingId: "bk-1",
      customerName: "Eloise Tran",
      addressLine1: "12 Marine Parade, Apt 5",
      whenLabel: "30 Apr · Morning",
    });
  });

  it("falls back to 'To be coordinated' when no slot is locked", () => {
    const summary = summarizeTemplateUsageBooking(
      makeBooking("bk-2", "u-2", "Jordan Pham", [], {
        serviceDate: null,
        serviceSlot: "to_be_coordinated",
      }),
      TEST_UNITS,
    );
    expect(summary.whenLabel).toBe("To be coordinated");
    expect(summary.addressLine1).toBe("9 Aspen Boulevard, Apt 2");
  });

  it("falls back to '—' when the unit isn't in the units list", () => {
    const summary = summarizeTemplateUsageBooking(
      makeBooking("bk-3", "u-missing", "Sam Chen", []),
      TEST_UNITS,
    );
    expect(summary.addressLine1).toBe("—");
  });
});

// ─── End-to-end via <AdminApp /> ───────────────────────────────────

describe("Templates drill-down ↔ Bookings cross-view navigation", () => {
  it("logging a bulk call against the seeded template surfaces the bookings in the Call templates popover; clicking one opens its booking detail", () => {
    render(<AdminApp />);

    // Switch to Awaiting coordination so we can fire a templated bulk
    // log-call that stamps `templateLabel` on those bookings'
    // timelines — that's what the drill-down popover later reads.
    fireEvent.click(
      screen.getByRole("button", { name: "Awaiting coordination" }),
    );

    // Pick the first two coordination rows by their per-row checkbox
    // testid prefix — the rows themselves don't matter, we just need
    // two selected so the bulk-log entry stamps `templateLabel` onto
    // two timelines.
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

    // Open the bulk Log-call form, pick the seeded "No answer — left
    // voicemail" template (id `voicemail_left`), and confirm.
    fireEvent.click(screen.getByTestId("button-bulk-log-call"));
    const templateSelect = screen.getByTestId(
      "select-bulk-call-template",
    ) as HTMLSelectElement;
    fireEvent.change(templateSelect, { target: { value: "voicemail_left" } });
    fireEvent.click(screen.getByTestId("button-bulk-confirm-log-call"));

    // Now jump to the Call templates panel and open the popover for
    // that template — its seeded id keys both the row testid and the
    // popover testid.
    fireEvent.click(screen.getByRole("button", { name: "Call templates" }));
    const usageToggle = screen.getByTestId(
      "call-template-usage-voicemail_left",
    );
    expect(usageToggle.textContent).toMatch(/Referenced by 2 timeline/);
    fireEvent.click(usageToggle);
    const popover = screen.getByTestId(
      "call-template-usage-popover-voicemail_left",
    );
    // Two booking rows visible — exact ids depend on which two
    // coordination rows we ticked, so we just count the row buttons.
    const rowButtons = within(popover)
      .getAllByRole("button")
      .filter((btn) =>
        btn
          .getAttribute("data-testid")
          ?.startsWith("call-template-usage-booking-voicemail_left-"),
      );
    expect(rowButtons.length).toBe(2);

    // Clicking the first row should land on the booking detail
    // screen for that booking — its root carries a stable per-id
    // testid so we can pin the navigation outcome.
    const firstRow = rowButtons[0]!;
    const targetBookingId = firstRow
      .getAttribute("data-testid")!
      .replace("call-template-usage-booking-voicemail_left-", "");
    fireEvent.click(firstRow);

    // Popover closes on click-through.
    expect(
      screen.queryByTestId("call-template-usage-popover-voicemail_left"),
    ).toBeNull();
    // BookingDetail is now mounted — its per-booking testid carries
    // the booking id.
    expect(
      screen.getByTestId(`booking-detail-${targetBookingId}`),
    ).toBeTruthy();
  });

  it("logging a bulk email against the seeded template surfaces the bookings in the Email templates popover; clicking one opens its booking detail", () => {
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
    const templateSelect = screen.getByTestId(
      "select-bulk-email-template",
    ) as HTMLSelectElement;
    fireEvent.change(templateSelect, { target: { value: "rebook_link" } });
    fireEvent.click(screen.getByTestId("button-bulk-confirm-log-email"));

    fireEvent.click(screen.getByRole("button", { name: "Email templates" }));
    const usageToggle = screen.getByTestId(
      "email-template-usage-rebook_link",
    );
    expect(usageToggle.textContent).toMatch(/Referenced by 2 timeline/);
    fireEvent.click(usageToggle);
    const popover = screen.getByTestId(
      "email-template-usage-popover-rebook_link",
    );
    const rowButtons = within(popover)
      .getAllByRole("button")
      .filter((btn) =>
        btn
          .getAttribute("data-testid")
          ?.startsWith("email-template-usage-booking-rebook_link-"),
      );
    expect(rowButtons.length).toBe(2);

    const firstRow = rowButtons[0]!;
    const targetBookingId = firstRow
      .getAttribute("data-testid")!
      .replace("email-template-usage-booking-rebook_link-", "");
    fireEvent.click(firstRow);

    expect(
      screen.queryByTestId("email-template-usage-popover-rebook_link"),
    ).toBeNull();
    expect(
      screen.getByTestId(`booking-detail-${targetBookingId}`),
    ).toBeTruthy();
  });
});

// ─── Inverse round-trip: chip → templates panel (Task #155) ────────

describe("Booking timeline 'From template' chip ↔ templates panel round-trip", () => {
  it("clicking the chip on a call timeline entry switches to Call templates and highlights the matching row", () => {
    render(<AdminApp />);

    // Seed a templated call timeline entry by bulk-logging one
    // through the Awaiting coordination view — same path the
    // popover-direction e2e test uses, just to get a real
    // `templateLabel` on a real booking timeline.
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

    // Drill into the booking via the Call templates popover so we
    // land on a BookingDetail whose timeline carries the
    // templateLabel snapshot we just stamped.
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
    fireEvent.click(firstBookingRow);

    // Find the chip — its label is the seeded template's display
    // name, scoped through the case-insensitive "template:" pattern
    // shared with the existing chip-render assertions.
    const chip = screen.getByRole("button", {
      name: /template "No answer — left voicemail"/i,
    });
    expect(chip.textContent).toMatch(
      /from template:\s*no answer\s*—\s*left voicemail/i,
    );

    fireEvent.click(chip);

    // We should now be back on the Call templates panel with the
    // matching row marked as focused. The data-focused attribute is
    // the round-trip's stable contract — same shape as the popover's
    // direction uses booking-detail testids to pin the landing.
    const focusedRow = screen.getByTestId(
      "call-template-row-voicemail_left",
    );
    expect(focusedRow.getAttribute("data-focused")).toBe("true");
    // No other call template row is focused.
    const otherRows = screen
      .getAllByRole("row")
      .filter(
        (r) =>
          r
            .getAttribute("data-testid")
            ?.startsWith("call-template-row-") &&
          r.getAttribute("data-testid") !== "call-template-row-voicemail_left",
      );
    for (const r of otherRows) {
      expect(r.getAttribute("data-focused")).not.toBe("true");
    }
  });

  it("clicking the chip on an email timeline entry switches to Email templates and highlights the matching row", () => {
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
    expect(rowCheckboxes.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(rowCheckboxes[0]!);
    fireEvent.click(screen.getByTestId("button-bulk-log-email"));
    fireEvent.change(
      screen.getByTestId("select-bulk-email-template") as HTMLSelectElement,
      { target: { value: "rebook_link" } },
    );
    fireEvent.click(screen.getByTestId("button-bulk-confirm-log-email"));

    fireEvent.click(screen.getByRole("button", { name: "Email templates" }));
    fireEvent.click(screen.getByTestId("email-template-usage-rebook_link"));
    const popover = screen.getByTestId(
      "email-template-usage-popover-rebook_link",
    );
    const firstBookingRow = within(popover)
      .getAllByRole("button")
      .find((btn) =>
        btn
          .getAttribute("data-testid")
          ?.startsWith("email-template-usage-booking-rebook_link-"),
      )!;
    fireEvent.click(firstBookingRow);

    const chip = screen.getByRole("button", {
      name: /template "Sent rebook link"/i,
    });
    expect(chip.textContent).toMatch(/from template:\s*sent rebook link/i);

    fireEvent.click(chip);

    const focusedRow = screen.getByTestId("email-template-row-rebook_link");
    expect(focusedRow.getAttribute("data-focused")).toBe("true");
    const otherRows = screen
      .getAllByRole("row")
      .filter(
        (r) =>
          r
            .getAttribute("data-testid")
            ?.startsWith("email-template-row-") &&
          r.getAttribute("data-testid") !== "email-template-row-rebook_link",
      );
    for (const r of otherRows) {
      expect(r.getAttribute("data-focused")).not.toBe("true");
    }
  });

  it("navigating away via the sidebar clears the focused-row highlight (re-entering the panel opens clean)", () => {
    render(<AdminApp />);

    // Quickest path to a focused state: bulk-log a call, drill to
    // the booking, click the chip — same first-half as the call test
    // above.
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
    fireEvent.click(firstBookingRow);
    fireEvent.click(
      screen.getByRole("button", {
        name: /template "No answer — left voicemail"/i,
      }),
    );
    expect(
      screen
        .getByTestId("call-template-row-voicemail_left")
        .getAttribute("data-focused"),
    ).toBe("true");

    // Navigate elsewhere then back — the highlight should be gone.
    fireEvent.click(screen.getByRole("button", { name: "Awaiting coordination" }));
    fireEvent.click(screen.getByRole("button", { name: "Call templates" }));
    expect(
      screen
        .getByTestId("call-template-row-voicemail_left")
        .getAttribute("data-focused"),
    ).not.toBe("true");
  });
});
