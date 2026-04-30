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
  CALL_TEMPLATES,
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

  /**
   * The booking detail screen mirrors the bookings list +
   * Awaiting-coordination queue's "Last attempt: spoke · 3d ago"
   * line so the staleness signal an admin saw on the queue stays
   * visible after they click in (Task #140). The line:
   *   - Renders only when there's a typed call/email entry to point
   *     at (legacy "Mark as chased"-only bookings keep the older
   *     `last contact …` chase chip and nothing more).
   *   - Reads `fresh` (slate text) when the latest entry's
   *     `loggedAt` is younger than `LAST_ATTEMPT_STALE_HOURS`.
   *   - Flips into the amber `stale` style once that threshold is
   *     crossed — same `data-stale` boolean the queue uses, so a
   *     visual-regression test could pin both surfaces against the
   *     same attribute.
   */
  describe("Last attempt freshness line", () => {
    it("omits the line when the booking has no logged call/email entries", () => {
      renderDetail(makeBooking());
      expect(screen.queryByTestId("booking-detail-last-attempt")).toBeNull();
    });

    it("renders a fresh (slate) Last attempt line for a recent call", () => {
      const recentIso = new Date(
        Date.now() - 3 * 60 * 60 * 1000, // 3h ago — well under the 48h stale threshold
      ).toISOString();
      renderDetail(
        makeBooking({
          lastContactedAt: recentIso,
          serviceTimeline: [
            {
              kind: "call",
              status: "logged_call",
              label: "Logged call · Spoke to them",
              at: "Today",
              by: "Mia (admin)",
              loggedAt: recentIso,
            },
          ],
        }),
      );
      const line = screen.getByTestId("booking-detail-last-attempt");
      expect(line.getAttribute("data-stale")).toBe("false");
      // Driven by latestCoordinationAttempt → "spoke" label, plus a
      // recency suffix from formatAttemptRecency.
      expect(line.textContent).toMatch(/Last attempt:\s*spoke/);
      expect(line.textContent).toMatch(/ago|just now/);
    });

    it("flips into the amber stale style once the latest attempt crosses LAST_ATTEMPT_STALE_HOURS", () => {
      const staleIso = new Date(
        Date.now() - 72 * 60 * 60 * 1000, // 3d ago — past the 48h threshold
      ).toISOString();
      renderDetail(
        makeBooking({
          lastContactedAt: staleIso,
          serviceTimeline: [
            {
              kind: "email",
              status: "logged_email",
              label: "Logged email · Booking access — please confirm",
              at: "3d ago",
              by: "Mia (admin)",
              loggedAt: staleIso,
            },
          ],
        }),
      );
      const line = screen.getByTestId("booking-detail-last-attempt");
      expect(line.getAttribute("data-stale")).toBe("true");
      // Amber warning class — same hue the queue uses so the
      // staleness cue is visually identical across surfaces.
      expect(line.className).toContain("text-amber-700");
      expect(line.textContent).toMatch(/Last attempt:/);
      expect(line.textContent).toMatch(/3d ago/);
    });
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

  it("Log call form opens with the template dropdown on Custom… so the note input starts empty", () => {
    renderDetail(makeBooking());
    fireEvent.click(screen.getByTestId("button-log-call"));
    const select = screen.getByTestId(
      "select-call-template",
    ) as HTMLSelectElement;
    expect(select.value).toBe("custom");
    expect(
      (screen.getByTestId("input-call-note") as HTMLTextAreaElement).value,
    ).toBe("");
  });

  it("picking a saved call template prefills the note input (still editable) and reports the template name to onLogCallToast", () => {
    const onUpdate = vi.fn();
    const onLogCallToast = vi.fn();
    const tpl = CALL_TEMPLATES[0];
    renderDetail(makeBooking(), { onUpdate, onLogCallToast });

    fireEvent.click(screen.getByTestId("button-log-call"));
    fireEvent.change(screen.getByTestId("select-call-template"), {
      target: { value: tpl.id },
    });

    const noteInput = screen.getByTestId(
      "input-call-note",
    ) as HTMLTextAreaElement;
    expect(noteInput.value).toBe(tpl.note);

    // Note stays editable after the template prefill — small edit
    // survives submit.
    fireEvent.change(noteInput, {
      target: { value: `${tpl.note} (Bldg A)` },
    });
    fireEvent.click(screen.getByTestId("button-confirm-log-call"));

    // Timeline label still encodes outcome only — same shape as the
    // bulk-logged entry so the Awaiting-coordination "Last attempt"
    // cell reads consistently.
    expect(onUpdate).toHaveBeenCalledTimes(1);
    const [, patch] = onUpdate.mock.calls[0];
    const newEntry = patch.serviceTimeline.at(-1);
    expect(newEntry.label).toBe("Logged call · No answer");
    expect(newEntry.note).toBe(`${tpl.note} (Bldg A)`);

    // Toast callback receives the template's display name (not its
    // id) so the AdminApp shell can confirm which preset landed —
    // mirror of the bulk-log-call toast.
    expect(onLogCallToast).toHaveBeenCalledTimes(1);
    expect(onLogCallToast.mock.calls[0][0]).toBe(tpl.name);
    // Outcome label flows up so the Custom-path fallback in the
    // AdminApp toast still has something useful to surface.
    expect(onLogCallToast.mock.calls[0][1]).toBe("No answer");
  });

  it("switching from a call template back to Custom… clears the prefilled note", () => {
    const tpl = CALL_TEMPLATES[1] ?? CALL_TEMPLATES[0];
    renderDetail(makeBooking());

    fireEvent.click(screen.getByTestId("button-log-call"));
    fireEvent.change(screen.getByTestId("select-call-template"), {
      target: { value: tpl.id },
    });
    const noteInput = screen.getByTestId(
      "input-call-note",
    ) as HTMLTextAreaElement;
    expect(noteInput.value).toBe(tpl.note);

    fireEvent.change(screen.getByTestId("select-call-template"), {
      target: { value: "custom" },
    });
    expect(noteInput.value).toBe("");
  });

  it("Custom call submit reports the Custom label + outcome to onLogCallToast", () => {
    const onLogCallToast = vi.fn();
    renderDetail(makeBooking(), { onLogCallToast });

    fireEvent.click(screen.getByTestId("button-log-call"));
    fireEvent.change(screen.getByTestId("select-call-outcome"), {
      target: { value: "voicemail" },
    });
    fireEvent.click(screen.getByTestId("button-confirm-log-call"));

    expect(onLogCallToast).toHaveBeenCalledTimes(1);
    expect(onLogCallToast.mock.calls[0][0]).toBe("Custom");
    expect(onLogCallToast.mock.calls[0][1]).toBe("Left voicemail");
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

  it("persists the chosen template name on the timeline entry's templateLabel for non-Custom picks (Task #138)", () => {
    const onUpdate = vi.fn();
    const tpl = EMAIL_TEMPLATES[0];
    renderDetail(makeBooking(), { onUpdate });

    fireEvent.click(screen.getByTestId("button-log-email"));
    fireEvent.change(screen.getByTestId("select-email-template"), {
      target: { value: tpl.id },
    });
    fireEvent.click(screen.getByTestId("button-confirm-log-email"));

    expect(onUpdate).toHaveBeenCalledTimes(1);
    const [, patch] = onUpdate.mock.calls[0];
    const newEntry = patch.serviceTimeline.at(-1);
    // The template's display name lives on the timeline entry so the
    // Service timeline can render a `Template: …` chip even after
    // the success toast disappears (so ops can audit which preset
    // produced the entry by glancing at the entry itself, not the
    // ephemeral toast).
    expect(newEntry.templateLabel).toBe(tpl.name);
  });

  it("omits templateLabel on the timeline entry for Custom submits (Task #138)", () => {
    const onUpdate = vi.fn();
    renderDetail(makeBooking(), { onUpdate });

    fireEvent.click(screen.getByTestId("button-log-email"));
    fireEvent.change(screen.getByTestId("input-email-subject"), {
      target: { value: "Free-text" },
    });
    fireEvent.click(screen.getByTestId("button-confirm-log-email"));

    expect(onUpdate).toHaveBeenCalledTimes(1);
    const [, patch] = onUpdate.mock.calls[0];
    const newEntry = patch.serviceTimeline.at(-1);
    // Free-text picks don't carry a chip — the subject already tells
    // the audit story, so adding `Template: Custom` would just be
    // visual noise on the timeline.
    expect("templateLabel" in newEntry).toBe(false);
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

  it("renders the Template chip beneath the email entry label when templateLabel is set (Task #138)", () => {
    renderDetail(
      makeBooking({
        serviceTimeline: [
          emailEntry({ templateLabel: "Sent rebook link" }),
        ],
      }),
    );
    const row = within(screen.getByTestId("timeline-entry-0"));
    const chip = row.getByTestId("timeline-entry-0-template");
    expect(chip).toBeTruthy();
    expect(chip.textContent).toMatch(/template:\s*sent rebook link/i);
    // Chip sits between the label and the note (rendered above the
    // muted note line) so ops can see the template at a glance even
    // when the entry has a long free-text note beneath.
    const label = row.getByText(
      "Logged email · Booking access — please confirm",
    );
    const note = row.getByText("Sent rebook link");
    expect(
      label.compareDocumentPosition(chip) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      chip.compareDocumentPosition(note) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("renders the Template chip beneath the call entry label when templateLabel is set (Task #149)", () => {
    // Call entries carry the same `templateLabel` snapshot the Log
    // call form persists for non-Custom picks; the chip mirrors the
    // email path so an admin can retrace which preset wrote the row
    // without opening the panel and counting references.
    renderDetail(
      makeBooking({
        serviceTimeline: [
          callEntry({ templateLabel: "No answer — left voicemail" }),
        ],
      }),
    );
    const row = within(screen.getByTestId("timeline-entry-0"));
    const chip = row.getByTestId("timeline-entry-0-template");
    expect(chip).toBeTruthy();
    expect(chip.textContent).toMatch(
      /template:\s*no answer\s*—\s*left voicemail/i,
    );
    // Chip sits between the label and the note line so ops can see
    // the template at a glance even with a long free-text note.
    const label = row.getByText("Logged call · Spoke to them");
    const note = row.getByText("Confirmed Wed afternoon");
    expect(
      label.compareDocumentPosition(chip) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      chip.compareDocumentPosition(note) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("omits the Template chip when the email entry has no templateLabel (Custom + legacy entries) (Task #138)", () => {
    renderDetail(
      makeBooking({
        serviceTimeline: [
          // Custom / pre-Task-138 entries don't carry templateLabel —
          // the chip must not render so the timeline stays clean.
          emailEntry({ templateLabel: undefined }),
        ],
      }),
    );
    const row = within(screen.getByTestId("timeline-entry-0"));
    expect(row.queryByTestId("timeline-entry-0-template")).toBeNull();
    expect(row.queryByText(/template:/i)).toBeNull();
  });

  it("omits the Template chip when the call entry has no templateLabel (Custom + legacy entries) (Task #149)", () => {
    renderDetail(
      makeBooking({
        serviceTimeline: [
          // Custom / pre-Task-149 call entries don't carry
          // templateLabel — the chip must not render so the timeline
          // stays clean for legacy rows.
          callEntry({ templateLabel: undefined }),
        ],
      }),
    );
    const row = within(screen.getByTestId("timeline-entry-0"));
    expect(row.queryByTestId("timeline-entry-0-template")).toBeNull();
    expect(row.queryByText(/template:/i)).toBeNull();
  });

  it("never renders a Template chip on generic status entries even if templateLabel slips through (Task #149)", () => {
    renderDetail(
      makeBooking({
        serviceTimeline: [
          // The chip is an audit affordance for logged Call/Email
          // touches; lifecycle status rows must never render it even
          // if a stale field somehow survives a future schema change.
          {
            status: "scheduled",
            label: "Scheduled",
            at: "Today 09:00",
            by: "System",
            templateLabel: "Sent rebook link",
          } as never,
        ],
      }),
    );
    const row = within(screen.getByTestId("timeline-entry-0"));
    expect(row.queryByTestId("timeline-entry-0-template")).toBeNull();
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
