// @vitest-environment happy-dom

/**
 * Pins down the slot-picker access-commitment banner, which now
 * branches into THREE access modes — the "Heads up: be available
 * the entire window" warning is reserved for customers who
 * personally committed to meeting the technician:
 *
 *   - "self-attended" (be-there: owner_live_at_unit,
 *     owner_leased_be_there, owner_vacant_be_there, agent_be_there)
 *     → the only mode that gets the "Heads up" framing. Copy says
 *     "you are available for the entire window" and the
 *     "Change access method" affordance (`button-change-access`)
 *     is visible.
 *
 *   - "coordinated" (leave-key, agent_tenant_self, defensive
 *     fallback when no method is set) → drops the "Heads up"
 *     framing and the per-party "be available" warning. Replaces
 *     it with a softer informational note that the service will
 *     be carried out sometime within the chosen window with no
 *     set arrival time. `button-change-access` is hidden.
 *
 *   - "unattended" (parcel locker, collect & return, agency trade
 *     key) → uses the "authorising us" framing. Never says
 *     "available for the entire window" or "Heads up".
 *     `button-change-access` is hidden.
 *
 *   - `button-edit-ac` is always visible, regardless of access
 *     method.
 *
 * Both desktop and mobile slot pickers are exercised so the two
 * copies stay in lockstep.
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
    it("renders the coordinated banner with the informational copy and no Heads up", () => {
      // No setAccessMethod → reset already cleared it.
      const { getByTestId, queryByTestId } = render(<Component />);

      const banner = getByTestId(bannerTestid);
      expect(banner.getAttribute("data-access-mode")).toBe("coordinated");

      const text = banner.textContent ?? "";
      // Informational scheduling-model explanation must be present.
      expect(text).toContain("sometime within the window");
      expect(text).toContain("no set arrival time");
      // The heavy "Heads up" framing and per-party "be available"
      // warning must NOT show — those are reserved for self-attended.
      expect(text).not.toContain("Heads up");
      expect(text).not.toContain("available for the entire window");
      // No method → can't be a be-there option, so the change-access
      // nudge stays hidden.
      expect(queryByTestId("button-change-access")).toBeNull();
    });
  });

  describe("self-attended (be-there) methods", () => {
    for (const method of BE_THERE) {
      it(`shows the Heads up banner with the change-access nudge for ${method}`, () => {
        bookingActions.setAccessMethod(method);
        const { getByTestId, queryByTestId } = render(<Component />);

        const banner = getByTestId(bannerTestid);
        expect(banner.getAttribute("data-access-mode")).toBe("self-attended");

        const text = banner.textContent ?? "";
        // Be-there is the ONLY mode that gets "Heads up" + "be
        // available the entire window" copy, and it always
        // references the customer themselves ("you are").
        expect(text).toContain("Heads up");
        expect(text).toContain("you are available for the entire window");
        // Be-there → never references key holder / tenant.
        expect(text).not.toContain("your key holder");
        expect(text).not.toContain("your tenant");
        // Authorisation framing belongs to the unattended branch only.
        expect(text).not.toContain("authorising us");

        expect(queryByTestId("button-change-access")).not.toBeNull();
        expect(queryByTestId("button-edit-ac")).not.toBeNull();
      });
    }
  });

  describe("coordinated leave-key methods (key holder attends)", () => {
    it("uses the informational copy without Heads up or per-party warning", () => {
      bookingActions.setAccessMethod("owner_leased_leave_key");
      const { getByTestId, queryByTestId } = render(<Component />);

      const banner = getByTestId(bannerTestid);
      expect(banner.getAttribute("data-access-mode")).toBe("coordinated");

      const text = banner.textContent ?? "";
      // Coordinated copy explains the scheduling model.
      expect(text).toContain("sometime within the window");
      expect(text).toContain("no set arrival time");
      // The customer themselves isn't attending, so the heavy
      // warning + per-party "be available" copy must NOT show.
      expect(text).not.toContain("Heads up");
      expect(text).not.toContain("your key holder");
      expect(text).not.toContain("available for the entire window");

      expect(queryByTestId("button-change-access")).toBeNull();
      expect(queryByTestId("button-edit-ac")).not.toBeNull();
    });
  });

  describe("coordinated agent_tenant_self (tenant attends)", () => {
    it("uses the informational copy without Heads up or per-party warning", () => {
      bookingActions.setAccessMethod("agent_tenant_self");
      const { getByTestId, queryByTestId } = render(<Component />);

      const banner = getByTestId(bannerTestid);
      expect(banner.getAttribute("data-access-mode")).toBe("coordinated");

      const text = banner.textContent ?? "";
      expect(text).toContain("sometime within the window");
      expect(text).toContain("no set arrival time");
      expect(text).not.toContain("Heads up");
      expect(text).not.toContain("your tenant");
      expect(text).not.toContain("available for the entire window");

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
        // The "available for the entire window" warning is the
        // self-attended branch — it must NOT leak into unattended.
        expect(text).not.toContain("available for the entire window");
        expect(text).not.toContain("Heads up");

        expect(queryByTestId("button-change-access")).toBeNull();
        expect(queryByTestId("button-edit-ac")).not.toBeNull();
      });
    }
  });
});
