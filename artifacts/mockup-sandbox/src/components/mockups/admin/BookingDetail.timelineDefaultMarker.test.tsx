// @vitest-environment happy-dom

/**
 * Per-row regression for the Default-marker pill (Task #181) the
 * booking-detail Service timeline shows next to the "From template:
 * …" chip when ops logged a call or email using the channel's default
 * template — same affordance the dropdown trigger pill (Task #163)
 * and the success toast (Task #169) already echo.
 *
 * For both the call and email channel, exercises:
 *   1. Logging via the default template persists `templateIsDefault:
 *      true` on the entry and renders the amber Default pill.
 *   2. Logging via a non-default template renders the template chip
 *      alone — no Default pill.
 *   3. Logging via Custom… renders neither the chip nor the pill.
 *
 * The persisted-shape assertions guard the snapshot-on-use contract
 * — toggling a different template to default later must not rewrite
 * the historical marker.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  type AdminAgent,
  type AdminBooking,
  type AdminUnit,
  type CallTemplate,
  type EmailTemplate,
  type TimelineEntry,
} from "@/state/adminMockData";

import { BookingDetail } from "./BookingDetail";

afterEach(cleanup);

const UNIT: AdminUnit = {
  id: "u-tdm",
  addressLine1: "12 / 100 Pitt Street",
  addressLine2: "Sydney NSW 2000",
  ac: { type: "split", brand: "", systems: 2, additional: 0 },
  agentId: null,
  buildingId: "bldg-tdm",
};

const AGENTS: AdminAgent[] = [];

const CALL_TEMPLATES_FIX: ReadonlyArray<CallTemplate> = [
  {
    id: "tpl-call-default",
    name: "Reminder follow-up",
    note: "Reminder follow-up — confirmed window is still good.",
    isDefault: true,
  },
  {
    id: "tpl-call-other",
    name: "Spoke — confirmed window",
    note: "Spoke to tenant — confirmed the window works.",
  },
];

const EMAIL_TEMPLATES_FIX: ReadonlyArray<EmailTemplate> = [
  {
    id: "tpl-email-default",
    name: "Sent rebook link",
    subject: "Booking access — please pick a new window",
    note: "Sent rebook link so the tenant can grab a fresh slot.",
    isDefault: true,
  },
  {
    id: "tpl-email-other",
    name: "Sent agent intro",
    subject: "Coordinating your AC service — quick intro",
    note: "Intro email to the managing agent with the booking summary.",
  },
];

function makeBooking(overrides: Partial<AdminBooking> = {}): AdminBooking {
  return {
    id: "bk-tdm",
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

/** Render the detail screen, firing a fresh `onUpdate` mock so the
 *  test can both inspect the patch shape and re-render the component
 *  with the resulting timeline so the renderer assertions also run. */
function renderDetail(
  booking: AdminBooking,
  handlers: Partial<React.ComponentProps<typeof BookingDetail>> = {},
) {
  return render(
    <BookingDetail
      bookingId={booking.id}
      bookings={[booking]}
      units={[UNIT]}
      agents={AGENTS}
      onBack={() => {}}
      onCancelBooking={() => {}}
      onUpdate={() => {}}
      callTemplates={CALL_TEMPLATES_FIX}
      emailTemplates={EMAIL_TEMPLATES_FIX}
      {...handlers}
    />,
  );
}

/** Re-mount the detail with the patched booking so we can assert what
 *  the timeline renderer puts on screen for the freshly-appended
 *  entry. Returns the rendered helpers. */
function rerenderWithPatch(
  base: AdminBooking,
  patch: Partial<AdminBooking>,
  handlers: Partial<React.ComponentProps<typeof BookingDetail>> = {},
) {
  cleanup();
  const patched: AdminBooking = { ...base, ...patch };
  return renderDetail(patched, handlers);
}

describe("BookingDetail · Service timeline · Default template marker", () => {
  describe("Log call", () => {
    it("logging via the default Call template persists templateIsDefault and renders the amber Default pill next to the template chip", () => {
      const onUpdate = vi.fn();
      const booking = makeBooking();
      renderDetail(booking, { onUpdate });

      fireEvent.click(screen.getByTestId("button-log-call"));
      // Default template is preselected; just confirm + submit.
      fireEvent.click(screen.getByTestId("button-confirm-log-call"));

      expect(onUpdate).toHaveBeenCalledTimes(1);
      const [, patch] = onUpdate.mock.calls[0] as [
        string,
        Partial<AdminBooking>,
      ];
      const newEntry = (patch.serviceTimeline as TimelineEntry[]).at(
        -1,
      ) as TimelineEntry;
      expect(newEntry.kind).toBe("call");
      expect(newEntry.templateLabel).toBe("Reminder follow-up");
      // Snapshot-on-use marker — set when the picked template was the
      // catalog's default at log time.
      expect(newEntry.templateIsDefault).toBe(true);

      rerenderWithPatch(booking, patch);
      // Find the freshly-appended entry by its template chip and
      // assert the sibling Default pill is rendered.
      const chip = screen.getByText("From template: Reminder follow-up");
      const entryRoot = chip.closest(`li[data-testid^="timeline-entry-"]`);
      expect(entryRoot).not.toBeNull();
      const pill = entryRoot!.querySelector(
        '[data-testid$="-template-default"]',
      );
      expect(pill).not.toBeNull();
      expect(pill!.textContent).toContain("Default");
    });

    it("logging via a non-default Call template renders the template chip alone — no Default pill", () => {
      const onUpdate = vi.fn();
      const booking = makeBooking();
      renderDetail(booking, { onUpdate });

      fireEvent.click(screen.getByTestId("button-log-call"));
      // Switch off the preselected default to a non-default template.
      fireEvent.change(screen.getByTestId("select-call-template"), {
        target: { value: "tpl-call-other" },
      });
      fireEvent.click(screen.getByTestId("button-confirm-log-call"));

      expect(onUpdate).toHaveBeenCalledTimes(1);
      const [, patch] = onUpdate.mock.calls[0] as [
        string,
        Partial<AdminBooking>,
      ];
      const newEntry = (patch.serviceTimeline as TimelineEntry[]).at(
        -1,
      ) as TimelineEntry;
      expect(newEntry.templateLabel).toBe("Spoke — confirmed window");
      // Field is omitted entirely when the template wasn't default —
      // the renderer treats that as "no pill".
      expect("templateIsDefault" in newEntry).toBe(false);

      rerenderWithPatch(booking, patch);
      const chip = screen.getByText("From template: Spoke — confirmed window");
      const entryRoot = chip.closest(`li[data-testid^="timeline-entry-"]`);
      expect(entryRoot).not.toBeNull();
      expect(
        entryRoot!.querySelector('[data-testid$="-template-default"]'),
      ).toBeNull();
    });

    it("logging a Custom… call (no template picked) renders neither the template chip nor the Default pill", () => {
      const onUpdate = vi.fn();
      const booking = makeBooking();
      renderDetail(booking, { onUpdate });

      fireEvent.click(screen.getByTestId("button-log-call"));
      fireEvent.change(screen.getByTestId("select-call-template"), {
        target: { value: "custom" },
      });
      // Type a free-text note so the form has something to submit.
      fireEvent.change(screen.getByTestId("input-call-note"), {
        target: { value: "Free-text note from Mia." },
      });
      fireEvent.click(screen.getByTestId("button-confirm-log-call"));

      expect(onUpdate).toHaveBeenCalledTimes(1);
      const [, patch] = onUpdate.mock.calls[0] as [
        string,
        Partial<AdminBooking>,
      ];
      const newEntry = (patch.serviceTimeline as TimelineEntry[]).at(
        -1,
      ) as TimelineEntry;
      expect("templateLabel" in newEntry).toBe(false);
      expect("templateIsDefault" in newEntry).toBe(false);

      rerenderWithPatch(booking, patch);
      // Custom entries omit the whole template row, so neither the
      // chip nor the pill should be present.
      expect(
        screen.queryByText(/^From template:/),
      ).toBeNull();
      expect(
        screen.queryByTestId(/timeline-entry-\d+-template-default$/),
      ).toBeNull();
    });
  });

  describe("Log email", () => {
    it("logging via the default Email template persists templateIsDefault and renders the amber Default pill next to the template chip", () => {
      const onUpdate = vi.fn();
      const booking = makeBooking();
      renderDetail(booking, { onUpdate });

      fireEvent.click(screen.getByTestId("button-log-email"));
      // Default template is preselected; just confirm + submit.
      fireEvent.click(screen.getByTestId("button-confirm-log-email"));

      expect(onUpdate).toHaveBeenCalledTimes(1);
      const [, patch] = onUpdate.mock.calls[0] as [
        string,
        Partial<AdminBooking>,
      ];
      const newEntry = (patch.serviceTimeline as TimelineEntry[]).at(
        -1,
      ) as TimelineEntry;
      expect(newEntry.kind).toBe("email");
      expect(newEntry.templateLabel).toBe("Sent rebook link");
      expect(newEntry.templateIsDefault).toBe(true);

      rerenderWithPatch(booking, patch);
      const chip = screen.getByText("From template: Sent rebook link");
      const entryRoot = chip.closest(`li[data-testid^="timeline-entry-"]`);
      expect(entryRoot).not.toBeNull();
      const pill = entryRoot!.querySelector(
        '[data-testid$="-template-default"]',
      );
      expect(pill).not.toBeNull();
      expect(pill!.textContent).toContain("Default");
    });

    it("logging via a non-default Email template renders the template chip alone — no Default pill", () => {
      const onUpdate = vi.fn();
      const booking = makeBooking();
      renderDetail(booking, { onUpdate });

      fireEvent.click(screen.getByTestId("button-log-email"));
      fireEvent.change(screen.getByTestId("select-email-template"), {
        target: { value: "tpl-email-other" },
      });
      fireEvent.click(screen.getByTestId("button-confirm-log-email"));

      expect(onUpdate).toHaveBeenCalledTimes(1);
      const [, patch] = onUpdate.mock.calls[0] as [
        string,
        Partial<AdminBooking>,
      ];
      const newEntry = (patch.serviceTimeline as TimelineEntry[]).at(
        -1,
      ) as TimelineEntry;
      expect(newEntry.templateLabel).toBe("Sent agent intro");
      expect("templateIsDefault" in newEntry).toBe(false);

      rerenderWithPatch(booking, patch);
      const chip = screen.getByText("From template: Sent agent intro");
      const entryRoot = chip.closest(`li[data-testid^="timeline-entry-"]`);
      expect(entryRoot).not.toBeNull();
      expect(
        entryRoot!.querySelector('[data-testid$="-template-default"]'),
      ).toBeNull();
    });

    it("logging a Custom… email (no template picked) renders neither the template chip nor the Default pill", () => {
      const onUpdate = vi.fn();
      const booking = makeBooking();
      renderDetail(booking, { onUpdate });

      fireEvent.click(screen.getByTestId("button-log-email"));
      fireEvent.change(screen.getByTestId("select-email-template"), {
        target: { value: "custom" },
      });
      fireEvent.change(screen.getByTestId("input-email-subject"), {
        target: { value: "Quick nudge" },
      });
      fireEvent.click(screen.getByTestId("button-confirm-log-email"));

      expect(onUpdate).toHaveBeenCalledTimes(1);
      const [, patch] = onUpdate.mock.calls[0] as [
        string,
        Partial<AdminBooking>,
      ];
      const newEntry = (patch.serviceTimeline as TimelineEntry[]).at(
        -1,
      ) as TimelineEntry;
      expect("templateLabel" in newEntry).toBe(false);
      expect("templateIsDefault" in newEntry).toBe(false);

      rerenderWithPatch(booking, patch);
      expect(
        screen.queryByText(/^From template:/),
      ).toBeNull();
      expect(
        screen.queryByTestId(/timeline-entry-\d+-template-default$/),
      ).toBeNull();
    });
  });
});
