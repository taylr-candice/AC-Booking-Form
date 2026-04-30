// @vitest-environment happy-dom

/**
 * Pins down the staff "New booking" flow's per-AC-type indoor-unit
 * cap (Task #232). The Step-2 "Additional indoor units" stepper used
 * to hardcode max=10, so a staff member could enter a quantity the
 * customer flow would refuse. It now reads the live cap that
 * AdminApp projects through the `liveAcServices` bridge — the same
 * source the customer-facing AC step subscribes to — so editing the
 * cap in Admin → Services updates both surfaces and ops only has
 * one knob to turn.
 *
 * The test exercises three contracts:
 *
 *   1. With AC type = "split", "+" disables at 6 (the seeded split
 *      default in {@link DEFAULT_AC_INDOOR_CAPS}) and the
 *      "Max N — call us for more." hint appears.
 *   2. With AC type = "ducted", the cap shifts to 8, and switching
 *      ducted → split clamps an above-cap count down to the new cap.
 *   3. Writing a smaller cap into the live bridge mid-form clamps
 *      the displayed count and updates the cap hint live.
 */

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  SEEDED_BOOKINGS,
  SEEDED_BUILDINGS,
  SEEDED_UNITS,
  type AdminBuilding,
  type AdminUnit,
} from "@/state/adminMockData";
import { writeLiveAcCaps } from "@/state/liveAcServices";

import { NewBookingFlow } from "./NewBookingFlow";

afterEach(() => {
  cleanup();
  writeLiveAcCaps(null);
});

function renderFlow(presetBuildingId: string | null = null) {
  return render(
    <NewBookingFlow
      units={SEEDED_UNITS as readonly AdminUnit[] as AdminUnit[]}
      buildings={SEEDED_BUILDINGS as readonly AdminBuilding[] as AdminBuilding[]}
      bookings={[...SEEDED_BOOKINGS]}
      rolloutsRefreshKey={0}
      presetBuildingId={presetBuildingId}
      onCancel={() => {}}
      onConfirm={() => {}}
    />,
  );
}

/**
 * Walks Step 1 → Step 2 with the given seeded unit so the AC config
 * step is rendered. Customer name/email/phone are filled in just
 * enough to satisfy the Continue gating. Units are surfaced by their
 * `addressLine1` in the Step-1 list, so we look the unit up in the
 * seed array and click the row whose name matches that address.
 */
function advanceToStep2(unitId: string) {
  const unit = SEEDED_UNITS.find((u) => u.id === unitId);
  if (!unit) throw new Error(`Seed unit ${unitId} not found`);
  fireEvent.click(
    screen.getByRole("button", {
      name: new RegExp(escapeRegex(unit.addressLine1)),
    }),
  );
  fireEvent.change(screen.getByPlaceholderText(/Sam Patel/i), {
    target: { value: "Jane Doe" },
  });
  fireEvent.change(screen.getByPlaceholderText(/name@example\.com/i), {
    target: { value: "jane@example.com" },
  });
  fireEvent.change(screen.getByPlaceholderText(/0411 222 333/i), {
    target: { value: "0411 222 333" },
  });
  fireEvent.click(screen.getByRole("button", { name: /continue/i }));
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Find the "+" button next to the "Additional indoor units" label.
 * The form renders two stepper rows (Systems, Additional indoor
 * units), each with a "+" button — scope by walking up to the
 * shared FormField wrapper.
 */
function getAdditionalPlusButton(): HTMLButtonElement {
  const label = screen.getByText("Additional indoor units");
  const field = label.parentElement as HTMLElement;
  const buttons = field.querySelectorAll("button");
  const plus = Array.from(buttons).find(
    (b) => b.textContent?.trim() === "+",
  );
  if (!plus) throw new Error("Could not find '+' for Additional indoor units");
  return plus as HTMLButtonElement;
}

function getAdditionalCount(): number {
  const label = screen.getByText("Additional indoor units");
  const field = label.parentElement as HTMLElement;
  const display = field.querySelector(
    "div.min-w-\\[2\\.5rem\\]",
  ) as HTMLElement | null;
  if (!display) throw new Error("Could not find count display");
  return Number.parseInt(display.textContent?.trim() ?? "", 10);
}

describe("NewBookingFlow — Step 2 'Additional indoor units' cap (Task #232)", () => {
  it("disables '+' at the seeded split default of 6 and renders the cap hint", () => {
    // u-aspen-03 is a seeded split unit (1 system, 0 additional).
    renderFlow();
    advanceToStep2("u-aspen-03");

    const plus = getAdditionalPlusButton();
    // Click '+' until we hit the cap. Expect to land at 6 with '+'
    // disabled and the "Max 6 — call us for more." hint visible.
    for (let i = 0; i < 10; i++) {
      if (plus.disabled) break;
      fireEvent.click(plus);
    }
    expect(getAdditionalCount()).toBe(6);
    expect(plus.disabled).toBe(true);
    expect(screen.getByText(/Max 6 — call us for more\./)).toBeTruthy();
  });

  it("uses the seeded ducted cap of 8, and clamps when the user switches ducted → split", () => {
    // u-aspen-05 is a seeded ducted unit (1 system, 1 additional).
    renderFlow();
    advanceToStep2("u-aspen-05");

    const plus = getAdditionalPlusButton();
    // Walk all the way up to the ducted cap (8).
    for (let i = 0; i < 12; i++) {
      if (plus.disabled) break;
      fireEvent.click(plus);
    }
    expect(getAdditionalCount()).toBe(8);
    expect(screen.getByText(/Max 8 — call us for more\./)).toBeTruthy();

    // Switch AC type ducted → split. The split cap (6) is lower
    // than the current additional count (8), so the form should
    // clamp the count back down.
    fireEvent.click(screen.getByRole("button", { name: /^split$/i }));

    expect(getAdditionalCount()).toBe(6);
    expect(screen.getByText(/Max 6 — call us for more\./)).toBeTruthy();
  });

  it("re-clamps and updates the hint when Admin → Services lowers the live cap mid-form", () => {
    renderFlow();
    advanceToStep2("u-aspen-05"); // ducted

    const plus = getAdditionalPlusButton();
    for (let i = 0; i < 12; i++) {
      if (plus.disabled) break;
      fireEvent.click(plus);
    }
    expect(getAdditionalCount()).toBe(8);

    // Simulate Admin → Services lowering the ducted cap to 3.
    // Wrapped in `act` so the `useSyncExternalStore` subscriber and
    // the Step-2 clamping effect both flush before we assert.
    act(() => {
      writeLiveAcCaps({ split: 6, ducted: 3 });
    });

    expect(getAdditionalCount()).toBe(3);
    expect(screen.getByText(/Max 3 — call us for more\./)).toBeTruthy();
    // '+' must remain disabled at the new lower cap.
    const plusAfter = getAdditionalPlusButton();
    expect(plusAfter.disabled).toBe(true);
  });
});
