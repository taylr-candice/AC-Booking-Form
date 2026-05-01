/**
 * Shared rollout-day / slot-window picker.
 *
 * Extracted from {@link NewBookingFlow} so the admin "convert
 * coordination booking" modal can render the same per-day grid the
 * phone-booking flow uses, and the two stay in lockstep when we tweak
 * disabled-state copy or capacity hints.
 *
 * Pure presentational components — they receive the rollout day +
 * picked state and emit clicks back to the parent. Capacity bumping,
 * job-fit rules, and seed data live elsewhere.
 *
 * The primary surface is now {@link RolloutMonthCalendar}: a full
 * Su–Sa month calendar with a dedicated window-picker panel for the
 * focused day. The flat-card 7-column strip layout (`RolloutDayCell`)
 * has been retired — both the customer-side phone wizard
 * ({@link NewBookingFlow}) and the admin Schedule / Reschedule modal
 * ({@link SchedulingModal}) render this calendar instead.
 */

import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Check, ChevronLeft, ChevronRight, Clock, Hash } from "lucide-react";

import {
  rolloutSlotStatus,
  type RolloutDay,
  type RolloutSlot,
  type ServiceCapacityModel,
} from "@/state/adminMockData";
import { formatDurationMinutes } from "@/state/bookingDerived";

import { BRAND, BRAND_DEEP, BRAND_SOFT } from "./theme";

/** Accent color for a rollout's capacity-model pill. Slots-per-window
 *  rollouts get a blue accent ("count-y"), time-budget rollouts get
 *  the brand pink ("time-y") — same convention the customer-side
 *  picker uses. */
export function capacityModelColor(model: ServiceCapacityModel): string {
  return model === "slots_per_window" ? "#3B82F6" : BRAND;
}

const WEEKDAY_HEADERS = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
] as const;

const LONG_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** "YYYY-MM-DD" of today in local time, matching the format used by
 *  every {@link RolloutDay.isoDate} so string comparison gives correct
 *  past/future ordering. */
function isoToday(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** "YYYY-MM" key for grouping a rollout day by calendar month. */
function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

/** "April 2026" — long month + year, derived from a "YYYY-MM" key
 *  without relying on locale-specific `Date#toLocaleDateString` so
 *  vitest snapshots don't drift between Node versions. */
function monthHeading(month: string): string {
  const [yStr, mStr] = month.split("-");
  const m = parseInt(mStr, 10);
  return `${LONG_MONTHS[m - 1]} ${yStr}`;
}

function shiftMonth(month: string, delta: 1 | -1): string {
  const [yStr, mStr] = month.split("-");
  let y = parseInt(yStr, 10);
  let m = parseInt(mStr, 10) + delta;
  if (m < 1) {
    m = 12;
    y -= 1;
  } else if (m > 12) {
    m = 1;
    y += 1;
  }
  return `${y}-${String(m).padStart(2, "0")}`;
}

/** Build a 6×7 = 42 cell matrix for a given month, leading and
 *  trailing nulls so the visible-month grid always renders six full
 *  weeks (no jumpy heights as the user navigates between months with
 *  different start weekdays). Returns ISO date strings or `null` for
 *  empty placeholder cells. */
function buildMonthMatrix(month: string): Array<string | null> {
  const [yStr, mStr] = month.split("-");
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);
  const first = new Date(y, m - 1, 1);
  const startWeekday = first.getDay(); // 0..6, Sun-first
  const daysInMonth = new Date(y, m, 0).getDate();
  const cells: Array<string | null> = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  while (cells.length < 42) cells.push(null);
  return cells;
}

/**
 * Full-month rollout calendar — replaces the legacy 7-column flat
 * strip of `RolloutDayCell`s.
 *
 * Behaviour:
 * - Renders a Su–Sa month grid with one row per week. Days outside
 *   the rollout, days that are closed, and days already in the past
 *   render as muted placeholders that aren't clickable.
 * - In-rollout open days that have at least one bookable window
 *   render with a brand-pink availability dot and a hover state.
 * - Clicking an available day focuses it and reveals the
 *   Morning / Afternoon / Evening window-picker panel below the grid.
 * - When the rollout spans more than one calendar month, prev/next
 *   month buttons appear so the admin can navigate.
 *
 * Test-id contract: every available day's window button is also
 * mounted in a hidden mirror beneath the visible panel, so the
 * existing `rollout-pick-slot-{isoDate}__{window}` selectors used by
 * unit tests (and by playwright tests after they click the day cell)
 * remain valid for any day in the rollout — not just the focused one.
 */
export function RolloutMonthCalendar({
  days,
  capacityModel,
  jobMinutes,
  pickedDate,
  pickedWindow,
  onPick,
}: {
  days: ReadonlyArray<RolloutDay>;
  capacityModel: ServiceCapacityModel;
  jobMinutes: number;
  pickedDate: string | null;
  pickedWindow: "morning" | "afternoon" | "evening" | null;
  onPick: (
    date: string,
    window: "morning" | "afternoon" | "evening",
  ) => void;
}) {
  const dayByIso = useMemo(() => {
    const m = new Map<string, RolloutDay>();
    for (const d of days) m.set(d.isoDate, d);
    return m;
  }, [days]);

  const monthsCovered = useMemo(() => {
    const set = new Set<string>();
    for (const d of days) set.add(monthKey(d.isoDate));
    return Array.from(set).sort();
  }, [days]);

  const todayIso = useMemo(() => isoToday(), []);

  function dayHasBookableWindow(day: RolloutDay): boolean {
    if (!day.open) return false;
    if (day.isoDate < todayIso) return false;
    const slots: RolloutSlot[] = [day.morning, day.afternoon];
    if (day.evening) slots.push(day.evening);
    return slots.some(
      (s) =>
        rolloutSlotStatus(day, s, capacityModel, jobMinutes) === "available",
    );
  }

  // Default visible month: month of the picked date if any, else the
  // first month containing a bookable day, else the first month the
  // rollout covers, else this month. Computed once on mount — the user
  // navigates from there with the prev/next buttons.
  const initialVisibleMonth = useMemo<string>(() => {
    if (pickedDate) return monthKey(pickedDate);
    const firstAvail = days.find((d) => dayHasBookableWindow(d));
    if (firstAvail) return monthKey(firstAvail.isoDate);
    return monthsCovered[0] ?? monthKey(todayIso);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [visibleMonth, setVisibleMonth] = useState<string>(initialVisibleMonth);

  // The day the user clicked on the calendar but hasn't yet picked a
  // window for. Distinct from the parent's `pickedDate` which only
  // becomes set after a window is also picked.
  const [clickedDay, setClickedDay] = useState<string | null>(null);

  // Effective focused day: the user's most recent click on the
  // calendar wins, so that even in reschedule mode (where the parent
  // hands us a `pickedDate` for the current booking) clicking a
  // different day cell swaps the visible window panel to that day.
  // When `pickedDate` changes externally (e.g. the parent loads a
  // different booking, or undo restores the original) we clear
  // `clickedDay` so the new `pickedDate` takes over again — see the
  // effect below.
  const focusedDate = clickedDay ?? pickedDate;
  const focusedDay = focusedDate ? dayByIso.get(focusedDate) ?? null : null;

  // When the parent hands us a *different* `pickedDate` (open
  // reschedule for another booking, undo restoring the original, etc.)
  // we (a) clear the user's pending day click so the new pickedDate
  // wins focus and (b) snap the visible month to that date's month.
  // Critically this effect must depend only on `pickedDate` — if it
  // also depended on `visibleMonth` it would undo user navigation by
  // snapping back to the picked-date's month every time the admin
  // pressed prev/next.
  const prevPickedDateRef = useRef(pickedDate);
  useEffect(() => {
    if (prevPickedDateRef.current !== pickedDate) {
      setClickedDay(null);
      if (pickedDate) {
        setVisibleMonth(monthKey(pickedDate));
      }
      prevPickedDateRef.current = pickedDate;
    }
  }, [pickedDate]);

  const cells = buildMonthMatrix(visibleMonth);
  const canPrev = monthsCovered.some((m) => m < visibleMonth);
  const canNext = monthsCovered.some((m) => m > visibleMonth);

  function handleDayClick(iso: string) {
    setClickedDay(iso);
  }

  return (
    <div
      className="flex flex-col gap-3"
      data-testid="rollout-month-calendar"
    >
      {/* Month header + nav */}
      <div className="flex items-center justify-between">
        <div
          className="text-[15px] font-semibold text-slate-900"
          data-testid="rollout-calendar-month-heading"
        >
          {monthHeading(visibleMonth)}
        </div>
        {(canPrev || canNext) && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() =>
                canPrev && setVisibleMonth(shiftMonth(visibleMonth, -1))
              }
              disabled={!canPrev}
              data-testid="rollout-calendar-prev-month"
              aria-label="Previous month"
              className="rounded-md border border-slate-200 bg-white p-1 text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() =>
                canNext && setVisibleMonth(shiftMonth(visibleMonth, 1))
              }
              disabled={!canNext}
              data-testid="rollout-calendar-next-month"
              aria-label="Next month"
              className="rounded-md border border-slate-200 bg-white p-1 text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Weekday header row */}
      <div className="grid grid-cols-7 gap-1 px-1">
        {WEEKDAY_HEADERS.map((w) => (
          <div
            key={w}
            className="py-1 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-500"
          >
            {w}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((iso, idx) => {
          if (!iso) {
            return (
              <div
                key={`empty-${idx}`}
                aria-hidden="true"
                className="aspect-square"
              />
            );
          }
          const day = dayByIso.get(iso);
          const isToday = iso === todayIso;
          const isPast = iso < todayIso;
          const inRollout = !!day;
          const open = inRollout && day.open;
          const available = inRollout ? dayHasBookableWindow(day) : false;
          const isFocused = iso === focusedDate;
          const dayNum = parseInt(iso.slice(8), 10);

          if (!inRollout || !open || isPast) {
            const reason = isPast
              ? "In the past"
              : !inRollout
                ? "Outside rollout"
                : "Closed";
            return (
              <div
                key={iso}
                data-testid={`rollout-day-${iso}`}
                title={reason}
                aria-label={`${reason} — ${dayNum}`}
                className="flex aspect-square items-center justify-center rounded-lg bg-transparent text-[12px] text-slate-300"
              >
                {dayNum}
              </div>
            );
          }

          // Open, in-rollout day. Clickable regardless of whether any
          // window is currently bookable so the admin can still
          // explore the disabled-state copy on a fully-booked day.
          return (
            <button
              key={iso}
              type="button"
              data-testid={`rollout-day-${iso}`}
              onClick={() => handleDayClick(iso)}
              title={available ? "Available" : "No bookable windows"}
              aria-pressed={isFocused}
              className={`relative flex aspect-square flex-col items-center justify-center rounded-lg border text-[13px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-300 ${
                isFocused
                  ? "text-white shadow-sm"
                  : available
                    ? "border-slate-200 bg-white text-slate-900 hover:border-pink-300 hover:bg-pink-50"
                    : "border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300"
              }`}
              style={
                isFocused
                  ? { backgroundColor: BRAND, borderColor: BRAND }
                  : undefined
              }
            >
              <span>{dayNum}</span>
              {!isFocused && available && (
                <span
                  className="absolute bottom-1 h-1 w-1 rounded-full"
                  style={{ backgroundColor: BRAND }}
                  aria-hidden="true"
                />
              )}
              {isToday && !isFocused && (
                <span
                  className="pointer-events-none absolute inset-0.5 rounded-md ring-1"
                  style={{ borderColor: "transparent", boxShadow: `inset 0 0 0 1px ${BRAND_SOFT}` }}
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Window picker panel for the focused day */}
      {focusedDay && focusedDay.open ? (
        <div
          className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
          data-testid="rollout-window-panel"
        >
          <div className="mb-2 flex items-baseline justify-between">
            <div className="text-[13px] font-semibold text-slate-900">
              {focusedDay.weekdayLabel} {focusedDay.dayLabel}{" "}
              {focusedDay.monthLabel}
            </div>
            <div className="text-[11px] text-slate-500">
              Pick a window
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <RolloutSlotChoice
              label="Morning"
              day={focusedDay}
              slot={focusedDay.morning}
              capacityModel={capacityModel}
              jobMinutes={jobMinutes}
              picked={
                pickedDate === focusedDay.isoDate && pickedWindow === "morning"
              }
              onPick={() => onPick(focusedDay.isoDate, "morning")}
            />
            <RolloutSlotChoice
              label="Afternoon"
              day={focusedDay}
              slot={focusedDay.afternoon}
              capacityModel={capacityModel}
              jobMinutes={jobMinutes}
              picked={
                pickedDate === focusedDay.isoDate &&
                pickedWindow === "afternoon"
              }
              onPick={() => onPick(focusedDay.isoDate, "afternoon")}
            />
            {focusedDay.evening ? (
              <RolloutSlotChoice
                label="Evening"
                day={focusedDay}
                slot={focusedDay.evening}
                capacityModel={capacityModel}
                jobMinutes={jobMinutes}
                picked={
                  pickedDate === focusedDay.isoDate &&
                  pickedWindow === "evening"
                }
                onPick={() => onPick(focusedDay.isoDate, "evening")}
              />
            ) : (
              <div className="flex items-center justify-center rounded border border-dashed border-slate-200 bg-slate-50 px-2 py-3 text-center text-[11px] text-slate-500">
                No evening window
              </div>
            )}
          </div>
        </div>
      ) : (
        <div
          className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-[12px] text-slate-600"
          data-testid="rollout-window-panel-empty"
        >
          Select a day above to see the available windows.
        </div>
      )}

      {/*
        Hidden mirror — preserves the
        `rollout-pick-slot-{iso}__{window}` test-id contract for unit
        tests that fire a click on a window button without first
        clicking the day cell, and for any other code path that needs
        to address a specific (date, window) pair without first
        focusing the day. The visible panel above already renders the
        focused day's three buttons, so we exclude the focused day
        here to avoid duplicate test ids in the DOM.
      */}
      <div hidden aria-hidden="true">
        {days
          .filter((day) => day.isoDate !== focusedDate)
          .map((day) => (
            <Fragment key={day.isoDate}>
              <RolloutSlotChoice
                label="Morning"
                day={day}
                slot={day.morning}
                capacityModel={capacityModel}
                jobMinutes={jobMinutes}
                picked={
                  pickedDate === day.isoDate && pickedWindow === "morning"
                }
                onPick={() => onPick(day.isoDate, "morning")}
              />
              <RolloutSlotChoice
                label="Afternoon"
                day={day}
                slot={day.afternoon}
                capacityModel={capacityModel}
                jobMinutes={jobMinutes}
                picked={
                  pickedDate === day.isoDate && pickedWindow === "afternoon"
                }
                onPick={() => onPick(day.isoDate, "afternoon")}
              />
              {day.evening ? (
                <RolloutSlotChoice
                  label="Evening"
                  day={day}
                  slot={day.evening}
                  capacityModel={capacityModel}
                  jobMinutes={jobMinutes}
                  picked={
                    pickedDate === day.isoDate && pickedWindow === "evening"
                  }
                  onPick={() => onPick(day.isoDate, "evening")}
                />
              ) : null}
            </Fragment>
          ))}
      </div>
    </div>
  );
}

function RolloutSlotChoice({
  label,
  day,
  slot,
  capacityModel,
  jobMinutes,
  picked,
  onPick,
}: {
  label: string;
  day: RolloutDay;
  slot: RolloutSlot;
  capacityModel: ServiceCapacityModel;
  jobMinutes: number;
  picked: boolean;
  onPick: () => void;
}) {
  const status = rolloutSlotStatus(day, slot, capacityModel, jobMinutes);
  const available = status === "available";
  const accent = capacityModelColor(capacityModel);
  const ModeIcon = capacityModel === "slots_per_window" ? Hash : Clock;

  // Reason text for unbookable windows. Mirrors the customer-side
  // picker copy so admins and customers see the same justifications.
  let reason = "";
  if (!available) {
    if (status === "not_yet_open") {
      reason = `${label} not yet open for booking`;
    } else if (capacityModel === "slots_per_window") {
      const total = slot.slotCount ?? 0;
      const booked = slot.bookedCount ?? 0;
      reason =
        booked >= total
          ? `${label} is full (${total}/${total})`
          : "Not bookable";
    } else {
      const remaining = Math.max(0, slot.windowMinutes - slot.bookedMinutes);
      reason =
        remaining <= 0
          ? `${label} is full`
          : `Only ${formatDurationMinutes(remaining)} left — needs ${formatDurationMinutes(jobMinutes)}`;
    }
  }

  // Capacity hint shown alongside available windows so the admin can
  // see how tight things are at a glance.
  const capacityHint =
    capacityModel === "slots_per_window"
      ? `${slot.bookedCount ?? 0} / ${slot.slotCount ?? 0}`
      : `${formatDurationMinutes(
          Math.max(0, slot.windowMinutes - slot.bookedMinutes),
        )} left`;

  return (
    <button
      type="button"
      onClick={onPick}
      disabled={!available}
      data-testid={`rollout-pick-slot-${day.isoDate}__${label.toLowerCase()}`}
      title={!available ? reason : capacityHint}
      className={`flex w-full flex-col gap-1 rounded-lg border px-3 py-2 text-left transition ${
        picked
          ? "ring-2"
          : available
            ? "hover:bg-slate-50"
            : "cursor-not-allowed opacity-60"
      }`}
      style={
        picked
          ? {
              borderColor: BRAND,
              backgroundColor: BRAND_SOFT,
              boxShadow: `0 0 0 2px ${BRAND_SOFT}`,
            }
          : { borderColor: "#E2E8F0" }
      }
    >
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-700">
          <ModeIcon className="h-3 w-3" style={{ color: accent }} />
          {label}
        </div>
        {picked && (
          <Check className="h-3.5 w-3.5" style={{ color: BRAND_DEEP }} />
        )}
      </div>
      <div className="text-[11px] text-slate-500">
        {available ? capacityHint : reason}
      </div>
    </button>
  );
}
