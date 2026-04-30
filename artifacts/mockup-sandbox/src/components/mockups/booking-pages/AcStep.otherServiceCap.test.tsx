// @vitest-environment happy-dom

/**
 * Step-2 (AC step) e2e regression for the per-service add-on quantity
 * cap that Task #212 wired into the customer-facing UI.
 *
 * Background:
 *   The catalogue's `OtherServiceRule` carries an optional `maxQty`
 *   ceiling that:
 *     - the booking action `setOtherServiceQuantity` clamps writes
 *       against (covered by `state/otherServices.test.ts`), and
 *     - the Step-2 stepper uses to grey out the "+" button and
 *       surface a "Max N — call us for more." hint
 *       (`text-other-service-cap-hint-<id>`) under the row.
 *
 *   The data-layer clamp is unit-tested, but until now there was no
 *   test that walked the customer-facing UI from "+ Add" up through
 *   the cap, so a future regression that drops the disabled state on
 *   the "+" button or the hint text would slip through silently.
 *
 *   This file pins down both UI affordances by mounting the real
 *   AcMobile / AcDesktop step components, seeding a live catalogue
 *   entry with a known small `maxQty`, toggling it on, and clicking
 *   the "+" past the cap. The variant-parameterised describe makes a
 *   regression in either layout fail the suite.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { ComponentType } from "react";

import { AcMobile } from "./AcMobile";
import { AcDesktop } from "./AcDesktop";
import { type OtherServiceRule } from "../../../state/bookingDerived";
import { bookingActions } from "../../../state/bookingSession";
import {
  LIVE_OTHER_SERVICES_STORAGE_KEY,
  writeLiveOtherServices,
} from "../../../state/liveOtherServices";

// ─── Setup / teardown ──────────────────────────────────────────────────────

beforeEach(() => {
  if (typeof window !== "undefined") window.sessionStorage.clear();
  bookingActions.reset();
});

afterEach(() => {
  cleanup();
  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem(LIVE_OTHER_SERVICES_STORAGE_KEY);
    window.sessionStorage.clear();
  }
  bookingActions.reset();
});

// ─── Variants: AcMobile + AcDesktop share the same OtherServicesSection ────

const VARIANTS: ReadonlyArray<{
  label: string;
  Component: ComponentType;
}> = [
  { label: "AcMobile", Component: AcMobile },
  { label: "AcDesktop", Component: AcDesktop },
];

// `u2` lands the AC step in on-file mode (split, 2 systems, 0
// additional). On-file mode still renders the OtherServicesSection
// above the price block, so we don't have to flip into the override
// view just to exercise the add-on stepper.
const UNIT_WITH_RECORD = "u2";

const BATHROOM_CAPPED: OtherServiceRule = {
  id: "svc-bath-cap",
  name: "Bathroom extraction service",
  baseMinutes: 30,
  addonMinutes: 10,
  priceAud: 99,
  addonPriceAud: 25,
  appliesToNote: "applies to: bathroom extraction",
  addonLabel: "additional bathroom",
  // The cap under test — small enough that we can click "+" past it
  // in a few iterations without the test going slow.
  maxQty: 3,
};

describe.each(VARIANTS)(
  "$label — Step-2 add-on quantity cap UI (Task #221)",
  ({ Component }) => {
    it(
      "disables the '+' button at the cap, renders the cap hint, " +
        "and refuses to bump qty past maxQty when '+' is clicked again",
      () => {
        // Seed the live catalogue so OtherServicesSection has
        // something to render. The component reads from
        // sessionStorage via `useLiveOtherServices`, so this is the
        // production-shaped wiring path.
        writeLiveOtherServices([BATHROOM_CAPPED]);
        bookingActions.setUnit(UNIT_WITH_RECORD);

        const { getByTestId, queryByTestId } = render(<Component />);

        const toggleId = `toggle-other-service-${BATHROOM_CAPPED.id}`;
        const plusId = `btn-other-service-plus-${BATHROOM_CAPPED.id}`;
        const minusId = `btn-other-service-minus-${BATHROOM_CAPPED.id}`;
        const totalId = `text-other-service-total-${BATHROOM_CAPPED.id}`;
        const capHintId = `text-other-service-cap-hint-${BATHROOM_CAPPED.id}`;

        // Pre-condition: the row is not yet selected, so the stepper
        // and the hint are both absent — the only affordance is the
        // "+ Add" toggle.
        expect(getByTestId(toggleId)).toBeInTheDocument();
        expect(queryByTestId(plusId)).toBeNull();
        expect(queryByTestId(capHintId)).toBeNull();

        // Toggle the service on — this seeds qty=1 and reveals the
        // stepper (mirrors the AC indoor-units pattern).
        act(() => {
          fireEvent.click(getByTestId(toggleId));
        });

        const plus = getByTestId(plusId);
        expect(plus).toBeInTheDocument();
        // qty=1 < maxQty=3, so the "+" is enabled and there is no
        // cap hint yet.
        expect(plus).not.toBeDisabled();
        expect(queryByTestId(capHintId)).toBeNull();
        // Sibling minus is disabled at qty=1 (minQty=1) — sanity
        // check that the stepper is wired to the same row.
        expect(getByTestId(minusId)).toBeDisabled();

        // Click "+" up to the cap. Starting at qty=1, two clicks land
        // on qty=3 (= maxQty), at which point the "+" must disable
        // and the hint must appear.
        act(() => {
          fireEvent.click(getByTestId(plusId));
        });
        // qty=2 — still under the cap.
        expect(getByTestId(plusId)).not.toBeDisabled();
        expect(queryByTestId(capHintId)).toBeNull();

        act(() => {
          fireEvent.click(getByTestId(plusId));
        });

        // qty=3 — at the cap. "+" disables, hint renders with the
        // exact "Max N — call us for more." copy, and the row total
        // reflects the capped qty.
        const cappedPlus = getByTestId(plusId);
        expect(cappedPlus).toBeDisabled();
        // The cap reason is also exposed via the native `title` so
        // sighted users get a hover tooltip — pin it down so a future
        // refactor can't drop it silently.
        expect(cappedPlus).toHaveAttribute(
          "title",
          "Max 3 — call us for more",
        );

        const hint = getByTestId(capHintId);
        expect(hint).toBeInTheDocument();
        expect(hint).toHaveTextContent("Max 3 — call us for more.");

        // The visible qty in the row total should reflect qty=3:
        // base $99 × 3 + addon $25 × 2 = $347.
        expect(getByTestId(totalId)).toHaveTextContent("$347");
        // Direct assertion on the visible qty: at qty > 1 the row's
        // per-unit helper line spells out the count as "{qty} × ~30
        // min". Pin it down so a future refactor that drops the
        // disable wiring (and lets qty advance) shows up here too.
        expect(
          getByTestId(`card-other-service-${BATHROOM_CAPPED.id}`),
        ).toHaveTextContent(/3 × ~30 min/);

        // Click "+" past the cap. The button is disabled so the
        // click is a no-op; the qty must NOT advance to 4 and the
        // total must stay at $347.
        act(() => {
          fireEvent.click(getByTestId(plusId));
        });
        act(() => {
          fireEvent.click(getByTestId(plusId));
        });

        expect(getByTestId(plusId)).toBeDisabled();
        expect(getByTestId(capHintId)).toHaveTextContent(
          "Max 3 — call us for more.",
        );
        // Same total as before the over-cap clicks — qty was clamped
        // by the disabled state, not by the data-layer clamp (which
        // has its own coverage in `state/otherServices.test.ts`).
        expect(getByTestId(totalId)).toHaveTextContent("$347");
        // And the visible qty in the row's per-unit helper still
        // reads "3 × ~30 min" — i.e. the over-cap clicks did NOT
        // advance the displayed count past N.
        expect(
          getByTestId(`card-other-service-${BATHROOM_CAPPED.id}`),
        ).toHaveTextContent(/3 × ~30 min/);

        // Stepping back below the cap re-enables "+" and the hint
        // disappears — this is the inverse of the cap behaviour and
        // proves the disable / hint are reactive, not one-shot.
        act(() => {
          fireEvent.click(getByTestId(minusId));
        });
        expect(getByTestId(plusId)).not.toBeDisabled();
        expect(queryByTestId(capHintId)).toBeNull();
      },
    );
  },
);
