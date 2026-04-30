// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import "@testing-library/jest-dom/vitest";

import type {
  AdminBooking,
  AdminBuilding,
  AdminUnit,
  CallTemplate,
  EmailTemplate,
  TimelineEntry,
} from "@/state/adminMockData";

import { AwaitingCoordinationView } from "./AwaitingCoordinationView";

afterEach(cleanup);

function makeBuildings(): AdminBuilding[] {
  return [
    {
      id: "bldg-a",
      name: "Tower A",
      addressLine1: "1 A St",
      addressLine2: "Suburb NSW 2000",
      acType: "split",
      acBrand: "Daikin",
    },
  ];
}

function makeUnits(): AdminUnit[] {
  return [
    {
      id: "u-a1",
      addressLine1: "1 / 1 A St",
      addressLine2: "Suburb NSW 2000",
      ac: { type: "split", brand: "", systems: 1, additional: 0 },
      agentId: null,
      buildingId: "bldg-a",
    },
    {
      id: "u-a2",
      addressLine1: "2 / 1 A St",
      addressLine2: "Suburb NSW 2000",
      ac: { type: "split", brand: "", systems: 1, additional: 0 },
      agentId: null,
      buildingId: "bldg-a",
    },
    {
      id: "u-a3",
      addressLine1: "3 / 1 A St",
      addressLine2: "Suburb NSW 2000",
      ac: { type: "split", brand: "", systems: 1, additional: 0 },
      agentId: null,
      buildingId: "bldg-a",
    },
    {
      id: "u-a4",
      addressLine1: "4 / 1 A St",
      addressLine2: "Suburb NSW 2000",
      ac: { type: "split", brand: "", systems: 1, additional: 0 },
      agentId: null,
      buildingId: "bldg-a",
    },
  ];
}

function makeBooking(overrides: Partial<AdminBooking>): AdminBooking {
  return {
    id: "bk-x",
    unitId: "u-a1",
    customerName: "Test Customer",
    customerEmail: "test@example.com",
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
    serviceTimeline: [],
    notes: "",
    rolloutId: null,
    createdAt: "2026-04-20T09:00:00+10:00",
    lastContactedAt: "2026-04-28T09:00:00+10:00",
    ...overrides,
  };
}

function emailEntry(templateLabel: string | null): TimelineEntry {
  return {
    kind: "email",
    status: "logged_email",
    label: "Logged email · Hello",
    at: "Just now",
    by: "Mia (admin)",
    ...(templateLabel !== null ? { templateLabel } : {}),
  };
}

function callEntry(templateLabel: string | null): TimelineEntry {
  return {
    kind: "call",
    status: "logged_call",
    label: "Logged call · Spoke to them",
    at: "Just now",
    by: "Mia (admin)",
    ...(templateLabel !== null ? { templateLabel } : {}),
  };
}

function Harness({
  initial,
  callTemplates,
  emailTemplates,
}: {
  initial: AdminBooking[];
  callTemplates?: ReadonlyArray<CallTemplate>;
  emailTemplates?: ReadonlyArray<EmailTemplate>;
}) {
  const [filter, setFilter] = useState<
    "all" | "awaiting_tenant" | "awaiting_agent"
  >("all");
  const [buildingFilter, setBuildingFilter] = useState("all");
  const [search, setSearch] = useState("");
  return (
    <AwaitingCoordinationView
      bookings={initial}
      units={makeUnits()}
      buildings={makeBuildings()}
      filter={filter}
      onFilter={setFilter}
      buildingFilter={buildingFilter}
      onBuildingFilter={setBuildingFilter}
      search={search}
      onSearch={setSearch}
      onOpen={() => {}}
      callTemplates={callTemplates}
      emailTemplates={emailTemplates}
    />
  );
}

function renderedBookingIds(): string[] {
  // The row container is a `<tr role="button">`; the new template
  // suffix is also a `<button>` inside that row, so narrow to <tr>.
  const table = screen.getByRole("table");
  const rows = within(table)
    .queryAllByRole("button")
    .filter((el) => el.tagName === "TR");
  return rows.map((row) => {
    const idDiv = row.querySelector("td > div");
    const text = idDiv?.textContent?.trim() ?? "";
    return text.replace(/\s*Live\s*$/i, "").trim();
  });
}

describe("AwaitingCoordinationView — template filter pivot", () => {
  it("filters the queue to rows whose latest touch used the clicked template", () => {
    render(
      <Harness
        initial={[
          makeBooking({
            id: "bk-rebook",
            unitId: "u-a1",
            serviceTimeline: [emailEntry("Sent rebook link")],
          }),
          makeBooking({
            id: "bk-rebook-2",
            unitId: "u-a2",
            serviceTimeline: [emailEntry("Sent rebook link")],
          }),
          makeBooking({
            id: "bk-other",
            unitId: "u-a3",
            serviceTimeline: [emailEntry("Awaiting access info")],
          }),
          makeBooking({
            id: "bk-call",
            unitId: "u-a4",
            serviceTimeline: [callEntry("Spoke — confirmed window")],
          }),
        ]}
      />,
    );

    expect(new Set(renderedBookingIds())).toEqual(
      new Set(["bk-rebook", "bk-rebook-2", "bk-other", "bk-call"]),
    );
    expect(
      screen.queryByTestId("coordination-template-filter-chip"),
    ).toBeNull();

    const suffixes = screen.getAllByTestId(
      "coordinating-with-last-attempt-template",
    );
    const rebookSuffix = suffixes.find(
      (el) => el.getAttribute("data-template-label") === "Sent rebook link",
    );
    expect(rebookSuffix).toBeDefined();
    fireEvent.click(rebookSuffix!);

    expect(new Set(renderedBookingIds())).toEqual(
      new Set(["bk-rebook", "bk-rebook-2"]),
    );
    const chip = screen.getByTestId("coordination-template-filter-chip");
    expect(chip.textContent).toContain("Sent rebook link");
    expect(
      screen.getByTestId("button-clear-coordination-template-filter"),
    ).toBeInTheDocument();
  });

  it("clears the pivot when the chip's clear button is clicked", () => {
    render(
      <Harness
        initial={[
          makeBooking({
            id: "bk-a",
            unitId: "u-a1",
            serviceTimeline: [emailEntry("Sent rebook link")],
          }),
          makeBooking({
            id: "bk-b",
            unitId: "u-a2",
            serviceTimeline: [emailEntry("Awaiting access info")],
          }),
        ]}
      />,
    );

    const suffixes = screen.getAllByTestId(
      "coordinating-with-last-attempt-template",
    );
    const rebookSuffix = suffixes.find(
      (el) => el.getAttribute("data-template-label") === "Sent rebook link",
    );
    fireEvent.click(rebookSuffix!);
    expect(renderedBookingIds()).toEqual(["bk-a"]);

    fireEvent.click(
      screen.getByTestId("button-clear-coordination-template-filter"),
    );
    expect(
      screen.queryByTestId("coordination-template-filter-chip"),
    ).toBeNull();
    expect(new Set(renderedBookingIds())).toEqual(new Set(["bk-a", "bk-b"]));
  });

  it("Custom / no-template entries don't render a clickable suffix", () => {
    render(
      <Harness
        initial={[
          makeBooking({
            id: "bk-custom",
            unitId: "u-a1",
            serviceTimeline: [emailEntry(null)],
          }),
        ]}
      />,
    );

    expect(
      screen.getByTestId("coordinating-with-last-attempt"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("coordinating-with-last-attempt-template"),
    ).toBeNull();
    expect(
      screen.queryByTestId("coordination-template-filter-chip"),
    ).toBeNull();
  });

  it("clicking the template suffix doesn't open the booking", () => {
    let opened: string | null = null;
    function HarnessWithOpen() {
      const [filter, setFilter] = useState<
        "all" | "awaiting_tenant" | "awaiting_agent"
      >("all");
      const [buildingFilter, setBuildingFilter] = useState("all");
      const [search, setSearch] = useState("");
      return (
        <AwaitingCoordinationView
          bookings={[
            makeBooking({
              id: "bk-rebook",
              unitId: "u-a1",
              serviceTimeline: [emailEntry("Sent rebook link")],
            }),
          ]}
          units={makeUnits()}
          buildings={makeBuildings()}
          filter={filter}
          onFilter={setFilter}
          buildingFilter={buildingFilter}
          onBuildingFilter={setBuildingFilter}
          search={search}
          onSearch={setSearch}
          onOpen={(id) => {
            opened = id;
          }}
        />
      );
    }
    render(<HarnessWithOpen />);

    fireEvent.click(
      screen.getByTestId("coordinating-with-last-attempt-template"),
    );
    expect(opened).toBeNull();
    expect(
      screen.getByTestId("coordination-template-filter-chip"),
    ).toBeInTheDocument();
  });

  it("shows a 'no longer in templates catalog' hint when the chip's name doesn't match either current catalog (Task #177)", () => {
    const callTemplates: CallTemplate[] = [
      { id: "c1", name: "Some other call template", note: "" },
    ];
    const emailTemplates: EmailTemplate[] = [
      { id: "e1", name: "Some other email template", subject: "x", note: "" },
    ];
    render(
      <Harness
        initial={[
          makeBooking({
            id: "bk-renamed",
            unitId: "u-a1",
            serviceTimeline: [emailEntry("Old name template")],
          }),
        ]}
        callTemplates={callTemplates}
        emailTemplates={emailTemplates}
      />,
    );

    fireEvent.click(
      screen.getByTestId("coordinating-with-last-attempt-template"),
    );
    expect(
      screen.getByTestId("coordination-template-filter-chip"),
    ).toBeInTheDocument();
    const hint = screen.getByTestId(
      "coordination-template-filter-missing-hint",
    );
    expect(hint).toBeInTheDocument();
    expect(hint.getAttribute("aria-label")).toContain("Old name template");
    expect(hint.getAttribute("aria-label")).toContain(
      "no longer in the templates catalog",
    );
    // Filter still works — the snapshot match is unchanged.
    expect(renderedBookingIds()).toEqual(["bk-renamed"]);
  });

  it("does NOT show the missing-template hint when the chip's name matches a current call or email template", () => {
    // The chip's name lives in the email catalog → no hint.
    const callTemplates: CallTemplate[] = [];
    const emailTemplates: EmailTemplate[] = [
      { id: "e1", name: "Sent rebook link", subject: "x", note: "" },
    ];
    render(
      <Harness
        initial={[
          makeBooking({
            id: "bk-a",
            unitId: "u-a1",
            serviceTimeline: [emailEntry("Sent rebook link")],
          }),
        ]}
        callTemplates={callTemplates}
        emailTemplates={emailTemplates}
      />,
    );

    fireEvent.click(
      screen.getByTestId("coordinating-with-last-attempt-template"),
    );
    expect(
      screen.getByTestId("coordination-template-filter-chip"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("coordination-template-filter-missing-hint"),
    ).toBeNull();
  });

  it("does NOT show the hint when the chip's name matches a template in the OTHER channel's catalog", () => {
    // The snapshot was logged from an email entry, but the same name
    // happens to exist in the call catalog. Since the queue's chip
    // doesn't carry a `kind`, we treat a hit in either catalog as
    // "still in catalog" so the hint stays quiet.
    const callTemplates: CallTemplate[] = [
      { id: "c1", name: "Cross channel name", note: "" },
    ];
    const emailTemplates: EmailTemplate[] = [];
    render(
      <Harness
        initial={[
          makeBooking({
            id: "bk-a",
            unitId: "u-a1",
            serviceTimeline: [emailEntry("Cross channel name")],
          }),
        ]}
        callTemplates={callTemplates}
        emailTemplates={emailTemplates}
      />,
    );

    fireEvent.click(
      screen.getByTestId("coordinating-with-last-attempt-template"),
    );
    expect(
      screen.getByTestId("coordination-template-filter-chip"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("coordination-template-filter-missing-hint"),
    ).toBeNull();
  });

  it("clearing the chip removes the missing-template hint", () => {
    render(
      <Harness
        initial={[
          makeBooking({
            id: "bk-renamed",
            unitId: "u-a1",
            serviceTimeline: [emailEntry("Old name template")],
          }),
        ]}
        callTemplates={[]}
        emailTemplates={[]}
      />,
    );

    fireEvent.click(
      screen.getByTestId("coordinating-with-last-attempt-template"),
    );
    expect(
      screen.getByTestId("coordination-template-filter-missing-hint"),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByTestId("button-clear-coordination-template-filter"),
    );
    expect(
      screen.queryByTestId("coordination-template-filter-chip"),
    ).toBeNull();
    expect(
      screen.queryByTestId("coordination-template-filter-missing-hint"),
    ).toBeNull();
  });
});
