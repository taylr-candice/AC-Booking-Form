// @vitest-environment happy-dom

/**
 * UI-level lock-in test for Task #54's post-reset Undo affordance,
 * exercised through the actual admin Slot Calendar (not just the
 * editor in isolation as in `SlotWindowEditor.test.tsx`'s "post-reset
 * Undo affordance" suite).
 *
 * Spec: from the calendar view, opening a window with non-zero booked
 * minutes/count, clicking the footer "Reset usage" and confirming,
 * then clicking the inline "Undo" link, must restore the exact
 * pre-reset `bookedMinutes` and `bookedCount` — both as read by the
 * editor's controls AND, after the modal is closed, as rendered on
 * the calendar tile itself (the `headlineLabel` text in
 * `CalendarView`'s `CalendarSlot`). The lock-in also covers the
 * silent-dismiss behaviour: any other edit (mode toggle or
 * window-length slider drag) made while Undo is on screen must hide
 * the affordance without restoring values.
 *
 * Component-level coverage of the snapshot/restore wiring already
 * lives in `SlotWindowEditor.test.tsx` — this file pins the
 * integration with the calendar tile rendering so a future
 * restructure of either side (the calendar tile markup, or the editor
 * modal markup) is caught the moment the round-trip stops working.
 *
 * `CalendarView` is a controlled component: its parent (`AdminApp`)
 * owns the calendar array and feeds patches back in via `setCalendar`.
 * We mirror that contract here with a tiny `CalendarHarness` so the
 * tile re-renders with restored values after an Undo dispatched from
 * the editor inside the modal. Driving `CalendarView` directly (vs.
 * the full `AdminApp` shell) keeps the calendar fixture deterministic
 * — `getCalendar()` seeds off `new Date()` and would otherwise have
 * the test fixture drift with the wall-clock day.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";

import { CalendarView } from "./CalendarView";
import type { AdminCalendarDay, AdminSlot } from "@/state/adminMockData";

// ─── Test fixtures ─────────────────────────────────────────────────────────

const TARGET_DAY_ISO = "2026-04-28";
const OTHER_DAY_ISO = "2026-04-29";

// Day-0 morning fixture: time-based, 1h 15m booked of a 4h window, with
// 2 of 4 booking slots also booked. The headline label rendered by
// `CalendarSlot` for these values is "1h 15m / 4h" — picked
// specifically so it's unique across the harness's tiles (the other
// non-zero tile uses a different mode/numbers) and we can assert the
// post-Undo tile state by querying that exact string.
const PRE_RESET_BOOKED_MINUTES = 75;
const PRE_RESET_BOOKED_COUNT = 2;
const PRE_RESET_HEADLINE = "1h 15m / 4h";
const POST_RESET_HEADLINE = "0m / 4h";

function makeMorning(overrides: Partial<AdminSlot> = {}): AdminSlot {
  return {
    id: `${TARGET_DAY_ISO}-am`,
    window: "morning",
    mode: "time_based",
    windowMinutes: 240,
    bookedMinutes: PRE_RESET_BOOKED_MINUTES,
    slotCount: 4,
    bookedCount: PRE_RESET_BOOKED_COUNT,
    ...overrides,
  };
}

function makeAfternoon(overrides: Partial<AdminSlot> = {}): AdminSlot {
  return {
    id: `${TARGET_DAY_ISO}-pm`,
    window: "afternoon",
    mode: "time_based",
    windowMinutes: 300,
    bookedMinutes: 0,
    slotCount: 5,
    bookedCount: 0,
    ...overrides,
  };
}

function makeDay(
  isoDate: string,
  morning: AdminSlot,
  afternoon: AdminSlot,
  open = true,
): AdminCalendarDay {
  return {
    isoDate,
    dayLabel: isoDate.slice(8, 10).replace(/^0/, ""),
    weekdayLabel: isoDate === TARGET_DAY_ISO ? "Tue" : "Wed",
    monthLabel: "Apr",
    open,
    morning,
    afternoon,
  };
}

/**
 * A two-day calendar where the day-0 morning is the only "interesting"
 * tile — non-zero usage, time-based, the values we want to round-trip.
 * The day-0 afternoon and the entirety of day-1 are zeroed-out
 * time-based windows, kept only so the calendar grid renders something
 * realistic around the target tile.
 */
function buildInitialCalendar(): AdminCalendarDay[] {
  return [
    makeDay(
      TARGET_DAY_ISO,
      makeMorning(),
      makeAfternoon(),
    ),
    makeDay(
      OTHER_DAY_ISO,
      makeMorning({
        id: `${OTHER_DAY_ISO}-am`,
        bookedMinutes: 0,
        bookedCount: 0,
      }),
      makeAfternoon({
        id: `${OTHER_DAY_ISO}-pm`,
      }),
    ),
  ];
}

/**
 * Stateful wrapper that mimics `AdminApp`'s ownership of the calendar
 * array so patches dispatched from the editor inside `CalendarView`
 * round-trip back into the tile's rendered headline. Without this,
 * the calendar tile would never re-render with restored values after
 * Undo, and the round-trip the lock-in is here to pin would be
 * untestable.
 */
function CalendarHarness({ initial }: { initial: AdminCalendarDay[] }) {
  const [calendar, setCalendar] = useState<AdminCalendarDay[]>(initial);
  return <CalendarView calendar={calendar} setCalendar={setCalendar} />;
}

/**
 * Locate the day-0 morning sub-tile (`CalendarSlot` for the morning
 * window of `TARGET_DAY_ISO`) by walking up from its "Morning" label
 * to the enclosing tile container. The harness puts the target morning
 * first in document order, so `getAllByText("Morning")[0]` is it.
 *
 * Throws (rather than returning null) so a markup change that drops
 * the "Morning" label or moves it outside the tile fails loudly here
 * with a useful message instead of as a downstream
 * cannot-read-property error.
 */
function getMorningTile(): HTMLElement {
  const labels = screen.getAllByText("Morning");
  if (labels.length === 0) {
    throw new Error('No "Morning" label found in the rendered calendar.');
  }
  // "Morning" is text inside `<div class="flex items-center gap-1 ...">`,
  // which sits inside the tile's flex header row, which sits inside the
  // tile container itself. Walk up two levels to reach the tile.
  const tile =
    labels[0].parentElement?.parentElement ?? null;
  if (!tile) {
    throw new Error("Could not walk up to the morning tile container.");
  }
  return tile;
}

/** Open the editor modal for the day-0 morning by clicking its "Edit". */
function openDay0MorningEditor() {
  const tile = getMorningTile();
  fireEvent.click(within(tile).getByRole("button", { name: /^edit$/i }));
}

afterEach(() => {
  cleanup();
});

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("Slot calendar — post-reset Undo round-trips through the calendar tile", () => {
  it("clicking Undo after a confirmed Reset usage restores both bookedMinutes and bookedCount on the editor and on the calendar tile after closing", () => {
    render(<CalendarHarness initial={buildInitialCalendar()} />);

    // Sanity: the day-0 morning tile shows the pre-reset headline
    // before we open the editor — this is the "before" state we
    // expect Undo to restore the tile to.
    expect(within(getMorningTile()).getByText(PRE_RESET_HEADLINE)).toBeTruthy();

    // ── Open the editor for the day-0 morning ──────────────────────
    openDay0MorningEditor();

    // The modal renders the day's "morning window" header — confirms
    // we're editing the right slot.
    expect(screen.getByText(/^morning window$/i)).toBeTruthy();
    // The editor's "Already booked" line surfaces the same minutes
    // value the calendar tile is showing (1h 15m).
    expect(screen.getByText(/already booked:/i).textContent).toContain("1h 15m");

    // ── Click footer "Reset usage" → confirmation panel appears ────
    fireEvent.click(screen.getByRole("button", { name: /^reset usage$/i }));
    expect(screen.getByText(/reset usage for this window\?/i)).toBeTruthy();

    // ── Confirm. Both tracks zero out and the Undo affordance shows.
    fireEvent.click(screen.getByRole("button", { name: /yes, reset/i }));
    expect(screen.getByText(/usage reset\./i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /^undo$/i })).toBeTruthy();
    // Editor now reports zero booked minutes — the underlying patch
    // landed on the parent calendar.
    expect(screen.getByText(/already booked:/i).textContent).toContain("0m");

    // ── Click the inline Undo link ─────────────────────────────────
    fireEvent.click(screen.getByRole("button", { name: /^undo$/i }));

    // Undo affordance is gone; "Reset usage" is back in the footer
    // (and enabled, because usage is non-zero again).
    expect(screen.queryByRole("button", { name: /^undo$/i })).toBeNull();
    const resetUsage = screen.getByRole("button", { name: /^reset usage$/i });
    expect((resetUsage as HTMLButtonElement).disabled).toBe(false);

    // Editor reflects the exact pre-reset minutes value again — this
    // is what confirms `bookedMinutes` was round-tripped through the
    // calendar's `setCalendar` and back into the editor's `slot` prop.
    expect(screen.getByText(/already booked:/i).textContent).toContain("1h 15m");

    // ── Close the modal via Done and assert the calendar tile shows
    //     the restored headline (which encodes both bookedMinutes and
    //     — because pre-reset bookedCount was 2 of 4, derived back via
    //     the inferred-pair logic — also evidences a non-zero count).
    fireEvent.click(screen.getByRole("button", { name: /^done$/i }));

    // Modal is gone.
    expect(screen.queryByText(/^morning window$/i)).toBeNull();

    // Calendar tile reflects the restored values (headline back to the
    // pre-reset string, NOT the post-reset "0m / 4h").
    const morningTile = getMorningTile();
    expect(within(morningTile).getByText(PRE_RESET_HEADLINE)).toBeTruthy();
    expect(within(morningTile).queryByText(POST_RESET_HEADLINE)).toBeNull();

    // Belt-and-braces: re-open the editor and assert the count track
    // also survived the round-trip. Switching to count-based mode
    // surfaces "Already booked: 2 of 4" — proving `bookedCount` is
    // back at 2, not 0.
    openDay0MorningEditor();
    fireEvent.click(screen.getByRole("button", { name: /count-based/i }));
    const alreadyBookedLine = screen.getByText(/already booked:/i);
    expect(alreadyBookedLine.textContent).toContain("2");
    expect(alreadyBookedLine.textContent).toMatch(/of\s*4/);
  });
});

describe("Slot calendar — Undo affordance is silently dismissed by any other edit", () => {
  it("toggling the mode while Undo is showing dismisses the affordance and leaves bookedMinutes / bookedCount at zero (tile reflects post-reset, not restored)", () => {
    render(<CalendarHarness initial={buildInitialCalendar()} />);

    openDay0MorningEditor();
    fireEvent.click(screen.getByRole("button", { name: /^reset usage$/i }));
    fireEvent.click(screen.getByRole("button", { name: /yes, reset/i }));
    expect(screen.getByRole("button", { name: /^undo$/i })).toBeTruthy();

    // Any other edit — here, switching the mode — wipes the snapshot.
    fireEvent.click(screen.getByRole("button", { name: /count-based/i }));

    // Undo is gone, no "Usage reset." caption, and crucially no
    // restoration happened — the editor still reads zero booked.
    expect(screen.queryByRole("button", { name: /^undo$/i })).toBeNull();
    expect(screen.queryByText(/usage reset\./i)).toBeNull();
    expect(screen.getByText(/already booked:/i).textContent).toContain("0");

    // Close the modal and confirm the tile is showing the post-reset
    // headline for the new (count-based) mode — `bookedCount` is 0 of
    // the previous 4 slots — i.e. the tile was not restored either.
    fireEvent.click(screen.getByRole("button", { name: /^done$/i }));
    const morningTile = getMorningTile();
    expect(within(morningTile).getByText("0 / 4 booked")).toBeTruthy();
    // And the pre-reset time-based headline is gone for good — Undo
    // having been dismissed means this string never came back.
    expect(within(morningTile).queryByText(PRE_RESET_HEADLINE)).toBeNull();
  });

  it("dragging the window-length slider while Undo is showing dismisses the affordance and leaves bookedMinutes / bookedCount at zero", () => {
    render(<CalendarHarness initial={buildInitialCalendar()} />);

    openDay0MorningEditor();
    fireEvent.click(screen.getByRole("button", { name: /^reset usage$/i }));
    fireEvent.click(screen.getByRole("button", { name: /yes, reset/i }));
    expect(screen.getByRole("button", { name: /^undo$/i })).toBeTruthy();

    // The window-length slider is the only `range` input rendered by
    // the editor in time-based mode (count-based mode swaps it for a
    // slot-count slider, but we're still in time-based here).
    const slider = screen.getByRole("slider") as HTMLInputElement;
    fireEvent.change(slider, { target: { value: "180" } });

    // Undo dismissed silently. No restoration.
    expect(screen.queryByRole("button", { name: /^undo$/i })).toBeNull();
    expect(screen.queryByText(/usage reset\./i)).toBeNull();
    expect(screen.getByText(/already booked:/i).textContent).toContain("0m");

    // Close the modal. The tile shows zero booked against the new 3h
    // window — proves the slider edit landed AND that nothing was
    // restored (otherwise the headline would still be "1h 15m / …").
    fireEvent.click(screen.getByRole("button", { name: /^done$/i }));
    const morningTile = getMorningTile();
    expect(within(morningTile).getByText("0m / 3h")).toBeTruthy();
    expect(within(morningTile).queryByText(PRE_RESET_HEADLINE)).toBeNull();
  });
});
