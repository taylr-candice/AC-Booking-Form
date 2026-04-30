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
        "'View terms' link and the type-toggle link — the old " +
        "'Use what's on file' / 'Change AC type' / OverrideBanner stack " +
        "is gone (Task #110)",
      () => {
        // Same unit as on-file, but with the override flag flipped on
        // — that's exactly what `link-update-details`'s onClick does.
        bookingActions.setUnit(UNIT_WITH_RECORD);
        bookingActions.setAcOverrideActive(true);

        const { getByTestId, queryByTestId } = render(<Component />);

        // Required UI for overridden mode
        expect(getByTestId("checkbox-ac-ack")).toBeInTheDocument();
        expect(getByTestId("link-view-terms")).toBeInTheDocument();
        // Task #110 — the only type-affecting affordance is the new
        // toggle link; the chunky reset/change-type/banner stack is
        // gone.
        expect(getByTestId("link-toggle-ac-type")).toBeInTheDocument();
        expect(queryByTestId("link-use-on-file")).toBeNull();
        expect(queryByTestId("link-change-ac-type")).toBeNull();
        expect(queryByTestId("button-override-reset")).toBeNull();
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
      "no-record mode (counts blank, type inherited from the building) " +
        "renders the steppers + ack directly — no AC-type ChoicePanel, " +
        "no 'Use what's on file' link, and no on-file summary card",
      () => {
        // Task #110 — `u3` has no `systems`/`additional` on file but its
        // building (Bourke) carries `acType: "split"` + `acBrand:
        // "Fujitsu"`, so the type/brand are pre-filled and the customer
        // is taken straight to the count steppers. The old ChoicePanel
        // is gone (the building always knows the type) and there's
        // nothing to reset back to (no counts on file).
        bookingActions.setUnit(UNIT_WITHOUT_RECORD);

        const { getByTestId, queryByTestId } = render(<Component />);

        // Steppers + ack + view-terms link are visible directly because
        // the type is pre-filled from the building — no picker needed.
        expect(getByTestId("btn-systems-plus")).toBeInTheDocument();
        expect(getByTestId("btn-additional-plus")).toBeInTheDocument();
        expect(getByTestId("checkbox-ac-ack")).toBeInTheDocument();
        expect(getByTestId("link-view-terms")).toBeInTheDocument();

        // Affordances that Task #110 explicitly removed.
        expect(queryByTestId("choice-ducted")).toBeNull();
        expect(queryByTestId("choice-split")).toBeNull();
        expect(queryByTestId("link-use-on-file")).toBeNull();
        expect(queryByTestId("link-change-ac-type")).toBeNull();
        expect(queryByTestId("button-override-reset")).toBeNull();
        // No on-file summary card — there are no counts on file.
        expect(queryByTestId(onFileSummaryTestid)).toBeNull();

        // The replacement affordance: a single "I now have a [opposite
        // type] system" link that flips the type for this booking.
        expect(getByTestId("link-toggle-ac-type")).toBeInTheDocument();
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

        // Task #110 — recorded snapshot now carries the AC brand
        // alongside the type/counts, so admin views (and any future
        // ops surface that reads the discrepancy) can show the full
        // "Split · Mitsubishi" context without a separate lookup.
        expect(getBookingSession().ac_discrepancy).toEqual({
          recorded: {
            type: "split",
            brand: "Mitsubishi",
            systems: 2,
            additional: 0,
          },
          customer: { type: "split", systems: 3, additional: 0 },
        });
      },
    );

    // Task #110 — the "← Use what's on file" reset lifecycle test
    // used to live here. The link was removed from the override view
    // (along with ChoicePanel / "Change AC type" / OverrideBanner) so
    // the override view is one-way from the customer's perspective:
    // the way "back" to on-file is to navigate Step 3 with the
    // override flag off, which is what the on-file path already
    // covers (first test in this describe). The store-level guarantee
    // that `setAcOverrideActive(false)` wipes any captured discrepancy
    // is still pinned down at the store level (see
    // `bookingSession.test.ts`), so we don't lose coverage by
    // dropping this UI-driven duplicate.


    it(
      "no-record → adjust counts → no discrepancy is ever written",
      () => {
        // Task #110 — `u3` has no `systems`/`additional` on file but
        // its building pre-fills the type, so the steppers are visible
        // straight away (no ChoicePanel step required).
        bookingActions.setUnit(UNIT_WITHOUT_RECORD);

        const { getByTestId } = render(<Component />);

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

// ─── (3) Unsure mode — streamlined-view contract (Task #101/#109/#110) ─────
//
// Task #101 streamlined the AC step in unsure mode so the UnsureCard is
// the leading content: the page heading ("Tell us about the AC setup"),
// the intro paragraph, and the pink OverrideBanner are all suppressed.
// The acknowledgement checkbox, Continue button, and (on mobile) Back
// button must still be present so the customer can finish the step.
//
// Task #110 removed the AC-type ChoicePanel from the customer flow (the
// building always knows the type now), which also removes the
// type-level unsure entry route — the only reachable unsure path is the
// count-level "Not sure? We can confirm this on-site" link under the
// systems stepper. The streamlined-view + merged-card contract still
// applies, so we exercise it via that single entry route.

describe.each(VARIANTS)(
  "$label — unsure mode streamlined-view contract",
  ({ Component, label }) => {
    it(
      "entered via 'notSureCount' (tapped 'Not sure? We can confirm " +
        "this on-site' under the systems stepper): suppresses the page " +
        "heading, intro paragraph and pink OverrideBanner; renders the " +
        "UnsureCard; and keeps the ack checkbox, Continue button " +
        "(and on mobile, Back button)",
      () => {
        // Task #110 — `u3` inherits its AC type from the building, so
        // the steppers are visible directly without a ChoicePanel step
        // in between. The only unsure entry left is `link-not-sure-
        // count` under the systems stepper.
        bookingActions.setUnit(UNIT_WITHOUT_RECORD);

        const { getByTestId, queryByTestId, queryByText } = render(
          <Component />,
        );

        act(() => {
          fireEvent.click(getByTestId("link-not-sure-count"));
        });

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
        // affordance ("I'd like to enter the count myself") shows
        // because the customer arrived via `notSureCount` (so they
        // can back out to the stepper).
        expect(
          queryByText(/confirm your setup during the service/i),
        ).toBeInTheDocument();
        expect(getByTestId("button-undo-not-sure")).toBeInTheDocument();

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

// ─── (4) Merged UnsureCard — per-path content contract (Task #102/#110) ────
//
// Task #102 collapsed the old OverrideBanner + UnsureCard pair into a
// single `card-unsure-merged` shown above the price block. Task #110
// removed the AC-type ChoicePanel — and with it the type-level unsure
// entry — so only the count-level path remains. We pin down the
// content of that card and the price block beside it so a future
// refactor of the unsure path can't silently regress the affordances
// or the price reassurance.

describe.each(VARIANTS)(
  "$label — merged UnsureCard per-path content",
  ({ Component }) => {
    it(
      "count-level unsure (split): card-unsure-merged contains " +
        "button-undo-not-sure and the 'Showing split setup' context " +
        "line, the price block total is $179, and no OverrideBanner " +
        "reset is shown",
      () => {
        // Task #110 — `u3` inherits its AC type ("split") from the
        // building, so the steppers are visible immediately. Tap the
        // "Not sure? We can confirm this on-site" link under the
        // systems stepper to enter the count-level unsure path
        // (effectiveType === "split", notSureCount === true).
        bookingActions.setUnit(UNIT_WITHOUT_RECORD);

        const { getByTestId, queryByTestId } = render(<Component />);

        act(() => {
          fireEvent.click(getByTestId("link-not-sure-count"));
        });

        // Merged card is rendered with the count-level affordance only.
        const card = getByTestId("card-unsure-merged");
        expect(card).toBeInTheDocument();
        expect(getByTestId("button-undo-not-sure")).toBeInTheDocument();
        expect(queryByTestId("button-change-ac-type-unsure")).toBeNull();

        // Context line spells out which known setup we're booking the
        // default against — this is the customer's reassurance that
        // their type pick wasn't lost when they tapped "Not sure".
        expect(getByTestId("text-unsure-context")).toHaveTextContent(
          /Showing split setup/i,
        );

        // No pink OverrideBanner in the merged-card path.
        expect(queryByTestId("button-override-reset")).toBeNull();

        // Price block — default 1 × $179 (displaySystems collapses to
        // 1 in unsure mode regardless of any prior stepper state).
        expect(getByTestId("block-price")).toBeInTheDocument();
        expect(getByTestId("text-price-total")).toHaveTextContent("$179");
      },
    );
  },
);

// ─── (5) Task #110 — type-toggle link contract ────────────────────────────
//
// The override view now sports a single small "I now have a [opposite
// type] system" link beneath the type heading. Clicking it flips the
// effective type for the booking, records a discrepancy for ops to
// review (in overridden mode where there's something to compare
// against), and updates the steppers' addon labels accordingly. It
// must not silently overwrite the unit record.

describe.each(VARIANTS)(
  "$label — type-toggle link",
  ({ Component }) => {
    it(
      "shows 'I now have a [opposite type] system' beneath the type " +
        "heading and flips the effective type when clicked",
      () => {
        // u3 inherits split from its building (Bourke). The toggle
        // link should advertise the OPPOSITE — ducted — and clicking
        // it should flip the steppers' addon label from 'Extra indoor
        // units' (split) to 'Extra return-air grilles' (ducted).
        bookingActions.setUnit(UNIT_WITHOUT_RECORD);

        const { getByTestId, queryByTestId } = render(<Component />);

        const toggle = getByTestId("link-toggle-ac-type");
        expect(toggle).toBeInTheDocument();
        expect(toggle).toHaveTextContent(/I now have a ducted system/i);

        // Steppers reflect split before the click.
        expect(queryByTestId("text-extras-helper")).toHaveTextContent(
          /indoor unit/i,
        );

        act(() => {
          fireEvent.click(toggle);
        });

        // After the flip the toggle now offers the reverse direction
        // and the steppers' addon helper switches to the ducted copy.
        expect(getByTestId("link-toggle-ac-type")).toHaveTextContent(
          /I now have a split system/i,
        );
        expect(queryByTestId("text-extras-helper")).toHaveTextContent(
          /return-air grille/i,
        );
      },
    );

    it(
      "in overridden mode, clicking the toggle records a discrepancy " +
        "with the new type so ops can decide whether to promote it",
      () => {
        // u2 is on file as split + Mitsubishi + 2 systems + 0 extras.
        // Open the override view and flip the type.
        bookingActions.setUnit(UNIT_WITH_RECORD);
        bookingActions.setAcOverrideActive(true);

        const { getByTestId } = render(<Component />);

        // Baseline — same type as recorded ⇒ no discrepancy yet.
        expect(getBookingSession().ac_discrepancy).toBeNull();

        act(() => {
          fireEvent.click(getByTestId("link-toggle-ac-type"));
        });

        // Discrepancy snapshot now reflects the type flip — the
        // recorded side keeps the on-file split + brand + counts; the
        // customer side drops to the ducted defaults (1 system, 0
        // extras) since the previous split counts no longer apply.
        const snap = getBookingSession().ac_discrepancy;
        expect(snap).not.toBeNull();
        expect(snap?.recorded.type).toBe("split");
        expect(snap?.customer.type).toBe("ducted");
      },
    );
  },
);
