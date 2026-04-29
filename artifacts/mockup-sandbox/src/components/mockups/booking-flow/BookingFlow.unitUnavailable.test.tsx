// @vitest-environment happy-dom
/**
 * UI-level regression test for the "Unit already booked" terminal in the
 * iframed `BookingFlow*` wrapper (Task #56, spec §9 row "Unit
 * unavailable").
 *
 * Why this test exists
 * --------------------
 * Task #56 added the fourth terminal state to the iframed wrapper, with
 * two new store actions (`markUnitUnavailable`, `pickAnotherUnit`) and
 * a "Simulate unit unavailable" affordance on the Pay step. The
 * cancelled-payment terminal already has a UI-level regression test
 * pinning its full round-trip behaviour (see
 * `BookingForm.tryAgain.test.tsx`) — but that test is for the LEGACY
 * single-page `BookingForm`. The new wrapper had no end-to-end test
 * coverage for terminal transitions at all, so a silent regression
 * that broke the "Unit already booked" terminal screen would only have
 * surfaced in manual QA.
 *
 * What this pins
 * --------------
 *  1. The wrapper renders the dedicated "Unit already booked" terminal
 *     screen (title, body copy, "Pick another unit" CTA) when
 *     `unit_unavailable` flips on while the customer is sitting on
 *     Step 5 — and the active step iframe is unmounted at the same
 *     time (no dual-render).
 *  2. Tapping "Pick another unit" returns the customer to Step 1 with
 *     `unit_id` and `ac_discrepancy` cleared and the terminal flag
 *     cleared.
 *  3. Every other answer (role, agency, contact, AC counts, primary
 *     residence, access method, schedule) survives the round-trip —
 *     same coverage shape as `BookingForm.tryAgain.test.tsx`.
 *
 * Test mechanics — same pattern as `BookingFlow.editAcShortCircuit.test.tsx`
 * ------------------------------------------------------------------------
 * The wrapper renders each step inside an `<iframe>` whose `src` points
 * at a Vite dev-server preview URL that doesn't resolve in the test
 * environment. We don't need to click any buttons *inside* the iframes
 * for this test (the terminal screen and its CTA are owned by the
 * wrapper itself), but we still bootstrap each iframe with `srcdoc` —
 * stripping the failing `src` — so happy-dom doesn't keep racing to
 * fetch the unreachable preview URLs. That keeps the test logs clean
 * and prevents the abort-on-teardown noise other wrapper tests
 * suffer from.
 *
 * The "Simulate unit unavailable" button in production is a plain
 * `<button onClick={() => bookingActions.markUnitUnavailable()}>` on
 * the Pay step — it bypasses the wrapper's iframe click bridge and
 * calls the store action directly. We therefore simulate "tapping" it
 * by calling the same store action; observably indistinguishable from
 * the real button. The terminal screen the test then asserts against
 * IS rendered by the wrapper, and the "Pick another unit" CTA on it
 * IS clicked through the live UI.
 *
 * Parameterised over both `BookingFlowMobile` and `BookingFlowDesktop`
 * because the terminal-state guard and the confirmation component are
 * identical in both — a regression in either wrapper should be
 * caught.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import type { ComponentType } from "react";

import { BookingFlowDesktop } from "./BookingFlowDesktop";
import { BookingFlowMobile } from "./BookingFlowMobile";
import {
  bookingActions,
  getBookingSession,
} from "../../../state/bookingSession";

// ─── Test fixtures ─────────────────────────────────────────────────────────

const OWNER_CONTACT = {
  firstName: "Sam",
  lastName: "Lee",
  email: "sam@example.com",
  mobile: "0411222333",
};

const AGENT_CONTACT = {
  firstName: "Robin",
  lastName: "Park",
  email: "robin@agency.test",
  mobile: "0455666777",
};

const AGENT_AGENCY_ID = "a2";

// ─── Test helpers ──────────────────────────────────────────────────────────

/**
 * Replace the iframe's failing `src`-driven load with an empty
 * `srcdoc` so happy-dom stops racing to fetch the unreachable preview
 * URL and we don't get abort-on-teardown noise in the logs.
 *
 * This test doesn't dispatch clicks inside the iframe (the buttons it
 * cares about live on the wrapper-rendered terminal screen), so the
 * srcdoc body can be empty — we just need to free happy-dom from the
 * pending navigation.
 */
async function neutralizeIframe(iframe: HTMLIFrameElement): Promise<void> {
  iframe.removeAttribute("src");
  iframe.setAttribute(
    "srcdoc",
    "<!DOCTYPE html><html><head></head><body></body></html>",
  );
  // Wait until the srcdoc has actually been parsed; otherwise the
  // following test logic might race ahead while the iframe is still
  // mid-navigation, which can re-introduce the noise this helper is
  // here to suppress.
  await waitFor(() => {
    expect(iframe.contentDocument?.body).toBeTruthy();
  });
}

/** Drive `bookingActions` to the same end-state the iframed Step 1..5
 *  pages would produce when the user fills them in by hand. The test
 *  can't tap the per-step buttons directly — happy-dom won't fetch
 *  the iframe sources, so the page UIs aren't reachable from inside
 *  the iframes under test. The wrapper reacts to the same store the
 *  iframed pages write to, so populating the store this way is
 *  observably indistinguishable from the user walking the wizard
 *  click-by-click. */
function driveOwnerScheduledFlowToStep5() {
  bookingActions.setUnit("u1");
  bookingActions.setRole("owner");
  bookingActions.setContact({
    contact_first_name: OWNER_CONTACT.firstName,
    contact_last_name: OWNER_CONTACT.lastName,
    contact_email: OWNER_CONTACT.email,
    contact_phone: OWNER_CONTACT.mobile,
  });
  // u1's AC record is "ducted, 1 system, 1 additional". Bump the
  // customer's selection so the discrepancy snapshot is non-null —
  // we want to assert it gets wiped on `pickAnotherUnit`, which is
  // only meaningful when there's something to wipe.
  bookingActions.setSystems(2);
  bookingActions.setAdditionalIndoor(2);
  bookingActions.setAcDiscrepancy({
    recorded: { type: "ducted", systems: 1, additional: 1 },
    customer: { type: "ducted", systems: 2, additional: 2 },
  });
  bookingActions.setPrimaryResidence("live_in");
  bookingActions.setAccessMethod("owner_live_at_unit");
  bookingActions.setSchedule("2026-05-04", "am");
  bookingActions.goToStep(5);
}

/** Same shape as the owner helper but for the agent / coordination
 *  flow: agency is set, access method is a coordination one (so
 *  Step 4 is hidden and there is no schedule to preserve). Used by
 *  the second test to pin agency preservation. */
function driveAgentCoordinationFlowToStep5() {
  bookingActions.setUnit("u3");
  bookingActions.setRole("agent");
  bookingActions.setAgency(AGENT_AGENCY_ID);
  bookingActions.setContact({
    contact_first_name: AGENT_CONTACT.firstName,
    contact_last_name: AGENT_CONTACT.lastName,
    contact_email: AGENT_CONTACT.email,
    contact_phone: AGENT_CONTACT.mobile,
  });
  bookingActions.setSystems(1);
  bookingActions.setAdditionalIndoor(0);
  // u3 has no AC record on file — but Step 4 still records a
  // discrepancy when the customer answers "unsure". Set one so we
  // can pin that it gets cleared by `pickAnotherUnit` here too.
  bookingActions.setAcDiscrepancy({
    recorded: { type: "split", systems: 1, additional: 0 },
    customer: { type: "unsure" },
  });
  // Coordination flow: Taylr arranges with the tenant. This hides
  // Step 4 (Schedule) — there is no slot to preserve.
  bookingActions.setAccessMethod("agent_tenant_taylr");
  bookingActions.goToStep(5);
}

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

// ─── Driver: parameterised over mobile + desktop wrappers ──────────────────

const VARIANTS: ReadonlyArray<{ label: string; Wrapper: ComponentType }> = [
  { label: "BookingFlowMobile", Wrapper: BookingFlowMobile },
  { label: "BookingFlowDesktop", Wrapper: BookingFlowDesktop },
];

describe.each(VARIANTS)(
  "$label — 'Pick another unit' on the unit-unavailable terminal (owner / scheduled flow)",
  ({ Wrapper }) => {
    it(
      "returns the customer to Step 1 with unit_id + ac_discrepancy cleared, " +
        "preserving role / contact / AC counts / access method / schedule",
      async () => {
        const user = userEvent.setup();

        // Populate the store as if the customer had walked Step 1..5
        // by hand. (Why this can't go through the iframe UI: see the
        // file header.)
        driveOwnerScheduledFlowToStep5();

        const { findByTestId } = render(<Wrapper />);

        // Pre-bounce sanity: the wrapper is showing the Step 5 iframe
        // (NOT the terminal yet). Without this, a regression that
        // always rendered the terminal would still pass the
        // post-flip assertions below.
        const step5Iframe = (await findByTestId(
          "flow-iframe-5",
        )) as HTMLIFrameElement;
        await neutralizeIframe(step5Iframe);
        expect(
          screen.queryByTestId("text-terminal-title"),
        ).not.toBeInTheDocument();

        // Trigger the terminal. In production this fires when the
        // booking service rejects the submission because another
        // customer just booked the same unit; in the mockup it's
        // wired to the `button-simulate-unit-unavailable` affordance
        // on the Pay step, which is a plain
        // `onClick={() => bookingActions.markUnitUnavailable()}`
        // button — it bypasses the wrapper's iframe click bridge
        // entirely, so calling the action directly here is exactly
        // what the simulate button does at runtime.
        bookingActions.markUnitUnavailable();

        // ── Terminal screen renders ────────────────────────────────
        // Title, body and CTA all from the `unit_unavailable` branch
        // of `BookingFlowConfirmation`.
        expect(
          await screen.findByTestId("text-terminal-title"),
        ).toHaveTextContent("Unit already booked");
        expect(screen.getByTestId("text-terminal-body")).toHaveTextContent(
          /just booked by someone else/i,
        );
        expect(screen.getByTestId("text-terminal-body")).toHaveTextContent(
          /No payment has been taken/i,
        );
        const cta = screen.getByTestId("button-pick-another-unit");
        expect(cta).toBeInTheDocument();
        expect(cta).toHaveTextContent("Pick another unit");

        // Sanity: no other terminal screens are mounted at the same
        // time. (Three other terminals share `BookingFlowConfirmation`
        // — pinning the absence of their CTAs guards against a
        // regression that picked the wrong variant.)
        expect(screen.queryByTestId("button-try-again")).not.toBeInTheDocument();
        expect(
          screen.queryByTestId("button-book-another"),
        ).not.toBeInTheDocument();
        expect(
          screen.queryByTestId("button-book-another-coord"),
        ).not.toBeInTheDocument();

        // The step iframe is replaced by the terminal — it should be
        // gone entirely while the terminal is up. (A regression that
        // left the iframe mounted alongside the terminal would still
        // pass the visual-content checks above; this pins the
        // wrapper's either/or contract.)
        expect(screen.queryByTestId("flow-iframe-5")).not.toBeInTheDocument();

        // ── Click the CTA under test ───────────────────────────────
        await user.click(cta);

        // ── Back on Step 1 with the right things wiped ─────────────
        expect(
          screen.queryByTestId("text-terminal-title"),
        ).not.toBeInTheDocument();
        const step1Iframe = (await findByTestId(
          "flow-iframe-1",
        )) as HTMLIFrameElement;
        await neutralizeIframe(step1Iframe);

        // Read straight from the store — every answer the wrapper
        // depends on lives there, and the store is the authoritative
        // source the re-mounted Step 1 iframe will read from when it
        // loads.
        const post = getBookingSession();

        // The two things the spec says must be cleared:
        expect(post.unit_id).toBeNull();
        expect(post.ac_discrepancy).toBeNull();
        // Terminal flag is gone too — otherwise the wrapper would
        // immediately re-render the terminal on the next render.
        expect(post.unit_unavailable).toBe(false);
        // And the wrapper is on Step 1.
        expect(post.current_step).toBe(1);

        // Everything else survives. (If a regression had wired the
        // CTA to `bookAnother()` it would wipe AC counts, access
        // method and schedule; if it had been wired to `reset()` it
        // would also wipe role and contact. Both would fall foul of
        // the asserts below.)
        expect(post.role).toBe("owner");
        expect(post.contact_first_name).toBe(OWNER_CONTACT.firstName);
        expect(post.contact_last_name).toBe(OWNER_CONTACT.lastName);
        expect(post.contact_email).toBe(OWNER_CONTACT.email);
        expect(post.contact_phone).toBe(OWNER_CONTACT.mobile);
        expect(post.num_systems).toBe(2);
        expect(post.num_additional_indoor).toBe(2);
        expect(post.primary_residence).toBe("live_in");
        expect(post.access_method).toBe("owner_live_at_unit");
        expect(post.service_date).toBe("2026-05-04");
        expect(post.service_slot).toBe("am");
      },
    );
  },
);

describe.each(VARIANTS)(
  "$label — 'Pick another unit' on the unit-unavailable terminal (agent / coordination flow)",
  ({ Wrapper }) => {
    it(
      "returns the customer to Step 1 with unit_id + ac_discrepancy cleared, " +
        "preserving role / agency / contact / AC counts / access method",
      async () => {
        const user = userEvent.setup();

        driveAgentCoordinationFlowToStep5();

        const { findByTestId } = render(<Wrapper />);

        // Coordination flow hides Step 4, so Step 5's iframe is the
        // one mounted (visibleSteps: [1,2,3,5]). Pin that we're on
        // the iframe before the terminal flips.
        const step5Iframe = (await findByTestId(
          "flow-iframe-5",
        )) as HTMLIFrameElement;
        await neutralizeIframe(step5Iframe);
        expect(
          screen.queryByTestId("text-terminal-title"),
        ).not.toBeInTheDocument();

        // Trigger the terminal (same affordance as the owner test).
        bookingActions.markUnitUnavailable();

        // ── Terminal screen renders ────────────────────────────────
        expect(
          await screen.findByTestId("text-terminal-title"),
        ).toHaveTextContent("Unit already booked");
        const cta = screen.getByTestId("button-pick-another-unit");
        expect(cta).toBeInTheDocument();

        // ── Click the CTA under test ───────────────────────────────
        await user.click(cta);

        // ── Back on Step 1 ─────────────────────────────────────────
        expect(
          screen.queryByTestId("text-terminal-title"),
        ).not.toBeInTheDocument();
        const step1Iframe = (await findByTestId(
          "flow-iframe-1",
        )) as HTMLIFrameElement;
        await neutralizeIframe(step1Iframe);

        const post = getBookingSession();
        expect(post.unit_id).toBeNull();
        expect(post.ac_discrepancy).toBeNull();
        expect(post.unit_unavailable).toBe(false);
        expect(post.current_step).toBe(1);

        // Agent-specific preservation: agency_id survives. (For
        // owners this field is null both before and after, so the
        // owner test can't distinguish "preserved" from "cleared" —
        // this is the assertion that pins agency preservation.)
        expect(post.role).toBe("agent");
        expect(post.agency_id).toBe(AGENT_AGENCY_ID);
        expect(post.contact_first_name).toBe(AGENT_CONTACT.firstName);
        expect(post.contact_last_name).toBe(AGENT_CONTACT.lastName);
        expect(post.contact_email).toBe(AGENT_CONTACT.email);
        expect(post.contact_phone).toBe(AGENT_CONTACT.mobile);
        expect(post.num_systems).toBe(1);
        expect(post.num_additional_indoor).toBe(0);
        expect(post.access_method).toBe("agent_tenant_taylr");

        // Coordination flow has no schedule — pin that too so a
        // regression that injected a default slot would be caught.
        expect(post.service_date).toBeNull();
        expect(post.service_slot).toBeNull();
      },
    );
  },
);
