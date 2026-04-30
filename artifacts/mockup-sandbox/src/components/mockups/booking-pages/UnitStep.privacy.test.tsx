// @vitest-environment happy-dom

/**
 * Privacy regression for the Step-1 unit picker.
 *
 * The customer flow was hardened so that picking a property which
 * already has a paid booking opens a generic "this property is already
 * booked" modal — never inline copy that exposes the existing
 * customer's name, contact details, booked date or window.
 *
 * Seeded blocker on `u1` (`bk-1042`):
 *   Henrik Olsen · henrik.o@example.com · 0411 222 901
 *   2026-04-29 · morning
 *
 * This test exercises both `UnitDesktop` and `UnitMobile` and asserts:
 *   1. Clicking the paid row opens the modal and does NOT commit the
 *      unit to the booking session.
 *   2. The modal still renders the Taylr support email link so the
 *      customer can ask questions.
 *   3. The modal text contains none of the seeded blocker's PII
 *      tokens — name parts, email, phone, ISO date, friendly date,
 *      or window word.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { ComponentType } from "react";

import { UnitDesktop } from "./UnitDesktop";
import { UnitMobile } from "./UnitMobile";
import {
  bookingActions,
  getBookingSession,
} from "../../../state/bookingSession";

beforeEach(() => {
  if (typeof window !== "undefined") window.sessionStorage.clear();
  bookingActions.reset();
});

afterEach(() => {
  cleanup();
  if (typeof window !== "undefined") window.sessionStorage.clear();
  bookingActions.reset();
});

const VARIANTS: ReadonlyArray<{ label: string; Component: ComponentType }> = [
  { label: "UnitDesktop", Component: UnitDesktop },
  { label: "UnitMobile", Component: UnitMobile },
];

/**
 * PII tokens from the seeded `bk-1042` blocker on unit `u1`.
 * Each one of these appearing in the modal would be a privacy leak.
 */
const BLOCKER_PII_TOKENS = [
  "Henrik",
  "Olsen",
  "henrik.o@example.com",
  "0411",
  "222 901",
  "2026-04-29",
  "29 Apr",
  "Apr 29",
  "Morning",
  "morning",
] as const;

describe.each(VARIANTS)(
  "Step 1 unit picker — $label — privacy of already-booked modal",
  ({ Component }) => {
    it("opens the generic modal, leaves the booking unset, and leaks no blocker PII", () => {
      render(<Component />);

      // Open the dropdown and click the paid unit (u1).
      fireEvent.click(screen.getByTestId("dropdown-unit-trigger"));
      fireEvent.click(screen.getByTestId("dropdown-unit-u1"));

      const modal = screen.getByTestId("modal-unit-already-booked");
      expect(modal).toBeInTheDocument();

      // Booking session must NOT be advanced — the unit is not committed.
      expect(getBookingSession().unit_id).toBeNull();

      // Modal still surfaces the Taylr support email so the customer
      // has a place to ask questions.
      const supportLink = screen.getByTestId(
        "link-unit-already-booked-support-email",
      );
      expect(supportLink).toHaveAttribute(
        "href",
        "mailto:support@taylr.com.au",
      );
      expect(supportLink).toHaveTextContent("support@taylr.com.au");

      // The modal text must contain NONE of the blocker booking's PII.
      const modalText = modal.textContent ?? "";
      for (const token of BLOCKER_PII_TOKENS) {
        expect(modalText).not.toContain(token);
      }
    });
  },
);
