// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

import { BookingsView, type BookingsTemplateFilter } from "./BookingsView";

type HarnessProps = {
  bookings: AdminBooking[];
  onOpen?: (id: string) => void;
  callTemplates?: ReadonlyArray<CallTemplate>;
  emailTemplates?: ReadonlyArray<EmailTemplate>;
};

function Harness({
  bookings,
  onOpen,
  callTemplates,
  emailTemplates,
}: HarnessProps) {
  const [templateFilter, setTemplateFilter] =
    useState<BookingsTemplateFilter>(null);
  return (
    <BookingsView
      bookings={bookings}
      units={makeUnits()}
      buildings={makeBuildings()}
      statusFilter="all"
      onStatusFilter={() => {}}
      buildingFilter="all"
      onBuildingFilter={() => {}}
      search=""
      onSearch={() => {}}
      onOpen={onOpen ?? (() => {})}
      onNewBooking={() => {}}
      paymentMode={false}
      onAcknowledgeSupersede={() => {}}
      templateFilter={templateFilter}
      onTemplateFilter={setTemplateFilter}
      callTemplates={callTemplates}
      emailTemplates={emailTemplates}
    />
  );
}

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
  ];
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

function makeBooking(overrides: Partial<AdminBooking>): AdminBooking {
  return {
    id: "bk-x",
    unitId: "u1",
    customerName: "Test Customer",
    customerEmail: "test@example.com",
    customerPhone: "0411 000 000",
    bookerRole: "owner",
    bookerAgencyId: null,
    bookerAgencyOtherName: "",
    accessMethod: "owner_live_at_unit",
    tenants: [],
    systems: 1,
    additional: 0,
    acType: "split",
    discrepancy: null,
    serviceDate: "2026-05-10",
    serviceSlot: "morning",
    paymentStatus: "paid",
    serviceStatus: "scheduled",
    totalAud: 199,
    paymentTimeline: [],
    serviceTimeline: [],
    notes: "",
    rolloutId: null,
    createdAt: "2026-04-20T09:00:00+10:00",
    lastContactedAt: null,
    ...overrides,
  };
}

function renderView(bookings: AdminBooking[]) {
  return render(<Harness bookings={bookings} />);
}

function visibleBookingIds(): string[] {
  const rows = screen.getAllByRole("button", { name: /Open booking/i });
  return rows
    .map((row) => row.getAttribute("aria-label") ?? "")
    .map((label) => {
      const m = label.match(/Open booking (\S+)/);
      return m ? m[1] : "";
    })
    .filter(Boolean);
}

describe("BookingsView — template filter pivot", () => {
  it("filters the table to rows whose latest touch used the clicked template", () => {
    const bookings: AdminBooking[] = [
      makeBooking({
        id: "bk-rebook",
        serviceTimeline: [emailEntry("Sent rebook link")],
      }),
      makeBooking({
        id: "bk-rebook-2",
        customerEmail: "two@example.com",
        serviceTimeline: [emailEntry("Sent rebook link")],
      }),
      makeBooking({
        id: "bk-other",
        customerEmail: "other@example.com",
        serviceTimeline: [emailEntry("Awaiting access info")],
      }),
      makeBooking({
        id: "bk-call",
        customerEmail: "call@example.com",
        serviceTimeline: [callEntry("Spoke — confirmed window")],
      }),
    ];
    renderView(bookings);

    expect(visibleBookingIds().sort()).toEqual([
      "bk-call",
      "bk-other",
      "bk-rebook",
      "bk-rebook-2",
    ]);
    expect(screen.queryByTestId("bookings-template-filter-chip")).toBeNull();

    const firstSuffix = screen
      .getAllByTestId("bookings-row-last-attempt-template")
      .find((el) => el.getAttribute("data-booking-id") === "bk-rebook");
    expect(firstSuffix).toBeDefined();
    expect(firstSuffix!.getAttribute("data-template-label")).toBe(
      "Sent rebook link",
    );
    fireEvent.click(firstSuffix!);

    expect(visibleBookingIds().sort()).toEqual(["bk-rebook", "bk-rebook-2"]);
    const chip = screen.getByTestId("bookings-template-filter-chip");
    expect(chip.textContent).toContain("Sent rebook link");
    expect(
      screen.getByTestId("button-clear-bookings-template-filter"),
    ).toBeInTheDocument();
  });

  it("clears the pivot when the chip's clear button is clicked", () => {
    const bookings: AdminBooking[] = [
      makeBooking({
        id: "bk-a",
        serviceTimeline: [emailEntry("Sent rebook link")],
      }),
      makeBooking({
        id: "bk-b",
        customerEmail: "b@example.com",
        serviceTimeline: [emailEntry("Awaiting access info")],
      }),
    ];
    renderView(bookings);

    const suffix = screen
      .getAllByTestId("bookings-row-last-attempt-template")
      .find((el) => el.getAttribute("data-booking-id") === "bk-a");
    fireEvent.click(suffix!);
    expect(visibleBookingIds()).toEqual(["bk-a"]);

    fireEvent.click(
      screen.getByTestId("button-clear-bookings-template-filter"),
    );
    expect(screen.queryByTestId("bookings-template-filter-chip")).toBeNull();
    expect(visibleBookingIds().sort()).toEqual(["bk-a", "bk-b"]);
  });

  it("Custom / no-template entries don't render a clickable suffix", () => {
    const bookings: AdminBooking[] = [
      makeBooking({
        id: "bk-custom",
        serviceTimeline: [emailEntry(null)],
      }),
    ];
    renderView(bookings);

    expect(screen.getByTestId("bookings-row-last-attempt")).toBeInTheDocument();
    expect(
      screen.queryByTestId("bookings-row-last-attempt-template"),
    ).toBeNull();
    expect(screen.queryByTestId("bookings-template-filter-chip")).toBeNull();
  });

  it("shows a 'no longer in templates catalog' hint when the chip's template name doesn't match either current catalog (Task #173)", () => {
    const bookings: AdminBooking[] = [
      makeBooking({
        id: "bk-renamed",
        serviceTimeline: [emailEntry("Old name template")],
      }),
    ];
    const callTemplates: CallTemplate[] = [
      { id: "c1", name: "Some other call template", note: "" },
    ];
    const emailTemplates: EmailTemplate[] = [
      { id: "e1", name: "Some other email template", subject: "x", note: "" },
    ];
    render(
      <Harness
        bookings={bookings}
        callTemplates={callTemplates}
        emailTemplates={emailTemplates}
      />,
    );

    fireEvent.click(
      screen.getByTestId("bookings-row-last-attempt-template"),
    );
    expect(screen.getByTestId("bookings-template-filter-chip")).toBeInTheDocument();
    const hint = screen.getByTestId("bookings-template-filter-missing-hint");
    expect(hint).toBeInTheDocument();
    expect(hint.getAttribute("aria-label")).toContain("Old name template");
    expect(hint.getAttribute("aria-label")).toContain("no longer in the templates catalog");
    // The filter still works — `bk-renamed` is the only matching row.
    expect(visibleBookingIds()).toEqual(["bk-renamed"]);
  });

  it("does NOT show the missing-template hint when the chip's name matches a current call or email template", () => {
    const bookings: AdminBooking[] = [
      makeBooking({
        id: "bk-a",
        serviceTimeline: [emailEntry("Sent rebook link")],
      }),
    ];
    const callTemplates: CallTemplate[] = [];
    const emailTemplates: EmailTemplate[] = [
      { id: "e1", name: "Sent rebook link", subject: "x", note: "" },
    ];
    render(
      <Harness
        bookings={bookings}
        callTemplates={callTemplates}
        emailTemplates={emailTemplates}
      />,
    );

    fireEvent.click(
      screen.getByTestId("bookings-row-last-attempt-template"),
    );
    expect(screen.getByTestId("bookings-template-filter-chip")).toBeInTheDocument();
    expect(
      screen.queryByTestId("bookings-template-filter-missing-hint"),
    ).toBeNull();
  });

  it("clearing the chip removes the missing-template hint", () => {
    const bookings: AdminBooking[] = [
      makeBooking({
        id: "bk-renamed",
        serviceTimeline: [emailEntry("Old name template")],
      }),
    ];
    render(
      <Harness
        bookings={bookings}
        callTemplates={[]}
        emailTemplates={[]}
      />,
    );

    fireEvent.click(
      screen.getByTestId("bookings-row-last-attempt-template"),
    );
    expect(
      screen.getByTestId("bookings-template-filter-missing-hint"),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByTestId("button-clear-bookings-template-filter"),
    );
    expect(screen.queryByTestId("bookings-template-filter-chip")).toBeNull();
    expect(
      screen.queryByTestId("bookings-template-filter-missing-hint"),
    ).toBeNull();
  });

  it("stays quiet (no false-positive hint) when the catalogs aren't threaded in", () => {
    const bookings: AdminBooking[] = [
      makeBooking({
        id: "bk-a",
        serviceTimeline: [emailEntry("Old name template")],
      }),
    ];
    renderView(bookings);

    fireEvent.click(
      screen.getByTestId("bookings-row-last-attempt-template"),
    );
    expect(screen.getByTestId("bookings-template-filter-chip")).toBeInTheDocument();
    // No catalogs => we can't tell renamed/removed apart from "we just
    // don't know", so we deliberately suppress the hint to avoid a
    // false positive on older call-sites.
    expect(
      screen.queryByTestId("bookings-template-filter-missing-hint"),
    ).toBeNull();
  });

  it("clicking the template suffix doesn't bubble up to open the booking", () => {
    const bookings: AdminBooking[] = [
      makeBooking({
        id: "bk-rebook",
        serviceTimeline: [emailEntry("Sent rebook link")],
      }),
    ];
    let opened: string | null = null;
    render(
      <Harness
        bookings={bookings}
        onOpen={(id) => {
          opened = id;
        }}
      />,
    );

    fireEvent.click(
      screen.getByTestId("bookings-row-last-attempt-template"),
    );
    expect(opened).toBeNull();
    expect(
      screen.getByTestId("bookings-template-filter-chip"),
    ).toBeInTheDocument();
  });
});
