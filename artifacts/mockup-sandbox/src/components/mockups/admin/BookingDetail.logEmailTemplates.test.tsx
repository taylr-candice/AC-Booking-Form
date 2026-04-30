// @vitest-environment happy-dom

/**
 * Regression test for the per-row "Log email" form on a booking
 * detail's Coordination card pulling its template dropdown from the
 * live `emailTemplates` prop owned by `AdminApp`.
 *
 * Mirror of `AwaitingCoordinationView.bulkLogEmail.test.tsx` —
 * the per-row form needs the same shape so the Email templates panel
 * is the single source of truth for both single- and bulk-row email
 * logging. Adding / editing / removing a template in the panel must
 * reflect in the per-row dropdown on the next render with no
 * propagation step.
 *
 * What we lock in here:
 *   1. With no `emailTemplates` prop, the dropdown defaults to the
 *      seeded `EMAIL_TEMPLATES` so the screen stays usable in
 *      isolation.
 *   2. When the prop is supplied, the dropdown renders exactly that
 *      catalog (plus the Custom… sentinel) — i.e. an empty catalog
 *      collapses to just Custom…, and a custom catalog never shows
 *      a stray seeded template.
 *   3. Picking a template prefills subject + note inputs (still
 *      editable).
 *   4. Switching back to Custom… clears both inputs.
 *   5. Submitting fires `onUpdate` with the literal subject + note
 *      embedded in the timeline entry — never a template id — so
 *      editing or removing the template later cannot rewrite the
 *      historical entry. This is the snapshot-on-use contract that
 *      keeps the audit trail immutable.
 *   6. Re-rendering the form with a mutated `emailTemplates` prop
 *      shows the new options on the next render — no propagation
 *      step required (the contract the task brief calls out).
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  EMAIL_TEMPLATES,
  type AdminAgent,
  type AdminBooking,
  type AdminUnit,
  type EmailTemplate,
} from "@/state/adminMockData";

import { BookingDetail } from "./BookingDetail";

afterEach(cleanup);

const UNIT: AdminUnit = {
  id: "u-coord-tpl",
  addressLine1: "12 / 100 Pitt Street",
  addressLine2: "Sydney NSW 2000",
  ac: { type: "split", brand: "", systems: 2, additional: 0 },
  agentId: null,
  buildingId: "bldg-coord-tpl",
};

const AGENTS: AdminAgent[] = [];

function makeBooking(overrides: Partial<AdminBooking> = {}): AdminBooking {
  return {
    id: "bk-coord-tpl",
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
    systems: 2,
    additional: 0,
    acType: "split",
    discrepancy: null,
    serviceDate: null,
    serviceSlot: "to_be_coordinated",
    paymentStatus: "paid",
    serviceStatus: "scheduled",
    totalAud: 218,
    paymentTimeline: [],
    serviceTimeline: [],
    notes: "",
    rolloutId: null,
    createdAt: "2026-04-26T09:14:00+10:00",
    lastContactedAt: null,
    ...overrides,
  };
}

function renderDetail(
  booking: AdminBooking,
  handlers: Partial<React.ComponentProps<typeof BookingDetail>> = {},
) {
  const noop = () => {};
  return render(
    <BookingDetail
      bookingId={booking.id}
      bookings={[booking]}
      units={[UNIT]}
      agents={AGENTS}
      onBack={noop}
      onUpdate={noop}
      onCancelBooking={noop}
      {...handlers}
    />,
  );
}

function selectOptionValues(select: HTMLSelectElement): string[] {
  return Array.from(select.options).map((o) => o.value);
}

describe("BookingDetail · Log email · template picker", () => {
  it("with no emailTemplates prop, the dropdown falls back to the seeded EMAIL_TEMPLATES catalog", () => {
    renderDetail(makeBooking());
    fireEvent.click(screen.getByTestId("button-log-email"));
    const select = screen.getByTestId(
      "select-email-template",
    ) as HTMLSelectElement;
    // Custom sentinel always present, then every seeded template in
    // catalog order. No extras, no drops.
    expect(selectOptionValues(select)).toEqual([
      "custom",
      ...EMAIL_TEMPLATES.map((t) => t.id),
    ]);
  });

  it("renders exactly the supplied emailTemplates catalog (plus Custom…) — empty catalog collapses to just Custom…", () => {
    const { rerender } = renderDetail(makeBooking(), { emailTemplates: [] });
    fireEvent.click(screen.getByTestId("button-log-email"));
    const empty = screen.getByTestId(
      "select-email-template",
    ) as HTMLSelectElement;
    expect(selectOptionValues(empty)).toEqual(["custom"]);

    // Swap in a custom catalog with one entry — re-render the same
    // BookingDetail tree (the form stays mounted) and confirm the
    // dropdown options reflect the new prop on the next render.
    // This is the propagation contract the task brief calls out:
    // adding / removing a template in the Email templates panel
    // must show up here without any extra plumbing.
    const onlyOne: ReadonlyArray<EmailTemplate> = [
      {
        id: "tpl-only",
        name: "Only template",
        subject: "Only subject",
        note: "Only note",
      },
    ];
    rerender(
      <BookingDetail
        bookingId="bk-coord-tpl"
        bookings={[makeBooking()]}
        units={[UNIT]}
        agents={AGENTS}
        onBack={() => {}}
        onUpdate={() => {}}
        onCancelBooking={() => {}}
        emailTemplates={onlyOne}
      />,
    );
    fireEvent.click(screen.getByTestId("button-log-email"));
    const oneTpl = screen.getByTestId(
      "select-email-template",
    ) as HTMLSelectElement;
    expect(selectOptionValues(oneTpl)).toEqual(["custom", "tpl-only"]);
  });

  it("picking a template prefills the subject + note inputs (still editable)", () => {
    const tpl: EmailTemplate = {
      id: "tpl-rebook",
      name: "Sent rebook link",
      subject: "Booking access — please pick a new window",
      note: "Sent rebook link so the tenant can grab a fresh appointment slot.",
    };
    renderDetail(makeBooking(), { emailTemplates: [tpl] });

    fireEvent.click(screen.getByTestId("button-log-email"));
    const subjectInput = screen.getByTestId(
      "input-email-subject",
    ) as HTMLInputElement;
    const noteInput = screen.getByTestId(
      "input-email-note",
    ) as HTMLTextAreaElement;
    // Form opens on Custom… so inputs start empty — matches the
    // historical free-text behaviour for anyone who didn't ask for a
    // template.
    expect(subjectInput.value).toBe("");
    expect(noteInput.value).toBe("");

    fireEvent.change(screen.getByTestId("select-email-template"), {
      target: { value: tpl.id },
    });
    expect(subjectInput.value).toBe(tpl.subject);
    expect(noteInput.value).toBe(tpl.note);

    // Inputs stay editable so the admin can tweak per booking — make
    // a small edit to the subject and ensure it sticks.
    fireEvent.change(subjectInput, {
      target: { value: `${tpl.subject} (Sam's place)` },
    });
    expect(subjectInput.value).toBe(`${tpl.subject} (Sam's place)`);
  });

  it("switching from a template back to Custom… clears both inputs", () => {
    const tpl: EmailTemplate = {
      id: "tpl-parcel",
      name: "Sent parcel-locker instructions",
      subject: "Building access — parcel-locker instructions",
      note: "Sent parcel-locker / building access instructions.",
    };
    renderDetail(makeBooking(), { emailTemplates: [tpl] });

    fireEvent.click(screen.getByTestId("button-log-email"));
    fireEvent.change(screen.getByTestId("select-email-template"), {
      target: { value: tpl.id },
    });
    const subjectInput = screen.getByTestId(
      "input-email-subject",
    ) as HTMLInputElement;
    const noteInput = screen.getByTestId(
      "input-email-note",
    ) as HTMLTextAreaElement;
    expect(subjectInput.value).toBe(tpl.subject);
    expect(noteInput.value).toBe(tpl.note);

    fireEvent.change(screen.getByTestId("select-email-template"), {
      target: { value: "custom" },
    });
    expect(subjectInput.value).toBe("");
    expect(noteInput.value).toBe("");
  });

  it("submitting after picking a template snapshots the literal subject + note onto the timeline entry — never a template id", () => {
    const onUpdate = vi.fn();
    const tpl: EmailTemplate = {
      id: "tpl-agent-intro",
      name: "Sent agent intro",
      subject: "Coordinating your AC service — quick intro",
      note: "Intro email to the managing agent with the booking summary.",
    };
    renderDetail(makeBooking(), { onUpdate, emailTemplates: [tpl] });

    fireEvent.click(screen.getByTestId("button-log-email"));
    fireEvent.change(screen.getByTestId("select-email-template"), {
      target: { value: tpl.id },
    });
    fireEvent.click(screen.getByTestId("button-confirm-log-email"));

    expect(onUpdate).toHaveBeenCalledTimes(1);
    const [bookingId, patch] = onUpdate.mock.calls[0];
    expect(bookingId).toBe("bk-coord-tpl");
    const newEntry = patch.serviceTimeline.at(-1);
    expect(newEntry.kind).toBe("email");
    expect(newEntry.status).toBe("logged_email");
    // The literal subject from the template is encoded in the entry
    // label — not the template id. This is the snapshot-on-use
    // contract: editing or removing `tpl-agent-intro` later must
    // never rewrite this historical timeline entry.
    expect(newEntry.label).toBe(`Logged email · ${tpl.subject}`);
    expect(newEntry.note).toBe(tpl.note);
    // Defensive: nothing in the patch should reference the template
    // id, so a future template rename can't leak through.
    const serialized = JSON.stringify(patch);
    expect(serialized).not.toContain(tpl.id);
  });

  it("submitting on Custom… (no template picked) preserves the historical free-text behaviour", () => {
    const onUpdate = vi.fn();
    renderDetail(makeBooking(), { onUpdate, emailTemplates: [] });

    fireEvent.click(screen.getByTestId("button-log-email"));
    fireEvent.change(screen.getByTestId("input-email-subject"), {
      target: { value: "Quick nudge" },
    });
    // Submit without touching the template dropdown or the note.
    fireEvent.click(screen.getByTestId("button-confirm-log-email"));

    expect(onUpdate).toHaveBeenCalledTimes(1);
    const [, patch] = onUpdate.mock.calls[0];
    const newEntry = patch.serviceTimeline.at(-1);
    expect(newEntry.kind).toBe("email");
    expect(newEntry.status).toBe("logged_email");
    expect(newEntry.label).toBe("Logged email · Quick nudge");
    // No note field at all when the textarea is empty — matches the
    // bulk Log-email shape and the existing per-row Log-call shape.
    expect("note" in newEntry).toBe(false);
  });
});
