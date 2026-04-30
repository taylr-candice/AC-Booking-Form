// @vitest-environment happy-dom

/**
 * Task #236: regression test pinning the panel-side integration of
 * the templates source-row highlight.
 *
 * Background: Task #231 folded the Call/Email templates panels onto
 * the shared `useFocusedRowHighlight` hook in `controlled` dismissal
 * mode, so the BRAND_SOFT highlight stays put through clicks /
 * scrolls / keypresses inside the panels until the parent AdminApp
 * shell clears `focusedTemplateId` on the next sidebar nav. The hook
 * itself is unit-tested in `useFocusedRowHighlight.test.tsx` (the
 * "controlled dismissal" describe block), but the templates panels'
 * end-to-end integration with the hook isn't covered. This file (and
 * its email mirror) closes that gap so any future panel-side refactor
 * that accidentally reintroduces a global mousedown / scroll /
 * keydown dismiss path — or stale local pulse-id state that swallows
 * the focused-row contract — fails surgically here rather than only
 * surfacing as a manual-QA regression.
 */

import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { CallTemplate } from "@/state/adminMockData";

import { CallTemplatesView } from "./CallTemplatesView";
import { BRAND_SOFT } from "./theme";

afterEach(() => {
  cleanup();
});

const SEED: CallTemplate[] = [
  { id: "voicemail", name: "Voicemail left", note: "Left a voicemail" },
  { id: "spoke", name: "Spoke with resident", note: "Confirmed slot" },
];

/**
 * Resolve the inline backgroundColor the browser actually applied to
 * the focused row, then compare against a probe element painted with
 * the BRAND_SOFT constant. Browsers normalise hex to `rgb(...)` on
 * `style.backgroundColor`, so painting the same constant onto a
 * throwaway probe lets us pin the contract without hardcoding the
 * normalised string here. Mirrors the helper used in
 * `useFocusedRowHighlight.test.tsx`.
 */
function brandSoftRgb(): string {
  const probe = document.createElement("div");
  probe.style.backgroundColor = BRAND_SOFT;
  return probe.style.backgroundColor;
}

describe("CallTemplatesView — source-row highlight survives mouse/scroll/key activity (Task #236)", () => {
  it("renders the focused row tinted with BRAND_SOFT and keeps it lit through global mousedown/scroll/keydown, then drops the highlight when the parent clears focusedTemplateId", () => {
    const { getByTestId, rerender } = render(
      <CallTemplatesView
        templates={SEED}
        onCreate={() => {}}
        onUpdate={() => {}}
        onRemove={() => {}}
        onSetDefault={() => {}}
        focusedTemplateId="spoke"
      />,
    );

    const focusedRow = getByTestId("call-template-row-spoke") as HTMLTableRowElement;
    const otherRow = getByTestId("call-template-row-voicemail") as HTMLTableRowElement;
    const expectedTint = brandSoftRgb();

    // Baseline: parent owns the focus prop, so the matching row is
    // both `data-focused` and tinted with BRAND_SOFT. The sibling
    // row stays untouched.
    expect(focusedRow.getAttribute("data-focused")).toBe("true");
    expect(focusedRow.style.backgroundColor).toBe(expectedTint);
    expect(otherRow.getAttribute("data-focused")).toBeNull();
    expect(otherRow.style.backgroundColor).toBe("");

    // Fire each of the three global signals the *interaction*-mode
    // hook would dismiss on. In controlled mode the panel must
    // ignore them — focus + tint stay until the parent flips
    // `focusedTemplateId`.
    act(() => {
      fireEvent.mouseDown(document.body);
    });
    expect(focusedRow.getAttribute("data-focused")).toBe("true");
    expect(focusedRow.style.backgroundColor).toBe(expectedTint);

    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });
    expect(focusedRow.getAttribute("data-focused")).toBe("true");
    expect(focusedRow.style.backgroundColor).toBe(expectedTint);

    act(() => {
      fireEvent.keyDown(document, { key: "ArrowDown" });
    });
    expect(focusedRow.getAttribute("data-focused")).toBe("true");
    expect(focusedRow.style.backgroundColor).toBe(expectedTint);

    // Sibling row never picks up the highlight across any of the
    // global signals.
    expect(otherRow.getAttribute("data-focused")).toBeNull();
    expect(otherRow.style.backgroundColor).toBe("");

    // Parent flips the prop back to null (mirrors AdminApp clearing
    // `focusedTemplateId` on the next sidebar nav). The
    // data-focused marker AND the inline tint must both drop.
    rerender(
      <CallTemplatesView
        templates={SEED}
        onCreate={() => {}}
        onUpdate={() => {}}
        onRemove={() => {}}
        onSetDefault={() => {}}
        focusedTemplateId={null}
      />,
    );

    const clearedRow = getByTestId("call-template-row-spoke") as HTMLTableRowElement;
    expect(clearedRow.getAttribute("data-focused")).toBeNull();
    expect(clearedRow.style.backgroundColor).toBe("");
  });
});
