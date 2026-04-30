// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CALL_TEMPLATES,
  EMAIL_TEMPLATES,
  type AdminBooking,
  type AdminBuilding,
  type AdminUnit,
  type TimelineEntry,
} from "@/state/adminMockData";

import { AwaitingCoordinationView } from "./AwaitingCoordinationView";

afterEach(cleanup);

function makeBuildings(): AdminBuilding[] {
  return [
    {
      id: "bldg-test",
      name: "Test Tower",
      addressLine1: "1 Test St",
      addressLine2: "Suburb NSW 2000",
      acType: "split",
      acBrand: "Daikin",
    },
  ];
}

function makeUnits(): AdminUnit[] {
  return [
    {
      id: "u1",
      addressLine1: "1 / 1 Test St",
      addressLine2: "Suburb NSW 2000",
      ac: { type: "split", brand: "", systems: 1, additional: 0 },
      agentId: null,
      buildingId: "bldg-test",
    },
    {
      id: "u2",
      addressLine1: "2 / 1 Test St",
      addressLine2: "Suburb NSW 2000",
      ac: { type: "split", brand: "", systems: 1, additional: 0 },
      agentId: null,
      buildingId: "bldg-test",
    },
  ];
}

function makeBooking(
  id: string,
  unitId: string,
  serviceTimeline: TimelineEntry[],
): AdminBooking {
  return {
    id,
    unitId,
    customerName: "Test Customer",
    customerEmail: `${id}@example.com`,
    customerPhone: "0411 000 000",
    bookerRole: "owner",
    bookerAgencyId: null,
    bookerAgencyOtherName: "",
    accessMethod: "owner_leased_tenant",
    tenants: [
      {
        first: "T",
        last: "Tenant",
        email: "t@example.com",
        phone: "0411111111",
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
    createdAt: "2026-04-20T09:00:00+10:00",
    lastContactedAt: null,
  };
}

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

const NO_DEFAULT_CALL_TEMPLATES = CALL_TEMPLATES.map(
  ({ isDefault: _isDefault, ...t }) => t,
);
const NO_DEFAULT_EMAIL_TEMPLATES = EMAIL_TEMPLATES.map(
  ({ isDefault: _isDefault, ...t }) => t,
);

function Harness({
  bookings,
  onBulkLogCall = () => {},
  onBulkLogEmail = () => {},
}: {
  bookings: AdminBooking[];
  onBulkLogCall?: (
    ids: string[],
    outcome: "no_answer" | "spoke" | "voicemail",
    note: string,
    templateLabel: string,
  ) => void;
  onBulkLogEmail?: (
    ids: string[],
    subject: string,
    note: string,
    templateLabel: string,
  ) => void;
}) {
  const [filter, setFilter] = useState<"all">("all");
  return (
    <AwaitingCoordinationView
      bookings={bookings}
      units={makeUnits()}
      buildings={makeBuildings()}
      filter={filter}
      onFilter={setFilter as never}
      buildingFilter="all"
      onBuildingFilter={() => {}}
      search=""
      onSearch={() => {}}
      onOpen={() => {}}
      onBulkLogCall={onBulkLogCall}
      onBulkLogEmail={onBulkLogEmail}
      callTemplates={NO_DEFAULT_CALL_TEMPLATES}
      emailTemplates={NO_DEFAULT_EMAIL_TEMPLATES}
    />
  );
}

describe("AwaitingCoordinationView · bulk template picker sparklines", () => {
  it("opens the call-template dropdown and shows a sparkline per option (none on Custom)", () => {
    const voicemailLabel = "No answer — left voicemail";
    const bookings = [
      makeBooking("bk-1", "u1", [
        callEntry("2026-04-28T09:00:00Z", voicemailLabel),
        callEntry("2026-04-29T10:00:00Z", voicemailLabel),
        callEntry("2026-04-30T11:00:00Z", voicemailLabel),
      ]),
      makeBooking("bk-2", "u2", []),
    ];

    render(<Harness bookings={bookings} />);

    fireEvent.click(screen.getByTestId("checkbox-coordination-row-bk-1"));
    fireEvent.click(screen.getByTestId("checkbox-coordination-row-bk-2"));
    fireEvent.click(screen.getByTestId("button-bulk-log-call"));

    // Listbox is closed until the trigger is clicked.
    expect(
      screen.queryByTestId("option-bulk-call-template-listbox"),
    ).toBeNull();

    const trigger = screen.getByTestId("trigger-bulk-call-template");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    const listbox = screen.getByTestId("option-bulk-call-template-listbox");
    const optionRows = Array.from(listbox.querySelectorAll('[role="option"]'));
    expect(optionRows.length).toBe(NO_DEFAULT_CALL_TEMPLATES.length + 1);

    // Custom row has no sparkline.
    const customRow = screen.getByTestId("option-bulk-call-template-custom");
    expect(
      customRow.querySelector(
        '[data-testid^="call-template-usage-sparkline-bulk-"]',
      ),
    ).toBeNull();

    // Each saved template shows a sparkline.
    for (const tpl of NO_DEFAULT_CALL_TEMPLATES) {
      const row = screen.getByTestId(`option-bulk-call-template-${tpl.id}`);
      const spark = row.querySelector(
        `[data-testid="call-template-usage-sparkline-bulk-${tpl.id}"]`,
      );
      expect(spark, `sparkline missing for ${tpl.name}`).not.toBeNull();
    }

    // Voicemail template has 3 uses this week → "+3" delta.
    const voicemailTpl = NO_DEFAULT_CALL_TEMPLATES.find(
      (t) => t.name === voicemailLabel,
    )!;
    expect(
      screen.getByTestId(
        `call-template-usage-sparkline-delta-bulk-${voicemailTpl.id}`,
      ).textContent,
    ).toMatch(/\+3/);

    // A template with no usage has no delta rendered.
    const quietTpl = NO_DEFAULT_CALL_TEMPLATES.find(
      (t) => t.name !== voicemailLabel,
    )!;
    expect(
      screen.queryByTestId(
        `call-template-usage-sparkline-delta-bulk-${quietTpl.id}`,
      ),
    ).toBeNull();
  });

  it("selecting an email-template option syncs the hidden select and closes the popover", () => {
    const sentLinkLabel = "Sent rebook link";
    const bookings = [
      makeBooking("bk-1", "u1", [
        emailEntry("2026-04-29T09:00:00Z", sentLinkLabel),
        emailEntry("2026-04-30T10:00:00Z", sentLinkLabel),
      ]),
      makeBooking("bk-2", "u2", []),
    ];
    render(<Harness bookings={bookings} onBulkLogEmail={vi.fn()} />);

    fireEvent.click(screen.getByTestId("checkbox-coordination-row-bk-1"));
    fireEvent.click(screen.getByTestId("checkbox-coordination-row-bk-2"));
    fireEvent.click(screen.getByTestId("button-bulk-log-email"));

    fireEvent.click(screen.getByTestId("trigger-bulk-email-template"));
    expect(screen.getByTestId("option-bulk-email-template-listbox"))
      .toBeTruthy();

    const sentLinkTpl = NO_DEFAULT_EMAIL_TEMPLATES.find(
      (t) => t.name === sentLinkLabel,
    )!;
    expect(
      screen.getByTestId(
        `email-template-usage-sparkline-delta-bulk-${sentLinkTpl.id}`,
      ).textContent,
    ).toMatch(/\+2/);

    const select = screen.getByTestId(
      "select-bulk-email-template",
    ) as HTMLSelectElement;
    expect(select.value).not.toBe(sentLinkTpl.id);

    fireEvent.click(
      screen.getByTestId(`option-bulk-email-template-${sentLinkTpl.id}`),
    );

    expect(select.value).toBe(sentLinkTpl.id);
    // Popover closes after a selection.
    expect(
      screen.queryByTestId("option-bulk-email-template-listbox"),
    ).toBeNull();
    // Trigger label reflects the selection.
    expect(
      screen.getByTestId("trigger-bulk-email-template").textContent,
    ).toMatch(sentLinkLabel);
  });
});
