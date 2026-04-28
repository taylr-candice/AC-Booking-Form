// @vitest-environment happy-dom

/**
 * UI-level regression test for the wrapper's stale-`return_to` fallback
 * branch in the iframed BookingFlow click bridge.
 *
 * Background:
 *   The "Change access method" affordance on the slot picker (Step 5)
 *   stashes a `return_to=5` hint and jumps the customer to Step 4 so
 *   they can swap their access method, then short-circuits Continue
 *   on Step 4 straight back to Step 5 — that happy path is pinned in
 *   `BookingFlow.changeAccessShortCircuit.test.tsx`.
 *
 *   But there's a third behaviour: if the customer arrives on Step 4
 *   with `return_to=5` and then picks a *coordination* access method
 *   (`agent_tenant_taylr`, `owner_leased_tenant`, `owner_leased_agent`)
 *   — one that hides Step 5 from `visibleSteps` — the hint is now
 *   pointing at a step that no longer exists in the customer's flow.
 *   Flinging them back to a hidden Step 5 would be wrong.
 *
 *   The bridge handles this by gating the short-circuit on
 *   `visible.includes(fresh.return_to)`: when the hint is stale it
 *   clears `return_to` and falls through to normal forward navigation
 *   (`nextStepId`), landing the customer on Step 6 (Review & pay) —
 *   the correct next visible step.
 *
 *   That branch lives only in the wrapper — store-level tests don't
 *   exercise it — and a regression there would silently send the
 *   customer somewhere wrong on Continue.
 *
 * Sister test of `BookingFlow.changeAccessShortCircuit.test.tsx` and
 * `BookingFlow.editAcShortCircuit.test.tsx` (both of which pin the
 * happy-path short-circuit). Same iframe `srcdoc` mechanics — see the
 * long preamble in `BookingFlow.editAcShortCircuit.test.tsx` for the
 * rationale.
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
  "$label — stale return_to fallback when Step 5 is no longer visible",
  ({ Wrapper }) => {
    it(
      "with return_to=5 + current_step=4, swapping to a coordination access " +
        "method (which hides Step 5) makes Continue clear return_to and walk " +
        "forward to Step 6 instead of flinging back to a now-hidden Step 5",
      async () => {
        // ── Pre-seed the booking session ────────────────────────────
        // Simulate the state the bridge would have left behind after
        // the customer:
        //   1. Reached Step 5 (slot picker) on a non-coordination flow.
        //   2. Tapped "Change access method" → bridge stashed
        //      return_to=5 and jumped to Step 4.
        //   3. On Step 4 swapped to a coordination access method
        //      (`agent_tenant_taylr` — Taylr coordinates with the
        //      tenant), which removes Step 5 from `visibleSteps`.
        // We assemble that state directly via `bookingActions` rather
        // than driving it through the affordance click — this test is
        // about the fallback branch that fires on the *next* Continue,
        // not about the affordance itself (which has its own coverage
        // in `BookingFlow.changeAccessShortCircuit.test.tsx`).
        bookingActions.setUnit("u2");
        bookingActions.setRole("agent");
        bookingActions.setAccessMethod("agent_tenant_taylr");
        bookingActions.goToStep(4);
        bookingActions.setReturnTo(5);

        // Sanity: the seeded state really is the precondition for the
        // stale-hint branch. If a future refactor changes either of
        // these (e.g. setReturnTo starts validating against
        // visibleSteps), this assertion catches it before the iframe
        // dance muddies the failure.
        {
          const s = getBookingSession();
          expect(s.current_step).toBe(4);
          expect(s.return_to).toBe(5);
          expect(s.access_method).toBe("agent_tenant_taylr");
        }

        // ── Render the wrapper ──────────────────────────────────────
        const { findByTestId } = render(<Wrapper />);

        // ── Step 4: access iframe + click "Continue" ────────────────
        const iframe = (await findByTestId(
          "flow-iframe-4",
        )) as HTMLIFrameElement;
        const doc = await bootstrapIframeWithButton(iframe, "button-continue");

        const continueBtn = doc.querySelector(
          '[data-testid="button-continue"]',
        ) as HTMLButtonElement;
        // Sanity: the static button is enabled. The wrapper's bridge
        // bails on `btn.disabled`, so this precondition is part of
        // what we're asserting the bridge sees.
        expect(continueBtn.disabled).toBe(false);
        await clickIn(doc, continueBtn);

        // ── Final assertion: forward to Step 6, NOT back to Step 5 ──
        // The wrapper saw `return_to=5` + `current_step=4` but the
        // hinted step (5) is no longer in `visibleSteps` (the
        // coordination access method hides it). It must therefore
        // clear `return_to` and fall through to `nextStepId`, which
        // returns Step 6 (the next visible step after 4 when 5 is
        // hidden). A regression that took the short-circuit branch
        // unconditionally would land on Step 5 here.
        await waitFor(() => {
          const s = getBookingSession();
          expect(s.current_step).toBe(6);
          expect(s.return_to).toBeNull();
        });

        // Belt-and-braces: confirm the wrapper actually re-mounted
        // the Review & pay iframe (Step 6) and did NOT mount the
        // slot-picker iframe (Step 5). If the short-circuit fired
        // anyway, `flow-iframe-5` would be present here.
        await findByTestId("flow-iframe-6");
        expect(
          document.querySelector('[data-testid="flow-iframe-5"]'),
        ).toBeNull();
      },
    );
  },
);
