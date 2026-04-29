// @vitest-environment happy-dom
/**
 * UI-level integration test for the SUBMIT-TIME half of the
 * "one confirmed booking per unit per service rollout" rule (Task #49).
 *
 * The sibling `BookingFlow.unitUnavailable.test.tsx` short-cuts to
 * `bookingActions.markUnitUnavailable()` to flip the flag — it never
 * runs the real `submitBooking()` → `uniquenessGuard` →
 * `unit_unavailable` flow that a customer with a deep link into a
 * paid unit would experience. This test fills that gap.
 *
 * It wires the same uniqueness guard `AdminApp` installs (so the
 * verdict comes from real `getActiveBookingForUnit` lookups against
 * `SEEDED_BOOKINGS`), drives the booking session to Step 5 against
 * a paid unit (u1 / bk-1042 / rl-ac-aspen), then triggers
 * `submitBooking()` the way the iframed Pay button does. Asserts:
 *
 *   - Wrapper renders the "Unit already booked" terminal screen.
 *   - `panel-blocker-context` shows the seeded booker's name, role,
 *     date, and slot.
 *   - Both terminal CTAs (`button-contact-us`, `button-pick-another-unit`)
 *     are present.
 *   - The Step 5 iframe is unmounted (terminal-vs-iframe contract).
 *   - Store: `unit_unavailable=true`, `submitted=false`,
 *     `reference=null`, blocker payload intact.
 *
 * Iframe note: each step is rendered inside an `<iframe>` whose
 * `src` is unreachable under happy-dom. We can't click the Pay
 * button itself (it's inside that iframe), so we call
 * `submitBooking()` directly — observably indistinguishable from
 * the iframe's onClick. The terminal screen + blocker panel are
 * rendered by the wrapper, not the iframe.
 *
 * Parameterised over both wrappers.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { ComponentType } from "react";

import { BookingFlowDesktop } from "./BookingFlowDesktop";
import { BookingFlowMobile } from "./BookingFlowMobile";
import {
  bookingActions,
  getBookingSession,
  setUniquenessGuard,
} from "../../../state/bookingSession";
import {
  SEEDED_BOOKINGS,
  findRolloutForBooking,
  getActiveBookingForUnit,
} from "../../../state/adminMockData";

const PAID_UNIT_ID = "u1"; // bk-1042 (Henrik Olsen, owner) on rl-ac-aspen

const CUSTOMER_CONTACT = {
  firstName: "Sam",
  lastName: "Lee",
  email: "sam@example.com",
  mobile: "0411222333",
};

async function neutralizeIframe(iframe: HTMLIFrameElement): Promise<void> {
  iframe.removeAttribute("src");
  iframe.setAttribute(
    "srcdoc",
    "<!DOCTYPE html><html><head></head><body></body></html>",
  );
  await waitFor(() => {
    expect(iframe.contentDocument?.body).toBeTruthy();
  });
}

function driveOwnerScheduledFlowToStep5(unitId: string) {
  bookingActions.setUnit(unitId);
  bookingActions.setRole("owner");
  bookingActions.setContact({
    contact_first_name: CUSTOMER_CONTACT.firstName,
    contact_last_name: CUSTOMER_CONTACT.lastName,
    contact_email: CUSTOMER_CONTACT.email,
    contact_phone: CUSTOMER_CONTACT.mobile,
  });
  bookingActions.setSystems(1);
  bookingActions.setAdditionalIndoor(1);
  bookingActions.setPrimaryResidence("live_in");
  bookingActions.setAccessMethod("owner_live_at_unit");
  bookingActions.setSchedule("2026-05-04", "am");
  bookingActions.setCancellationAcknowledged(true);
  bookingActions.goToStep(5);
}

/**
 * Mirror the read-side of AdminApp's uniqueness guard. We only need
 * the paid-rejection branch for this test; the supersede side-effect
 * for invoice_pending is exhaustively covered by `bookingSession.test.ts`.
 */
function installRealUniquenessGuardAgainstSeededBookings() {
  setUniquenessGuard((sess) => {
    if (!sess.unit_id) return "ok";
    const rollout = findRolloutForBooking("svc-ac", sess.unit_id);
    if (!rollout) return "ok";
    const verdict = getActiveBookingForUnit(
      sess.unit_id,
      SEEDED_BOOKINGS,
      rollout.id,
    );
    if (verdict.kind === "paid") {
      const winning = verdict.booking;
      return {
        kind: "paid",
        blocker: {
          name: winning.customerName,
          role: winning.bookerRole,
          date: winning.serviceDate,
          slot: winning.serviceSlot,
        },
      };
    }
    if (verdict.kind === "invoice_pending") return "invoice_pending";
    return "ok";
  });
}

beforeEach(() => {
  if (typeof window !== "undefined") window.sessionStorage.clear();
  bookingActions.reset();
});

afterEach(() => {
  cleanup();
  if (typeof window !== "undefined") window.sessionStorage.clear();
  bookingActions.reset();
  setUniquenessGuard(null);
});

// Pin the seed-data precondition so a future change that moves u1
// out of the paid bucket fails loudly here rather than silently
// passing the wrapper test for the wrong reason.
describe("seed data invariant", () => {
  it("u1 has a paid seeded booking on its rollout", () => {
    const rollout = findRolloutForBooking("svc-ac", PAID_UNIT_ID);
    expect(rollout).not.toBeNull();
    const verdict = getActiveBookingForUnit(
      PAID_UNIT_ID,
      SEEDED_BOOKINGS,
      rollout!.id,
    );
    expect(verdict.kind).toBe("paid");
  });
});

const VARIANTS: ReadonlyArray<{ label: string; Wrapper: ComponentType }> = [
  { label: "BookingFlowMobile", Wrapper: BookingFlowMobile },
  { label: "BookingFlowDesktop", Wrapper: BookingFlowDesktop },
];

describe.each(VARIANTS)(
  "$label — submit-time uniqueness rejection renders the unit-unavailable terminal",
  ({ Wrapper }) => {
    it("submitBooking() against a paid unit flips the wrapper to the terminal with real seeded blocker context", async () => {
      installRealUniquenessGuardAgainstSeededBookings();
      driveOwnerScheduledFlowToStep5(PAID_UNIT_ID);

      const { findByTestId } = render(<Wrapper />);

      // Pre-submit sanity: on Step 5 iframe, NOT the terminal.
      const step5Iframe = (await findByTestId(
        "flow-iframe-5",
      )) as HTMLIFrameElement;
      await neutralizeIframe(step5Iframe);
      expect(
        screen.queryByTestId("text-terminal-title"),
      ).not.toBeInTheDocument();

      // Same as the iframed Pay button's
      // `onClick={() => bookingActions.submitBooking()}`.
      bookingActions.submitBooking();

      // Terminal screen renders.
      expect(
        await screen.findByTestId("text-terminal-title"),
      ).toHaveTextContent("Unit already booked");
      expect(screen.getByTestId("text-terminal-body")).toHaveTextContent(
        /just booked by someone else/i,
      );
      expect(screen.getByTestId("text-terminal-body")).toHaveTextContent(
        /No payment has been taken/i,
      );

      // Blocker context comes from real seeded data (bk-1042: Henrik
      // Olsen, owner, 2026-04-29 morning).
      const blockerPanel = await screen.findByTestId("panel-blocker-context");
      expect(blockerPanel).toHaveTextContent("Henrik Olsen");
      expect(blockerPanel).toHaveTextContent(/the unit owner/i);
      expect(blockerPanel).toHaveTextContent(/morning/i);
      expect(blockerPanel).toHaveTextContent("2026-04-29");

      expect(screen.getByTestId("button-contact-us")).toBeInTheDocument();
      expect(
        screen.getByTestId("button-pick-another-unit"),
      ).toBeInTheDocument();

      // Either/or contract: Step 5 iframe is unmounted.
      expect(screen.queryByTestId("flow-iframe-5")).not.toBeInTheDocument();

      // Store: rejected, not submitted, blocker payload intact.
      const post = getBookingSession();
      expect(post.unit_unavailable).toBe(true);
      expect(post.submitted).toBe(false);
      expect(post.reference).toBeNull();
      expect(post.unit_unavailable_blocker).toEqual({
        name: "Henrik Olsen",
        role: "owner",
        date: "2026-04-29",
        slot: "morning",
      });
    });
  },
);
