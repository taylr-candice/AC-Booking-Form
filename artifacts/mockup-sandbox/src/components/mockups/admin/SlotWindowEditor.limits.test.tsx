// @vitest-environment happy-dom

/**
 * Component-level regression tests for the admin `SlotWindowEditor`'s
 * sizing-control limits:
 *
 *  1. The time-based "Window length" slider clamps `windowMinutes`
 *     between 60 and 540, and shrinking the window below the current
 *     `bookedMinutes` caps `bookedMinutes` to the new window length.
 *  2. The count-based "Number of booking slots" controls clamp
 *     `slotCount` between 1 and 20, and shrinking the count below the
 *     current `bookedCount` caps `bookedCount` to the new slot count.
 *
 * These guards live in `setWindowMinutes` / `setSlotCount` inside the
 * editor. The slider/number inputs also carry HTML `min`/`max`
 * attributes, but those are just UI hints — the JS clamps are what
 * actually keep the data sane, so we exercise them by dispatching
 * change events with arbitrary out-of-bounds values.
 *
 * Mirrors the controlled-component harness used in
 * `SlotWindowEditor.test.tsx`: the parent owns the calendar state and
 * feeds patches back in via `onPatch`.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";

import { SlotWindowEditor } from "./AdminApp";
import type { AdminCalendarDay, AdminSlot } from "@/state/adminMockData";

// ─── Test fixtures ─────────────────────────────────────────────────────────

const DAY_ISO = "2026-04-29";

function makeSlot(
  window: "morning" | "afternoon",
  overrides: Partial<AdminSlot> = {},
): AdminSlot {
  const base: AdminSlot =
    window === "morning"
      ? {
          id: `${DAY_ISO}-am`,
          window: "morning",
          mode: "time_based",
          windowMinutes: 240,
          bookedMinutes: 0,
          slotCount: 4,
          bookedCount: 0,
        }
      : {
          id: `${DAY_ISO}-pm`,
          window: "afternoon",
          mode: "time_based",
          windowMinutes: 300,
          bookedMinutes: 0,
          slotCount: 5,
          bookedCount: 0,
        };
  return { ...base, ...overrides };
}

function makeDay(morning: AdminSlot, afternoon: AdminSlot): AdminCalendarDay {
  return {
    isoDate: DAY_ISO,
    dayLabel: "29",
    weekdayLabel: "Wed",
    monthLabel: "Apr",
    open: true,
    morning,
    afternoon,
  };
}

/**
 * Stateful wrapper that mirrors `AdminApp`'s ownership of the calendar
 * and forwards `onPatch` mutations as new props back to the editor, so
 * the rendered DOM reflects the post-clamp values we want to assert on.
 *
 * Probe spans expose the four fields under test (`windowMinutes`,
 * `bookedMinutes`, `slotCount`, `bookedCount`) so tests can read them
 * straight out of the DOM after dispatched patches.
 */
function Harness({
  initialMorning,
  initialAfternoon,
  window: win = "morning",
}: {
  initialMorning: AdminSlot;
  initialAfternoon?: AdminSlot;
  window?: "morning" | "afternoon";
}) {
  const [day, setDay] = useState<AdminCalendarDay>(() =>
    makeDay(initialMorning, initialAfternoon ?? makeSlot("afternoon")),
  );
  return (
    <>
      <span data-testid="probe-windowMinutes">{day[win].windowMinutes}</span>
      <span data-testid="probe-bookedMinutes">{day[win].bookedMinutes}</span>
      <span data-testid="probe-slotCount">{day[win].slotCount}</span>
      <span data-testid="probe-bookedCount">{day[win].bookedCount}</span>
      <SlotWindowEditor
        dayIso={DAY_ISO}
        window={win}
        calendar={[day]}
        onPatch={(patch) =>
          setDay((prev) => ({ ...prev, [win]: { ...prev[win], ...patch } }))
        }
        onClose={() => {}}
      />
    </>
  );
}

function readWindowMinutes(): number {
  return Number(screen.getByTestId("probe-windowMinutes").textContent);
}

function readBookedMinutes(): number {
  return Number(screen.getByTestId("probe-bookedMinutes").textContent);
}

function readSlotCount(): number {
  return Number(screen.getByTestId("probe-slotCount").textContent);
}

function readBookedCount(): number {
  return Number(screen.getByTestId("probe-bookedCount").textContent);
}

/**
 * In time-based mode the editor renders exactly one `type="range"`
 * input — the window-length slider. Targeting it by role keeps the
 * test resilient to surrounding markup tweaks.
 */
function getWindowLengthSlider(): HTMLInputElement {
  return screen.getByRole("slider") as HTMLInputElement;
}

/**
 * In count-based mode the editor renders both a slider and a number
 * input that both call `setSlotCount`. We exercise the number input
 * because it's where an admin can most easily punch in an
 * out-of-bounds value, but both feed the same clamp.
 */
function getSlotCountNumberInput(): HTMLInputElement {
  return screen.getByRole("spinbutton") as HTMLInputElement;
}

afterEach(() => {
  cleanup();
});

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("SlotWindowEditor — window-length (time-based) limits", () => {
  it("clamps windowMinutes UP to 60 when set below the lower bound", () => {
    render(
      <Harness
        initialMorning={makeSlot("morning", {
          mode: "time_based",
          windowMinutes: 240,
          bookedMinutes: 0,
        })}
      />,
    );

    fireEvent.change(getWindowLengthSlider(), { target: { value: "30" } });

    expect(readWindowMinutes()).toBe(60);
  });

  it("clamps windowMinutes DOWN to 540 when set above the upper bound", () => {
    render(
      <Harness
        initialMorning={makeSlot("morning", {
          mode: "time_based",
          windowMinutes: 240,
          bookedMinutes: 0,
        })}
      />,
    );

    fireEvent.change(getWindowLengthSlider(), { target: { value: "9999" } });

    expect(readWindowMinutes()).toBe(540);
  });

  it("caps bookedMinutes to the new windowMinutes when the window shrinks below it", () => {
    render(
      <Harness
        initialMorning={makeSlot("morning", {
          mode: "time_based",
          windowMinutes: 300,
          bookedMinutes: 240, // 4h already booked
        })}
      />,
    );

    // Shrink the window to 120 minutes — well below the 240 already booked.
    fireEvent.change(getWindowLengthSlider(), { target: { value: "120" } });

    expect(readWindowMinutes()).toBe(120);
    expect(readBookedMinutes()).toBe(120);
  });

  it("leaves bookedMinutes alone when the new window is still ≥ bookedMinutes", () => {
    render(
      <Harness
        initialMorning={makeSlot("morning", {
          mode: "time_based",
          windowMinutes: 300,
          bookedMinutes: 90,
        })}
      />,
    );

    // Shrink the window, but stay above the 90 minutes already booked.
    fireEvent.change(getWindowLengthSlider(), { target: { value: "180" } });

    expect(readWindowMinutes()).toBe(180);
    expect(readBookedMinutes()).toBe(90);
  });

  it("caps bookedMinutes to 60 when the window is shrunk into the lower-bound clamp", () => {
    // Combine both guards in one step: ask for an absurdly small window
    // while bookedMinutes is high. windowMinutes should clamp to 60 and
    // bookedMinutes should be capped to that same 60.
    render(
      <Harness
        initialMorning={makeSlot("morning", {
          mode: "time_based",
          windowMinutes: 480,
          bookedMinutes: 360,
        })}
      />,
    );

    fireEvent.change(getWindowLengthSlider(), { target: { value: "0" } });

    expect(readWindowMinutes()).toBe(60);
    expect(readBookedMinutes()).toBe(60);
  });
});

describe("SlotWindowEditor — slot-count (count-based) limits", () => {
  it("clamps slotCount UP to 1 when set below the lower bound", () => {
    render(
      <Harness
        initialMorning={makeSlot("morning", {
          mode: "count_based",
          slotCount: 5,
          bookedCount: 0,
        })}
      />,
    );

    fireEvent.change(getSlotCountNumberInput(), { target: { value: "0" } });

    expect(readSlotCount()).toBe(1);
  });

  it("clamps slotCount DOWN to 20 when set above the upper bound", () => {
    render(
      <Harness
        initialMorning={makeSlot("morning", {
          mode: "count_based",
          slotCount: 5,
          bookedCount: 0,
        })}
      />,
    );

    fireEvent.change(getSlotCountNumberInput(), { target: { value: "999" } });

    expect(readSlotCount()).toBe(20);
  });

  it("caps bookedCount to the new slotCount when the count shrinks below it", () => {
    render(
      <Harness
        initialMorning={makeSlot("morning", {
          mode: "count_based",
          slotCount: 8,
          bookedCount: 6,
        })}
      />,
    );

    // Shrink the count to 3 — well below the 6 already booked.
    fireEvent.change(getSlotCountNumberInput(), { target: { value: "3" } });

    expect(readSlotCount()).toBe(3);
    expect(readBookedCount()).toBe(3);
  });

  it("leaves bookedCount alone when the new count is still ≥ bookedCount", () => {
    render(
      <Harness
        initialMorning={makeSlot("morning", {
          mode: "count_based",
          slotCount: 8,
          bookedCount: 2,
        })}
      />,
    );

    // Shrink the count, but stay above the 2 already booked.
    fireEvent.change(getSlotCountNumberInput(), { target: { value: "5" } });

    expect(readSlotCount()).toBe(5);
    expect(readBookedCount()).toBe(2);
  });

  it("caps bookedCount to 1 when the count is shrunk into the lower-bound clamp", () => {
    // Combine both guards: ask for 0 slots while bookedCount is high.
    // slotCount should clamp to 1 and bookedCount should be capped to it.
    render(
      <Harness
        initialMorning={makeSlot("morning", {
          mode: "count_based",
          slotCount: 10,
          bookedCount: 7,
        })}
      />,
    );

    fireEvent.change(getSlotCountNumberInput(), { target: { value: "-3" } });

    expect(readSlotCount()).toBe(1);
    expect(readBookedCount()).toBe(1);
  });
});
