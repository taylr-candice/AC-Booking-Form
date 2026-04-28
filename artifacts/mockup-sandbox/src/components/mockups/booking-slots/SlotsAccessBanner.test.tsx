// @vitest-environment happy-dom

/**
 * Pins down the slot-picker access-commitment banner branching added by
 * Task #55:
 *
 *   - Be-there access methods (owner_live_at_unit, owner_leased_be_there,
 *     owner_vacant_be_there, agent_be_there) → `data-access-mode="attended"`,
 *     copy says "you ... are available for the entire window", and the
 *     "Change access method" affordance (`button-change-access`) is visible.
 *
 *   - Leave-key (key_holder) → `attended`, copy says "your key holder ... is
 *     available", and `button-change-access` is hidden (only be-there gets
 *     the nudge).
 *
 *   - Tenant-self coordination (`agent_tenant_self`) → `attended`, copy
 *     says "your tenant ... is available", and `button-change-access` is
 *     hidden.
 *
 *   - Unattended methods (parcel locker, collect & return, agency trade
 *     key) → `data-access-mode="unattended"`, copy uses the "authorising
 *     us" framing and never says "available for the entire window", and
 *     `button-change-access` is hidden.
 *
 *   - `button-edit-ac` is always visible, regardless of access method.
 *
 * Both desktop and mobile slot pickers are exercised so the two copies
 * stay in lockstep.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";

import { SlotsDesktop } from "./SlotsDesktop";
import { SlotsMobile } from "./SlotsMobile";
import { bookingActions, type AccessMethod } from "../../../state/bookingSession";

const VARIANTS = [
  { name: "SlotsDesktop", Component: SlotsDesktop, bannerTestid: "banner-access-commitment-desktop" },
  { name: "SlotsMobile",  Component: SlotsMobile,  bannerTestid: "banner-access-commitment-mobile" },
] as const;

const BE_THERE: AccessMethod[] = [
  "owner_live_at_unit",
  "owner_leased_be_there",
  "owner_vacant_be_there",
  "agent_be_there",
];

const UNATTENDED: AccessMethod[] = [
  "owner_live_collect",
  "owner_vacant_collect",
  "owner_leased_parcel_locker",
  "owner_vacant_parcel_locker",
  "agent_trade_key",
];

beforeEach(() => {
  if (typeof window !== "undefined") window.sessionStorage.clear();
  bookingActions.reset();
  // Slot picker reads role + AC counts via useBookingSession; we just need
  // a sensible owner default here, copy doesn't depend on it.
  bookingActions.setRole("owner");
  bookingActions.setSystems(1);
  bookingActions.setAdditionalIndoor(0);
});

afterEach(() => {
  cleanup();
  if (typeof window !== "undefined") window.sessionStorage.clear();
  bookingActions.reset();
});

describe.each(VARIANTS)("$name access-commitment banner", ({ Component, bannerTestid }) => {
  describe("defensive fallback (no access method set)", () => {
    it("renders the attended banner with grammatically-correct 'you are' copy", () => {
      // No setAccessMethod → reset already cleared it.
      const { getByTestId, queryByTestId } = render(<Component />);

      const banner = getByTestId(bannerTestid);
      expect(banner.getAttribute("data-access-mode")).toBe("attended");

      const text = banner.textContent ?? "";
      expect(text).toContain("you are available for the entire window");
      // Must NOT produce "you is" — that would be the broken grammar
      // path the partyVerb fix avoids.
      expect(text).not.toMatch(/\byou is\b/);

      // No method → can't be a be-there option, so the change-access
      // nudge stays hidden.
      expect(queryByTestId("button-change-access")).toBeNull();
    });
  });

  describe("attended (be-there) methods", () => {
    for (const method of BE_THERE) {
      it(`shows the attended banner with the change-access nudge for ${method}`, () => {
        bookingActions.setAccessMethod(method);
        const { getByTestId, queryByTestId } = render(<Component />);

        const banner = getByTestId(bannerTestid);
        expect(banner.getAttribute("data-access-mode")).toBe("attended");

        const text = banner.textContent ?? "";
        expect(text).toContain("available for the entire window");
        // Be-there → references the customer themselves (never key holder / tenant).
        expect(text).not.toContain("your key holder");
        expect(text).not.toContain("your tenant");
        // Authorisation framing belongs to the unattended branch only.
        expect(text).not.toContain("authorising us");

        expect(queryByTestId("button-change-access")).not.toBeNull();
        expect(queryByTestId("button-edit-ac")).not.toBeNull();
      });
    }
  });

  describe("attended leave-key methods reference the key holder", () => {
    it("uses 'your key holder' copy and hides the change-access nudge", () => {
      bookingActions.setAccessMethod("owner_leased_leave_key");
      const { getByTestId, queryByTestId } = render(<Component />);

      const banner = getByTestId(bannerTestid);
      expect(banner.getAttribute("data-access-mode")).toBe("attended");

      const text = banner.textContent ?? "";
      expect(text).toContain("your key holder");
      expect(text).toContain("available for the entire window");

      expect(queryByTestId("button-change-access")).toBeNull();
      expect(queryByTestId("button-edit-ac")).not.toBeNull();
    });
  });

  describe("agent_tenant_self references the tenant", () => {
    it("uses 'your tenant' copy and hides the change-access nudge", () => {
      bookingActions.setAccessMethod("agent_tenant_self");
      const { getByTestId, queryByTestId } = render(<Component />);

      const banner = getByTestId(bannerTestid);
      expect(banner.getAttribute("data-access-mode")).toBe("attended");

      const text = banner.textContent ?? "";
      expect(text).toContain("your tenant");
      expect(text).toContain("available for the entire window");

      expect(queryByTestId("button-change-access")).toBeNull();
      expect(queryByTestId("button-edit-ac")).not.toBeNull();
    });
  });

  describe("unattended methods", () => {
    for (const method of UNATTENDED) {
      it(`shows the authorising-us banner with no change-access nudge for ${method}`, () => {
        bookingActions.setAccessMethod(method);
        const { getByTestId, queryByTestId } = render(<Component />);

        const banner = getByTestId(bannerTestid);
        expect(banner.getAttribute("data-access-mode")).toBe("unattended");

        const text = banner.textContent ?? "";
        expect(text).toContain("authorising us");
        expect(text).toContain("no one needs to be there");
        // The "available for the entire window" warning is the attended
        // branch — it must NOT leak into unattended copy.
        expect(text).not.toContain("available for the entire window");

        expect(queryByTestId("button-change-access")).toBeNull();
        expect(queryByTestId("button-edit-ac")).not.toBeNull();
      });
    }
  });
});
