// @vitest-environment happy-dom

/**
 * Asserts the collapsed-state "Default" pill on the Log call /
 * Log email template dropdowns toggles in step with the dropdown
 * selection across all four variants:
 *   - per-row Log call / Log email on `BookingDetail`
 *   - bulk Log call / Log email on `AwaitingCoordinationView`
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import {
  CALL_TEMPLATE_CUSTOM_ID,
  EMAIL_TEMPLATE_CUSTOM_ID,
  type AdminAgent,
  type AdminBooking,
  type AdminBuilding,
  type AdminUnit,
  type CallTemplate,
  type EmailTemplate,
} from "@/state/adminMockData";

import { AwaitingCoordinationView } from "./AwaitingCoordinationView";
import { BookingDetail } from "./BookingDetail";

afterEach(cleanup);

const UNIT: AdminUnit = {
  id: "u-pill",
  addressLine1: "1 / 1 Pill Lane",
  addressLine2: "Sydney NSW 2000",
  ac: { type: "split", systems: 1, additional: 0 },
  agentId: null,
  buildingId: "bldg-pill",
};

const BUILDING: AdminBuilding = {
  id: "bldg-pill",
  name: "Pill Tower",
  addressLine1: "1 Pill Lane",
  addressLine2: "Sydney NSW 2000",
};

const AGENTS: AdminAgent[] = [];

const CALL_TEMPLATES_FIXTURE: ReadonlyArray<CallTemplate> = [
  {
    id: "tpl-call-default",
    name: "Spoke to them — confirmed window",
    note: "Spoke to the customer and confirmed the requested window.",
    isDefault: true,
  },
  {
    id: "tpl-call-other",
    name: "Left voicemail — will retry",
    note: "Left a voicemail; will try again tomorrow.",
  },
];

const EMAIL_TEMPLATES_FIXTURE: ReadonlyArray<EmailTemplate> = [
  {
    id: "tpl-email-default",
    name: "Sent rebook link",
    subject: "Booking access — please pick a new window",
    note: "Sent the rebook link.",
    isDefault: true,
  },
  {
    id: "tpl-email-other",
    name: "Sent parcel-locker instructions",
    subject: "Building access — parcel-locker instructions",
    note: "Sent parcel-locker instructions.",
  },
];

function makeBooking(): AdminBooking {
  return {
    id: "bk-pill",
    unitId: UNIT.id,
    customerName: "Pill Customer",
    customerEmail: "pill@example.com",
    customerPhone: "0400 000 000",
    bookerRole: "owner",
    bookerAgencyId: null,
    bookerAgencyOtherName: "",
    accessMethod: "owner_leased_tenant",
    tenants: [
      {
        first: "P",
        last: "Tenant",
        phone: "0411 111 111",
        email: "p@example.com",
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
    serviceTimeline: [],
    notes: "",
    rolloutId: null,
    createdAt: "2026-04-26T09:00:00+10:00",
    lastContactedAt: null,
  };
}

function renderDetail() {
  const noop = () => {};
  return render(
    <BookingDetail
      bookingId="bk-pill"
      bookings={[makeBooking()]}
      units={[UNIT]}
      agents={AGENTS}
      onBack={noop}
      onUpdate={noop}
      onCancelBooking={noop}
      callTemplates={CALL_TEMPLATES_FIXTURE}
      emailTemplates={EMAIL_TEMPLATES_FIXTURE}
    />,
  );
}

type BulkFilter = "all" | "awaiting_tenant" | "awaiting_agent";

function BulkHarness() {
  const [filter, setFilter] = useState<BulkFilter>("all");
  return (
    <AwaitingCoordinationView
      bookings={[makeBooking()]}
      units={[UNIT]}
      buildings={[BUILDING]}
      filter={filter}
      onFilter={setFilter}
      buildingFilter="all"
      onBuildingFilter={() => {}}
      search=""
      onSearch={() => {}}
      onOpen={() => {}}
      onBulkLogCall={() => {}}
      onBulkLogEmail={() => {}}
      callTemplates={CALL_TEMPLATES_FIXTURE}
      emailTemplates={EMAIL_TEMPLATES_FIXTURE}
    />
  );
}

function expectPillNextToSelect(pillTestId: string, selectTestId: string) {
  const pill = screen.getByTestId(pillTestId);
  const select = screen.getByTestId(selectTestId);
  expect(pill.parentElement).toBe(select.parentElement);
}

describe("Log call / Log email · collapsed-state Default pill", () => {
  it("per-row Log call: pill toggles in step with the dropdown selection", () => {
    renderDetail();
    fireEvent.click(screen.getByTestId("button-log-call"));

    expectPillNextToSelect(
      "pill-default-selected-call-template",
      "select-call-template",
    );

    fireEvent.change(screen.getByTestId("select-call-template"), {
      target: { value: CALL_TEMPLATE_CUSTOM_ID },
    });
    expect(
      screen.queryByTestId("pill-default-selected-call-template"),
    ).toBeNull();

    fireEvent.change(screen.getByTestId("select-call-template"), {
      target: { value: "tpl-call-other" },
    });
    expect(
      screen.queryByTestId("pill-default-selected-call-template"),
    ).toBeNull();

    fireEvent.change(screen.getByTestId("select-call-template"), {
      target: { value: "tpl-call-default" },
    });
    expectPillNextToSelect(
      "pill-default-selected-call-template",
      "select-call-template",
    );
  });

  it("per-row Log email: pill toggles in step with the dropdown selection", () => {
    renderDetail();
    fireEvent.click(screen.getByTestId("button-log-email"));

    expectPillNextToSelect(
      "pill-default-selected-email-template",
      "select-email-template",
    );

    fireEvent.change(screen.getByTestId("select-email-template"), {
      target: { value: EMAIL_TEMPLATE_CUSTOM_ID },
    });
    expect(
      screen.queryByTestId("pill-default-selected-email-template"),
    ).toBeNull();

    fireEvent.change(screen.getByTestId("select-email-template"), {
      target: { value: "tpl-email-other" },
    });
    expect(
      screen.queryByTestId("pill-default-selected-email-template"),
    ).toBeNull();

    fireEvent.change(screen.getByTestId("select-email-template"), {
      target: { value: "tpl-email-default" },
    });
    expectPillNextToSelect(
      "pill-default-selected-email-template",
      "select-email-template",
    );
  });

  it("bulk Log call: pill toggles in step with the dropdown selection", () => {
    render(<BulkHarness />);
    fireEvent.click(screen.getByTestId("checkbox-coordination-row-bk-pill"));
    fireEvent.click(screen.getByTestId("button-bulk-log-call"));

    expectPillNextToSelect(
      "pill-default-selected-bulk-call-template",
      "select-bulk-call-template",
    );

    fireEvent.change(screen.getByTestId("select-bulk-call-template"), {
      target: { value: CALL_TEMPLATE_CUSTOM_ID },
    });
    expect(
      screen.queryByTestId("pill-default-selected-bulk-call-template"),
    ).toBeNull();

    fireEvent.change(screen.getByTestId("select-bulk-call-template"), {
      target: { value: "tpl-call-other" },
    });
    expect(
      screen.queryByTestId("pill-default-selected-bulk-call-template"),
    ).toBeNull();

    fireEvent.change(screen.getByTestId("select-bulk-call-template"), {
      target: { value: "tpl-call-default" },
    });
    expectPillNextToSelect(
      "pill-default-selected-bulk-call-template",
      "select-bulk-call-template",
    );
  });

  it("bulk Log email: pill toggles in step with the dropdown selection", () => {
    render(<BulkHarness />);
    fireEvent.click(screen.getByTestId("checkbox-coordination-row-bk-pill"));
    fireEvent.click(screen.getByTestId("button-bulk-log-email"));

    expectPillNextToSelect(
      "pill-default-selected-bulk-email-template",
      "select-bulk-email-template",
    );

    fireEvent.change(screen.getByTestId("select-bulk-email-template"), {
      target: { value: EMAIL_TEMPLATE_CUSTOM_ID },
    });
    expect(
      screen.queryByTestId("pill-default-selected-bulk-email-template"),
    ).toBeNull();

    fireEvent.change(screen.getByTestId("select-bulk-email-template"), {
      target: { value: "tpl-email-other" },
    });
    expect(
      screen.queryByTestId("pill-default-selected-bulk-email-template"),
    ).toBeNull();

    fireEvent.change(screen.getByTestId("select-bulk-email-template"), {
      target: { value: "tpl-email-default" },
    });
    expectPillNextToSelect(
      "pill-default-selected-bulk-email-template",
      "select-bulk-email-template",
    );
  });
});
