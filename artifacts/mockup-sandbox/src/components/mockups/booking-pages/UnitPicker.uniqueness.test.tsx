// @vitest-environment happy-dom
/**
 * Component-level regression test for the customer-facing half of the
 * "one confirmed booking per unit per service rollout" rule (Task #49).
 *
 * Pinned contract (per the spec note in `UnitAlreadyBookedModal.tsx`,
 * "Spec (Apr 2026)" — and the inline comments in `UnitDesktop` /
 * `UnitMobile` at the dropdown render):
 *
 *   1. PAID unit  → tap does NOT commit `unit_id`; the generic
 *      "this property is already booked" modal opens (every row is
 *      rendered identically — no strike-through / lock icon / inline
 *      booker name — privacy). The block is enforced on commit
 *      rather than as a disabled row so the existing customer's
 *      identity stays hidden.
 *   2. INVOICE_PENDING unit → treated identically to PAID per
 *      Task #89: tap does NOT commit `unit_id`; the same generic
 *      "already booked" modal opens; the legacy yellow supersede
 *      warning panel never renders. Ops re-sends the existing
 *      pending invoice instead of letting a fresh booking start
 *      on top of it.
 *   3. NORMAL unit (no rollout / no live booking) → tap commits
 *      `unit_id`, no modal, no warning panel.
 *
 * Parameterised over `UnitDesktop` + `UnitMobile` so a regression in
 * either surface is caught.
 *
 * Test data: the components default to `SEEDED_BOOKINGS` /
 * `SEEDED_ROLLOUTS` (no `setLiveBookingsSource` call needed). u1 is
 * paid (bk-1042 on rl-ac-aspen), u3 is invoice-pending (bk-1039 on
 * rl-ac-marine), u5 has no rollout.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

const VARIANTS: ReadonlyArray<{ label: string; Picker: ComponentType }> = [
  { label: "UnitDesktop", Picker: UnitDesktop },
  { label: "UnitMobile", Picker: UnitMobile },
];

describe.each(VARIANTS)(
  "$label — up-front uniqueness block on the unit picker",
  ({ Picker }) => {
    it("blocks a PAID unit on commit: opens the modal AND does NOT set unit_id", async () => {
      const user = userEvent.setup();
      render(<Picker />);

      expect(getBookingSession().unit_id).toBeNull();
      expect(
        screen.queryByTestId("modal-unit-already-booked"),
      ).not.toBeInTheDocument();

      await user.click(screen.getByTestId("dropdown-unit-trigger"));
      // u1 is paid (bk-1042 / rl-ac-aspen).
      await user.click(screen.getByTestId("dropdown-unit-u1"));

      // Modal renders with the privacy-preserving copy.
      const modal = await screen.findByTestId("modal-unit-already-booked");
      expect(modal).toBeInTheDocument();
      expect(
        screen.getByTestId("text-unit-already-booked-body"),
      ).toHaveTextContent(/already a service booked at this property/i);

      // Load-bearing: the unit must NOT be selected. A regression
      // that dropped the `kind === "paid"` guard in `selectUnit`
      // would commit u1 even though the modal still rendered.
      expect(getBookingSession().unit_id).toBeNull();

      // Dismissing the modal still leaves the unit unselected
      // (modal is an explainer, not a confirm step).
      await user.click(
        screen.getByTestId("button-unit-already-booked-confirm"),
      );
      expect(
        screen.queryByTestId("modal-unit-already-booked"),
      ).not.toBeInTheDocument();
      expect(getBookingSession().unit_id).toBeNull();
    });

    it("hard-blocks an INVOICE_PENDING unit identically to PAID: opens the modal AND does NOT set unit_id (Task #89)", async () => {
      const user = userEvent.setup();
      render(<Picker />);

      expect(getBookingSession().unit_id).toBeNull();
      expect(
        screen.queryByTestId("modal-unit-already-booked"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId("warning-unit-invoice-pending"),
      ).not.toBeInTheDocument();

      await user.click(screen.getByTestId("dropdown-unit-trigger"));
      // u3 is invoice_pending (bk-1039 / rl-ac-marine, payment pending).
      await user.click(screen.getByTestId("dropdown-unit-u3"));

      // Same generic "already booked" modal as the paid case.
      const modal = await screen.findByTestId("modal-unit-already-booked");
      expect(modal).toBeInTheDocument();
      expect(
        screen.getByTestId("text-unit-already-booked-body"),
      ).toHaveTextContent(/already a service booked at this property/i);

      // Load-bearing: per Task #89, invoice_pending must NOT commit
      // unit_id (no soft-block fallthrough). A regression that
      // restored the legacy `commit + warning panel` path would
      // resurface ops's "two bookings on one pending invoice" bug.
      expect(getBookingSession().unit_id).toBeNull();

      // The legacy yellow supersede warning panel is gone — Task #89
      // removed it because the modal is the only surface ops want
      // customers to see for invoice_pending units.
      expect(
        screen.queryByTestId("warning-unit-invoice-pending"),
      ).not.toBeInTheDocument();

      // Dismissing the modal still leaves the unit unselected.
      await user.click(
        screen.getByTestId("button-unit-already-booked-confirm"),
      );
      expect(
        screen.queryByTestId("modal-unit-already-booked"),
      ).not.toBeInTheDocument();
      expect(getBookingSession().unit_id).toBeNull();
    });

    it("a NORMAL unit (no blocking booking on its rollout) commits cleanly: no modal, no warning panel", async () => {
      const user = userEvent.setup();
      render(<Picker />);

      await user.click(screen.getByTestId("dropdown-unit-trigger"));
      // u5 (Anzac Gardens) is on rl-ac-anzac but its only seeded
      // booking (bk-1040) is a legacy ad-hoc row with `rolloutId: null`,
      // which the picker skips when computing per-rollout uniqueness →
      // status `{ kind: "none" }`.
      await user.click(screen.getByTestId("dropdown-unit-u5"));

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
