import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Task #189: when an admin (or beta tester) sets their OS to "reduce
 * motion", the one-shot `template-row-focus-pulse` flash that lands
 * on the source row after a booking-timeline pivot must collapse to a
 * no-op. The persistent BRAND_SOFT tint and the `data-focused="true"`
 * marker stay intact — only the bouncing animation is suppressed.
 *
 * The carve-out lives entirely in `index.css` so every consumer that
 * adds the `template-row-focus-pulse` class (BookingsView,
 * Call/EmailTemplatesView, AwaitingCoordinationView) inherits it
 * without any JS-side branching on `window.matchMedia`. That makes a
 * regression silent — a future cleanup of the stylesheet could drop
 * the `@media (prefers-reduced-motion: reduce)` block and nothing in
 * the component tests would notice. This file pins the rule by
 * inspecting the CSS source directly, so any such drop fails loudly
 * here instead of shipping to admins.
 *
 * We assert against the source text (not the resolved
 * `getComputedStyle` value) on purpose: the headless test environment
 * doesn't honour `(prefers-reduced-motion: reduce)` in a way that
 * survives across happy-dom / jsdom upgrades, but the source contract
 * is unambiguous and trivially checkable.
 */

const indexCssPath = path.resolve(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "index.css",
);
const indexCss = readFileSync(indexCssPath, "utf8");

describe("template-row-focus-pulse — reduced-motion carve-out", () => {
  it("defines the base animation shorthand on the .template-row-focus-pulse class", () => {
    // Sanity check: the rule we're guarding actually exists. Without
    // this, a refactor that renames the class (or splits the
    // animation onto a sibling rule) could leave the @media block
    // pointing at a non-existent selector and we'd silently pass.
    const baseRule = indexCss.match(
      /\.template-row-focus-pulse\s*\{\s*animation:\s*template-row-focus-pulse[^;]*;\s*\}/,
    );
    expect(baseRule).not.toBeNull();
  });

  it("collapses the animation shorthand to `none` when prefers-reduced-motion: reduce matches", () => {
    // Find the `@media (prefers-reduced-motion: reduce) { … }` block
    // and assert that within it, the same `.template-row-focus-pulse`
    // selector resolves to `animation: none`. A naive substring check
    // against the whole stylesheet would also pass if the override
    // lived outside the media block, which is exactly the regression
    // we want to catch.
    const reducedMotionBlock = indexCss.match(
      /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)\s*\{([\s\S]*?)\n\}/,
    );
    expect(reducedMotionBlock).not.toBeNull();

    const body = reducedMotionBlock![1]!;
    expect(body).toMatch(
      /\.template-row-focus-pulse\s*\{\s*animation:\s*none\s*;\s*\}/,
    );
  });

  it("does not gate the persistent BRAND_SOFT tint or the data-focused marker on prefers-reduced-motion", () => {
    // The carve-out must suppress ONLY the animation. Neither the
    // BRAND_SOFT inline-style tint (applied by each consumer view)
    // nor the `data-focused="true"` marker (a DOM attribute, not
    // CSS) should be inside the reduced-motion block — both stay
    // visible to reduced-motion users so the landing row is still
    // distinguishable. We assert this by checking the block body
    // contains no other selectors / declarations that would imply
    // hiding or unstyling the row.
    const reducedMotionBlock = indexCss.match(
      /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)\s*\{([\s\S]*?)\n\}/,
    );
    const body = reducedMotionBlock![1]!;
    expect(body).not.toMatch(/background[-:]/);
    expect(body).not.toMatch(/data-focused/);
    expect(body).not.toMatch(/display\s*:\s*none/);
    expect(body).not.toMatch(/visibility\s*:\s*hidden/);
  });
});
