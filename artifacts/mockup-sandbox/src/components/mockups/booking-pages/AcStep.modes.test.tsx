// @vitest-environment happy-dom

/**
 * Component-level regression tests for the three customer-facing AC step
 * modes (`on-file`, `overridden`, `no-record`) — see Task #82.
 *
 * Background:
 *   The AC step (Step 2 of the booking flow) renders one of three views
 *   depending on whether Taylr has an AC record on file for the unit
 *   and whether the customer has explicitly chosen to override it. The
 *   helper that classifies the mode (`getAcMode`) and the store action
 *   that toggles the override (`setAcOverrideActive`) both have direct
 *   unit-test coverage, but until now there was no test that proved the
 *   actual rendered AcMobile / AcDesktop UI matches the mode contract,
 *   nor that the discrepancy snapshot follows the expected lifecycle as
 *   the customer toggles between modes inside the page itself.
 *
 *   This file pins down both contracts:
 *
 *   1. Mode-to-view mapping
 *      - on-file     → minimal summary card + price block + "Agree and
 *                       continue" button + "Update the details" link;
 *                       NO ack checkbox, NO "Use what's on file" link.
 *      - overridden  → full configuration UI (steppers) + ack checkbox
 *                       + "View terms" link + "← Use what's on file"
 *                       reset link; NO on-file summary card.
 *      - no-record   → full configuration UI but NO "← Use what's on
 *                       file" link (there's nothing to reset to).
 *
 *   2. Discrepancy lifecycle
 *      - on-file     → "Update the details" → adjust counts → mode
 *                       flips to overridden and a discrepancy snapshot
 *                       is captured on the booking session.
 *      - overridden  → "← Use what's on file" → mode flips back to
 *                       on-file and any captured discrepancy is wiped.
 *      - no-record   → adjust counts (after picking a type) → no
 *                       discrepancy is ever written.
 *
 *   The store under `../../../state/bookingSession` is module-scoped, so
 *   we reset it (and the underlying sessionStorage) between every test
 *   to keep state from leaking across cases.
 *
 *   Both AcMobile and AcDesktop share the mode logic and the bulk of
 *   their testids — the variants below parameterise over both wrappers
 *   so a regression in either layout fails the suite, and the only
 *   per-variant value we have to track is the device-specific suffix on
 *   the on-file summary card (`-mobile` vs `-desktop`).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { ComponentType } from "react";

import { AcMobile } from "./AcMobile";
import { AcDesktop } from "./AcDesktop";
import {
  bookingActions,
  getBookingSession,
} from "../../../state/bookingSession";

// ─── Setup / teardown ──────────────────────────────────────────────────────

beforeEach(() => {
  if (typeof window !== "undefined") window.sessionStorage.clear();
  bookingActions.reset();
});

afterEach(() => {
  cleanup();
  if (typeof window !== "undefined") window.sessionStorage.clear();
  bookingActions.reset();
});

// ─── Variants: AcMobile + AcDesktop share the same mode contract ───────────

const VARIANTS: ReadonlyArray<{
  label: string;
  Component: ComponentType;
  /** Per-device testid for the "what we have on record" summary card.
   *  Mobile and desktop diverge here because the layouts render the
   *  card differently and the prototype carried separate testids. */
  onFileSummaryTestid: string;
}> = [
  {
    label: "AcMobile",
    Component: AcMobile,
    onFileSummaryTestid: "card-on-file-summary-mobile",
  },
  {
    label: "AcDesktop",
    Component: AcDesktop,
    onFileSummaryTestid: "card-on-file-summary-desktop",
  },
];

// Demo unit fixtures — mirrors `UNIT_AC_CATALOG` in `bookingHelpers.ts`:
//   u2 → split, 2 systems, 0 additional indoor   (record ON file)
//   u3 → unknown                                 (NO record)
const UNIT_WITH_RECORD = "u2";
const UNIT_WITHOUT_RECORD = "u3";

// ─── (1) Mode-to-view mapping ──────────────────────────────────────────────

describe.each(VARIANTS)(
  "$label — mode-to-view contract",
  ({ Component, onFileSummaryTestid }) => {
    it(
      "on-file mode renders the summary card, price block, " +
        "'Agree and continue' button and 'Update the details' link — and " +
        "does NOT render the ack checkbox or 'Use what's on file' link",
      () => {
        // Default `ac_override_active === false` after `reset()`, so a
        // unit with an on-file record lands directly in on-file mode.
        bookingActions.setUnit(UNIT_WITH_RECORD);

        const { getByTestId, queryByTestId } = render(<Component />);

        // Required UI for on-file mode
        expect(getByTestId(onFileSummaryTestid)).toBeInTheDocument();
        expect(getByTestId("block-price")).toBeInTheDocument();
        expect(getByTestId("link-update-details")).toBeInTheDocument();

        const cont = getByTestId("button-continue");
        expect(cont).toBeInTheDocument();
        // The on-file CTA is intentionally an "Agree and continue"
        // button — there's no separate ack checkbox in this mode.
        expect(cont).toHaveTextContent(/Agree and continue/i);

        // Forbidden in on-file mode
        expect(queryByTestId("checkbox-ac-ack")).toBeNull();
        expect(queryByTestId("link-use-on-file")).toBeNull();
        // The full-config-only steppers should also be absent.
        expect(queryByTestId("btn-systems-plus")).toBeNull();
        expect(queryByTestId("btn-additional-plus")).toBeNull();
      },
    );

    it(
      "overridden mode renders the full configuration UI, ack checkbox, " +
        "'View terms' link and '← Use what's on file' reset",
      () => {
        // Same unit as on-file, but with the override flag flipped on
        // — that's exactly what `link-update-details`'s onClick does.
        bookingActions.setUnit(UNIT_WITH_RECORD);
        bookingActions.setAcOverrideActive(true);

        const { getByTestId, queryByTestId } = render(<Component />);

        // Required UI for overridden mode
        expect(getByTestId("checkbox-ac-ack")).toBeInTheDocument();
        expect(getByTestId("link-view-terms")).toBeInTheDocument();
        expect(getByTestId("link-use-on-file")).toBeInTheDocument();
        // Full configuration UI — steppers for systems + additional.
        expect(getByTestId("btn-systems-plus")).toBeInTheDocument();
        expect(getByTestId("btn-systems-minus")).toBeInTheDocument();
        expect(getByTestId("btn-additional-plus")).toBeInTheDocument();
        expect(getByTestId("btn-additional-minus")).toBeInTheDocument();

        // The on-file summary card belongs to the minimal view only.
        expect(queryByTestId(onFileSummaryTestid)).toBeNull();
      },
    );

    it(
      "no-record mode renders the full configuration UI but no " +
        "'← Use what's on file' link",
      () => {
        // Unit `u3` has `type: "unknown"` — no record on file.
        bookingActions.setUnit(UNIT_WITHOUT_RECORD);

        const { getByTestId, queryByTestId } = render(<Component />);

        // The full configuration view starts with the AC type picker
        // when we genuinely don't know the type — that's part of the
        // full UI, not a separate gate. There's no on-file summary
        // and (critically) no "Use what's on file" reset because
        // there's nothing to reset to.
        expect(getByTestId("choice-ducted")).toBeInTheDocument();
        expect(getByTestId("choice-split")).toBeInTheDocument();
        expect(queryByTestId("link-use-on-file")).toBeNull();
        expect(queryByTestId(onFileSummaryTestid)).toBeNull();

        // Once the customer picks a known type, the steppers + ack +
        // view-terms link become visible — still in no-record mode,
        // and still WITHOUT the "Use what's on file" reset.
        act(() => {
          fireEvent.click(getByTestId("choice-split"));
        });

        expect(getByTestId("btn-systems-plus")).toBeInTheDocument();
        expect(getByTestId("btn-additional-plus")).toBeInTheDocument();
        expect(getByTestId("checkbox-ac-ack")).toBeInTheDocument();
        expect(getByTestId("link-view-terms")).toBeInTheDocument();
        expect(queryByTestId("link-use-on-file")).toBeNull();
        expect(queryByTestId(onFileSummaryTestid)).toBeNull();
      },
    );
  },
);

// ─── (2) Discrepancy lifecycle ─────────────────────────────────────────────

describe.each(VARIANTS)(
  "$label — discrepancy lifecycle",
  ({ Component }) => {
    it(
      "on-file → 'Update the details' → adjust counts → flips to " +
        "overridden mode and captures a discrepancy snapshot",
      () => {
        bookingActions.setUnit(UNIT_WITH_RECORD); // split, 2 systems, 0 additional

        const { getByTestId } = render(<Component />);

        // Baseline — on-file mode, no discrepancy and no override.
        expect(getBookingSession().ac_override_active).toBe(false);
        expect(getBookingSession().ac_discrepancy).toBeNull();

        // Click the "Update the details" link — the on-file view's
        // sole job here is to flip `ac_override_active` to true, which
        // re-renders the component into the full configuration view.
        act(() => {
          fireEvent.click(getByTestId("link-update-details"));
        });

        expect(getBookingSession().ac_override_active).toBe(true);
        // Initial overridden state still matches the recorded values
        // exactly (steppers seed from the record), so no discrepancy
        // has been captured yet.
        expect(getBookingSession().ac_discrepancy).toBeNull();

        // Now bump the systems count. That diverges from the recorded
        // (split, 2, 0) and the discrepancy snapshot must be written.
        act(() => {
          fireEvent.click(getByTestId("btn-systems-plus"));
        });

        expect(getBookingSession().ac_discrepancy).toEqual({
          recorded: { type: "split", systems: 2, additional: 0 },
          customer: { type: "split", systems: 3, additional: 0 },
        });
      },
    );

    it(
      "overridden → '← Use what's on file' → flips back to on-file mode " +
        "and wipes any captured discrepancy",
      () => {
        bookingActions.setUnit(UNIT_WITH_RECORD);
        bookingActions.setAcOverrideActive(true);

        const { getByTestId } = render(<Component />);

        // Capture a discrepancy first by adjusting the count away
        // from the recorded value — exercises the same effect the
        // previous test pinned down.
        act(() => {
          fireEvent.click(getByTestId("btn-systems-plus"));
        });

        expect(getBookingSession().ac_override_active).toBe(true);
        expect(getBookingSession().ac_discrepancy).not.toBeNull();

        // Click the reset link — `setAcOverrideActive(false)` both
        // flips the mode back to on-file and clears the captured
        // discrepancy in a single store write (so the booking is
        // recorded as matching the on-file record exactly).
        act(() => {
          fireEvent.click(getByTestId("link-use-on-file"));
        });

        expect(getBookingSession().ac_override_active).toBe(false);
        expect(getBookingSession().ac_discrepancy).toBeNull();
      },
    );

    it(
      "no-record → adjust counts → no discrepancy is ever written",
      () => {
        bookingActions.setUnit(UNIT_WITHOUT_RECORD);

        const { getByTestId } = render(<Component />);

        expect(getBookingSession().ac_discrepancy).toBeNull();

        // Pick a type so the steppers appear.
        act(() => {
          fireEvent.click(getByTestId("choice-split"));
        });
        expect(getBookingSession().ac_discrepancy).toBeNull();

        // Adjust the counts repeatedly — there's nothing on file to
        // diverge from, so the discrepancy snapshot must stay null
        // throughout (the discrepancy effect short-circuits whenever
        // `mode !== "overridden"` or `recorded` is null).
        act(() => {
          fireEvent.click(getByTestId("btn-systems-plus"));
        });
        expect(getBookingSession().ac_discrepancy).toBeNull();

        act(() => {
          fireEvent.click(getByTestId("btn-additional-plus"));
        });
        expect(getBookingSession().ac_discrepancy).toBeNull();

        act(() => {
          fireEvent.click(getByTestId("btn-additional-plus"));
        });
        expect(getBookingSession().ac_discrepancy).toBeNull();
      },
    );
  },
);

// ─── (3) Unsure mode — streamlined-view contract (Task #101 / #109) ─────────
//
// Task #101 streamlined the AC step in unsure mode so the UnsureCard is
// the leading content: the page heading ("Tell us about the AC setup"),
// the intro paragraph, and the pink OverrideBanner are all suppressed.
// The acknowledgement checkbox, Continue button, and (on mobile) Back
// button must still be present so the customer can finish the step.
//
// There are two ways the customer enters unsure mode and both must yield
// the same streamlined view:
//   - `override === "unsure"` — picked "Not sure" from the type picker.
//   - `notSureCount === true` — picked a known type, then tapped
//     "Not sure? We can confirm this on-site" under the systems stepper.
//
// We use the no-record unit (`u3`) for both entry points because it
// surfaces the type picker as the leading content out of the box, so
// each entry route can be driven entirely from inside the rendered
// component without extra store priming.

const UNSURE_ENTRIES: ReadonlyArray<{
  label: string;
  enter: (q: { getByTestId: (id: string) => HTMLElement }) => void;
  /** Whether the "← I'd like to enter the count myself" undo affordance
   *  on the UnsureCard is expected — it only renders when the customer
   *  arrived via `notSureCount` (so they can back out to the stepper),
   *  not when they explicitly picked "Not sure" as the AC type. */
  expectUndo: boolean;
}> = [
  {
    label: 'override === "unsure" (picked from the type picker)',
    enter: ({ getByTestId }) => {
      act(() => {
        fireEvent.click(getByTestId("choice-unsure"));
      });
    },
    expectUndo: false,
  },
  {
    label:
      'notSureCount (picked a known type, then "Not sure? We can confirm this on-site")',
    enter: ({ getByTestId }) => {
      act(() => {
        fireEvent.click(getByTestId("choice-split"));
      });
      act(() => {
        fireEvent.click(getByTestId("link-not-sure-count"));
      });
    },
    expectUndo: true,
  },
];

describe.each(VARIANTS)(
  "$label — unsure mode streamlined-view contract",
  ({ Component, label }) => {
    it.each(UNSURE_ENTRIES)(
      "entered via $label: suppresses the page heading, intro paragraph " +
        "and pink OverrideBanner; renders the UnsureCard; and keeps the " +
        "ack checkbox, Continue button (and on mobile, Back button)",
      ({ enter, expectUndo }) => {
        bookingActions.setUnit(UNIT_WITHOUT_RECORD);

        const { getByTestId, queryByTestId, queryByText } = render(
          <Component />,
        );

        enter({ getByTestId });

        // Suppressed by the unsure-mode gate (Task #101).
        expect(
          queryByText(/Tell us about the AC setup/i),
        ).not.toBeInTheDocument();
        expect(
          queryByText(/Our technician will confirm your AC setup on-site\./i),
        ).not.toBeInTheDocument();

        // The pink OverrideBanner is the only thing that renders the
        // `button-override-reset` testid, so its absence is a reliable
        // proxy for the banner being suppressed.
        expect(queryByTestId("button-override-reset")).toBeNull();

        // UnsureCard is the leading content in unsure mode. It has no
        // wrapper testid so we assert via its heading copy. The undo
        // affordance ("I'd like to enter the count myself") only shows
        // for the `notSureCount` entry route — see UnsureCard's `onUndo`
        // prop in AcMobile / AcDesktop.
        expect(
          queryByText(/confirm your setup during the service/i),
        ).toBeInTheDocument();
        if (expectUndo) {
          expect(getByTestId("button-undo-not-sure")).toBeInTheDocument();
        } else {
          expect(queryByTestId("button-undo-not-sure")).toBeNull();
        }

        // The ack + Continue must remain available so the customer can
        // still complete the step from the streamlined view.
        expect(getByTestId("checkbox-ac-ack")).toBeInTheDocument();
        expect(getByTestId("button-continue")).toBeInTheDocument();
        // The mobile Back affordance is layout-specific.
        if (label === "AcMobile") {
          expect(getByTestId("button-back-mobile")).toBeInTheDocument();
        }
      },
    );
  },
);
