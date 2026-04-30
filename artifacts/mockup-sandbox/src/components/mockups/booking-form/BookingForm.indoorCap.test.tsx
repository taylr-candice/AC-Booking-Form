// @vitest-environment happy-dom
/**
 * Pins the per-AC-type indoor-unit cap on the legacy customer
 * `BookingForm`. The form has no AC-type selector, so the cap
 * resolves to `min(split, ducted)` from the live AC services
 * bridge — the strictest type's cap — and falls back to
 * {@link DEFAULT_AC_INDOOR_CAPS} when no Admin projection is
 * present. Edits in Admin → Services flow through to the stepper
 * without remounting.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";

import { BookingForm } from "./BookingForm";
import { bookingActions } from "@/state/bookingSession";
import {
  DEFAULT_AC_INDOOR_CAPS,
  writeLiveAcCaps,
} from "@/state/liveAcServices";

// ─── Polyfills happy-dom doesn't ship for Radix's pointer-event APIs ──────
// (Mirrors `BookingForm.bookAnother.test.tsx`.)
type PointerCaps = {
  hasPointerCapture?: (id: number) => boolean;
  setPointerCapture?: (id: number) => void;
  releasePointerCapture?: (id: number) => void;
  scrollIntoView?: () => void;
};
function installRadixDomShims() {
  const proto = globalThis.Element?.prototype as PointerCaps | undefined;
  if (!proto) return;
  if (typeof proto.hasPointerCapture !== "function") {
    proto.hasPointerCapture = () => false;
  }
  if (typeof proto.setPointerCapture !== "function") {
    proto.setPointerCapture = () => {};
  }
  if (typeof proto.releasePointerCapture !== "function") {
    proto.releasePointerCapture = () => {};
  }
  if (typeof proto.scrollIntoView !== "function") {
    proto.scrollIntoView = () => {};
  }
}

installRadixDomShims();

beforeEach(() => {
  bookingActions.reset();
  // Make sure no prior run's projection bleeds into this one.
  writeLiveAcCaps(null);
});

afterEach(() => {
  cleanup();
  bookingActions.reset();
  writeLiveAcCaps(null);
});

/**
 * Drive the form from a fresh render to Step 3 (AC counts) for an
 * owner picking a unit with no on-file counts. We use `u2` so the
 * step opens at the initial defaults of 1 system / 0 additional —
 * non-ambiguous starting point for the cap assertions below.
 */
async function driveToAcStep() {
  const user = userEvent.setup();

  // Step 1 — pick a unit (`u2`, no saved AC counts) and the owner role.
  await user.click(screen.getByTestId("button-select-unit"));
  await user.click(await screen.findByTestId("option-unit-u2"));
  await user.click(screen.getByTestId("button-role-owner"));
  await user.click(screen.getByTestId("button-next"));

  // Step 2 — minimum-viable contact details so Next enables.
  await user.type(screen.getByTestId("input-first-name"), "Sam");
  await user.type(screen.getByTestId("input-last-name"), "Lee");
  await user.type(screen.getByTestId("input-email"), "sam@example.com");
  await user.type(screen.getByTestId("input-mobile"), "0411222333");
  await user.click(screen.getByTestId("button-next"));

  return user;
}

describe("BookingForm — additional indoor units cap", () => {
  it("disables the '+' at the strictest live cap and shows the 'Max N — call us for more.' hint", async () => {
    // Default cap with no Admin projection: min(split=6, ducted=8).
    const expectedCap = Math.min(
      DEFAULT_AC_INDOOR_CAPS.split,
      DEFAULT_AC_INDOOR_CAPS.ducted,
    );
    expect(expectedCap).toBe(6);

    render(<BookingForm />);
    const user = await driveToAcStep();

    const plus = screen.getByTestId("button-additional-inc");
    expect(
      screen.queryByTestId("text-additional-cap-hint"),
    ).not.toBeInTheDocument();

    for (let i = 0; i < expectedCap; i++) {
      await user.click(plus);
    }
    expect(screen.getByTestId("text-additional-value")).toHaveTextContent(
      String(expectedCap),
    );

    expect(plus).toBeDisabled();
    expect(screen.getByTestId("text-additional-cap-hint")).toHaveTextContent(
      `Max ${expectedCap} — call us for more.`,
    );

    // One more click is a no-op — defence against the disabled flag
    // being bypassed by a future markup change.
    await user.click(plus);
    expect(screen.getByTestId("text-additional-value")).toHaveTextContent(
      String(expectedCap),
    );
  });

  it("shrinks live when Admin lowers ONLY the split cap (proves min-based resolution)", async () => {
    render(<BookingForm />);
    const user = await driveToAcStep();

    // Raise both caps so we can show that lowering ONE shrinks the
    // legacy stepper — the regression a max-based resolution misses.
    act(() => {
      writeLiveAcCaps({ split: 9, ducted: 9 });
    });

    const plus = screen.getByTestId("button-additional-inc");
    for (let i = 0; i < 5; i++) {
      await user.click(plus);
    }
    expect(screen.getByTestId("text-additional-value")).toHaveTextContent("5");
    expect(plus).not.toBeDisabled();

    // Lower ONLY split to 2; ducted stays at 9. min(2,9)=2.
    act(() => {
      writeLiveAcCaps({ split: 2, ducted: 9 });
    });

    expect(screen.getByTestId("text-additional-value")).toHaveTextContent("2");
    expect(screen.getByTestId("text-additional-cap-hint")).toHaveTextContent(
      "Max 2 — call us for more.",
    );
    expect(screen.getByTestId("button-additional-inc")).toBeDisabled();
  });

  it("clamps an in-flight count down when Admin shrinks the catalogue cap mid-form", async () => {
    render(<BookingForm />);
    const user = await driveToAcStep();

    const plus = screen.getByTestId("button-additional-inc");
    for (let i = 0; i < 4; i++) {
      await user.click(plus);
    }
    expect(screen.getByTestId("text-additional-value")).toHaveTextContent("4");
    expect(
      screen.queryByTestId("text-additional-cap-hint"),
    ).not.toBeInTheDocument();

    // Bridge dispatches a synchronous custom event — wrap in `act`
    // so the resulting state update flushes before assertions.
    act(() => {
      writeLiveAcCaps({ split: 3, ducted: 3 });
    });

    expect(screen.getByTestId("text-additional-value")).toHaveTextContent("3");
    expect(screen.getByTestId("text-additional-cap-hint")).toHaveTextContent(
      "Max 3 — call us for more.",
    );
    expect(screen.getByTestId("button-additional-inc")).toBeDisabled();
  });
});
