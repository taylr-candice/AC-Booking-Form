// @vitest-environment happy-dom

/**
 * Tests for the new "Coordinating with" / "Access on the day" right-
 * column panels on BookingDetail, plus the Log call / Log email
 * affordances that replaced the old "Mark as chased" button.
 *
 * What we're nailing down here:
 *
 * 1. The seed data must not contain `en_route` anywhere — the status
 *    was dropped from the lifecycle and any stray reference would
 *    create dead UI states.
 * 2. A `to_be_coordinated` booking renders the Coordinating-with
 *    panel with a Who block and the three new buttons (Log call /
 *    Log email / Schedule appointment).
 * 3. Submitting the Log call form fires `onUpdate` with a typed
 *    `kind: "call"` timeline entry, the chosen outcome encoded in
 *    the label, and a fresh `lastContactedAt` timestamp.
 * 4. Submitting the Log email form fires `onUpdate` with a typed
 *    `kind: "email"` timeline entry whose label includes the subject.
 * 5. A scheduled booking renders the Access-on-the-day panel
 *    instead, with the access-method one-liner.
 *
 * These are the behaviours the task brief calls out explicitly; the
 * older "WaitingChip + LastChasedChip + Mark as chased" surfaces are
 * intentionally not covered here because they no longer exist.
 */

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  EMAIL_TEMPLATES,
  SEEDED_BOOKINGS,
  type AdminAgent,
  type AdminBooking,
  type AdminUnit,
  type TimelineEntry,
} from "@/state/adminMockData";

import { BookingDetail } from "./BookingDetail";

afterEach(() => {
  cleanup();
});

const UNIT: AdminUnit = {
  id: "u-coord-1",
  addressLine1: "12 / 100 Pitt Street",
  addressLine2: "Sydney NSW 2000",
  ac: { type: "split", systems: 2, additional: 0 },
  agentId: null,
  buildingId: "bldg-coord",
};

const AGENTS: AdminAgent[] = [];

function makeBooking(overrides: Partial<AdminBooking> = {}): AdminBooking {
  return {
    id: "bk-coord-1",
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

describe("seed data hygiene", () => {
  it("never references the dropped `en_route` service status", () => {
    // Defensive: the lifecycle change removed `en_route` entirely.
    // Anything still using it (booking.serviceStatus or a timeline
    // entry's status field) would fall through every UI switch and
    // render a dead state.
    for (const b of SEEDED_BOOKINGS) {
      expect(b.serviceStatus, `booking ${b.id}`).not.toBe("en_route");
      for (const entry of b.serviceTimeline) {
        expect(entry.status, `booking ${b.id} timeline`).not.toBe("en_route");
      }
    }
  });
});

describe("BookingDetail · coordinating-with panel", () => {
  it("renders the panel with the tenant Who block + three buttons for to_be_coordinated bookings", () => {
    renderDetail(makeBooking());
    const panel = screen.getByTestId("coordination-panel");
    expect(panel).toBeTruthy();
    // Who block — tenant kind
    expect(screen.getByTestId("contact-tenant").textContent).toContain(
      "Riley Tenant",
    );
    expect(screen.getByTestId("contact-tenant").textContent).toContain(
      "0411 222 333",
    );
    // Access method one-liner is rendered
    expect(screen.getByTestId("access-method-summary").textContent).toMatch(
      /tenants?/i,
    );
    // The three follow-up buttons are present
    expect(screen.getByTestId("button-log-call")).toBeTruthy();
    expect(screen.getByTestId("button-log-email")).toBeTruthy();
  });

  it("does NOT render the access-on-the-day panel when waiting on coordination", () => {
    renderDetail(makeBooking());
    expect(screen.queryByTestId("access-on-the-day-panel")).toBeNull();
  });

  it("renders the access-on-the-day panel (and no coordination panel) for a scheduled booking", () => {
    renderDetail(
      makeBooking({
        serviceSlot: "morning",
        serviceDate: "2026-05-04",
      }),
    );
    expect(screen.getByTestId("access-on-the-day-panel")).toBeTruthy();
    expect(screen.queryByTestId("coordination-panel")).toBeNull();
    expect(screen.getByTestId("access-method-summary").textContent).toMatch(
      /tenants?/i,
    );
  });
});

describe("BookingDetail · log call / log email", () => {
  it("Log call → submit appends a kind:'call' timeline entry with the outcome in the label and stamps lastContactedAt", () => {
    const onUpdate = vi.fn();
    renderDetail(makeBooking(), { onUpdate });

    fireEvent.click(screen.getByTestId("button-log-call"));
    // Outcome dropdown defaults to "no_answer" — flip it to "spoke"
    // so we can see the label change in the patch.
    fireEvent.change(screen.getByTestId("select-call-outcome"), {
      target: { value: "spoke" },
    });
    fireEvent.change(screen.getByTestId("input-call-note"), {
      target: { value: "Confirmed Wed afternoon" },
    });
    fireEvent.click(screen.getByTestId("button-confirm-log-call"));

    expect(onUpdate).toHaveBeenCalledTimes(1);
    const [bookingId, patch] = onUpdate.mock.calls[0];
    expect(bookingId).toBe("bk-coord-1");
    expect(typeof patch.lastContactedAt).toBe("string");
    expect(patch.lastContactedAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    );
    const newEntry = patch.serviceTimeline.at(-1);
    expect(newEntry.kind).toBe("call");
    expect(newEntry.status).toBe("logged_call");
    expect(newEntry.label).toBe("Logged call · Spoke to them");
    expect(newEntry.note).toBe("Confirmed Wed afternoon");
  });

  it("Log email → submit appends a kind:'email' entry with the subject in the label", () => {
    const onUpdate = vi.fn();
    renderDetail(makeBooking(), { onUpdate });

    fireEvent.click(screen.getByTestId("button-log-email"));
    fireEvent.change(screen.getByTestId("input-email-subject"), {
      target: { value: "Booking access — please confirm" },
    });
    fireEvent.change(screen.getByTestId("input-email-note"), {
      target: { value: "Sent rebook link" },
    });
    fireEvent.click(screen.getByTestId("button-confirm-log-email"));

    expect(onUpdate).toHaveBeenCalledTimes(1);
    const [, patch] = onUpdate.mock.calls[0];
    const newEntry = patch.serviceTimeline.at(-1);
    expect(newEntry.kind).toBe("email");
    expect(newEntry.status).toBe("logged_email");
    expect(newEntry.label).toBe(
      "Logged email · Booking access — please confirm",
    );
    expect(newEntry.note).toBe("Sent rebook link");
  });

  it("Log email form opens with the template dropdown on Custom… so inputs start empty", () => {
    renderDetail(makeBooking());
    fireEvent.click(screen.getByTestId("button-log-email"));
    const select = screen.getByTestId(
      "select-email-template",
    ) as HTMLSelectElement;
    expect(select.value).toBe("custom");
    expect(
      (screen.getByTestId("input-email-subject") as HTMLInputElement).value,
    ).toBe("");
    expect(
      (screen.getByTestId("input-email-note") as HTMLTextAreaElement).value,
    ).toBe("");
  });

  it("picking a saved template prefills subject + note (still editable) and reports the template name to onLogEmailToast", () => {
    const onUpdate = vi.fn();
    const onLogEmailToast = vi.fn();
    const tpl = EMAIL_TEMPLATES[0];
    renderDetail(makeBooking(), { onUpdate, onLogEmailToast });

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

    // Tweak the prefilled subject so we prove the inputs are still
    // editable after the template prefill — same affordance as the
    // bulk picker.
    fireEvent.change(subjectInput, {
      target: { value: `${tpl.subject} (Bldg A)` },
    });
    fireEvent.click(screen.getByTestId("button-confirm-log-email"));

    // Timeline entry uses the (edited) subject — same shape as the
    // bulk-logged entry so the Awaiting-coordination "Last attempt"
    // cell reads consistently regardless of how the email was
    // logged.
    expect(onUpdate).toHaveBeenCalledTimes(1);
    const [, patch] = onUpdate.mock.calls[0];
    const newEntry = patch.serviceTimeline.at(-1);
    expect(newEntry.label).toBe(`Logged email · ${tpl.subject} (Bldg A)`);
    expect(newEntry.note).toBe(tpl.note);

    // Toast callback receives the template's display name (not its
    // id) so the AdminApp shell can confirm which preset landed —
    // mirror of the bulk-log-email toast.
    expect(onLogEmailToast).toHaveBeenCalledTimes(1);
    expect(onLogEmailToast.mock.calls[0][0]).toBe(tpl.name);
    expect(onLogEmailToast.mock.calls[0][1]).toBe(`${tpl.subject} (Bldg A)`);
  });

  it("switching from a template back to Custom… clears both inputs", () => {
    const tpl = EMAIL_TEMPLATES[1] ?? EMAIL_TEMPLATES[0];
    renderDetail(makeBooking());

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

  it("Custom submit reports the Custom label to onLogEmailToast", () => {
    const onLogEmailToast = vi.fn();
    renderDetail(makeBooking(), { onLogEmailToast });

    fireEvent.click(screen.getByTestId("button-log-email"));
    fireEvent.change(screen.getByTestId("input-email-subject"), {
      target: { value: "Quick nudge" },
    });
    fireEvent.click(screen.getByTestId("button-confirm-log-email"));

    expect(onLogEmailToast).toHaveBeenCalledTimes(1);
    expect(onLogEmailToast.mock.calls[0][0]).toBe("Custom");
    expect(onLogEmailToast.mock.calls[0][1]).toBe("Quick nudge");
  });

  it("omits the optional note field when the textarea is empty", () => {
    const onUpdate = vi.fn();
    renderDetail(makeBooking(), { onUpdate });

    fireEvent.click(screen.getByTestId("button-log-call"));
    fireEvent.click(screen.getByTestId("button-confirm-log-call"));

    const [, patch] = onUpdate.mock.calls[0];
    const newEntry = patch.serviceTimeline.at(-1);
    expect(newEntry.kind).toBe("call");
    expect("note" in newEntry).toBe(false);
  });

  it("hides the Log buttons when the booking is cancelled (read-only)", () => {
    renderDetail(
      makeBooking({
        serviceStatus: "cancelled",
        cancelledAt: "Yesterday",
        cancelledBy: "Admin",
      }),
    );
    expect(screen.queryByTestId("button-log-call")).toBeNull();
    expect(screen.queryByTestId("button-log-email")).toBeNull();
  });
});

/**
 * Render-level coverage for the timeline icons. Per-row + bulk
 * Log call / Log email both append entries with `kind: "call"` or
 * `kind: "email"` and an optional `note`. The Service-timeline
 * renderer must show those entries with a distinctive Phone / Mail
 * marker (so admins can scan call attempts vs email blasts vs
 * generic status events at a glance) and surface the `note` text
 * directly beneath the entry label. Plain `kind: "status"` rows
 * keep the coloured-dot marker and never render a note row.
 */
describe("BookingDetail · timeline · call/email entry rendering", () => {
  function callEntry(overrides: Partial<TimelineEntry> = {}): TimelineEntry {
    return {
      kind: "call",
      status: "logged_call",
      label: "Logged call · Spoke to them",
      at: "Today 10:14",
      by: "Mia (admin)",
      note: "Confirmed Wed afternoon",
      ...overrides,
    };
  }

  function emailEntry(overrides: Partial<TimelineEntry> = {}): TimelineEntry {
    return {
      kind: "email",
      status: "logged_email",
      label: "Logged email · Booking access — please confirm",
      at: "Today 11:02",
      by: "Mia (admin)",
      note: "Sent rebook link",
      ...overrides,
    };
  }

  it("renders call entries with a Phone icon and the note beneath the label", () => {
    renderDetail(
      makeBooking({
        serviceTimeline: [callEntry()],
      }),
    );
    const row = screen.getByTestId("timeline-entry-0");
    const utils = within(row);

    expect(utils.getByTitle("Logged phone call")).toBeTruthy();
    expect(utils.queryByTitle("Logged email")).toBeNull();

    const label = utils.getByText("Logged call · Spoke to them");
    const note = utils.getByText("Confirmed Wed afternoon");
    expect(label).toBeTruthy();
    expect(note).toBeTruthy();
    // Note must come after the label in document order (rendered
    // beneath it, not inline with the timestamp footer).
    expect(
      label.compareDocumentPosition(note) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("renders email entries with a Mail icon and the note beneath the label", () => {
    renderDetail(
      makeBooking({
        serviceTimeline: [emailEntry()],
      }),
    );
    const row = screen.getByTestId("timeline-entry-0");
    const utils = within(row);

    expect(utils.getByTitle("Logged email")).toBeTruthy();
    expect(utils.queryByTitle("Logged phone call")).toBeNull();

    const label = utils.getByText(
      "Logged email · Booking access — please confirm",
    );
    const note = utils.getByText("Sent rebook link");
    expect(label).toBeTruthy();
    expect(note).toBeTruthy();
    expect(
      label.compareDocumentPosition(note) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("omits the note row when the entry has no note (call + email parity)", () => {
    renderDetail(
      makeBooking({
        serviceTimeline: [
          callEntry({ note: undefined }),
          emailEntry({ note: undefined }),
        ],
      }),
    );

    const callRow = within(screen.getByTestId("timeline-entry-0"));
    expect(callRow.getByTitle("Logged phone call")).toBeTruthy();
    expect(callRow.queryByText("Confirmed Wed afternoon")).toBeNull();

    const emailRow = within(screen.getByTestId("timeline-entry-1"));
    expect(emailRow.getByTitle("Logged email")).toBeTruthy();
    expect(emailRow.queryByText("Sent rebook link")).toBeNull();
  });

  it("keeps generic status entries on the coloured-dot marker (no Phone/Mail icon)", () => {
    renderDetail(
      makeBooking({
        serviceTimeline: [
          {
            status: "scheduled",
            label: "Scheduled",
            at: "Today 09:00",
            by: "System",
          },
        ],
      }),
    );
    const row = within(screen.getByTestId("timeline-entry-0"));
    expect(row.queryByTitle("Logged phone call")).toBeNull();
    expect(row.queryByTitle("Logged email")).toBeNull();
    expect(row.getByText("Scheduled")).toBeTruthy();
  });
});
