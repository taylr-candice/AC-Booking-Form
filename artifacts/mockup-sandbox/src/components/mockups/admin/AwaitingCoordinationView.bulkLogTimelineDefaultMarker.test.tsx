// @vitest-environment happy-dom

/**
 * E2e regression for the Default-marker pill (Task #181) flowing
 * through the bulk Log call / Log email path on the Awaiting-
 * coordination queue, in addition to the per-row writers covered by
 * `BookingDetail.timelineDefaultMarker.test.tsx`. Mirror of the per-
 * row test file's done-criteria, exercised via the real `<AdminApp />`
 * shell:
 *
 *   - `bulkLogCall` (inline entry build) and
 *   - `bulkLogEmail` → `applyBulkLogEmail` → `buildBulkLogEmailEntry`
 *
 * For each channel:
 *   1. Bulk-logging via the seeded *default* template surfaces the
 *      amber Default pill on the new entry in every affected booking.
 *   2. Bulk-logging via a *non-default* template renders the template
 *      chip alone — no Default pill.
 *
 * Custom… picks are already covered by the per-row file (the writer
 * shape is identical).
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

const ROW_A = "bk-1038";
const ROW_B = "bk-1044";

function gotoAwaitingCoordination() {
  fireEvent.click(screen.getByRole("button", { name: "Awaiting coordination" }));
}

function selectRow(bookingId: string) {
  fireEvent.click(screen.getByTestId(`checkbox-coordination-row-${bookingId}`));
}

function openBookingRow(bookingId: string) {
  const row = screen.getByLabelText(new RegExp(`Open booking ${bookingId} `));
  fireEvent.click(row);
}

function backToCoordination() {
  // Detail screen has a "Back to list" affordance; clicking it
  // returns us to whatever list we came from. Then re-navigate to
  // the Awaiting-coordination view to reselect rows for the next
  // assertion within the same test.
  fireEvent.click(screen.getByRole("button", { name: /Back to list/ }));
  gotoAwaitingCoordination();
}

describe("AwaitingCoordinationView · bulk Log call/email · Default-marker timeline e2e (Task #181)", () => {
  it("bulk-logging a call via the seeded default Call template surfaces the Default pill on the new timeline entry", () => {
    render(<AdminApp />);
    gotoAwaitingCoordination();

    selectRow(ROW_A);
    selectRow(ROW_B);

    fireEvent.click(screen.getByTestId("button-bulk-log-call"));
    // The bulk Log-call form preselects the seeded default Call
    // template ("No answer — left voicemail"). Submit straight away
    // so the path under test is the default-template path.
    const tplSelect = screen.getByTestId(
      "select-bulk-call-template",
    ) as HTMLSelectElement;
    const pickedLabel = tplSelect.selectedOptions[0]!.text.replace(
      / \(default\)$/,
      "",
    );
    fireEvent.click(screen.getByTestId("button-bulk-confirm-log-call"));

    openBookingRow(ROW_A);
    const newEntryA = within(screen.getByTestId("timeline-entry-1"));
    expect(newEntryA.getByText(`From template: ${pickedLabel}`)).toBeTruthy();
    const pillA = newEntryA.getByTestId("timeline-entry-1-template-default");
    expect(pillA.textContent).toContain("Default");

    backToCoordination();
    openBookingRow(ROW_B);
    const newEntryB = within(screen.getByTestId("timeline-entry-1"));
    expect(newEntryB.getByText(`From template: ${pickedLabel}`)).toBeTruthy();
    expect(
      newEntryB.getByTestId("timeline-entry-1-template-default").textContent,
    ).toContain("Default");
  });

  it("bulk-logging a call via a non-default Call template renders the template chip alone — no Default pill", () => {
    render(<AdminApp />);
    gotoAwaitingCoordination();

    selectRow(ROW_A);
    selectRow(ROW_B);

    fireEvent.click(screen.getByTestId("button-bulk-log-call"));
    const tplSelect = screen.getByTestId(
      "select-bulk-call-template",
    ) as HTMLSelectElement;
    // Switch to a different (non-default) template option. The first
    // option is `Custom…`; the seeded default is one of the templated
    // ones. Pick any option whose visible text doesn't carry the
    // ` (default)` suffix and isn't `Custom…`.
    const nonDefaultOption = Array.from(tplSelect.options).find(
      (o) => o.value !== "custom" && !/\(default\)$/.test(o.text),
    );
    expect(nonDefaultOption).toBeTruthy();
    fireEvent.change(tplSelect, { target: { value: nonDefaultOption!.value } });
    const pickedLabel = nonDefaultOption!.text;
    fireEvent.click(screen.getByTestId("button-bulk-confirm-log-call"));

    openBookingRow(ROW_A);
    const newEntryA = within(screen.getByTestId("timeline-entry-1"));
    expect(newEntryA.getByText(`From template: ${pickedLabel}`)).toBeTruthy();
    expect(
      newEntryA.queryByTestId("timeline-entry-1-template-default"),
    ).toBeNull();
  });

  it("bulk-logging an email via the seeded default Email template surfaces the Default pill on the new timeline entry", () => {
    render(<AdminApp />);
    gotoAwaitingCoordination();

    selectRow(ROW_A);
    selectRow(ROW_B);

    fireEvent.click(screen.getByTestId("button-bulk-log-email"));
    const tplSelect = screen.getByTestId(
      "select-bulk-email-template",
    ) as HTMLSelectElement;
    const pickedLabel = tplSelect.selectedOptions[0]!.text.replace(
      / \(default\)$/,
      "",
    );
    fireEvent.click(screen.getByTestId("button-bulk-confirm-log-email"));

    openBookingRow(ROW_A);
    const newEntryA = within(screen.getByTestId("timeline-entry-1"));
    expect(newEntryA.getByText(`From template: ${pickedLabel}`)).toBeTruthy();
    expect(
      newEntryA.getByTestId("timeline-entry-1-template-default").textContent,
    ).toContain("Default");

    backToCoordination();
    openBookingRow(ROW_B);
    const newEntryB = within(screen.getByTestId("timeline-entry-1"));
    expect(newEntryB.getByText(`From template: ${pickedLabel}`)).toBeTruthy();
    expect(
      newEntryB.getByTestId("timeline-entry-1-template-default").textContent,
    ).toContain("Default");
  });

  it("bulk-logging an email via a non-default Email template renders the template chip alone — no Default pill", () => {
    render(<AdminApp />);
    gotoAwaitingCoordination();

    selectRow(ROW_A);
    selectRow(ROW_B);

    fireEvent.click(screen.getByTestId("button-bulk-log-email"));
    const tplSelect = screen.getByTestId(
      "select-bulk-email-template",
    ) as HTMLSelectElement;
    const nonDefaultOption = Array.from(tplSelect.options).find(
      (o) => o.value !== "custom" && !/\(default\)$/.test(o.text),
    );
    expect(nonDefaultOption).toBeTruthy();
    fireEvent.change(tplSelect, { target: { value: nonDefaultOption!.value } });
    const pickedLabel = nonDefaultOption!.text;
    fireEvent.click(screen.getByTestId("button-bulk-confirm-log-email"));

    openBookingRow(ROW_A);
    const newEntryA = within(screen.getByTestId("timeline-entry-1"));
    expect(newEntryA.getByText(`From template: ${pickedLabel}`)).toBeTruthy();
    expect(
      newEntryA.queryByTestId("timeline-entry-1-template-default"),
    ).toBeNull();
  });
});
