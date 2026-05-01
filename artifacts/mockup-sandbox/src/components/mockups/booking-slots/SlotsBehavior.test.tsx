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
 * The "be available for the entire window" reminder used to live as a
 * checkbox above Confirm; the customer had to tick it before the
 * booking could be confirmed. After the post-Task-#123 redesign that
 * reminder moved up into the SlotsAccessBanner at the top of the page
 * — the same words now read as a notification ("This is a window, not
 * a set time…") with an inline "Change access method" prompt instead
 * of being a tickbox. So the test ids for the old be-there ack are
 * gone; what remains is a per-variant lookup for the banner + its
 * change-access link, the cancellation-terms ack (Task #121, still a
 * checkbox), and the Confirm button.
 */
const BANNER_TESTID_BY_VARIANT: Record<
  (typeof VARIANTS)[number]["name"],
  string
> = {
  SlotsMobile: "banner-window-notice-mobile",
  SlotsMobileLite: "banner-window-notice-mobile-lite",
  SlotsDesktop: "banner-window-notice-desktop",
};

const CHANGE_ACCESS_TESTID_BY_VARIANT: Record<
  (typeof VARIANTS)[number]["name"],
  string
> = {
  SlotsMobile: "button-change-access-mobile",
  SlotsMobileLite: "button-change-access-mobile-lite",
  SlotsDesktop: "button-change-access-desktop",
};

const CANCELLATION_ACK_TESTID_BY_VARIANT: Record<
  (typeof VARIANTS)[number]["name"],
  string
> = {
  SlotsMobile: "checkbox-cancellation-ack-mobile",
  SlotsMobileLite: "checkbox-cancellation-ack-mobile-lite",
  SlotsDesktop: "checkbox-cancellation-ack-desktop",
};

const VIEW_TERMS_TESTID_BY_VARIANT: Record<
  (typeof VARIANTS)[number]["name"],
  string
> = {
  SlotsMobile: "button-view-cancellation-terms-mobile",
  SlotsMobileLite: "button-view-cancellation-terms-mobile-lite",
  SlotsDesktop: "button-view-cancellation-terms-desktop",
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

  describe("top-of-page window-notice banner (post-Task-#123)", () => {
    it("for be-there access methods: shows the be-there heads-up copy with a Change-access link, and the be-there ack checkbox is gone — only the cancellation ack gates Confirm", () => {
      // owner_live_at_unit is a be-there method. After the redesign
      // there's no checkbox above Confirm to tick — instead the
      // banner at the top reads "This is a window, not a set time"
      // and asks the customer to be available for the entire window,
      // with an inline "Change access method" prompt for those who
      // want to switch to a key-holder / lockbox method after
      // reading it.
      applyScenario("owner", {
        label: "tiny",
        systems: 1,
        additional: 0,
        ac_discrepancy: null,
      });
      bookingActions.setAccessMethod("owner_live_at_unit");

      const { container, getByTestId, queryByTestId } = render(
        <Component />,
      );

      // Banner is present, marked as the be-there variant, and
      // includes the entire-window reminder + a Change-access link.
      const banner = getByTestId(BANNER_TESTID_BY_VARIANT[name]);
      expect(banner.getAttribute("data-access-mode")).toBe("be-there");
      expect(banner.textContent ?? "").toContain(
        "This is a window, not a set time",
      );
      expect(banner.textContent ?? "").toContain(
        "available for the entire window",
      );
      expect(getByTestId(CHANGE_ACCESS_TESTID_BY_VARIANT[name])).toBeTruthy();

      // The legacy be-there ack checkbox must NOT be in the DOM —
      // any picker variant. The reminder is now a notification, not
      // a tickbox.
      expect(
        queryByTestId(`ack-checkbox-${
          name === "SlotsMobile"
            ? "mobile"
            : name === "SlotsMobileLite"
              ? "mobile-lite"
              : "desktop"
        }`),
      ).toBeNull();

      // Pick a day, then a window. Confirm stays disabled until the
      // cancellation ack is ticked — but it does NOT need a separate
      // be-there checkbox.
      const continueBtn = getByTestId(
        CONTINUE_TESTID_BY_VARIANT[name],
      ) as HTMLButtonElement;
      expect(continueBtn.disabled).toBe(true);

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

      // Slot picked but cancellation ack still untouched — Confirm
      // is the gated step.
      expect(continueBtn.disabled).toBe(true);

      const cancellationAck = getByTestId(
        CANCELLATION_ACK_TESTID_BY_VARIANT[name],
      ) as HTMLInputElement;
      expect(cancellationAck.checked).toBe(false);
      fireEvent.click(cancellationAck);
      expect(cancellationAck.checked).toBe(true);

      expect(continueBtn.disabled).toBe(false);
    });

    it("for non-be-there access methods: shows the unattended-mode copy in the banner, and the cancellation ack alone gates Confirm", () => {
      // owner_leased_leave_key is a non-be-there (key-holder) method.
      // The banner switches copy: no "be available for the entire
      // window" reminder — instead it explains the service will
      // happen sometime within the window.
      applyScenario("owner", {
        label: "tiny",
        systems: 1,
        additional: 0,
        ac_discrepancy: null,
      });
      bookingActions.setAccessMethod("owner_leased_leave_key");

      const { container, getByTestId } = render(<Component />);

      const banner = getByTestId(BANNER_TESTID_BY_VARIANT[name]);
      expect(banner.getAttribute("data-access-mode")).toBe("unattended");
      expect(banner.textContent ?? "").toContain(
        "This is a window, not a set time",
      );
      expect(banner.textContent ?? "").not.toContain(
        "available for the entire window",
      );

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

      // Cancellation ack alone still gates Confirm.
      expect(continueBtn.disabled).toBe(true);

      const cancellationAck = getByTestId(
        CANCELLATION_ACK_TESTID_BY_VARIANT[name],
      ) as HTMLInputElement;
      fireEvent.click(cancellationAck);

      expect(continueBtn.disabled).toBe(false);
    });
  });

  describe("cancellation-terms ack on Schedule (Task #121)", () => {
    it("renders the cancellation ack and View terms link regardless of access method or whether a slot has been picked", () => {
      // No access method is set — the ack must still be visible. The
      // cancellation policy applies to every booking, not just the
      // ones that need a be-there ack.
      applyScenario("owner", {
        label: "tiny",
        systems: 1,
        additional: 0,
        ac_discrepancy: null,
      });

      const { getByTestId } = render(<Component />);

      // The ack and the View terms link both render before any slot
      // is picked, so the customer can tick it any time on the page.
      const ack = getByTestId(
        CANCELLATION_ACK_TESTID_BY_VARIANT[name],
      ) as HTMLInputElement;
      expect(ack.checked).toBe(false);
      expect(getByTestId(VIEW_TERMS_TESTID_BY_VARIANT[name])).toBeTruthy();
    });

    it("uses the universal ack label that drops 'above' so it reads cleanly with the link to the modal", () => {
      applyScenario("owner", {
        label: "tiny",
        systems: 1,
        additional: 0,
        ac_discrepancy: null,
      });

      const { getByTestId, container } = render(<Component />);

      const ack = getByTestId(CANCELLATION_ACK_TESTID_BY_VARIANT[name]);
      const ackLabel = ack.closest("label");
      expect(ackLabel?.textContent ?? "").toContain(
        "I have read and accept the cancellation and rescheduling terms.",
      );
      // The old "above" wording must not leak back in anywhere.
      expect(container.textContent ?? "").not.toMatch(/terms above/i);
    });

    it("opens the cancellation terms modal when View terms is clicked, and closes it on the close button", () => {
      applyScenario("owner", {
        label: "tiny",
        systems: 1,
        additional: 0,
        ac_discrepancy: null,
      });

      const { getByTestId, queryByTestId } = render(<Component />);

      // Modal isn't mounted by default.
      expect(queryByTestId("modal-cancellation-terms")).toBeNull();

      fireEvent.click(getByTestId(VIEW_TERMS_TESTID_BY_VARIANT[name]));

      // Modal mounts, with the policy paragraphs and the support
      // contact line both rendered inside it.
      expect(getByTestId("modal-cancellation-terms")).toBeTruthy();
      expect(
        getByTestId("cancellation-terms-paragraphs").textContent ?? "",
      ).toMatch(/48 hours/);
      expect(
        getByTestId("cancellation-terms-contact").textContent ?? "",
      ).toContain("support@taylr.com.au");

      fireEvent.click(getByTestId("button-cancellation-terms-close"));
      expect(queryByTestId("modal-cancellation-terms")).toBeNull();
    });
  });

  describe("Next available smart-suggestion card (Task #241 follow-up)", () => {
    it("hides itself when no slot is available (huge job — every window full)", () => {
      // Huge job (315m) is bigger than every seeded window, so
      // findNextAvailable returns null and the card + the "Or choose
      // another day" sub-label both stay out of the DOM.
      applyScenario("owner", {
        label: "huge",
        systems: 7,
        additional: 0,
        ac_discrepancy: null,
      });

      const { queryByTestId } = render(<Component />);
      const suffix =
        name === "SlotsMobile"
          ? "mobile"
          : name === "SlotsMobileLite"
            ? "mobile-lite"
            : "desktop";
      expect(queryByTestId(`next-available-card-${suffix}`)).toBeNull();
      expect(
        queryByTestId(`label-choose-another-day-${suffix}`),
      ).toBeNull();
    });

    it("appears above the day picker, exposes the soonest day+window, and one-tap selects day + window + acks the cancellation terms", () => {
      // Tiny job → every seeded window is bookable, so the card has
      // a real "next available" pair to render.
      applyScenario("owner", {
        label: "tiny",
        systems: 1,
        additional: 0,
        ac_discrepancy: null,
      });

      const { container, getByTestId } = render(<Component />);

      // Suffix lookup so we can hit the right testIds per variant.
      const suffix =
        name === "SlotsMobile"
          ? "mobile"
          : name === "SlotsMobileLite"
            ? "mobile-lite"
            : "desktop";

      // Card renders above the day picker — verify both exist and
      // the card is positioned earlier in document order than the
      // day grid container.
      const card = getByTestId(`next-available-card-${suffix}`);
      const dayGrid = getByTestId(`customer-days-${suffix}`);
      expect(card).not.toBeNull();
      expect(dayGrid).not.toBeNull();
      expect(
        card.compareDocumentPosition(dayGrid) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).not.toBe(0);

      // Cancellation ack starts unticked, no slot selected, and the
      // docked Confirm is therefore disabled.
      const ack = getByTestId(
        CANCELLATION_ACK_TESTID_BY_VARIANT[name],
      ) as HTMLInputElement;
      const confirm = getByTestId(
        CONTINUE_TESTID_BY_VARIANT[name],
      ) as HTMLButtonElement;
      expect(ack.checked).toBe(false);
      expect(confirm.disabled).toBe(true);
      expect(
        container.querySelectorAll(
          `button[data-testid^="${slotTestidPrefix}"][aria-pressed="true"]`,
        ).length,
      ).toBe(0);

      // Tap the shortcut.
      const book = getByTestId(`button-book-next-available-${suffix}`);
      fireEvent.click(book);

      // After one tap: a window slot is selected (aria-pressed=true),
      // the cancellation terms are acked, and the docked Confirm is
      // now enabled — the customer has nothing else to tick before
      // they can move forward.
      const pressed = container.querySelectorAll<HTMLButtonElement>(
        `button[data-testid^="${slotTestidPrefix}"][aria-pressed="true"]`,
      );
      expect(pressed.length).toBe(1);
      expect(ack.checked).toBe(true);
      expect(confirm.disabled).toBe(false);
    });

    it("renders click-wrap consent microcopy in the same card as the CTA, and the View terms link opens the cancellation modal", () => {
      // Tiny job → card is renderable, so we can assert its consent
      // affordances. This guards the legal click-wrap from accidental
      // removal or layout separation in future refactors.
      applyScenario("owner", {
        label: "tiny",
        systems: 1,
        additional: 0,
        ac_discrepancy: null,
      });

      const { getByTestId, queryByTestId } = render(<Component />);
      const suffix =
        name === "SlotsMobile"
          ? "mobile"
          : name === "SlotsMobileLite"
            ? "mobile-lite"
            : "desktop";

      // Consent line is present and lives inside the same card
      // container as the Book CTA — so a customer cannot miss it
      // visually before tapping.
      const card = getByTestId(`next-available-card-${suffix}`);
      const consent = getByTestId(`next-available-consent-${suffix}`);
      const book = getByTestId(`button-book-next-available-${suffix}`);
      expect(card.contains(consent)).toBe(true);
      expect(card.contains(book)).toBe(true);
      expect(consent.textContent ?? "").toMatch(
        /By tapping.*Book this time.*cancellation and rescheduling terms/,
      );

      // View terms is a real button (keyboard + screen-reader
      // reachable, not inert text) and opens the cancellation modal,
      // so the customer can read the policy before tapping the CTA.
      expect(queryByTestId("modal-cancellation-terms")).toBeNull();
      const viewTerms = getByTestId(
        `button-view-next-available-terms-${suffix}`,
      );
      expect(viewTerms.tagName).toBe("BUTTON");
      fireEvent.click(viewTerms);
      expect(queryByTestId("modal-cancellation-terms")).not.toBeNull();
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
