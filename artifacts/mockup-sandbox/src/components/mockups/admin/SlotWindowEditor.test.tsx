// @vitest-environment happy-dom

/**
 * Component-level regression tests for the admin `SlotWindowEditor`
 * reset controls added in Task #35:
 *
 *  1. The contextual "Reset minutes/count to 0" prompt only appears
 *     after the admin flips modes during the editor session, and the
 *     prompt copy reflects the now-active mode.
 *  2. Clicking that contextual button zeros only the now-active track
 *     (`bookedMinutes` for time-based, `bookedCount` for count-based).
 *  3. The footer "Reset usage" button zeros BOTH `bookedMinutes` and
 *     `bookedCount` — regardless of which mode is active.
 *  4. The footer "Reset usage" button is disabled when both
 *     `bookedMinutes` and `bookedCount` are already zero.
 *
 * The editor is a controlled-style component: its parent owns the
 * calendar state and feeds patches back in via `onPatch`. We mirror
 * that contract here with a tiny `Harness` that holds a one-day
 * calendar in `useState` so the editor sees its patches reflected
 * back as new props (which is what triggers the "modeJustChanged"
 * banner to appear).
 */

import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";

import { SlotWindowEditor } from "./AdminApp";
import type {
  AdminCalendarDay,
  AdminSlot,
  AdminSlotMode,
} from "@/state/adminMockData";

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

function makeDay(
  morning: AdminSlot,
  afternoon: AdminSlot,
): AdminCalendarDay {
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
 * Stateful wrapper that mimics `AdminApp`'s ownership of the calendar
 * and forwards `onPatch` mutations as new props back to the editor.
 * Without this, the `modeJustChanged` branch (which compares the
 * latest `slot.mode` to the captured `sessionStartMode`) can never
 * fire because the slot prop never changes.
 *
 * Exposes the latest morning slot via `screen.queryByTestId(...)`-style
 * assertions on the rendered debug span so tests can read it from the
 * DOM rather than wiring up a ref.
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
      {/* Hidden state probes — let tests read the latest slot fields
          straight out of the DOM after dispatched patches. */}
      <span data-testid="probe-mode">{day[win].mode}</span>
      <span data-testid="probe-bookedMinutes">{day[win].bookedMinutes}</span>
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

function readMode(): AdminSlotMode {
  return screen.getByTestId("probe-mode").textContent as AdminSlotMode;
}

function readBookedMinutes(): number {
  return Number(screen.getByTestId("probe-bookedMinutes").textContent);
}

function readBookedCount(): number {
  return Number(screen.getByTestId("probe-bookedCount").textContent);
}

afterEach(() => {
  cleanup();
});

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("SlotWindowEditor — contextual mode-switch reset prompt", () => {
  it("does NOT show the prompt when no mode switch has happened", () => {
    render(
      <Harness
        initialMorning={makeSlot("morning", {
          mode: "time_based",
          bookedMinutes: 90,
        })}
      />,
    );
    expect(screen.queryByText(/just switched to/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /reset minutes to 0/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /reset count to 0/i })).toBeNull();
  });

  it("shows the prompt with time-based copy after switching count → time", () => {
    // Start in count-based with 60 inferred booked minutes from when
    // the slot was previously time-based. Flipping back to time-based
    // makes `bookedMinutes` the now-active track and surfaces the
    // contextual reset prompt with the time-based copy.
    render(
      <Harness
        initialMorning={makeSlot("morning", {
          mode: "count_based",
          bookedMinutes: 60,
          bookedCount: 3,
        })}
      />,
    );

    // Sanity: prompt absent before any switch.
    expect(screen.queryByText(/just switched to/i)).toBeNull();

    // The mode toggle is a pair of `aria-pressed` buttons whose labels
    // are "Time-based" / "Count-based".
    fireEvent.click(screen.getByRole("button", { name: /time-based/i }));

    expect(readMode()).toBe("time_based");
    // Prompt copy reflects the now-active (time-based) mode.
    expect(
      screen.getByText(/just switched to time-based\./i),
    ).toBeTruthy();
    // The inferred-from-previous-mode subline is present and references
    // the carried-over booked minutes.
    expect(
      screen.getByText(/the 1h booked was inferred from the previous mode\./i),
    ).toBeTruthy();
    // The reset button uses the time-based wording.
    expect(
      screen.getByRole("button", { name: /reset minutes to 0/i }),
    ).toBeTruthy();
  });

  it("shows the prompt with count-based copy after switching time → count", () => {
    render(
      <Harness
        initialMorning={makeSlot("morning", {
          mode: "time_based",
          bookedMinutes: 90,
          bookedCount: 2, // inferred-from-time-mode count
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /count-based/i }));

    expect(readMode()).toBe("count_based");
    expect(
      screen.getByText(/just switched to count-based\./i),
    ).toBeTruthy();
    expect(
      screen.getByText(/the count of 2 booked was inferred from the previous mode\./i),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /reset count to 0/i }),
    ).toBeTruthy();
  });

  it("does NOT show the prompt when the now-active value is already 0", () => {
    // Mode switched, but count_based bookedCount is already 0 — no need
    // to prompt.
    render(
      <Harness
        initialMorning={makeSlot("morning", {
          mode: "time_based",
          bookedMinutes: 90,
          bookedCount: 0,
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /count-based/i }));

    expect(readMode()).toBe("count_based");
    expect(readBookedCount()).toBe(0);
    expect(screen.queryByText(/just switched to/i)).toBeNull();
  });
});

describe("SlotWindowEditor — contextual reset zeros only the now-active track", () => {
  it("zeros bookedCount but leaves bookedMinutes alone after switching to count-based", () => {
    render(
      <Harness
        initialMorning={makeSlot("morning", {
          mode: "time_based",
          bookedMinutes: 90,
          bookedCount: 2,
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /count-based/i }));
    expect(readMode()).toBe("count_based");
    expect(readBookedCount()).toBe(2);

    fireEvent.click(screen.getByRole("button", { name: /reset count to 0/i }));

    expect(readBookedCount()).toBe(0);
    // bookedMinutes was preserved (unaffected by the contextual reset).
    expect(readBookedMinutes()).toBe(90);
    // Prompt disappears once the now-active value is 0.
    expect(screen.queryByText(/just switched to/i)).toBeNull();
  });

  it("zeros bookedMinutes but leaves bookedCount alone after switching to time-based", () => {
    render(
      <Harness
        initialMorning={makeSlot("morning", {
          mode: "count_based",
          bookedMinutes: 60,
          bookedCount: 3,
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /time-based/i }));
    expect(readMode()).toBe("time_based");
    expect(readBookedMinutes()).toBe(60);

    fireEvent.click(screen.getByRole("button", { name: /reset minutes to 0/i }));

    expect(readBookedMinutes()).toBe(0);
    // bookedCount was preserved (unaffected by the contextual reset).
    expect(readBookedCount()).toBe(3);
    expect(screen.queryByText(/just switched to/i)).toBeNull();
  });
});

describe("SlotWindowEditor — footer 'Reset usage' button", () => {
  it("zeros BOTH bookedMinutes and bookedCount when clicked (time-based)", () => {
    render(
      <Harness
        initialMorning={makeSlot("morning", {
          mode: "time_based",
          bookedMinutes: 120,
          bookedCount: 3,
        })}
      />,
    );

    const resetUsage = screen.getByRole("button", { name: /^reset usage$/i });
    expect((resetUsage as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(resetUsage);

    expect(readBookedMinutes()).toBe(0);
    expect(readBookedCount()).toBe(0);
  });

  it("zeros BOTH bookedMinutes and bookedCount when clicked (count-based)", () => {
    render(
      <Harness
        initialMorning={makeSlot("morning", {
          mode: "count_based",
          bookedMinutes: 75,
          bookedCount: 4,
        })}
      />,
    );

    const resetUsage = screen.getByRole("button", { name: /^reset usage$/i });
    expect((resetUsage as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(resetUsage);

    expect(readBookedMinutes()).toBe(0);
    expect(readBookedCount()).toBe(0);
  });

  it("is disabled when both bookedMinutes AND bookedCount are already 0", () => {
    render(
      <Harness
        initialMorning={makeSlot("morning", {
          mode: "time_based",
          bookedMinutes: 0,
          bookedCount: 0,
        })}
      />,
    );
    const resetUsage = screen.getByRole("button", { name: /^reset usage$/i });
    expect((resetUsage as HTMLButtonElement).disabled).toBe(true);
  });

  it("is enabled when only bookedMinutes is non-zero", () => {
    render(
      <Harness
        initialMorning={makeSlot("morning", {
          mode: "time_based",
          bookedMinutes: 30,
          bookedCount: 0,
        })}
      />,
    );
    const resetUsage = screen.getByRole("button", { name: /^reset usage$/i });
    expect((resetUsage as HTMLButtonElement).disabled).toBe(false);
  });

  it("is enabled when only bookedCount is non-zero", () => {
    render(
      <Harness
        initialMorning={makeSlot("morning", {
          mode: "count_based",
          bookedMinutes: 0,
          bookedCount: 1,
        })}
      />,
    );
    const resetUsage = screen.getByRole("button", { name: /^reset usage$/i });
    expect((resetUsage as HTMLButtonElement).disabled).toBe(false);
  });

  it("becomes disabled after a successful reset", () => {
    render(
      <Harness
        initialMorning={makeSlot("morning", {
          mode: "time_based",
          bookedMinutes: 60,
          bookedCount: 2,
        })}
      />,
    );
    const resetUsage = screen.getByRole("button", { name: /^reset usage$/i });
    expect((resetUsage as HTMLButtonElement).disabled).toBe(false);
    act(() => {
      fireEvent.click(resetUsage);
    });
    expect(
      (screen.getByRole("button", { name: /^reset usage$/i }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});
