// @vitest-environment happy-dom

/**
 * Component-level regression tests for the three customer-facing slot
 * pickers (`SlotsMobile`, `SlotsMobileLite`, `SlotsDesktop`).
 *
 * These pin down the conditional rendering rules established by Tasks
 * #27 / #29 so a future change to the seed data, the fit logic, or the
 * AC step can't silently re-introduce regressions:
 *
 *  1. No minute / hour DURATION text ever leaks into the rendered output
 *     for any seeded slot, regardless of job size or AC unsure state.
 *     (Clock-time strings like "8am – 12pm" are intentionally allowed.)
 *
 *  2. The "Not sure" callout renders if and only if
 *     `ac_discrepancy.customer.type === "unsure"` — never on a "split"
 *     or "ducted" answer, and never when there's no discrepancy at all.
 *
 *  3. Disabled slot tiles render only one of the two generic, non-numeric
 *     reasons ("Not enough time left for this service" or "Full") and
 *     never the old "Won't fit your N-minute service" copy.
 *
 * The store under `../../../state/bookingSession` is module-scoped, so
 * we reset it (and the underlying sessionStorage) between every test
 * to keep state from leaking across cases.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";

import { SlotsDesktop } from "./SlotsDesktop";
import { SlotsMobile } from "./SlotsMobile";
import { SlotsMobileLite } from "./SlotsMobileLite";
import {
  bookingActions,
  type AcDiscrepancy,
  type Role,
} from "../../../state/bookingSession";

// ─── Forbidden-text regexes ────────────────────────────────────────────────

/**
 * Matches a number followed by any duration unit — the kind of leakage
 * `formatDurationMinutes()` would produce ("45m", "4h 0m", "240 minutes",
 * "45-minute service"). Crucially does NOT match clock-time strings
 * like "8am" or "12pm" — the unit letter must be the entire word, so
 * the 'a' in "8am" / 'p' in "12pm" defeats the unit branch.
 */
const NUMERIC_DURATION_RE =
  /\b\d+\s*-?\s*(?:m(?:in(?:ute)?s?)?|h(?:rs?|ours?)?)\b/i;

/** Standalone "minute" / "minutes" word, anywhere — covers cases the
 *  numeric regex would miss (e.g. "a few minutes"). */
const MINUTE_WORD_RE = /\bminutes?\b/i;

/** Standalone "hour" / "hours" word, anywhere. */
const HOUR_WORD_RE = /\bhours?\b/i;

/** Phrases from the pre-Task-#27 copy that should never re-appear. */
const LEGACY_FORBIDDEN_SUBSTRINGS = [
  "minute service",
  "minutes left",
  "won't fit",
] as const;

// ─── Test fixtures ─────────────────────────────────────────────────────────

const VARIANTS = [
  {
    name: "SlotsMobile",
    Component: SlotsMobile,
    slotTestidPrefix: "mobile-slot-",
    unsureCalloutTestid: "callout-unsure-mobile",
    accountabilityNudgeTestid: "nudge-accountability-mobile",
  },
  {
    name: "SlotsMobileLite",
    Component: SlotsMobileLite,
    slotTestidPrefix: "mobile-slot-",
    unsureCalloutTestid: "callout-unsure-mobile",
    accountabilityNudgeTestid: "nudge-accountability-mobile",
  },
  {
    name: "SlotsDesktop",
    Component: SlotsDesktop,
    slotTestidPrefix: "desktop-slot-",
    unsureCalloutTestid: "callout-unsure-desktop",
    accountabilityNudgeTestid: "nudge-accountability-desktop",
  },
] as const;

// Distinct keywords baked into the role-conditional accountability copy
// so the assertions don't have to mirror the entire sentence verbatim.
// Mirrors the literals used by the slot-picker components.
const OWNER_NUDGE_KEYWORD = "be home for";
const AGENT_NUDGE_KEYWORD = "coordinate a second visit with the tenant";

/**
 * Job-size scenarios chosen to stress the slot grid in different ways:
 *  - tiny: every slot fits → exercises the "no leak in available tiles"
 *  - medium: morning windows (240m) too small, afternoon (300m) fine →
 *    exercises both fit and unfit paths in one render
 *  - huge: bigger than every seeded window → every tile is disabled
 *  - unsure: forces `getBookingDurationMinutes` down its fallback branch
 *    (and toggles the "Not sure" callout — covered separately too).
 */
type Scenario = {
  label: string;
  systems: number;
  additional: number;
  ac_discrepancy: AcDiscrepancy | null;
};

const SCENARIOS: Scenario[] = [
  {
    label: "tiny job (defaults)",
    systems: 1,
    additional: 0,
    ac_discrepancy: null,
  },
  {
    label: "medium job (255m)",
    systems: 4,
    additional: 5,
    ac_discrepancy: null,
  },
  {
    label: "huge job (315m, every slot full)",
    systems: 7,
    additional: 0,
    ac_discrepancy: null,
  },
  {
    label: "unsure customer",
    systems: 1,
    additional: 0,
    ac_discrepancy: {
      recorded: { type: "split", systems: 2, additional: 1 },
      customer: { type: "unsure" },
    },
  },
];

const ROLES: Role[] = ["owner", "agent"];

// ─── Setup / teardown ──────────────────────────────────────────────────────

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

function applyScenario(role: Role, s: Scenario) {
  bookingActions.setRole(role);
  bookingActions.setSystems(s.systems);
  bookingActions.setAdditionalIndoor(s.additional);
  bookingActions.setAcDiscrepancy(s.ac_discrepancy);
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe.each(VARIANTS)("$name slot picker", ({
  Component,
  slotTestidPrefix,
  unsureCalloutTestid,
  accountabilityNudgeTestid,
}) => {
  describe("no minute/hour leakage in customer UI", () => {
    for (const role of ROLES) {
      for (const scenario of SCENARIOS) {
        it(`renders no duration text for ${role} on ${scenario.label}`, () => {
          applyScenario(role, scenario);
          const { container } = render(<Component />);

          const text = container.textContent ?? "";

          expect(text).not.toMatch(NUMERIC_DURATION_RE);
          expect(text).not.toMatch(MINUTE_WORD_RE);
          expect(text).not.toMatch(HOUR_WORD_RE);
          for (const phrase of LEGACY_FORBIDDEN_SUBSTRINGS) {
            // Lower-cased compare so we catch any casing variant.
            expect(text.toLowerCase()).not.toContain(phrase);
          }
        });
      }
    }
  });

  describe('"Not sure" callout visibility', () => {
    it("hides the callout when there is no AC discrepancy", () => {
      bookingActions.setRole("owner");
      bookingActions.setAcDiscrepancy(null);
      const { queryByTestId } = render(<Component />);
      expect(queryByTestId(unsureCalloutTestid)).toBeNull();
    });

    it('hides the callout when the customer answered "split"', () => {
      bookingActions.setRole("owner");
      bookingActions.setAcDiscrepancy({
        recorded: { type: "split", systems: 2, additional: 1 },
        customer: { type: "split", systems: 1, additional: 0 },
      });
      const { queryByTestId } = render(<Component />);
      expect(queryByTestId(unsureCalloutTestid)).toBeNull();
    });

    it('hides the callout when the customer answered "ducted"', () => {
      bookingActions.setRole("owner");
      bookingActions.setAcDiscrepancy({
        recorded: { type: "split", systems: 2, additional: 1 },
        customer: { type: "ducted", systems: 1, additional: 0 },
      });
      const { queryByTestId } = render(<Component />);
      expect(queryByTestId(unsureCalloutTestid)).toBeNull();
    });

    it('shows the callout when the customer answered "unsure"', () => {
      bookingActions.setRole("owner");
      bookingActions.setAcDiscrepancy({
        recorded: { type: "split", systems: 2, additional: 1 },
        customer: { type: "unsure" },
      });
      const { getByTestId } = render(<Component />);
      const callout = getByTestId(unsureCalloutTestid);
      // Sanity-check the callout itself is also free of duration leaks.
      const calloutText = callout.textContent ?? "";
      expect(calloutText).not.toMatch(NUMERIC_DURATION_RE);
      expect(calloutText).not.toMatch(MINUTE_WORD_RE);
      expect(calloutText).not.toMatch(HOUR_WORD_RE);
    });
  });

  describe("disabled slot tiles render a generic, non-numeric reason", () => {
    it("renders only the generic non-numeric reason on every disabled tile", () => {
      // Force a job size that's larger than every seeded morning AND
      // afternoon window so we're guaranteed at least one disabled tile.
      // 7 systems × 45m = 315m > 300m (afternoon) > 240m (morning).
      applyScenario("owner", {
        label: "saturating",
        systems: 7,
        additional: 0,
        ac_discrepancy: null,
      });

      const { container } = render(<Component />);

      const disabledTiles = container.querySelectorAll<HTMLButtonElement>(
        `button[data-testid^="${slotTestidPrefix}"][disabled]`,
      );
      expect(disabledTiles.length).toBeGreaterThan(0);

      for (const tile of disabledTiles) {
        const tileText = tile.textContent ?? "";
        // Each disabled tile must surface ONE of the two generic, non-numeric
        // reasons the components are allowed to show:
        //   - "Full" when status === "full"
        //   - "Not enough time left for this service" otherwise
        // Both are generic and contain no minutes/hours.
        const hasGenericReason =
          tileText.includes("Not enough time left for this service") ||
          tileText.includes("Full");
        expect(hasGenericReason).toBe(true);
        expect(tileText.toLowerCase()).not.toContain("won't fit");
        expect(tileText.toLowerCase()).not.toContain("minute service");
        expect(tileText).not.toMatch(NUMERIC_DURATION_RE);
        expect(tileText).not.toMatch(MINUTE_WORD_RE);
        expect(tileText).not.toMatch(HOUR_WORD_RE);
      }
    });

    it("does not render the disabled-reason copy on enabled tiles", () => {
      // A small job (45m) fits every seeded window, so every tile is
      // enabled and the disabled-reason text must be absent.
      applyScenario("owner", {
        label: "tiny",
        systems: 1,
        additional: 0,
        ac_discrepancy: null,
      });

      const { container } = render(<Component />);

      const enabledTiles = container.querySelectorAll<HTMLButtonElement>(
        `button[data-testid^="${slotTestidPrefix}"]:not([disabled])`,
      );
      expect(enabledTiles.length).toBeGreaterThan(0);

      for (const tile of enabledTiles) {
        const tileText = tile.textContent ?? "";
        expect(tileText).not.toContain("Not enough time left for this service");
        // "Full" is the other allowed disabled-reason — it must also be absent
        // on enabled tiles (enabled tiles render the slot duration label, not
        // either disabled-reason copy).
        expect(tileText).not.toContain("Full");
      }
    });
  });

  describe("accountability nudge flips copy by role", () => {
    /**
     * The accountability nudge lives inside the "Not sure" callout, so
     * we only render it when the customer answered "unsure" on the AC
     * step. These tests pin the role-conditional phrasing in place so
     * a future copy refactor can't quietly collapse owner / agent into
     * a single message again.
     */
    function renderUnsureFor(role: Role) {
      bookingActions.setRole(role);
      bookingActions.setAcDiscrepancy({
        recorded: { type: "split", systems: 2, additional: 1 },
        customer: { type: "unsure" },
      });
      return render(<Component />);
    }

    it("uses the owner copy when role === 'owner'", () => {
      const { getByTestId } = renderUnsureFor("owner");
      const nudge = getByTestId(accountabilityNudgeTestid);
      const text = nudge.textContent ?? "";
      expect(text).toContain(OWNER_NUDGE_KEYWORD);
      expect(text).not.toContain(AGENT_NUDGE_KEYWORD);
    });

    it("uses the agent copy when role === 'agent'", () => {
      const { getByTestId } = renderUnsureFor("agent");
      const nudge = getByTestId(accountabilityNudgeTestid);
      const text = nudge.textContent ?? "";
      expect(text).toContain(AGENT_NUDGE_KEYWORD);
      expect(text).not.toContain(OWNER_NUDGE_KEYWORD);
    });

    it("falls back to the owner copy when role is unset", () => {
      // The customer can technically reach the slot picker iframe in
      // isolation (e.g. via the mockup canvas) before picking a role.
      // We default to the owner phrasing in that case rather than
      // showing nothing — the canvas mockup should still read sensibly.
      bookingActions.setRole(null);
      bookingActions.setAcDiscrepancy({
        recorded: { type: "split", systems: 2, additional: 1 },
        customer: { type: "unsure" },
      });
      const { getByTestId } = render(<Component />);
      const text = getByTestId(accountabilityNudgeTestid).textContent ?? "";
      expect(text).toContain(OWNER_NUDGE_KEYWORD);
      expect(text).not.toContain(AGENT_NUDGE_KEYWORD);
    });

    it("does not render the nudge at all when the callout is hidden", () => {
      bookingActions.setRole("agent");
      bookingActions.setAcDiscrepancy(null);
      const { queryByTestId } = render(<Component />);
      expect(queryByTestId(accountabilityNudgeTestid)).toBeNull();
    });
  });
});
