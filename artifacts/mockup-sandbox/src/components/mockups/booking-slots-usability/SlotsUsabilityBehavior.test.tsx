// @vitest-environment happy-dom

/**
 * Component-level regression tests for the three booking-slots-usability
 * mockups (`SlotsAffordanceForward`, `SlotsAccessibleReadable`,
 * `SlotsHierarchyFirst`). After Tasks #168 and #178 they share the
 * `resolveCustomerSlotData` pipeline that powers the production
 * pickers, but only the production pickers had component tests — so
 * the next refactor could re-introduce the divergence and nobody
 * would notice. This file pins the four edge states the wiring is
 * supposed to handle, parameterised across all three variants so any
 * variant that drifts fails the test, not the demo.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { ComponentType } from "react";

import { SlotsAffordanceForward } from "./SlotsAffordanceForward";
import { SlotsAccessibleReadable } from "./SlotsAccessibleReadable";
import { SlotsHierarchyFirst } from "./SlotsHierarchyFirst";
import { bookingActions } from "../../../state/bookingSession";

beforeEach(() => {
  // The booking store is a module singleton backed by sessionStorage.
  // Wipe both so each test sees a clean slate.
  if (typeof window !== "undefined") window.sessionStorage.clear();
  bookingActions.reset();
});

afterEach(() => {
  cleanup();
  if (typeof window !== "undefined") window.sessionStorage.clear();
  bookingActions.reset();
});

const VARIANTS: ReadonlyArray<{
  name: string;
  Component: ComponentType;
}> = [
  { name: "SlotsAffordanceForward", Component: SlotsAffordanceForward },
  { name: "SlotsAccessibleReadable", Component: SlotsAccessibleReadable },
  { name: "SlotsHierarchyFirst", Component: SlotsHierarchyFirst },
];

describe.each(VARIANTS)(
  "$name — live wiring regression (Tasks #168 + #178)",
  ({ Component }) => {
    it("(a) renders the no-rollout empty state when the unit's building has no svc-ac rollout", () => {
      // u-pyrmont-01 lives at bldg-pyrmont. SEEDED_ROLLOUTS does not
      // open svc-ac on Pyrmont (it is the dedicated no-rollout seed
      // building), so the lookup resolves to a null rollout.
      bookingActions.setUnit("u-pyrmont-01");

      const { getByTestId, queryByTestId } = render(<Component />);

      expect(getByTestId("empty-no-rollout-mobile")).toBeInTheDocument();
      // The other two terminal panels must NOT also render — the
      // empty state should be the sole replacement for the day grid.
      expect(queryByTestId("banner-locked-by-other-mobile")).toBeNull();
    });

    it("(b) renders the locked-by-other panel when an active confirmed booking exists for the unit", () => {
      // u1 has the seeded paid blocker bk-1042 on rollout rl-ac-aspen.
      bookingActions.setUnit("u1");

      const { getByTestId, queryByTestId } = render(<Component />);

      const banner = getByTestId("banner-locked-by-other-mobile");
      expect(banner).toBeInTheDocument();
      // bk-1042 is a paid booking, so the locked-kind data attribute
      // (used by the privacy panel + future copy tweaks) must surface
      // it as such on every variant.
      expect(banner).toHaveAttribute("data-locked-kind", "paid");
      // Sanity: the locked panel is mutually exclusive with the empty
      // state and the day grid.
      expect(queryByTestId("empty-no-rollout-mobile")).toBeNull();
    });

    it("(c) renders evening window tiles when the resolved rollout day has one open", () => {
      // u-aspen-02 lives at bldg-aspen (rollout rl-ac-aspen) and is
      // NOT blocked by bk-1042 (which lives on u1). RL_ASPEN_DAYS
      // opens evening windows on 2026-05-01, 2026-05-04, and
      // 2026-05-08; their slot ids are suffixed `-ev`, so the
      // rendered <button> for each evening tile carries
      // `data-testid$="-ev"`.
      bookingActions.setUnit("u-aspen-02");

      const { container, queryByTestId } = render(<Component />);

      // The locked / empty panels must not have intercepted the day
      // grid for this unit; if either did, the evening assertion
      // below would also fail but the diagnostic would be confusing.
      expect(queryByTestId("banner-locked-by-other-mobile")).toBeNull();
      expect(queryByTestId("empty-no-rollout-mobile")).toBeNull();

      const eveningTiles = container.querySelectorAll<HTMLButtonElement>(
        'button[data-testid^="mobile-slot-"][data-testid$="-ev"]',
      );
      expect(eveningTiles.length).toBeGreaterThan(0);
    });

    it("(d) keeps Continue disabled when lockedByOther flips on AFTER a slot is already selected", () => {
      // The guard is `disabled={!selected || !!lockedByOther}`. A
      // refactor that drops the `lockedByOther` half would still
      // leave `disabled={!selected}` — and a test that only renders
      // the locked state directly (where `selected` stays null)
      // wouldn't catch that. So we drive a real transition: pick a
      // slot on a clean unit, then change the unit to one with an
      // active blocker, and assert Continue stays disabled.
      //
      // u-aspen-02 and u1 both live at bldg-aspen, so they share
      // rl-ac-aspen. Slot ids are date+window keyed (e.g.
      // `20260501-am`), which means the slot picked on u-aspen-02
      // is still present in u1's visibleDays — the variants'
      // selected-invalidation useEffect won't drop it just because
      // the unit changed. That's deliberate: it isolates the
      // assertion to the lockedByOther guard.
      bookingActions.setUnit("u-aspen-02");

      const { container, getByTestId, queryByTestId } = render(<Component />);

      // Sanity: we are NOT in the locked state to begin with.
      expect(queryByTestId("banner-locked-by-other-mobile")).toBeNull();

      const continueBtn = getByTestId(
        "button-continue-mobile",
      ) as HTMLButtonElement;

      // No slot picked → Continue is disabled (baseline). This is
      // the `!selected` half of the guard; if it were the only half
      // left, the test would still pass at this point — the next
      // assertions are what catch the regression.
      expect(continueBtn.disabled).toBe(true);

      // Pick the first available slot tile. All three variants
      // expose tiles via `data-testid="mobile-slot-<id>"`; the
      // unbookable ones are rendered with `disabled`, so we
      // explicitly skip those.
      const firstSlot = container.querySelector<HTMLButtonElement>(
        'button[data-testid^="mobile-slot-"]:not([disabled])',
      );
      expect(firstSlot).not.toBeNull();
      fireEvent.click(firstSlot!);

      // Continue must enable now — confirms the click actually set
      // `selected` (otherwise step (d) below would pass trivially).
      expect(continueBtn.disabled).toBe(false);

      // Flip to u1 — same building, so slot ids stay valid, but
      // bk-1042 (paid) makes lockedByOther truthy.
      act(() => {
        bookingActions.setUnit("u1");
      });

      // The locked panel now replaces the day grid…
      expect(getByTestId("banner-locked-by-other-mobile")).toBeInTheDocument();
      // …and even though the previously-selected slot id is still
      // in component state, Continue must be disabled. If the
      // `!!lockedByOther` half of the guard were dropped, Continue
      // would re-enable here and this assertion would fail.
      expect(continueBtn.disabled).toBe(true);
    });
  },
);
