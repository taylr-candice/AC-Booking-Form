// @vitest-environment happy-dom

/**
 * Task #209 — pin the per-day drill-down popover that the bulk
 * template picker's per-option sparkline now exposes (mirror of the
 * Templates panel behaviour added in Task #197).
 *
 * Coverage:
 *  - Clicking a non-zero sparkline bar inside a bulk-picker option
 *    opens the day-scoped popover listing exactly the bookings whose
 *    timeline touched that template on that UTC day (no leakage from
 *    adjacent days, no leakage from other templates).
 *  - Clicking a booking row inside that popover invokes the same
 *    `onOpen` handler the queue rows use, so the admin lands on the
 *    matching BookingDetail without bouncing back to the Templates
 *    panel.
 *  - Zero-count days remain non-interactive (rendered as inert spans).
 */

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
    {
      id: "u3",
      addressLine1: "3 / 1 Test St",
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
  customerName: string,
  serviceTimeline: TimelineEntry[],
): AdminBooking {
  return {
    id,
    unitId,
    customerName,
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
  onOpen = () => {},
  onBulkLogCall = () => {},
  onBulkLogEmail = () => {},
}: {
  bookings: AdminBooking[];
  onOpen?: (id: string) => void;
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
      onOpen={onOpen}
      onBulkLogCall={onBulkLogCall}
      onBulkLogEmail={onBulkLogEmail}
      callTemplates={NO_DEFAULT_CALL_TEMPLATES}
      emailTemplates={NO_DEFAULT_EMAIL_TEMPLATES}
    />
  );
}

describe("AwaitingCoordinationView · bulk template picker per-day drill-down (Task #209)", () => {
  it("clicking a non-zero sparkline bar opens a day-scoped popover with exactly the bookings whose timeline touched the template that day", () => {
    const voicemailLabel = "No answer — left voicemail";
    const otherCallLabel = NO_DEFAULT_CALL_TEMPLATES.find(
      (t) => t.name !== voicemailLabel,
    )!.name;
    const bookings = [
      // Same day, same template — should be grouped together.
      makeBooking("bk-aaa", "u1", "Eloise Tran", [
        callEntry("2026-04-28T09:00:00Z", voicemailLabel),
      ]),
      makeBooking("bk-bbb", "u2", "Mia Holland", [
        callEntry("2026-04-28T18:30:00Z", voicemailLabel),
      ]),
      // Different day — must NOT show in the Apr 28 popover.
      makeBooking("bk-ccc", "u3", "Noah Reyes", [
        callEntry("2026-04-29T09:00:00Z", voicemailLabel),
      ]),
      // Different template, same day — must NOT leak into the
      // voicemail popover.
      makeBooking("bk-ddd", "u3", "Priya Kapoor", [
        callEntry("2026-04-28T12:00:00Z", otherCallLabel),
      ]),
    ];

    render(<Harness bookings={bookings} />);

    fireEvent.click(screen.getByTestId("checkbox-coordination-row-bk-aaa"));
    fireEvent.click(screen.getByTestId("button-bulk-log-call"));
    fireEvent.click(screen.getByTestId("trigger-bulk-call-template"));

    const voicemailTpl = NO_DEFAULT_CALL_TEMPLATES.find(
      (t) => t.name === voicemailLabel,
    )!;

    // Zero-count bar stays inert (a span, not a button). The
    // sparkline rolls a 7-day window anchored on today's UTC midnight,
    // so we pick the leftmost bucket (today − 6 days) to be sure it's
    // in the rendered window and is not touched by any of the seeded
    // bookings (which target Apr 28/29).
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    const todayUtc = new Date();
    const leftmostUtc = new Date(
      Date.UTC(
        todayUtc.getUTCFullYear(),
        todayUtc.getUTCMonth(),
        todayUtc.getUTCDate(),
      ) - 6 * ONE_DAY_MS,
    );
    const leftmostIso = leftmostUtc.toISOString().slice(0, 10);
    const zeroBar = screen.getByTestId(
      `call-template-usage-sparkline-bar-bulk-${voicemailTpl.id}-${leftmostIso}`,
    );
    expect(zeroBar.tagName).toBe("SPAN");
    expect(zeroBar.getAttribute("data-interactive")).toBe("false");

    // Apr 28 has 2 bookings touching the voicemail template — bar
    // should be a button announcing "open 2 bookings".
    const apr28Bar = screen.getByTestId(
      `call-template-usage-sparkline-bar-bulk-${voicemailTpl.id}-2026-04-28`,
    );
    expect(apr28Bar.tagName).toBe("BUTTON");
    expect(apr28Bar.getAttribute("data-interactive")).toBe("true");
    expect(apr28Bar.getAttribute("aria-label")).toBe(
      "Apr 28 · 2 · open 2 bookings",
    );

    // No popover is mounted yet.
    expect(
      screen.queryByTestId(
        `call-template-usage-sparkline-popover-bulk-${voicemailTpl.id}`,
      ),
    ).toBeNull();

    fireEvent.click(apr28Bar);

    const popover = screen.getByTestId(
      `call-template-usage-sparkline-popover-bulk-${voicemailTpl.id}`,
    );
    expect(popover.getAttribute("data-day")).toBe("2026-04-28");
    expect(popover.textContent).toContain("Apr 28");
    expect(popover.textContent).toContain("2 bookings");

    // Both Apr 28 voicemail bookings are listed.
    expect(
      screen.getByTestId(
        `call-template-usage-sparkline-booking-bulk-${voicemailTpl.id}-2026-04-28-bk-aaa`,
      ),
    ).toBeTruthy();
    expect(
      screen.getByTestId(
        `call-template-usage-sparkline-booking-bulk-${voicemailTpl.id}-2026-04-28-bk-bbb`,
      ),
    ).toBeTruthy();
    // The Apr 29 booking and the other-template booking must not
    // leak into this day's popover.
    expect(
      screen.queryByTestId(
        `call-template-usage-sparkline-booking-bulk-${voicemailTpl.id}-2026-04-28-bk-ccc`,
      ),
    ).toBeNull();
    expect(
      screen.queryByTestId(
        `call-template-usage-sparkline-booking-bulk-${voicemailTpl.id}-2026-04-28-bk-ddd`,
      ),
    ).toBeNull();
  });

  it("clicking a booking row inside the popover invokes onOpen with the booking id (mirror of the Templates panel behaviour)", () => {
    const sentLinkLabel = "Sent rebook link";
    const bookings = [
      makeBooking("bk-eee", "u1", "Quinn Walsh", [
        emailEntry("2026-04-28T09:00:00Z", sentLinkLabel),
      ]),
      makeBooking("bk-fff", "u2", "Rohan Singh", [
        emailEntry("2026-04-28T11:00:00Z", sentLinkLabel),
      ]),
    ];

    const onOpen = vi.fn();
    render(<Harness bookings={bookings} onOpen={onOpen} />);

    fireEvent.click(screen.getByTestId("checkbox-coordination-row-bk-eee"));
    fireEvent.click(screen.getByTestId("button-bulk-log-email"));
    fireEvent.click(screen.getByTestId("trigger-bulk-email-template"));

    const sentLinkTpl = NO_DEFAULT_EMAIL_TEMPLATES.find(
      (t) => t.name === sentLinkLabel,
    )!;

    fireEvent.click(
      screen.getByTestId(
        `email-template-usage-sparkline-bar-bulk-${sentLinkTpl.id}-2026-04-28`,
      ),
    );

    fireEvent.click(
      screen.getByTestId(
        `email-template-usage-sparkline-booking-bulk-${sentLinkTpl.id}-2026-04-28-bk-fff`,
      ),
    );

    expect(onOpen).toHaveBeenCalledWith("bk-fff");
    // After the booking-row click the day-scoped popover closes.
    expect(
      screen.queryByTestId(
        `email-template-usage-sparkline-popover-bulk-${sentLinkTpl.id}`,
      ),
    ).toBeNull();
  });
});
