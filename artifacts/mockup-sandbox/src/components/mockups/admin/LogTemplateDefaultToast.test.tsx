// @vitest-environment happy-dom

/**
 * Tests for Task #169 — confirmation toast echoes a "(Default)"
 * marker when ops logs a call/email using the channel default
 * template. Custom and non-default picks keep the toast unchanged.
 * Bulk paths render `AdminApp` end-to-end and assert on the rendered
 * toast text; per-row paths render `BookingDetail` and assert on the
 * `isDefault` (third) arg the shell forwards into `setToast`.
 */

import {
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminApp } from "./AdminApp";
import { BookingDetail } from "./BookingDetail";
import {
  CALL_TEMPLATES,
  EMAIL_TEMPLATES,
  findDefaultCallTemplate,
  findDefaultEmailTemplate,
  type AdminAgent,
  type AdminBooking,
  type AdminUnit,
} from "@/state/adminMockData";

afterEach(() => {
  cleanup();
});

/** Mount `AdminApp` and navigate to the Awaiting-coordination queue. */
function openAwaitingCoordination() {
  render(<AdminApp />);
  fireEvent.click(
    screen.getByRole("button", { name: "Awaiting coordination" }),
  );
}

/** Read the latest toast message text, or `null` when no toast is mounted. */
function readToastMessage(): string | null {
  const toast = screen.queryByTestId("toast-success");
  if (!toast) return null;
  return toast.textContent ?? "";
}

describe("Task #169 · Default-marker echo in confirmation toast", () => {
  /** Select the first coordination row to arm the bulk action bar. */
  function selectFirstCoordinationRow() {
    const checkboxes = screen.getAllByTestId(/^checkbox-coordination-row-/);
    expect(checkboxes.length, "queue should have selectable rows").toBeGreaterThan(0);
    fireEvent.click(checkboxes[0]!);
  }

  it("bulk Log call with the default call template appends ' · (Default)' to the toast tail", () => {
    openAwaitingCoordination();
    selectFirstCoordinationRow();

    // Form auto-selects the seeded default — submit as-is.
    fireEvent.click(screen.getByTestId("button-bulk-log-call"));
    const defaultCall = findDefaultCallTemplate(CALL_TEMPLATES);
    expect(defaultCall, "seed must include a default call template").toBeTruthy();
    const select = screen.getByTestId(
      "select-bulk-call-template",
    ) as HTMLSelectElement;
    expect(select.value).toBe(defaultCall!.id);

    fireEvent.click(screen.getByTestId("button-bulk-confirm-log-call"));

    const message = readToastMessage();
    expect(message).toBeTruthy();
    expect(message).toContain(`· ${defaultCall!.name}`);
    expect(message).toContain("· (Default)");
  });

  it("bulk Log call with a non-default call template leaves the toast suffix-free", () => {
    openAwaitingCoordination();
    selectFirstCoordinationRow();

    fireEvent.click(screen.getByTestId("button-bulk-log-call"));

    // Pick a non-default template to prove the suffix is gated on
    // `isDefault`, not just on "not Custom".
    const nonDefault = CALL_TEMPLATES.find((t) => !t.isDefault);
    expect(nonDefault, "seed must include a non-default call template").toBeTruthy();
    fireEvent.change(screen.getByTestId("select-bulk-call-template"), {
      target: { value: nonDefault!.id },
    });

    fireEvent.click(screen.getByTestId("button-bulk-confirm-log-call"));

    const message = readToastMessage();
    expect(message).toBeTruthy();
    expect(message).toContain(`· ${nonDefault!.name}`);
    expect(message).not.toContain("(Default)");
  });

  it("bulk Log email with the default email template appends ' · (Default)' to the toast tail", () => {
    openAwaitingCoordination();
    selectFirstCoordinationRow();

    fireEvent.click(screen.getByTestId("button-bulk-log-email"));
    const defaultEmail = findDefaultEmailTemplate(EMAIL_TEMPLATES);
    expect(
      defaultEmail,
      "seed must include a default email template",
    ).toBeTruthy();
    const select = screen.getByTestId(
      "select-bulk-email-template",
    ) as HTMLSelectElement;
    expect(select.value).toBe(defaultEmail!.id);

    fireEvent.click(screen.getByTestId("button-bulk-confirm-log-email"));

    const message = readToastMessage();
    expect(message).toBeTruthy();
    expect(message).toContain(`· ${defaultEmail!.name}`);
    expect(message).toContain("· (Default)");
  });

  it("bulk Log email with a non-default email template leaves the toast suffix-free", () => {
    openAwaitingCoordination();
    selectFirstCoordinationRow();

    fireEvent.click(screen.getByTestId("button-bulk-log-email"));

    const nonDefault = EMAIL_TEMPLATES.find((t) => !t.isDefault);
    expect(
      nonDefault,
      "seed must include a non-default email template",
    ).toBeTruthy();
    fireEvent.change(screen.getByTestId("select-bulk-email-template"), {
      target: { value: nonDefault!.id },
    });

    fireEvent.click(screen.getByTestId("button-bulk-confirm-log-email"));

    const message = readToastMessage();
    expect(message).toBeTruthy();
    expect(message).toContain(`· ${nonDefault!.name}`);
    expect(message).not.toContain("(Default)");
  });
});

/**
 * Per-row coverage. The per-row Log forms in `BookingDetail` flow
 * through `AdminApp.logCallToast` / `logEmailToast` (separate from
 * the bulk path above). We unit-test `BookingDetail` directly with a
 * spy and assert on the `isDefault` (third) arg the shell forwards
 * into `setToast`.
 */

const PER_ROW_UNIT: AdminUnit = {
  id: "u-toast-default",
  addressLine1: "12 / 100 Pitt Street",
  addressLine2: "Sydney NSW 2000",
  ac: { type: "split", brand: "Daikin", systems: 2, additional: 0 },
  agentId: null,
  buildingId: "bldg-toast-default",
};

const PER_ROW_AGENTS: AdminAgent[] = [];

function makePerRowBooking(): AdminBooking {
  return {
    id: "bk-toast-default",
    unitId: PER_ROW_UNIT.id,
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
  };
}

function renderPerRowDetail(
  handlers: Partial<React.ComponentProps<typeof BookingDetail>> = {},
) {
  const booking = makePerRowBooking();
  const noop = () => {};
  return render(
    <BookingDetail
      bookingId={booking.id}
      bookings={[booking]}
      units={[PER_ROW_UNIT]}
      agents={PER_ROW_AGENTS}
      callTemplates={CALL_TEMPLATES}
      emailTemplates={EMAIL_TEMPLATES}
      onBack={noop}
      onUpdate={noop}
      onCancelBooking={noop}
      {...handlers}
    />,
  );
}

describe("Task #169 · Default-marker echo · per-row paths", () => {
  it("per-row Log call with the default call template forwards isDefault=true to onLogCallToast", () => {
    const onLogCallToast = vi.fn();
    renderPerRowDetail({ onLogCallToast });

    fireEvent.click(screen.getByTestId("button-log-call"));
    const defaultCall = findDefaultCallTemplate(CALL_TEMPLATES);
    expect(defaultCall, "seed must include a default call template").toBeTruthy();
    const select = screen.getByTestId(
      "select-call-template",
    ) as HTMLSelectElement;
    expect(select.value).toBe(defaultCall!.id);

    fireEvent.click(screen.getByTestId("button-confirm-log-call"));

    expect(onLogCallToast).toHaveBeenCalledTimes(1);
    expect(onLogCallToast.mock.calls[0][0]).toBe(defaultCall!.name);
    expect(onLogCallToast.mock.calls[0][2]).toBe(true);
  });

  it("per-row Log call with a non-default call template forwards isDefault=false", () => {
    const onLogCallToast = vi.fn();
    renderPerRowDetail({ onLogCallToast });

    fireEvent.click(screen.getByTestId("button-log-call"));
    const nonDefault = CALL_TEMPLATES.find((t) => !t.isDefault);
    expect(nonDefault, "seed must include a non-default call template").toBeTruthy();
    fireEvent.change(screen.getByTestId("select-call-template"), {
      target: { value: nonDefault!.id },
    });
    fireEvent.click(screen.getByTestId("button-confirm-log-call"));

    expect(onLogCallToast).toHaveBeenCalledTimes(1);
    expect(onLogCallToast.mock.calls[0][0]).toBe(nonDefault!.name);
    expect(onLogCallToast.mock.calls[0][2]).toBe(false);
  });

  it("per-row Log email with the default email template forwards isDefault=true to onLogEmailToast", () => {
    const onLogEmailToast = vi.fn();
    renderPerRowDetail({ onLogEmailToast });

    fireEvent.click(screen.getByTestId("button-log-email"));
    const defaultEmail = findDefaultEmailTemplate(EMAIL_TEMPLATES);
    expect(
      defaultEmail,
      "seed must include a default email template",
    ).toBeTruthy();
    const select = screen.getByTestId(
      "select-email-template",
    ) as HTMLSelectElement;
    expect(select.value).toBe(defaultEmail!.id);

    fireEvent.click(screen.getByTestId("button-confirm-log-email"));

    expect(onLogEmailToast).toHaveBeenCalledTimes(1);
    expect(onLogEmailToast.mock.calls[0][0]).toBe(defaultEmail!.name);
    expect(onLogEmailToast.mock.calls[0][2]).toBe(true);
  });

  it("per-row Log email with a non-default email template forwards isDefault=false", () => {
    const onLogEmailToast = vi.fn();
    renderPerRowDetail({ onLogEmailToast });

    fireEvent.click(screen.getByTestId("button-log-email"));
    const nonDefault = EMAIL_TEMPLATES.find((t) => !t.isDefault);
    expect(
      nonDefault,
      "seed must include a non-default email template",
    ).toBeTruthy();
    fireEvent.change(screen.getByTestId("select-email-template"), {
      target: { value: nonDefault!.id },
    });
    fireEvent.click(screen.getByTestId("button-confirm-log-email"));

    expect(onLogEmailToast).toHaveBeenCalledTimes(1);
    expect(onLogEmailToast.mock.calls[0][0]).toBe(nonDefault!.name);
    expect(onLogEmailToast.mock.calls[0][2]).toBe(false);
  });
});
