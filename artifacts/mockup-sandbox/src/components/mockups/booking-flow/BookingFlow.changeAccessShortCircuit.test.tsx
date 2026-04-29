// @vitest-environment happy-dom

/**
 * UI-level regression test for the "Change access method" → access
 * step → back to slot picker short-circuit in the iframed BookingFlow
 * wrapper.
 *
 * Background:
 *   The slot picker offers a second one-tap edit-jump alongside
 *   "Update AC info" — the "Change access method" affordance, only
 *   shown when the customer picked an "I'll be there" option. Tapping
 *   it makes the wrapper's click bridge:
 *     1. Stash a `return_to` hint pointing back to Step 4 (via
 *        `bookingActions.setReturnTo(4)`).
 *     2. Jump straight to Step 3 (Property access) via
 *        `bookingActions.goToStep(3)`.
 *   Then, when the customer hits Continue on Step 3, the wrapper
 *   short-circuits the normal `nextStepId` walk and flings them
 *   straight back to the hinted return step (4) instead of walking
 *   them forward to Step 5 (Review & pay).
 *
 *   Sister test of `BookingFlow.editAcShortCircuit.test.tsx` (which
 *   pins down the AC edit-jump). Same shape; different testid +
 *   different intermediate step. Lives in its own file so that a
 *   regression in either branch points straight at the affordance
 *   that broke.
 *
 * Store-level coverage of `setReturnTo` / `goToStep`'s clear-on-arrival
 * lives in `bookingSession.test.ts`. This file pins down the wrapper's
 * iframe click bridge end-to-end so a future refactor that drops the
 * short-circuit branch (or renames the `button-change-access` /
 * `button-continue` testids the bridge listens for) can't silently
 * re-introduce the multi-step detour.
 *
 * Test mechanics: see the long preamble in
 * `BookingFlow.editAcShortCircuit.test.tsx`. Same `srcdoc`-driven
 * iframe trick — we deliberately avoid mounting the real React step
 * components inside the iframes and just inject the testid-bearing
 * buttons the bridge listens for.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { ComponentType } from "react";

import { BookingFlowMobile } from "./BookingFlowMobile";
import { BookingFlowDesktop } from "./BookingFlowDesktop";
import {
  bookingActions,
  getBookingSession,
} from "../../../state/bookingSession";

// ─── Shared test helpers ───────────────────────────────────────────────────

/**
 * Replace the iframe's failing `src`-driven load with a deterministic
 * `srcdoc` that contains a single button bearing the requested
 * data-testid. happy-dom dispatches the `load` event for srcdoc iframes
 * via `requestAnimationFrame` so the wrapper's `onLoad` callback runs
 * and attaches its click listener to the iframe's `contentDocument`
 * before we dispatch any synthetic click events on it.
 */
async function bootstrapIframeWithButton(
  iframe: HTMLIFrameElement,
  testid: string,
): Promise<Document> {
  iframe.removeAttribute("src");
  iframe.setAttribute(
    "srcdoc",
    `<!DOCTYPE html><html><head></head><body>` +
      `<button type="button" data-testid="${testid}">click</button>` +
      `</body></html>`,
  );
  await waitFor(() => {
    const doc = iframe.contentDocument;
    expect(doc?.querySelector(`[data-testid="${testid}"]`)).toBeTruthy();
  });
  return iframe.contentDocument!;
}

/** Click an element inside an iframe's contentDocument. The wrapper's
 *  click listener is attached on that document, so we must fire the
 *  event there (not on the outer host document) for it to bubble to
 *  the bridge. */
async function clickIn(doc: Document, el: HTMLElement) {
  await act(async () => {
    el.dispatchEvent(
      new doc.defaultView!.MouseEvent("click", { bubbles: true }),
    );
  });
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
  "$label — one-tap return from access fix to slot picker",
  ({ Wrapper }) => {
    it(
      "stashes return_to=4 on 'Change access method', then short-circuits " +
        "Continue on the access step straight back to the slot picker " +
        "(skipping Step 5)",
      async () => {
        // ── Pre-seed the booking session ────────────────────────────
        // Pick a unit + role so the wrapper's visibleSteps gate doesn't
        // hide Step 4; then land directly on Step 4 (the slot picker)
        // — this is the entry point for the affordance under test.
        // `access_method` stays null (the default), which is treated
        // as a non-coordination flow so Step 4 stays visible.
        bookingActions.setUnit("u2");
        bookingActions.setRole("owner");
        bookingActions.goToStep(4);

        // ── Render the wrapper ──────────────────────────────────────
        const { findByTestId } = render(<Wrapper />);

        // ── Step 4: slot picker iframe + click "Change access" ──────
        let iframe = (await findByTestId(
          "flow-iframe-4",
        )) as HTMLIFrameElement;
        let doc = await bootstrapIframeWithButton(
          iframe,
          "button-change-access",
        );

        const changeAccessBtn = doc.querySelector(
          '[data-testid="button-change-access"]',
        ) as HTMLButtonElement;
        await clickIn(doc, changeAccessBtn);

        // ── State assertions: bridge fired both writes atomically ──
        // The handler must have:
        //   - read current_step=4, recognised it as a NAV_GOTO_RETURN_FROM
        //     step, and called setReturnTo(4)
        //   - called goToStep(3), jumping to the access page
        // Unlike the AC edit-jump there's no contextual origin marker
        // to assert: the access page already explains itself, so the
        // bridge intentionally doesn't stamp anything analogous to
        // `ac_step_origin` here.
        await waitFor(() => {
          const s = getBookingSession();
          expect(s.current_step).toBe(3);
          expect(s.return_to).toBe(4);
        });

        // ── Step 3: access iframe + click "Continue" ────────────────
        iframe = (await findByTestId("flow-iframe-3")) as HTMLIFrameElement;
        doc = await bootstrapIframeWithButton(iframe, "button-continue");

        const continueBtn = doc.querySelector(
          '[data-testid="button-continue"]',
        ) as HTMLButtonElement;
        // Sanity: the static button is enabled. The wrapper's bridge
        // bails on `btn.disabled`, so this precondition is part of
        // what we're asserting the bridge sees.
        expect(continueBtn.disabled).toBe(false);
        await clickIn(doc, continueBtn);

        // ── Final assertion: short-circuit back to Step 4, NOT 5 ────
        // The wrapper saw `return_to=4` + `current_step=3` and called
        // `goToStep(4)` instead of walking forward through `nextStepId`
        // (which would have landed on Step 5 — Review & pay). The
        // store also clears `return_to` once the customer arrives at
        // the hinted step, so we pin both invariants here.
        await waitFor(() => {
          const s = getBookingSession();
          expect(s.current_step).toBe(4);
          expect(s.return_to).toBeNull();
        });

        // Belt-and-braces: confirm the wrapper actually re-mounted
        // the slot-picker iframe (not Step 5's Review-and-pay
        // iframe). A regression that skipped the short-circuit and
        // ran `nextStepId` instead would render `flow-iframe-5` here.
        await findByTestId("flow-iframe-4");
        expect(
          document.querySelector('[data-testid="flow-iframe-5"]'),
        ).toBeNull();
      },
    );
  },
);
