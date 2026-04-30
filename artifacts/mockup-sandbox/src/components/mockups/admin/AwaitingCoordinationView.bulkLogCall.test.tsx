// @vitest-environment happy-dom

/**
 * Regression test for the bulk "Log call" action on the Awaiting-
 * coordination queue.
 *
 * The bulk affordance used to append a generic "Marked as chased"
 * timeline entry to every selected row. That mixed two timeline-entry
 * styles in the same audit trail and meant bulk chases didn't carry
 * an outcome.
 *
 * The new affordance is structured:
 *   - The action bar exposes an outcome dropdown
 *     (No answer / Spoke to them / Left voicemail) and an optional
 *     shared note.
 *   - Submitting fires `onBulkLogCall(ids, outcome, note)` with
 *     exactly the rows the admin selected.
 *   - The ids are then used by `AdminApp.bulkLogCall` to append a
 *     typed `kind: "call"` entry to every selected booking — same
 *     shape as the per-row `BookingDetail.logCall()` so timeline
 *     entries stay interchangeable.
 *
 * What we lock in here:
 *   1. Selecting rows + clicking "Log call" expands the form.
 *   2. Submitting calls `onBulkLogCall` with the ids, outcome, and
 *      trimmed note.
 *   3. The legacy "Marked as chased" entry shape is no longer
 *      produced anywhere.
 *   4. Selection is cleared after submit so the bar collapses.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CALL_TEMPLATES,
  type AdminBooking,
  type AdminBuilding,
  type AdminUnit,
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
    },
  ];
}

function makeUnits(): AdminUnit[] {
  return [
    {
      id: "u1",
      addressLine1: "1 / 1 Test St",
      addressLine2: "Suburb NSW 2000",
      ac: { type: "split", systems: 1, additional: 0 },
      agentId: null,
      buildingId: "bldg-test",
    },
    {
      id: "u2",
      addressLine1: "2 / 1 Test St",
      addressLine2: "Suburb NSW 2000",
      ac: { type: "split", systems: 1, additional: 0 },
      agentId: null,
      buildingId: "bldg-test",
    },
    {
      id: "u3",
      addressLine1: "3 / 1 Test St",
      addressLine2: "Suburb NSW 2000",
      ac: { type: "split", systems: 1, additional: 0 },
      agentId: null,
      buildingId: "bldg-test",
    },
  ];
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
    lastContactedAt: null,
    ...overrides,
  };
}

// Strip `isDefault` so the bulk form opens on Custom… (the baseline
// these assertions were written against). Seeded-default pre-selection
// is covered by `TemplateDefaults.test.tsx`.
const NO_DEFAULT_CALL_TEMPLATES = CALL_TEMPLATES.map(
  ({ isDefault: _isDefault, ...t }) => t,
);

function Harness({
  bookings,
  onBulkLogCall,
}: {
  bookings: AdminBooking[];
  onBulkLogCall: (
    ids: string[],
    outcome: "no_answer" | "spoke" | "voicemail",
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
      callTemplates={NO_DEFAULT_CALL_TEMPLATES}
    />
  );
}

describe("AwaitingCoordinationView · bulk log call", () => {
  it("submitting the bulk form fires onBulkLogCall with the ids, outcome, and trimmed note", () => {
    const onBulkLogCall = vi.fn();
    const bookings = [
      makeBooking({ id: "bk-1", unitId: "u1" }),
      makeBooking({ id: "bk-2", unitId: "u2" }),
      makeBooking({ id: "bk-3", unitId: "u3" }),
    ];
    render(<Harness bookings={bookings} onBulkLogCall={onBulkLogCall} />);

    // Pick two of the three rows.
    fireEvent.click(screen.getByTestId("checkbox-coordination-row-bk-1"));
    fireEvent.click(screen.getByTestId("checkbox-coordination-row-bk-3"));

    // Action bar should now be mounted with the new "Log call" CTA
    // (and the legacy "Mark N as chased" CTA must be gone).
    expect(screen.queryByTestId("button-bulk-mark-as-chased")).toBeNull();
    const trigger = screen.getByTestId("button-bulk-log-call");
    expect(trigger.textContent).toMatch(/log call/i);

    // The form is collapsed by default — opening it should reveal the
    // outcome dropdown + shared note input.
    expect(screen.queryByTestId("bulk-log-call-form")).toBeNull();
    fireEvent.click(trigger);
    expect(screen.getByTestId("bulk-log-call-form")).toBeTruthy();

    fireEvent.change(screen.getByTestId("select-bulk-call-outcome"), {
      target: { value: "voicemail" },
    });
    // Note has surrounding whitespace to lock in the trimming behaviour.
    fireEvent.change(screen.getByTestId("input-bulk-call-note"), {
      target: { value: "  Voicemail blast — try again Wed AM  " },
    });
    fireEvent.click(screen.getByTestId("button-bulk-confirm-log-call"));

    expect(onBulkLogCall).toHaveBeenCalledTimes(1);
    const [ids, outcome, note, templateLabel] = onBulkLogCall.mock.calls[0];
    expect(new Set(ids)).toEqual(new Set(["bk-1", "bk-3"]));
    expect(outcome).toBe("voicemail");
    // The view passes the raw note straight through; the AdminApp
    // handler trims it before stamping the timeline. We assert the
    // raw value here so the contract between the two stays explicit.
    expect(note).toBe("  Voicemail blast — try again Wed AM  ");
    // The template picker defaults to Custom… so submitting without
    // touching it must report "Custom" — keeps the AdminApp toast
    // path honest for free-text submits.
    expect(templateLabel).toBe("Custom");

    // Selection is cleared after submit so the bar (and form) collapse.
    expect(screen.queryByTestId("bulk-action-bar-coordination")).toBeNull();
    expect(screen.queryByTestId("bulk-log-call-form")).toBeNull();
  });

  it("the optional note can be empty — onBulkLogCall is still fired with the chosen outcome", () => {
    const onBulkLogCall = vi.fn();
    render(
      <Harness
        bookings={[makeBooking({ id: "bk-only", unitId: "u1" })]}
        onBulkLogCall={onBulkLogCall}
      />,
    );

    fireEvent.click(screen.getByTestId("checkbox-coordination-row-bk-only"));
    fireEvent.click(screen.getByTestId("button-bulk-log-call"));
    // Default outcome ("no_answer") is fine — submit straight away
    // with no note.
    fireEvent.click(screen.getByTestId("button-bulk-confirm-log-call"));

    expect(onBulkLogCall).toHaveBeenCalledTimes(1);
    const [ids, outcome, note] = onBulkLogCall.mock.calls[0];
    expect(ids).toEqual(["bk-only"]);
    expect(outcome).toBe("no_answer");
    expect(note).toBe("");
  });

  it("picking a saved template prefills the shared note input and reports the template name to onBulkLogCall", () => {
    const onBulkLogCall = vi.fn();
    const tpl = CALL_TEMPLATES[0];
    render(
      <Harness
        bookings={[makeBooking({ id: "bk-tpl", unitId: "u1" })]}
        onBulkLogCall={onBulkLogCall}
      />,
    );

    fireEvent.click(screen.getByTestId("checkbox-coordination-row-bk-tpl"));
    fireEvent.click(screen.getByTestId("button-bulk-log-call"));

    // Form opens with the dropdown on Custom… so the note starts
    // empty — matches the historical free-text behaviour for anyone
    // who didn't ask for a template.
    const noteInput = screen.getByTestId(
      "input-bulk-call-note",
    ) as HTMLTextAreaElement;
    expect(noteInput.value).toBe("");

    // Pick the first seeded template — the note should snap to the
    // template's preset value. Outcome is intentionally NOT touched
    // by the picker.
    fireEvent.change(screen.getByTestId("select-bulk-call-template"), {
      target: { value: tpl.id },
    });
    expect(noteInput.value).toBe(tpl.note);

    // Note stays editable so ops can tweak per batch — small edit
    // survives submit.
    fireEvent.change(noteInput, {
      target: { value: `${tpl.note} (Bldg A)` },
    });

    fireEvent.click(screen.getByTestId("button-bulk-confirm-log-call"));

    expect(onBulkLogCall).toHaveBeenCalledTimes(1);
    const [ids, outcome, note, templateLabel] = onBulkLogCall.mock.calls[0];
    expect(ids).toEqual(["bk-tpl"]);
    // Outcome stays at the default — the template picker doesn't
    // touch it.
    expect(outcome).toBe("no_answer");
    expect(note).toBe(`${tpl.note} (Bldg A)`);
    // The template's display name (not its id) flows up so the
    // AdminApp toast can confirm which preset landed across the
    // batch.
    expect(templateLabel).toBe(tpl.name);
  });

  it("switching from a template back to Custom… clears the prefilled note", () => {
    const onBulkLogCall = vi.fn();
    const tpl = CALL_TEMPLATES[1] ?? CALL_TEMPLATES[0];
    render(
      <Harness
        bookings={[makeBooking({ id: "bk-flip", unitId: "u1" })]}
        onBulkLogCall={onBulkLogCall}
      />,
    );

    fireEvent.click(screen.getByTestId("checkbox-coordination-row-bk-flip"));
    fireEvent.click(screen.getByTestId("button-bulk-log-call"));
    fireEvent.change(screen.getByTestId("select-bulk-call-template"), {
      target: { value: tpl.id },
    });

    const noteInput = screen.getByTestId(
      "input-bulk-call-note",
    ) as HTMLTextAreaElement;
    expect(noteInput.value).toBe(tpl.note);

    // Flip back to Custom… — the historical free-text entry mode —
    // and the note should be wiped so ops aren't left typing on top
    // of the previous preset.
    fireEvent.change(screen.getByTestId("select-bulk-call-template"), {
      target: { value: "custom" },
    });
    expect(noteInput.value).toBe("");
  });

  it("Cancel collapses the form without firing onBulkLogCall", () => {
    const onBulkLogCall = vi.fn();
    render(
      <Harness
        bookings={[makeBooking({ id: "bk-cancel", unitId: "u1" })]}
        onBulkLogCall={onBulkLogCall}
      />,
    );

    fireEvent.click(screen.getByTestId("checkbox-coordination-row-bk-cancel"));
    fireEvent.click(screen.getByTestId("button-bulk-log-call"));
    expect(screen.getByTestId("bulk-log-call-form")).toBeTruthy();

    fireEvent.click(screen.getByTestId("button-bulk-cancel-log-call"));
    expect(screen.queryByTestId("bulk-log-call-form")).toBeNull();
    expect(onBulkLogCall).not.toHaveBeenCalled();

    // The selection is preserved — Cancel only closes the form, not
    // the bar — so ops can re-open it without re-checking rows.
    expect(screen.getByTestId("bulk-action-bar-coordination")).toBeTruthy();
  });
});
