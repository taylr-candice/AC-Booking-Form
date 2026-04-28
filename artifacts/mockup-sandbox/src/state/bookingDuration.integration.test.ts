/**
 * End-to-end check for the slot picker time-budget wire-up (Task #27).
 *
 * The slot picker doesn't run in this test environment, but it computes
 * its "Your service" chip and capacity-fit logic by calling
 * `getBookingDurationMinutes(useBookingSession())`. The AC step
 * (`AcMobile.tsx` / `AcDesktop.tsx`) is responsible for persisting the
 * customer's stepper values to the session via `bookingActions.setSystems`
 * and `bookingActions.setAdditionalIndoor` — without that wiring the
 * slot picker would always read default values and the disable logic
 * would be meaningless.
 *
 * These tests mirror what the AC effect does and prove the duration
 * helper sees the changes immediately, across all the AC step's
 * interesting cases (split, ducted with extras, "I'm not sure").
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getBookingDurationMinutes } from "./bookingDerived";
import {
  bookingActions,
  getBookingSession,
} from "./bookingSession";

beforeEach(() => {
  bookingActions.reset();
});
afterEach(() => {
  bookingActions.reset();
});

describe("AC step → slot picker duration wiring", () => {
  it("starts at 45 minutes (1 system, 0 extras) for a fresh session", () => {
    // Default INITIAL_STATE — no AC interaction yet.
    expect(getBookingDurationMinutes(getBookingSession())).toBe(45);
  });

  it("reflects a 'split, 2 systems' selection — the customer picked a 2-system split", () => {
    // What AcMobile/AcDesktop write when the customer lands on a unit
    // with 2 split systems on file (or steps up to that count).
    bookingActions.setSystems(2);
    bookingActions.setAdditionalIndoor(0);
    expect(getBookingDurationMinutes(getBookingSession())).toBe(90);
  });

  it("reflects a 'ducted, 2 systems + 1 extra' selection — the spec's worked example", () => {
    bookingActions.setSystems(2);
    bookingActions.setAdditionalIndoor(1);
    expect(getBookingDurationMinutes(getBookingSession())).toBe(105);
  });

  it("reflects a large 'ducted, 3 systems + 2 extras' booking", () => {
    bookingActions.setSystems(3);
    bookingActions.setAdditionalIndoor(2);
    expect(getBookingDurationMinutes(getBookingSession())).toBe(165);
  });

  it("falls back to 45 minutes when the customer answered 'I'm not sure', regardless of seeded counts", () => {
    // The AC effect writes `displaySystems`/`displayAdditional` (which
    // collapse to 1/0 in unsure mode), but the *real* signal is the
    // discrepancy snapshot's `customer.type === "unsure"`. The duration
    // helper short-circuits to the unsure fallback when it sees that.
    bookingActions.setUnit("u2"); // has a record on file: split, 2 systems
    bookingActions.setSystems(1);
    bookingActions.setAdditionalIndoor(0);
    bookingActions.setAcDiscrepancy({
      recorded: { type: "split", systems: 2, additional: 0 },
      customer: { type: "unsure" },
    });
    expect(getBookingDurationMinutes(getBookingSession())).toBe(45);
  });

  it("recovers the stepper-based duration when the customer leaves 'I'm not sure'", () => {
    // First go unsure ⇒ fallback.
    bookingActions.setUnit("u2");
    bookingActions.setAcDiscrepancy({
      recorded: { type: "split", systems: 2, additional: 0 },
      customer: { type: "unsure" },
    });
    expect(getBookingDurationMinutes(getBookingSession())).toBe(45);

    // Now confirm the recorded type with matching counts ⇒ the AC effect
    // wipes the unsure flag (matches the recorded type/counts → null
    // discrepancy) and writes the real numbers.
    bookingActions.setSystems(2);
    bookingActions.setAdditionalIndoor(0);
    bookingActions.setAcDiscrepancy(null);
    expect(getBookingDurationMinutes(getBookingSession())).toBe(90);
  });

  it("clears the unsure fallback if a unit switch wipes the discrepancy snapshot", () => {
    // Spec: `setUnit` resets the discrepancy snapshot to null. So even
    // if the customer was unsure on the previous unit, the slot picker
    // should fall back to the steppers (which the AC step will re-seed
    // from the new unit's record on next render).
    bookingActions.setUnit("u2");
    bookingActions.setSystems(2);
    bookingActions.setAcDiscrepancy({
      recorded: { type: "split", systems: 2, additional: 0 },
      customer: { type: "unsure" },
    });
    expect(getBookingDurationMinutes(getBookingSession())).toBe(45);

    bookingActions.setUnit("u5");
    // The steppers haven't been updated yet (the AC effect would do
    // that on the next mount), but the snapshot is gone — so the helper
    // computes from whatever the steppers currently hold (2 systems
    // from before the unit switch).
    expect(getBookingSession().ac_discrepancy).toBeNull();
    expect(getBookingDurationMinutes(getBookingSession())).toBe(90);
  });
});
