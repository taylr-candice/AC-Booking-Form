// @vitest-environment happy-dom

/**
 * Regression test for the bulk "Log email" action on the Awaiting-
 * coordination queue.
 *
 * Mirror of the bulk "Log call" affordance — the email channel needs
 * the same shape so ops can fire a templated email-out across a batch
 * (e.g. "Sent rebook link to all 6 stalled tenants") without dropping
 * into each booking one at a time.
 *
 * The bulk affordance is structured:
 *   - The action bar exposes both "Log call" and "Log email" triggers
 *     when one or more rows are selected.
 *   - "Log email" expansion mirrors the per-row `LogEmailForm`: a
 *     subject input + optional shared note + Save / Cancel.
 *   - Submitting fires `onBulkLogEmail(ids, subject, note)` with
 *     exactly the rows the admin selected. The view passes the raw
 *     subject / note straight through; the AdminApp handler trims
 *     them before they hit the timeline.
 *   - The ids are then used by `AdminApp.bulkLogEmail` to append a
 *     typed `kind: "email"` / `status: "logged_email"` entry to every
 *     selected booking — same shape as the per-row
 *     `BookingDetail.logEmail()` so timeline entries stay
 *     interchangeable.
 *
 * What we lock in here:
 *   1. With both bulk handlers wired, both triggers are present.
 *   2. The "Log call" and "Log email" forms are mutually exclusive —
 *      opening one collapses the other so the legacy single-form
 *      bulk path can't slip back in.
 *   3. Submitting the email form calls `onBulkLogEmail` with the
 *      ids, subject, and note (raw — trimming happens in AdminApp).
 *   4. The `bulkLogEmail` AdminApp handler shape produces a typed
 *      `kind: "email"` / `status: "logged_email"` entry whose label
 *      encodes the trimmed subject and whose `note` (if present) is
 *      the trimmed shared note. The legacy "Marked as chased" /
 *      generic entry shape is no longer produced anywhere.
 *   5. Selection is cleared after submit so the bar collapses.
 *   6. Cancel collapses the form without firing onBulkLogEmail and
 *      leaves the selection intact.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applyBulkLogEmail,
  buildBulkLogEmailEntry,
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
const NO_DEFAULT_EMAIL_TEMPLATES = EMAIL_TEMPLATES.map(
  ({ isDefault: _isDefault, ...t }) => t,
);

function Harness({
  bookings,
  onBulkLogCall,
  onBulkLogEmail,
}: {
  bookings: AdminBooking[];
  onBulkLogCall?: (
    ids: string[],
    outcome: "no_answer" | "spoke" | "voicemail",
    note: string,
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
      emailTemplates={NO_DEFAULT_EMAIL_TEMPLATES}
    />
  );
}

describe("AwaitingCoordinationView · bulk log email", () => {
  it("with both handlers wired, both triggers are present and mutually exclusive", () => {
    const onBulkLogCall = vi.fn();
    const onBulkLogEmail = vi.fn();
    render(
      <Harness
        bookings={[
          makeBooking({ id: "bk-1", unitId: "u1" }),
          makeBooking({ id: "bk-2", unitId: "u2" }),
        ]}
        onBulkLogCall={onBulkLogCall}
        onBulkLogEmail={onBulkLogEmail}
      />,
    );

    fireEvent.click(screen.getByTestId("checkbox-coordination-row-bk-1"));

    // Both triggers should be in the action bar.
    const callTrigger = screen.getByTestId("button-bulk-log-call");
    const emailTrigger = screen.getByTestId("button-bulk-log-email");
    expect(callTrigger.textContent).toMatch(/log call/i);
    expect(emailTrigger.textContent).toMatch(/log email/i);

    // Open Log email — its form mounts, the call form does not.
    fireEvent.click(emailTrigger);
    expect(screen.getByTestId("bulk-log-email-form")).toBeTruthy();
    expect(screen.queryByTestId("bulk-log-call-form")).toBeNull();

    // Switching to Log call collapses the email form so only one
    // panel ever floats above the pill at a time. This guards
    // against the legacy single-form bulk path from slipping back
    // in (i.e. the bulk bar should never grow two competing forms
    // that both write to the timeline).
    fireEvent.click(callTrigger);
    expect(screen.getByTestId("bulk-log-call-form")).toBeTruthy();
    expect(screen.queryByTestId("bulk-log-email-form")).toBeNull();

    // And back the other way — switching back to Log email closes
    // the call form. Same rule, opposite direction.
    fireEvent.click(emailTrigger);
    expect(screen.getByTestId("bulk-log-email-form")).toBeTruthy();
    expect(screen.queryByTestId("bulk-log-call-form")).toBeNull();
  });

  it("submitting the bulk email form fires onBulkLogEmail with the ids, subject, and note", () => {
    const onBulkLogEmail = vi.fn();
    const bookings = [
      makeBooking({ id: "bk-1", unitId: "u1" }),
      makeBooking({ id: "bk-2", unitId: "u2" }),
      makeBooking({ id: "bk-3", unitId: "u3" }),
    ];
    render(<Harness bookings={bookings} onBulkLogEmail={onBulkLogEmail} />);

    // Pick two of the three rows.
    fireEvent.click(screen.getByTestId("checkbox-coordination-row-bk-1"));
    fireEvent.click(screen.getByTestId("checkbox-coordination-row-bk-3"));

    // The form is collapsed by default — opening it should reveal
    // the subject input + shared note input.
    expect(screen.queryByTestId("bulk-log-email-form")).toBeNull();
    fireEvent.click(screen.getByTestId("button-bulk-log-email"));
    expect(screen.getByTestId("bulk-log-email-form")).toBeTruthy();

    fireEvent.change(screen.getByTestId("input-bulk-email-subject"), {
      target: { value: "  Booking access — please confirm window  " },
    });
    fireEvent.change(screen.getByTestId("input-bulk-email-note"), {
      target: { value: "  Sent rebook link to all stalled tenants  " },
    });
    fireEvent.click(screen.getByTestId("button-bulk-confirm-log-email"));

    expect(onBulkLogEmail).toHaveBeenCalledTimes(1);
    const [ids, subject, note, templateLabel] = onBulkLogEmail.mock.calls[0];
    expect(new Set(ids)).toEqual(new Set(["bk-1", "bk-3"]));
    // The view passes the raw subject / note straight through; the
    // AdminApp handler trims them before stamping the timeline.
    // We assert the raw values here so the contract between the
    // two stays explicit.
    expect(subject).toBe("  Booking access — please confirm window  ");
    expect(note).toBe("  Sent rebook link to all stalled tenants  ");
    // No template was picked (the dropdown defaults to Custom…), so
    // the view reports the canonical "Custom" label up to AdminApp
    // — which the toast surfaces so ops can confirm the batch was
    // sent free-text rather than from a saved preset.
    expect(templateLabel).toBe("Custom");

    // Selection is cleared after submit so the bar (and form) collapse.
    expect(screen.queryByTestId("bulk-action-bar-coordination")).toBeNull();
    expect(screen.queryByTestId("bulk-log-email-form")).toBeNull();
  });

  it("the optional note can be empty — onBulkLogEmail is still fired with the chosen subject", () => {
    const onBulkLogEmail = vi.fn();
    render(
      <Harness
        bookings={[makeBooking({ id: "bk-only", unitId: "u1" })]}
        onBulkLogEmail={onBulkLogEmail}
      />,
    );

    fireEvent.click(screen.getByTestId("checkbox-coordination-row-bk-only"));
    fireEvent.click(screen.getByTestId("button-bulk-log-email"));
    fireEvent.change(screen.getByTestId("input-bulk-email-subject"), {
      target: { value: "Quick nudge" },
    });
    // Submit without touching the note input.
    fireEvent.click(screen.getByTestId("button-bulk-confirm-log-email"));

    expect(onBulkLogEmail).toHaveBeenCalledTimes(1);
    const [ids, subject, note, templateLabel] = onBulkLogEmail.mock.calls[0];
    expect(ids).toEqual(["bk-only"]);
    expect(subject).toBe("Quick nudge");
    expect(note).toBe("");
    expect(templateLabel).toBe("Custom");
  });

  it("picking a saved template prefills the subject + note inputs and reports the template name to onBulkLogEmail", () => {
    const onBulkLogEmail = vi.fn();
    const tpl = EMAIL_TEMPLATES[0];
    render(
      <Harness
        bookings={[makeBooking({ id: "bk-tpl", unitId: "u1" })]}
        onBulkLogEmail={onBulkLogEmail}
      />,
    );

    fireEvent.click(screen.getByTestId("checkbox-coordination-row-bk-tpl"));
    fireEvent.click(screen.getByTestId("button-bulk-log-email"));

    // Form opens with the dropdown on Custom… so the inputs start
    // empty — matches the historical free-text behaviour for
    // anyone who didn't ask for a template.
    const subjectInput = screen.getByTestId(
      "input-bulk-email-subject",
    ) as HTMLInputElement;
    const noteInput = screen.getByTestId(
      "input-bulk-email-note",
    ) as HTMLTextAreaElement;
    expect(subjectInput.value).toBe("");
    expect(noteInput.value).toBe("");

    // Pick the first seeded template — both inputs should snap to
    // the template's preset values.
    fireEvent.change(screen.getByTestId("select-bulk-email-template"), {
      target: { value: tpl.id },
    });
    expect(subjectInput.value).toBe(tpl.subject);
    expect(noteInput.value).toBe(tpl.note);

    // Inputs stay editable so ops can tweak per batch — make a small
    // edit to the subject and ensure it survives submit.
    fireEvent.change(subjectInput, { target: { value: `${tpl.subject} (Bldg A)` } });

    fireEvent.click(screen.getByTestId("button-bulk-confirm-log-email"));

    expect(onBulkLogEmail).toHaveBeenCalledTimes(1);
    const [ids, subject, note, templateLabel] = onBulkLogEmail.mock.calls[0];
    expect(ids).toEqual(["bk-tpl"]);
    expect(subject).toBe(`${tpl.subject} (Bldg A)`);
    expect(note).toBe(tpl.note);
    // The template's display name (not its id) flows up so the
    // AdminApp toast can confirm which preset landed across the
    // batch.
    expect(templateLabel).toBe(tpl.name);
  });

  it("switching from a template back to Custom… clears both inputs", () => {
    const onBulkLogEmail = vi.fn();
    const tpl = EMAIL_TEMPLATES[1] ?? EMAIL_TEMPLATES[0];
    render(
      <Harness
        bookings={[makeBooking({ id: "bk-flip", unitId: "u1" })]}
        onBulkLogEmail={onBulkLogEmail}
      />,
    );

    fireEvent.click(screen.getByTestId("checkbox-coordination-row-bk-flip"));
    fireEvent.click(screen.getByTestId("button-bulk-log-email"));
    fireEvent.change(screen.getByTestId("select-bulk-email-template"), {
      target: { value: tpl.id },
    });

    const subjectInput = screen.getByTestId(
      "input-bulk-email-subject",
    ) as HTMLInputElement;
    const noteInput = screen.getByTestId(
      "input-bulk-email-note",
    ) as HTMLTextAreaElement;
    expect(subjectInput.value).toBe(tpl.subject);
    expect(noteInput.value).toBe(tpl.note);

    // Flip back to Custom… — the historical free-text entry mode —
    // and both inputs should be wiped so ops aren't left typing on
    // top of the previous preset.
    fireEvent.change(screen.getByTestId("select-bulk-email-template"), {
      target: { value: "custom" },
    });
    expect(subjectInput.value).toBe("");
    expect(noteInput.value).toBe("");
  });

  it("Cancel collapses the form without firing onBulkLogEmail and keeps the selection", () => {
    const onBulkLogEmail = vi.fn();
    render(
      <Harness
        bookings={[makeBooking({ id: "bk-cancel", unitId: "u1" })]}
        onBulkLogEmail={onBulkLogEmail}
      />,
    );

    fireEvent.click(screen.getByTestId("checkbox-coordination-row-bk-cancel"));
    fireEvent.click(screen.getByTestId("button-bulk-log-email"));
    expect(screen.getByTestId("bulk-log-email-form")).toBeTruthy();

    fireEvent.click(screen.getByTestId("button-bulk-cancel-log-email"));
    expect(screen.queryByTestId("bulk-log-email-form")).toBeNull();
    expect(onBulkLogEmail).not.toHaveBeenCalled();

    // The selection is preserved — Cancel only closes the form, not
    // the bar — so ops can re-open it without re-checking rows.
    expect(screen.getByTestId("bulk-action-bar-coordination")).toBeTruthy();
  });
});

/**
 * Direct unit coverage for the AdminApp-level handler shape. The view
 * test above only locks in the callback contract (ids/subject/note);
 * these tests assert the exact `TimelineEntry` written into each
 * selected booking when `AdminApp.bulkLogEmail` runs. The handler is
 * a thin wrapper around {@link applyBulkLogEmail}, so we exercise the
 * helper directly to:
 *
 *   - lock in the typed `kind: "email"` / `status: "logged_email"`
 *     entry shape (so the timeline icon / status filtering keeps
 *     working),
 *   - lock in the trimmed-subject label format (`"Logged email · …"`
 *     when present, plain `"Logged email"` when blank),
 *   - lock in the trimmed-note shape (`note` field present only when
 *     non-empty), matching the per-row `BookingDetail.logEmail`,
 *   - guarantee no legacy generic bulk-chase entry (label
 *     `"Marked as chased"` with no `kind`) can ever land,
 *   - guarantee `lastContactedAt` is stamped on every selected row
 *     and the live demo row is silently skipped.
 */
describe("AdminApp · bulkLogEmail entry shape", () => {
  function timelineBooking(id: string, extras: string[] = []): AdminBooking {
    return makeBooking({
      id,
      unitId: "u1",
      // Preserve a couple of pre-existing entries so we can assert the
      // bulk action appends rather than replaces.
      serviceTimeline: extras.map<TimelineEntry>((label, i) => ({
        status: "scheduled",
        label,
        at: `Day ${i + 1}`,
        by: "System",
      })),
    });
  }

  it("buildBulkLogEmailEntry produces the typed email shape with the trimmed subject + note", () => {
    const entry = buildBulkLogEmailEntry({
      subject: "  Booking access — please confirm window  ",
      note: "  Sent rebook link to all stalled tenants  ",
    });
    expect(entry).toEqual({
      kind: "email",
      status: "logged_email",
      label: "Logged email · Booking access — please confirm window",
      at: "Just now",
      by: "Mia (admin)",
      note: "Sent rebook link to all stalled tenants",
    });
  });

  it("buildBulkLogEmailEntry omits the note field entirely when the trimmed note is empty", () => {
    const entry = buildBulkLogEmailEntry({
      subject: "Quick nudge",
      note: "   ",
    });
    expect(entry).toEqual({
      kind: "email",
      status: "logged_email",
      label: "Logged email · Quick nudge",
      at: "Just now",
      by: "Mia (admin)",
    });
    expect("note" in entry).toBe(false);
  });

  it("buildBulkLogEmailEntry falls back to a plain 'Logged email' label when the subject is blank", () => {
    const entry = buildBulkLogEmailEntry({ subject: "   ", note: "" });
    expect(entry.label).toBe("Logged email");
  });

  it("buildBulkLogEmailEntry persists a non-Custom templateLabel onto the entry (Task #138)", () => {
    const entry = buildBulkLogEmailEntry({
      subject: "Quick nudge — please confirm",
      note: "",
      templateLabel: "  Sent rebook link  ",
    });
    // Trimmed and persisted so the timeline can render a
    // `Template: Sent rebook link` chip beneath the entry.
    expect(entry.templateLabel).toBe("Sent rebook link");
  });

  it("buildBulkLogEmailEntry omits templateLabel for Custom / blank picks (Task #138)", () => {
    // The free-text Custom… pick — no chip needed because the
    // free-text subject already tells the audit story.
    const customEntry = buildBulkLogEmailEntry({
      subject: "Free-text subject",
      note: "",
      templateLabel: "Custom",
    });
    expect("templateLabel" in customEntry).toBe(false);

    // Trimmed-empty / case-variant of the sentinel must also collapse
    // to "no template" so a future relabel of the dropdown option
    // doesn't accidentally surface `Template: custom` chips.
    const blankEntry = buildBulkLogEmailEntry({
      subject: "Subject",
      note: "",
      templateLabel: "  ",
    });
    expect("templateLabel" in blankEntry).toBe(false);
    const lowerEntry = buildBulkLogEmailEntry({
      subject: "Subject",
      note: "",
      templateLabel: "  custom  ",
    });
    expect("templateLabel" in lowerEntry).toBe(false);
  });

  it("applyBulkLogEmail appends the typed entry to every selected booking and stamps lastContactedAt", () => {
    const bookings: AdminBooking[] = [
      timelineBooking("bk-1", ["Coordination requested"]),
      timelineBooking("bk-2"),
      timelineBooking("bk-3", ["Coordination requested"]),
    ];
    const nowIso = "2026-04-29T10:00:00.000Z";

    const next = applyBulkLogEmail(
      bookings,
      ["bk-1", "bk-3"],
      "Booking access — please confirm window",
      "Sent rebook link",
      nowIso,
    );

    const bk1 = next.find((b) => b.id === "bk-1")!;
    const bk2 = next.find((b) => b.id === "bk-2")!;
    const bk3 = next.find((b) => b.id === "bk-3")!;

    // Selected rows: timeline grew by exactly one typed email entry,
    // pre-existing entries are still there, and lastContactedAt is
    // stamped to nowIso.
    for (const b of [bk1, bk3]) {
      expect(b.lastContactedAt).toBe(nowIso);
      expect(b.serviceTimeline).toHaveLength(2);
      expect(b.serviceTimeline.at(-1)).toEqual({
        kind: "email",
        status: "logged_email",
        label: "Logged email · Booking access — please confirm window",
        at: "Just now",
        by: "Mia (admin)",
        // Bulk emails inherit the caller-supplied `nowIso` as their
        // structured timestamp so the Bookings list / coordination
        // queue can render the "· Xh ago" recency suffix off the
        // entry itself rather than the row-level lastContactedAt.
        loggedAt: nowIso,
        note: "Sent rebook link",
      });
    }

    // Unselected row is untouched — no timeline mutation, no
    // lastContactedAt stamp.
    expect(bk2.lastContactedAt).toBeNull();
    expect(bk2.serviceTimeline).toHaveLength(0);
  });

  it("applyBulkLogEmail never produces the legacy generic 'Marked as chased' entry shape", () => {
    const bookings: AdminBooking[] = [timelineBooking("bk-1")];
    const next = applyBulkLogEmail(
      bookings,
      ["bk-1"],
      "Whatever subject",
      "Whatever note",
      "2026-04-29T10:00:00.000Z",
    );
    const newEntries = next[0].serviceTimeline;
    for (const entry of newEntries) {
      // The legacy bulk affordance used to append an untyped entry
      // with a free-text "Marked as chased" label and no `kind`. The
      // new bulk path must never reproduce that shape — every entry
      // it writes carries `kind: "email"` and a `Logged email · …`
      // (or plain `Logged email`) label.
      expect(entry.label).not.toMatch(/marked as chased/i);
      expect(entry.kind).toBe("email");
      expect(entry.status).toBe("logged_email");
    }
  });

  it("applyBulkLogEmail silently skips the live demo row even when its id is supplied", () => {
    const live = makeBooking({
      id: "bk-live",
      unitId: "u1",
      lastContactedAt: null,
    });
    const real = timelineBooking("bk-real");
    const next = applyBulkLogEmail(
      [live, real],
      ["bk-live", "bk-real"],
      "Subject",
      "",
      "2026-04-29T10:00:00.000Z",
    );
    const liveAfter = next.find((b) => b.id === "bk-live")!;
    const realAfter = next.find((b) => b.id === "bk-real")!;
    // Live row stays untouched (mockup mirrors the customer's
    // session — admin handler must never write to it).
    expect(liveAfter).toBe(live);
    expect(liveAfter.serviceTimeline).toHaveLength(0);
    expect(liveAfter.lastContactedAt).toBeNull();
    // Real row gets the typed email entry as expected.
    expect(realAfter.serviceTimeline.at(-1)?.kind).toBe("email");
    expect(realAfter.serviceTimeline.at(-1)?.status).toBe("logged_email");
  });

  it("applyBulkLogEmail forwards a non-Custom templateLabel onto every selected timeline entry (Task #138)", () => {
    const bookings: AdminBooking[] = [
      timelineBooking("bk-a"),
      timelineBooking("bk-b"),
    ];
    const next = applyBulkLogEmail(
      bookings,
      ["bk-a", "bk-b"],
      "Booking access — please confirm window",
      "",
      "2026-04-29T10:00:00.000Z",
      undefined,
      "Sent rebook link",
    );
    for (const id of ["bk-a", "bk-b"] as const) {
      const tail = next.find((b) => b.id === id)!.serviceTimeline.at(-1)!;
      expect(tail.kind).toBe("email");
      expect(tail.templateLabel).toBe("Sent rebook link");
    }
  });

  it("applyBulkLogEmail omits templateLabel on the entry for Custom picks (Task #138)", () => {
    const bookings: AdminBooking[] = [timelineBooking("bk-c")];
    const next = applyBulkLogEmail(
      bookings,
      ["bk-c"],
      "Free-text subject",
      "",
      "2026-04-29T10:00:00.000Z",
      undefined,
      "Custom",
    );
    const tail = next[0].serviceTimeline.at(-1)!;
    expect(tail.kind).toBe("email");
    expect("templateLabel" in tail).toBe(false);
  });

  it("applyBulkLogEmail returns the bookings unchanged when no ids are supplied", () => {
    const bookings: AdminBooking[] = [timelineBooking("bk-1")];
    const next = applyBulkLogEmail(
      bookings,
      [],
      "ignored",
      "ignored",
      "2026-04-29T10:00:00.000Z",
    );
    expect(next).toEqual(bookings);
  });
});
