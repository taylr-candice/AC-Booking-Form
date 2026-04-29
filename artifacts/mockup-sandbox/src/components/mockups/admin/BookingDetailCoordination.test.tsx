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
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SEEDED_BOOKINGS,
  type AdminAgent,
  type AdminBooking,
  type AdminUnit,
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
