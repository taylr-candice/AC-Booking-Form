// @vitest-environment happy-dom

/**
 * Privacy regression for the customer-facing slot pickers.
 *
 * When a customer reaches the slot picker for a property that already
 * has a confirmed booking by another party, all three picker variants
 * (`SlotsMobile`, `SlotsDesktop`, `SlotsMobileLite`) replace the day
 * grid with a read-only "Already scheduled for this address" panel.
 *
 * That panel must remain generic — no name, email, phone, date or
 * window from the existing booking may leak into the rendered output.
 *
 * Seeded blocker on `u1` (`bk-1042`):
 *   Henrik Olsen · henrik.o@example.com · 0411 222 901
 *   2026-04-29 · morning
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { ComponentType } from "react";

import { SlotsDesktop } from "./SlotsDesktop";
import { SlotsMobile } from "./SlotsMobile";
import { SlotsMobileLite } from "./SlotsMobileLite";
import { bookingActions } from "../../../state/bookingSession";

beforeEach(() => {
  if (typeof window !== "undefined") window.sessionStorage.clear();
  bookingActions.reset();
  // Pin the customer's session to unit `u1`, which has a seeded paid
  // blocker (`bk-1042`). Every picker variant resolves the same
  // `lockedByOther` panel from this state.
  bookingActions.setUnit("u1");
});

afterEach(() => {
  cleanup();
  if (typeof window !== "undefined") window.sessionStorage.clear();
  bookingActions.reset();
});

const VARIANTS: ReadonlyArray<{
  label: string;
  Component: ComponentType;
  bannerTestId: string;
  supportEmailTestId: string;
}> = [
  {
    label: "SlotsMobile",
    Component: SlotsMobile,
    bannerTestId: "banner-locked-by-other-mobile",
    supportEmailTestId: "link-locked-support-email-mobile",
  },
  {
    label: "SlotsDesktop",
    Component: SlotsDesktop,
    bannerTestId: "banner-locked-by-other-desktop",
    supportEmailTestId: "link-locked-support-email-desktop",
  },
  {
    label: "SlotsMobileLite",
    Component: SlotsMobileLite,
    bannerTestId: "banner-locked-by-other-mobile-lite",
    supportEmailTestId: "link-locked-support-email-mobile-lite",
  },
];

/**
 * PII tokens from the seeded `bk-1042` blocker on unit `u1`.
 * Each one of these appearing in the locked panel would be a leak.
 */
const BLOCKER_PII_TOKENS = [
  "Henrik",
  "Olsen",
  "henrik.o@example.com",
  "0411",
  "222 901",
  "2026-04-29",
  "29 Apr",
  "Apr 29",
  "Morning",
  "morning",
] as const;

describe.each(VARIANTS)(
  "Slot picker — $label — privacy of locked-by-other panel",
  ({ Component, bannerTestId, supportEmailTestId }) => {
    it("renders the locked panel with the support email and leaks no blocker PII", () => {
      render(<Component />);

      const banner = screen.getByTestId(bannerTestId);
      expect(banner).toBeInTheDocument();

      // The panel still surfaces the Taylr support email so a co-tenant
      // / co-owner has a place to ask questions.
      const supportLink = screen.getByTestId(supportEmailTestId);
      expect(supportLink).toHaveAttribute(
        "href",
        "mailto:support@taylr.com.au",
      );
      expect(supportLink).toHaveTextContent("support@taylr.com.au");

      // The panel text must contain NONE of the blocker booking's PII.
      const bannerText = banner.textContent ?? "";
      for (const token of BLOCKER_PII_TOKENS) {
        expect(bannerText).not.toContain(token);
      }
    });
  },
);
