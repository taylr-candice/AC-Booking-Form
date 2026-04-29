// @vitest-environment happy-dom

/**
 * End-to-end regression for the bulk Log call / Log email actions on
 * the Awaiting-coordination queue.
 *
 * The unit-level tests for these affordances
 * (`AwaitingCoordinationView.bulkLogCall.test.tsx` and
 * `.bulkLogEmail.test.tsx`) only assert the view-level callback shape —
 * they hand-stub `onBulkLogCall` / `onBulkLogEmail` and check the ids /
 * outcome / subject / note that get passed in. The actual timeline
 * entry shape (`kind: "call" | "email"`, `status: "logged_call" |
 * "logged_email"`, the trimmed-subject label format, the optional note
 * row) is enforced inside `AdminApp.bulkLogCall` /
 * `AdminApp.bulkLogEmail` and was previously only protected by
 * TypeScript types.
 *
 * This file drives the full flow against the real `<AdminApp />`
 * shell — navigate to the queue, multi-select rows, fire the bulk
 * action, then open one of the affected bookings and inspect the
 * rendered timeline — so a future refactor of the AdminApp handlers
 * can't quietly change what lands in the audit trail.
 *
 * What we lock in:
 *   1. Bulk Log call appends a `kind: "call"` entry to every selected
 *      row, rendered in BookingDetail with the Phone marker, the
 *      "Logged call · <Outcome>" label, and the trimmed shared note
 *      beneath it. The `lastContactedAt` stamp is reflected in the
 *      Awaiting-coordination "last contact" cell.
 *   2. Bulk Log email is the same shape on the email channel —
 *      `kind: "email"` entry with the Mail marker, "Logged email ·
 *      <Subject>" label, optional shared note, and a fresh
 *      `lastContactedAt` stamp.
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
 * Two seeded coordination bookings that both start with
 * `lastContactedAt: null` (never chased) and `serviceTimeline.length
 * === 1` ("Awaiting … coordination" entry). Picking these gives us a
 * deterministic before/after — the bulk action should flip the
 * "last contact" cell from "never contacted" to "last contact just
 * now" and append a single new entry as `timeline-entry-1` on each.
 *
 * - bk-1038 → unit u6 (Marcus Holloway booking, awaiting tenant)
 * - bk-1044 → unit u-marine-04 (Mateo Alvarez booking, awaiting tenant)
 */
const ROW_A = "bk-1038";
const ROW_B = "bk-1044";

function gotoAwaitingCoordination() {
  fireEvent.click(screen.getByRole("button", { name: "Awaiting coordination" }));
}

function selectRow(bookingId: string) {
  fireEvent.click(screen.getByTestId(`checkbox-coordination-row-${bookingId}`));
}

function openBookingRow(bookingId: string) {
  // The `<tr>` is the clickable element — its aria-label is
  // `Open booking <id> for <customerName>`. We don't care about the
  // customer name, so match by id only.
  const row = screen.getByLabelText(new RegExp(`Open booking ${bookingId} `));
  fireEvent.click(row);
}

describe("AwaitingCoordinationView · bulk Log call/email · timeline e2e", () => {
  it("bulk Log call appends a typed call entry visible in the affected booking's timeline", () => {
    render(<AdminApp />);
    gotoAwaitingCoordination();

    // Sanity: both rows start as "never contacted" so we can later
    // assert the bulk action flipped them to "last contact just now".
    const rowABefore = screen.getByLabelText(
      new RegExp(`Open booking ${ROW_A} `),
    );
    const rowBBefore = screen.getByLabelText(
      new RegExp(`Open booking ${ROW_B} `),
    );
    expect(within(rowABefore).getByText(/never contacted/)).toBeTruthy();
    expect(within(rowBBefore).getByText(/never contacted/)).toBeTruthy();

    selectRow(ROW_A);
    selectRow(ROW_B);

    // Open the bulk Log call form, pick the "Spoke to them" outcome,
    // and supply a shared note with surrounding whitespace so we can
    // also confirm the AdminApp handler trims it before the timeline
    // entry is built.
    fireEvent.click(screen.getByTestId("button-bulk-log-call"));
    fireEvent.change(screen.getByTestId("select-bulk-call-outcome"), {
      target: { value: "spoke" },
    });
    const sharedCallNote = "Confirmed Wed afternoon access";
    fireEvent.change(screen.getByTestId("input-bulk-call-note"), {
      target: { value: `   ${sharedCallNote}   ` },
    });
    fireEvent.click(screen.getByTestId("button-bulk-confirm-log-call"));

    // Action bar collapses (selection cleared) and the "last contact"
    // cell on both rows now reads "just now" — proves the
    // `lastContactedAt` stamp threaded through to the queue cell.
    expect(screen.queryByTestId("bulk-action-bar-coordination")).toBeNull();
    const rowAAfter = screen.getByLabelText(
      new RegExp(`Open booking ${ROW_A} `),
    );
    const rowBAfter = screen.getByLabelText(
      new RegExp(`Open booking ${ROW_B} `),
    );
    expect(within(rowAAfter).getByText(/last contact just now/)).toBeTruthy();
    expect(within(rowBAfter).getByText(/last contact just now/)).toBeTruthy();
    // The "Last attempt: …" helper line on the queue cell is sourced
    // from `latestCoordinationAttempt`, which parses the entry label
    // back into structure — a fresh "spoke" attempt should surface
    // here too.
    expect(
      within(rowAAfter).getByTestId("coordinating-with-last-attempt").textContent,
    ).toMatch(/Last attempt:.*spoke/);

    // Drill into ROW_A and inspect the Service-timeline entry that
    // landed via the bulk action. Both seed rows start with one
    // "Awaiting … coordination" entry, so the new entry is at
    // `timeline-entry-1`.
    openBookingRow(ROW_A);

    const newEntry = within(screen.getByTestId("timeline-entry-1"));
    // The marker uses a Phone icon with the "Logged phone call" title;
    // the email marker (title "Logged email") must not be present.
    expect(newEntry.getByTitle("Logged phone call")).toBeTruthy();
    expect(newEntry.queryByTitle("Logged email")).toBeNull();
    // Label encodes the chosen outcome, note is the trimmed shared
    // note (without the surrounding whitespace we typed).
    expect(newEntry.getByText("Logged call · Spoke to them")).toBeTruthy();
    expect(newEntry.getByText(sharedCallNote)).toBeTruthy();
    // The trailing timestamp footer is stamped by the handler — we
    // don't assert the exact "at" but we do confirm the admin-user
    // attribution made it through, which fixes who shows up in the
    // audit trail.
    expect(newEntry.getByText(/Mia \(admin\)/)).toBeTruthy();
  });

  it("bulk Log email appends a typed email entry visible in the affected booking's timeline", () => {
    render(<AdminApp />);
    gotoAwaitingCoordination();

    selectRow(ROW_A);
    selectRow(ROW_B);

    fireEvent.click(screen.getByTestId("button-bulk-log-email"));
    const subject = "Booking access — please confirm window";
    const sharedEmailNote = "Sent rebook link + parcel-locker instructions";
    // Pad both fields with whitespace so we also confirm the AdminApp
    // handler trims subject + note before the timeline entry is built.
    fireEvent.change(screen.getByTestId("input-bulk-email-subject"), {
      target: { value: `  ${subject}  ` },
    });
    fireEvent.change(screen.getByTestId("input-bulk-email-note"), {
      target: { value: `  ${sharedEmailNote}  ` },
    });
    fireEvent.click(screen.getByTestId("button-bulk-confirm-log-email"));

    expect(screen.queryByTestId("bulk-action-bar-coordination")).toBeNull();
    const rowAAfter = screen.getByLabelText(
      new RegExp(`Open booking ${ROW_A} `),
    );
    const rowBAfter = screen.getByLabelText(
      new RegExp(`Open booking ${ROW_B} `),
    );
    expect(within(rowAAfter).getByText(/last contact just now/)).toBeTruthy();
    expect(within(rowBAfter).getByText(/last contact just now/)).toBeTruthy();
    // "Last attempt: email · "<subject>"" is the format produced by
    // `latestCoordinationAttempt` for email entries.
    expect(
      within(rowBAfter).getByTestId("coordinating-with-last-attempt").textContent,
    ).toMatch(/Last attempt:\s*email/);

    openBookingRow(ROW_B);

    const newEntry = within(screen.getByTestId("timeline-entry-1"));
    expect(newEntry.getByTitle("Logged email")).toBeTruthy();
    expect(newEntry.queryByTitle("Logged phone call")).toBeNull();
    // Label is "Logged email · <trimmed subject>" — the leading /
    // trailing whitespace from the input is gone.
    expect(newEntry.getByText(`Logged email · ${subject}`)).toBeTruthy();
    expect(newEntry.getByText(sharedEmailNote)).toBeTruthy();
    expect(newEntry.getByText(/Mia \(admin\)/)).toBeTruthy();
  });
});
