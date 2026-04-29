// @vitest-environment happy-dom

/**
 * Component-level regression tests for the three customer-facing slot
 * pickers (`SlotsMobile`, `SlotsMobileLite`, `SlotsDesktop`).
 *
 * The Schedule page redesign (Task #72) collapses the old vertical
 * day list into a compact day grid — the customer first picks a day
 * card, then the windows for that day reveal beneath it. The legacy
 * pink access-commitment banner and yellow "Not sure" callout were
 * stripped along the way; tests for those now live nowhere because
 * the surfaces themselves are gone.
 *
 * What this file still pins down:
 *
 *  1. No minute / hour DURATION text ever leaks into the rendered
 *     output for any seeded slot, regardless of job size or AC unsure
 *     state. (Clock-time strings like "8am – 12pm" are intentionally
 *     allowed.) The day grid renders no clock text on its own — only
 *     once a day is picked do the window cards appear — so this test
 *     covers the initial unselected state, which is what customers
 *     see first and what catches the most regressions.
 *
 *  2. Disabled window tiles render NO reason text at all (Task #61).
 *     We click a day card first to reveal the windows, then exercise
 *     the disabled tile inside that day's window grid. Uses the
 *     "medium" job-size scenario (255m) so morning windows (240m)
 *     are unbookable but afternoons (300m) still fit — that mix
 *     guarantees both a clickable day card AND a disabled tile in
 *     the revealed window grid.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";

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
  },
  {
    name: "SlotsMobileLite",
    Component: SlotsMobileLite,
    slotTestidPrefix: "mobile-slot-",
  },
  {
    name: "SlotsDesktop",
    Component: SlotsDesktop,
    slotTestidPrefix: "desktop-slot-",
  },
] as const;

/**
 * Job-size scenarios chosen to stress the slot grid in different ways:
 *  - tiny: every slot fits → exercises the "no leak in available tiles"
 *  - medium: morning windows (240m) too small, afternoon (300m) fine →
 *    exercises both fit and unfit paths in one render
 *  - huge: bigger than every seeded window → every tile is disabled
 *    (so every day card is greyed out)
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

/**
 * Each variant exposes its own testid for the be-there ack-checkbox so
 * the gate can be exercised in tests. The two mobile pickers share the
 * "button-continue-mobile" CTA testid; the desktop picker has its own.
 */
const ACK_TESTID_BY_VARIANT: Record<(typeof VARIANTS)[number]["name"], string> = {
  SlotsMobile: "ack-checkbox-mobile",
  SlotsMobileLite: "ack-checkbox-mobile-lite",
  SlotsDesktop: "ack-checkbox-desktop",
};

const CONTINUE_TESTID_BY_VARIANT: Record<(typeof VARIANTS)[number]["name"], string> = {
  SlotsMobile: "button-continue-mobile",
  SlotsMobileLite: "button-continue-mobile",
  SlotsDesktop: "button-continue-desktop",
};

describe.each(VARIANTS)("$name slot picker", ({
  name,
  Component,
  slotTestidPrefix,
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

  describe("disabled slot tiles render no reason text (Task #61)", () => {
    it("disables unbookable tiles, prevents selection, and renders no reason text", () => {
      // Medium job (255m) lets us guarantee a mix inside ONE day's
      // window grid: morning (240m) is unbookable, afternoon (300m)
      // fits, so the day card stays clickable AND the revealed
      // window grid contains at least one disabled tile.
      applyScenario("owner", {
        label: "medium",
        systems: 4,
        additional: 5,
        ac_discrepancy: null,
      });

      const { container } = render(<Component />);

      // Pick the first clickable day card so the window tiles appear.
      const firstDay = container.querySelector<HTMLButtonElement>(
        'button[data-testid^="day-card-"]:not([disabled])',
      );
      expect(firstDay).not.toBeNull();
      fireEvent.click(firstDay!);

      const disabledTiles = container.querySelectorAll<HTMLButtonElement>(
        `button[data-testid^="${slotTestidPrefix}"][disabled]`,
      );
      expect(disabledTiles.length).toBeGreaterThan(0);

      for (const tile of disabledTiles) {
        // The browser must refuse the click — `disabled` is the
        // single source of truth for "not selectable".
        expect(tile.disabled).toBe(true);

        const tileText = tile.textContent ?? "";

        // The reason text must be gone. None of the legacy copy may
        // reappear, including the previous generic "Full" label.
        expect(tileText).not.toContain("Full");
        expect(tileText).not.toContain("Not enough time left for this service");
        expect(tileText).not.toContain("Not yet open for booking");
        expect(tileText.toLowerCase()).not.toContain("won't fit");
        expect(tileText.toLowerCase()).not.toContain("minute service");
        expect(tileText).not.toMatch(NUMERIC_DURATION_RE);
        expect(tileText).not.toMatch(MINUTE_WORD_RE);
        expect(tileText).not.toMatch(HOUR_WORD_RE);
      }
    });

  });

  describe("be-there ack checkbox gates Confirm (Task #72)", () => {
    it("for be-there access methods: Confirm stays disabled until the customer ticks the ack checkbox, then enables", () => {
      // owner_live_at_unit is a be-there method, so the ack checkbox
      // must appear and gate Confirm. Use the tiny job so every
      // window fits and we can deterministically pick the morning.
      applyScenario("owner", {
        label: "tiny",
        systems: 1,
        additional: 0,
        ac_discrepancy: null,
      });
      bookingActions.setAccessMethod("owner_live_at_unit");

      const { container, getByTestId } = render(<Component />);

      const continueBtn = getByTestId(
        CONTINUE_TESTID_BY_VARIANT[name],
      ) as HTMLButtonElement;

      // Without a slot selected, Confirm is disabled — baseline.
      expect(continueBtn.disabled).toBe(true);

      // Pick a day, then a window. Confirm must STILL be disabled
      // because the ack checkbox hasn't been ticked yet.
      const firstDay = container.querySelector<HTMLButtonElement>(
        'button[data-testid^="day-card-"]:not([disabled])',
      );
      expect(firstDay).not.toBeNull();
      fireEvent.click(firstDay!);

      const firstSlot = container.querySelector<HTMLButtonElement>(
        `button[data-testid^="${slotTestidPrefix}"]:not([disabled])`,
      );
      expect(firstSlot).not.toBeNull();
      fireEvent.click(firstSlot!);

      expect(continueBtn.disabled).toBe(true);

      // Tick the ack — Confirm must enable now.
      const ack = getByTestId(
        ACK_TESTID_BY_VARIANT[name],
      ) as HTMLInputElement;
      expect(ack.checked).toBe(false);
      fireEvent.click(ack);
      expect(ack.checked).toBe(true);

      expect(continueBtn.disabled).toBe(false);
    });

    it("for non-be-there access methods: no ack checkbox is rendered, and Confirm enables once a slot is picked", () => {
      // owner_leased_leave_key is a non-be-there (key-holder) method.
      // The ack checkbox must NOT be in the DOM, and Confirm must
      // enable as soon as the customer picks a slot.
      applyScenario("owner", {
        label: "tiny",
        systems: 1,
        additional: 0,
        ac_discrepancy: null,
      });
      bookingActions.setAccessMethod("owner_leased_leave_key");

      const { container, getByTestId, queryByTestId } = render(<Component />);

      const continueBtn = getByTestId(
        CONTINUE_TESTID_BY_VARIANT[name],
      ) as HTMLButtonElement;

      // Pick a day and a window.
      const firstDay = container.querySelector<HTMLButtonElement>(
        'button[data-testid^="day-card-"]:not([disabled])',
      );
      expect(firstDay).not.toBeNull();
      fireEvent.click(firstDay!);

      const firstSlot = container.querySelector<HTMLButtonElement>(
        `button[data-testid^="${slotTestidPrefix}"]:not([disabled])`,
      );
      expect(firstSlot).not.toBeNull();
      fireEvent.click(firstSlot!);

      // Ack checkbox must not exist for non-be-there methods.
      expect(queryByTestId(ACK_TESTID_BY_VARIANT[name])).toBeNull();
      // Confirm must enable on slot selection alone.
      expect(continueBtn.disabled).toBe(false);
    });
  });

  describe("legacy reason text never appears on enabled tiles", () => {
    it("never renders the legacy reason text on enabled tiles either", () => {
      // A small job (45m) fits every seeded window, so every revealed
      // tile is enabled. The legacy reason text must be absent here too.
      applyScenario("owner", {
        label: "tiny",
        systems: 1,
        additional: 0,
        ac_discrepancy: null,
      });

      const { container } = render(<Component />);

      // Reveal the windows for the first day so there's something to
      // assert against.
      const firstDay = container.querySelector<HTMLButtonElement>(
        'button[data-testid^="day-card-"]:not([disabled])',
      );
      expect(firstDay).not.toBeNull();
      fireEvent.click(firstDay!);

      const enabledTiles = container.querySelectorAll<HTMLButtonElement>(
        `button[data-testid^="${slotTestidPrefix}"]:not([disabled])`,
      );
      expect(enabledTiles.length).toBeGreaterThan(0);

      for (const tile of enabledTiles) {
        const tileText = tile.textContent ?? "";
        expect(tileText).not.toContain("Full");
        expect(tileText).not.toContain("Not enough time left for this service");
        expect(tileText).not.toContain("Not yet open for booking");
      }
    });
  });
});
