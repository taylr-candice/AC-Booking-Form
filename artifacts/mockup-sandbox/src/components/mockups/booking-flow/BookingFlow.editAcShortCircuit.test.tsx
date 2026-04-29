// @vitest-environment happy-dom

/**
 * UI-level regression test for the "Update AC info" → AC step → back to
 * slot picker short-circuit in the iframed BookingFlow wrapper.
 *
 * Background (Task #46):
 *   When a customer taps "Update AC info" from the slot picker (Step 4),
 *   the wrapper's click bridge does two things atomically:
 *     1. Stashes a `return_to` hint pointing back to Step 4 (via
 *        `bookingActions.setReturnTo(4)`).
 *     2. Jumps straight to Step 2 with the contextual origin recorded
 *        (via `bookingActions.editAcFromSlotPicker()`).
 *   Then, when the customer hits Continue on Step 2 (AC), the wrapper
 *   short-circuits the normal `nextStepId` walk and flings them straight
 *   back to the hinted return step (4) instead of walking them through
 *   Property access (Step 3).
 *
 * Store-level coverage of `setReturnTo` / `editAcFromSlotPicker` /
 * `goToStep`'s clear-on-arrival lives in `bookingSession.test.ts`. This
 * file pins down the wrapper's iframe click bridge end-to-end so a future
 * refactor that drops the short-circuit branch (or renames the
 * `button-edit-ac` / `button-continue` testids the bridge listens for)
 * can't silently re-introduce the multi-step detour.
 *
 * Test mechanics:
 *   The wrapper renders each step inside an `<iframe>` whose `src`
 *   points at a Vite dev-server preview URL that doesn't resolve in
 *   the test environment. To exercise the bridge without depending on
 *   real iframe page loads we:
 *     1. Override each iframe's `src` with a `srcdoc` containing a
 *        static `<button data-testid="…">` so happy-dom produces a
 *        clean `contentDocument` and fires a deterministic `load`
 *        event (the wrapper attaches its click listener inside
 *        `onLoad`).
 *     2. Dispatch a click on that static button inside the iframe's
 *        contentDocument and assert against the booking session store —
 *        the wrapper's job is to translate clicks on testid-bearing
 *        elements into store actions, and that contract is exactly
 *        what we want to lock in. We deliberately avoid mounting the
 *        real React step components inside the iframes: those have
 *        their own component-level tests, and a React tree subscribed
 *        to the booking store keeps trying to re-render after the
 *        wrapper recreates the iframe (key=current.id), which races
 *        teardown in happy-dom and makes the test flaky.
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
  // Strip src so happy-dom doesn't keep racing to navigate to the
  // (unreachable) preview URL; the empty srcdoc takes precedence and
  // produces a clean about:srcdoc document we can read from.
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
  "$label — one-tap return from AC fix to slot picker",
  ({ Wrapper }) => {
    it(
      "stashes return_to=4 on 'Edit AC info', then short-circuits Continue " +
        "on the AC step straight back to the slot picker (skipping Step 3)",
      async () => {
        // ── Pre-seed the booking session ────────────────────────────
        // Pick a unit + role so the wrapper's visibleSteps gate doesn't
        // hide Step 4; then land directly on Step 4 (the slot picker)
        // — this is the entry point for the affordance under test.
        bookingActions.setUnit("u2");
        bookingActions.setRole("owner");
        bookingActions.goToStep(4);

        // ── Render the wrapper ──────────────────────────────────────
        const { findByTestId } = render(<Wrapper />);

        // ── Step 4: slot picker iframe + click "Edit AC info" ───────
        let iframe = (await findByTestId(
          "flow-iframe-4",
        )) as HTMLIFrameElement;
        let doc = await bootstrapIframeWithButton(iframe, "button-edit-ac");

        const editAcBtn = doc.querySelector(
          '[data-testid="button-edit-ac"]',
        ) as HTMLButtonElement;
        await clickIn(doc, editAcBtn);

        // ── State assertions: bridge fired both writes atomically ──
        // The handler must have:
        //   - read current_step=4, recognised it as a NAV_GOTO_RETURN_FROM
        //     step, and called setReturnTo(4)
        //   - called editAcFromSlotPicker, which jumped to Step 2 and
        //     stamped ac_step_origin="slot_picker" in a single write
        await waitFor(() => {
          const s = getBookingSession();
          expect(s.current_step).toBe(2);
          expect(s.return_to).toBe(4);
          expect(s.ac_step_origin).toBe("slot_picker");
        });

        // ── Step 2: AC iframe + click "Continue" ────────────────────
        iframe = (await findByTestId("flow-iframe-2")) as HTMLIFrameElement;
        doc = await bootstrapIframeWithButton(iframe, "button-continue");

        const continueBtn = doc.querySelector(
          '[data-testid="button-continue"]',
        ) as HTMLButtonElement;
        // Sanity: the static button is enabled. The wrapper's bridge
        // bails on `btn.disabled`, so this precondition is part of
        // what we're asserting the bridge sees.
        expect(continueBtn.disabled).toBe(false);
        await clickIn(doc, continueBtn);

        // ── Final assertion: short-circuit back to Step 4, NOT 3 ────
        // The wrapper saw `return_to=4` + `current_step=2` and called
        // `goToStep(4)` instead of walking forward through `nextStepId`
        // (which would have landed on Step 3 — Property access). The
        // store also clears `return_to` once the customer arrives at
        // the hinted step, so we pin both invariants here.
        await waitFor(() => {
          const s = getBookingSession();
          expect(s.current_step).toBe(4);
          expect(s.return_to).toBeNull();
        });

        // Belt-and-braces: confirm the wrapper actually re-mounted
        // the slot-picker iframe (not Step 3's Property-access
        // iframe). A regression that skipped the short-circuit and
        // ran `nextStepId` instead would render `flow-iframe-3` here.
        await findByTestId("flow-iframe-4");
        expect(
          document.querySelector('[data-testid="flow-iframe-3"]'),
        ).toBeNull();
      },
    );
  },
);
