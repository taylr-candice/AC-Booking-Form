// @vitest-environment happy-dom

/**
 * Task #236: regression test pinning the panel-side integration of
 * the templates source-row highlight — email channel mirror of
 * `CallTemplatesView.sourceRowHighlight.test.tsx`.
 *
 * Background: Task #231 folded the Call/Email templates panels onto
 * the shared `useFocusedRowHighlight` hook in `controlled` dismissal
 * mode, so the BRAND_SOFT highlight stays put through clicks /
 * scrolls / keypresses inside the panels until the parent AdminApp
 * shell clears `focusedTemplateId` on the next sidebar nav. The hook
 * itself is unit-tested in `useFocusedRowHighlight.test.tsx` (the
 * "controlled dismissal" describe block); this file exercises the
 * EmailTemplatesView integration end-to-end so any future panel-side
 * refactor that accidentally reintroduces a global mousedown /
 * scroll / keydown dismiss path — or stale local pulse-id state that
 * swallows the focused-row contract — fails surgically here.
 */

import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { EmailTemplate } from "@/state/adminMockData";

import { EmailTemplatesView } from "./EmailTemplatesView";
import { BRAND_SOFT } from "./theme";

afterEach(() => {
  cleanup();
});

const SEED: EmailTemplate[] = [
  {
    id: "rebook",
    name: "Rebook link",
    subject: "Reschedule your AC service",
    note: "Use the link below to rebook.",
  },
  {
    id: "parcel",
    name: "Parcel pickup",
    subject: "Parcel arriving",
    note: "Tracking attached.",
  },
];

/** Mirrors the helper in `CallTemplatesView.sourceRowHighlight.test.tsx`
 *  and `useFocusedRowHighlight.test.tsx`: paint the BRAND_SOFT constant
 *  onto a throwaway probe so we can compare against the browser-
 *  normalised `rgb(...)` form without hardcoding it. */
function brandSoftRgb(): string {
  const probe = document.createElement("div");
  probe.style.backgroundColor = BRAND_SOFT;
  return probe.style.backgroundColor;
}

describe("EmailTemplatesView — source-row highlight survives mouse/scroll/key activity (Task #236)", () => {
  it("renders the focused row tinted with BRAND_SOFT and keeps it lit through global mousedown/scroll/keydown, then drops the highlight when the parent clears focusedTemplateId", () => {
    const { getByTestId, rerender } = render(
      <EmailTemplatesView
        templates={SEED}
        onCreate={() => {}}
        onUpdate={() => {}}
        onRemove={() => {}}
        onSetDefault={() => {}}
        focusedTemplateId="parcel"
      />,
    );

    const focusedRow = getByTestId("email-template-row-parcel") as HTMLTableRowElement;
    const otherRow = getByTestId("email-template-row-rebook") as HTMLTableRowElement;
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
      <EmailTemplatesView
        templates={SEED}
        onCreate={() => {}}
        onUpdate={() => {}}
        onRemove={() => {}}
        onSetDefault={() => {}}
        focusedTemplateId={null}
      />,
    );

    const clearedRow = getByTestId("email-template-row-parcel") as HTMLTableRowElement;
    expect(clearedRow.getAttribute("data-focused")).toBeNull();
    expect(clearedRow.style.backgroundColor).toBe("");
  });
});
