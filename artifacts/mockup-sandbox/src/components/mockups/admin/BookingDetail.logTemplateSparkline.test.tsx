// @vitest-environment happy-dom

/**
 * Task #205 — the per-row Log call / Log email forms inside
 * `BookingDetail`'s coordination panel show the same per-template
 * sparkline + "+N this week" delta the bulk pickers on the Awaiting-
 * coordination queue already render.
 *
 * What we lock in here:
 *   1. Opening the per-row Log call form and clicking the visible
 *      template trigger reveals one option per saved template plus a
 *      Custom… sentinel; the saved options each render a sparkline,
 *      Custom… stays sparkline-free.
 *   2. A template with N uses across the booking timelines this week
 *      surfaces as a "+N" delta on its option row, matching the bulk
 *      picker's `call-template-usage-sparkline-delta-row-…` testid.
 *   3. Mirror coverage for the per-row Log email form so the email
 *      channel doesn't drift from the call channel.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  CALL_TEMPLATES,
  EMAIL_TEMPLATES,
  type AdminAgent,
  type AdminBooking,
  type AdminUnit,
  type TimelineEntry,
} from "@/state/adminMockData";

import { BookingDetail } from "./BookingDetail";

afterEach(cleanup);

const UNIT: AdminUnit = {
  id: "u-tpl-spark",
  addressLine1: "1 / 1 Pitt Street",
  addressLine2: "Sydney NSW 2000",
  ac: { type: "split", brand: "", systems: 1, additional: 0 },
  agentId: null,
  buildingId: "bldg-tpl-spark",
};

const AGENTS: AdminAgent[] = [];

// Strip the seeded `isDefault` flag so the form opens on Custom… and
// the dropdown renders without an active default — matches the pattern
// the bulk-template sparkline test uses to keep delta assertions
// independent of which template happens to be the channel default.
const NO_DEFAULT_CALL_TEMPLATES = CALL_TEMPLATES.map(
  ({ isDefault: _isDefault, ...t }) => t,
);
const NO_DEFAULT_EMAIL_TEMPLATES = EMAIL_TEMPLATES.map(
  ({ isDefault: _isDefault, ...t }) => t,
);

function callEntry(loggedAt: string, templateLabel: string): TimelineEntry {
  return {
    kind: "call",
    status: "logged_call",
    label: `Logged call · ${templateLabel}`,
    at: "Apr 28 · 11:00",
    by: "Mia (admin)",
    loggedAt,
    templateLabel,
  };
}

function emailEntry(loggedAt: string, templateLabel: string): TimelineEntry {
  return {
    kind: "email",
    status: "logged_email",
    label: `Logged email · ${templateLabel}`,
    at: "Apr 28 · 11:00",
    by: "Mia (admin)",
    loggedAt,
    templateLabel,
  };
}

function makeBooking(
  id: string,
  serviceTimeline: TimelineEntry[] = [],
): AdminBooking {
  return {
    id,
    unitId: UNIT.id,
    customerName: "Sam Owner",
    customerEmail: "sam@example.com",
    customerPhone: "0400 111 222",
    bookerRole: "owner",
    bookerAgencyId: null,
    bookerAgencyOtherName: "",
    accessMethod: "owner_leased_tenant",
    tenants: [
      {
        first: "Riley",
        last: "Tenant",
        phone: "0411 222 333",
        email: "riley@example.com",
      },
    ],
    systems: 1,
    additional: 0,
    acType: "split",
    discrepancy: null,
    serviceDate: null,
    serviceSlot: "to_be_coordinated",
    paymentStatus: "paid",
    serviceStatus: "scheduled",
    totalAud: 199,
    paymentTimeline: [],
    serviceTimeline,
    notes: "",
    rolloutId: null,
    createdAt: "2026-04-26T09:14:00+10:00",
    lastContactedAt: null,
  };
}

function renderDetail(activeId: string, bookings: AdminBooking[]) {
  const noop = () => {};
  return render(
    <BookingDetail
      bookingId={activeId}
      bookings={bookings}
      units={[UNIT]}
      agents={AGENTS}
      onBack={noop}
      onUpdate={noop}
      onCancelBooking={noop}
      callTemplates={NO_DEFAULT_CALL_TEMPLATES}
      emailTemplates={NO_DEFAULT_EMAIL_TEMPLATES}
    />,
  );
}

describe("BookingDetail · per-row Log call / Log email · template picker sparklines", () => {
  it("opens the per-row Log call template dropdown and shows a sparkline per option (none on Custom)", () => {
    const voicemailLabel = "No answer — left voicemail";
    // Sibling row carries the recent voicemail history; the active row
    // is empty so the Log-call form opens cleanly. The per-template
    // trend is computed off the entire bookings list, mirroring the
    // bulk picker's behaviour.
    const active = makeBooking("bk-detail");
    const sibling = makeBooking("bk-history", [
      callEntry("2026-04-28T09:00:00Z", voicemailLabel),
      callEntry("2026-04-29T10:00:00Z", voicemailLabel),
      callEntry("2026-04-30T11:00:00Z", voicemailLabel),
    ]);
    renderDetail(active.id, [active, sibling]);

    fireEvent.click(screen.getByTestId("button-log-call"));

    // Listbox is closed until the visible trigger is clicked.
    expect(
      screen.queryByTestId("option-row-call-template-listbox"),
    ).toBeNull();

    const trigger = screen.getByTestId("trigger-row-call-template");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    const listbox = screen.getByTestId("option-row-call-template-listbox");
    const optionRows = Array.from(listbox.querySelectorAll('[role="option"]'));
    expect(optionRows.length).toBe(NO_DEFAULT_CALL_TEMPLATES.length + 1);

    // Custom row stays sparkline-free, matching the bulk picker.
    const customRow = screen.getByTestId("option-row-call-template-custom");
    expect(
      customRow.querySelector(
        '[data-testid^="call-template-usage-sparkline-row-"]',
      ),
    ).toBeNull();

    // Each saved template shows a sparkline.
    for (const tpl of NO_DEFAULT_CALL_TEMPLATES) {
      const row = screen.getByTestId(`option-row-call-template-${tpl.id}`);
      const spark = row.querySelector(
        `[data-testid="call-template-usage-sparkline-row-${tpl.id}"]`,
      );
      expect(spark, `sparkline missing for ${tpl.name}`).not.toBeNull();
    }

    // Voicemail template has 3 uses across the booking timelines this
    // week → "+3" delta surfaces on its row, with the same testid
    // shape the bulk picker uses (just `row-` prefixed instead of
    // `bulk-`).
    const voicemailTpl = NO_DEFAULT_CALL_TEMPLATES.find(
      (t) => t.name === voicemailLabel,
    )!;
    expect(
      screen.getByTestId(
        `call-template-usage-sparkline-delta-row-${voicemailTpl.id}`,
      ).textContent,
    ).toMatch(/\+3/);

    // A template with no usage has no delta rendered.
    const quietTpl = NO_DEFAULT_CALL_TEMPLATES.find(
      (t) => t.name !== voicemailLabel,
    )!;
    expect(
      screen.queryByTestId(
        `call-template-usage-sparkline-delta-row-${quietTpl.id}`,
      ),
    ).toBeNull();
  });

  it("opens the per-row Log email template dropdown and shows a sparkline + delta per option (none on Custom)", () => {
    const sentLinkLabel = "Sent rebook link";
    const active = makeBooking("bk-detail");
    const sibling = makeBooking("bk-history", [
      emailEntry("2026-04-29T09:00:00Z", sentLinkLabel),
      emailEntry("2026-04-30T10:00:00Z", sentLinkLabel),
    ]);
    renderDetail(active.id, [active, sibling]);

    fireEvent.click(screen.getByTestId("button-log-email"));

    fireEvent.click(screen.getByTestId("trigger-row-email-template"));

    const listbox = screen.getByTestId("option-row-email-template-listbox");
    const optionRows = Array.from(listbox.querySelectorAll('[role="option"]'));
    expect(optionRows.length).toBe(NO_DEFAULT_EMAIL_TEMPLATES.length + 1);

    const customRow = screen.getByTestId("option-row-email-template-custom");
    expect(
      customRow.querySelector(
        '[data-testid^="email-template-usage-sparkline-row-"]',
      ),
    ).toBeNull();

    for (const tpl of NO_DEFAULT_EMAIL_TEMPLATES) {
      const row = screen.getByTestId(`option-row-email-template-${tpl.id}`);
      const spark = row.querySelector(
        `[data-testid="email-template-usage-sparkline-row-${tpl.id}"]`,
      );
      expect(spark, `sparkline missing for ${tpl.name}`).not.toBeNull();
    }

    const sentLinkTpl = NO_DEFAULT_EMAIL_TEMPLATES.find(
      (t) => t.name === sentLinkLabel,
    )!;
    expect(
      screen.getByTestId(
        `email-template-usage-sparkline-delta-row-${sentLinkTpl.id}`,
      ).textContent,
    ).toMatch(/\+2/);
  });
});
