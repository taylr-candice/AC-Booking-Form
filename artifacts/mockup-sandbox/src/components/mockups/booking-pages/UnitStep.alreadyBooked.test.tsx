// @vitest-environment happy-dom

/**
 * Regression tests for the customer Step-1 unit picker behaviour added
 * in Task #89: a pending-invoice unit must be blocked the same way an
 * already-paid unit is — opening the generic "This property is already
 * booked" modal and *not* committing the unit to the booking session —
 * with no inline yellow "There's a pending invoice for this unit"
 * warning anywhere in the flow.
 *
 * Both UnitDesktop and UnitMobile share the selection logic, so we
 * parameterise over both. We rely on the seeded admin bookings to
 * provide:
 *   - u1 → an already-paid booking on `rl-ac-aspen`        (paid)
 *   - u3 → a pending-invoice booking on `rl-ac-marine`     (invoice_pending)
 *   - u5 → no rollout for `svc-ac` exists (Anzac)          (none)
 *
 * The store under `../../../state/bookingSession` is module-scoped, so
 * we reset it (and sessionStorage) between every test.
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

describe.each(VARIANTS)(
  "Step 1 unit picker — $label — already-booked behaviour (Task #89)",
  ({ Component }) => {
    it("opens the 'already booked' modal and does NOT commit a paid unit", () => {
      render(<Component />);

      // Open the dropdown and click the paid unit (u1).
      fireEvent.click(screen.getByTestId("dropdown-unit-trigger"));
      fireEvent.click(screen.getByTestId("dropdown-unit-u1"));

      expect(screen.getByTestId("modal-unit-already-booked")).toBeInTheDocument();
      expect(getBookingSession().unit_id).toBeNull();
    });

    it("opens the 'already booked' modal and does NOT commit a pending-invoice unit", () => {
      render(<Component />);

      // Open the dropdown and click the pending-invoice unit (u3).
      fireEvent.click(screen.getByTestId("dropdown-unit-trigger"));
      fireEvent.click(screen.getByTestId("dropdown-unit-u3"));

      expect(screen.getByTestId("modal-unit-already-booked")).toBeInTheDocument();
      expect(getBookingSession().unit_id).toBeNull();

      // The legacy yellow "pending invoice" warning must never render
      // anywhere in the customer flow.
      expect(
        screen.queryByTestId("warning-unit-invoice-pending"),
      ).not.toBeInTheDocument();
    });

    it("commits the unit and shows no modal when an unbooked unit is picked", () => {
      render(<Component />);

      // u5 is at Anzac Parade — no `svc-ac` rollout exists for that
      // building, so it cannot be "already booked" from the picker's POV.
      fireEvent.click(screen.getByTestId("dropdown-unit-trigger"));
      fireEvent.click(screen.getByTestId("dropdown-unit-u5"));

      expect(getBookingSession().unit_id).toBe("u5");
      expect(
        screen.queryByTestId("modal-unit-already-booked"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId("warning-unit-invoice-pending"),
      ).not.toBeInTheDocument();
    });
  },
);
