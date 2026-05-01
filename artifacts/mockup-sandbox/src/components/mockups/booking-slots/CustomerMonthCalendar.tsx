import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { dayWindows, type CustomerDay } from "./customerSlotData";

const BRAND = "#ED017F";
const BRAND_SOFT = "#FCE7F0";

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

function isoToday(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

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

/**
 * Build a 6×7 = 42 cell matrix for the given month, leading and
 * trailing nulls so the visible-month grid always renders six full
 * weeks (no jumpy heights as the user navigates between months with
 * different start weekdays).
 */
function buildMonthMatrix(month: string): Array<string | null> {
  const [yStr, mStr] = month.split("-");
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);
  const first = new Date(y, m - 1, 1);
  const startWeekday = first.getDay();
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
 * Customer-side full-month picker shared across SlotsMobile,
 * SlotsMobileLite, and SlotsDesktop. Distinct visual identity from
 * Calendly: each available day shows the date number plus a
 * three-segment availability indicator under it (one micro-dot per
 * window — morning / afternoon / evening). Filled dots = window is
 * still bookable; empty dots = full / closed / not-enough-time. This
 * gives the customer a glanceable density read-out before committing
 * to a day.
 *
 * Out-of-rollout days, past days, and days where every window is
 * unavailable render as muted placeholders that aren't selectable.
 *
 * The size variant scales day cell padding + dot size between the
 * desktop card (`regular`) and mobile contexts (`compact`).
 */
export function CustomerMonthCalendar({
  days,
  selectedDate,
  onSelect,
  size = "compact",
  testIdSuffix,
}: {
  days: ReadonlyArray<CustomerDay>;
  selectedDate: string | null;
  onSelect: (iso: string) => void;
  size?: "compact" | "regular";
  testIdSuffix: string;
}) {
  const dayByIso = useMemo(() => {
    const m = new Map<string, CustomerDay>();
    for (const d of days) m.set(d.date, d);
    return m;
  }, [days]);

  const monthsCovered = useMemo(() => {
    const set = new Set<string>();
    for (const d of days) set.add(monthKey(d.date));
    return Array.from(set).sort();
  }, [days]);

  const todayIso = useMemo(() => isoToday(), []);

  const initialVisibleMonth = useMemo<string>(() => {
    if (selectedDate) return monthKey(selectedDate);
    const firstAvail = days.find((d) =>
      dayWindows(d).some((s) => s.status === "available"),
    );
    if (firstAvail) return monthKey(firstAvail.date);
    return monthsCovered[0] ?? monthKey(todayIso);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [visibleMonth, setVisibleMonth] = useState<string>(initialVisibleMonth);

  useEffect(() => {
    if (selectedDate && monthKey(selectedDate) !== visibleMonth) {
      setVisibleMonth(monthKey(selectedDate));
    }
  }, [selectedDate, visibleMonth]);

  const cells = buildMonthMatrix(visibleMonth);
  const canPrev = monthsCovered.some((m) => m < visibleMonth);
  const canNext = monthsCovered.some((m) => m > visibleMonth);

  const isCompact = size === "compact";
  const dayPad = isCompact ? "py-1.5" : "py-2";
  const dayNumberSize = isCompact ? "text-[13px]" : "text-[15px]";
  const dotSize = isCompact ? "h-1 w-1" : "h-1.5 w-1.5";
  const headerWeekdaySize = isCompact ? "text-[9px]" : "text-[10px]";

  return (
    <div
      className="flex flex-col gap-2"
      data-testid={`customer-month-calendar-${testIdSuffix}`}
    >
      {/* Month header + nav */}
      <div className="flex items-center justify-between">
        <div
          className="text-[13px] font-semibold uppercase tracking-wider text-slate-900"
          data-testid={`customer-calendar-month-${testIdSuffix}`}
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
              data-testid={`customer-calendar-prev-${testIdSuffix}`}
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
              data-testid={`customer-calendar-next-${testIdSuffix}`}
              aria-label="Next month"
              className="rounded-md border border-slate-200 bg-white p-1 text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Soft brand underline accent — visually anchors the calendar
          as a Taylr surface, not a generic Calendly grid. */}
      <div
        className="h-px w-full"
        style={{ backgroundColor: BRAND_SOFT }}
        aria-hidden="true"
      />

      {/* Weekday header row */}
      <div className="grid grid-cols-7 gap-1 px-0.5 pt-1">
        {WEEKDAY_HEADERS.map((w) => (
          <div
            key={w}
            className={`py-1 text-center font-semibold uppercase tracking-wider text-slate-500 ${headerWeekdaySize}`}
          >
            {w[0]}
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
                className={`${dayPad}`}
              />
            );
          }
          const day = dayByIso.get(iso);
          const isToday = iso === todayIso;
          const isPast = iso < todayIso;
          const inRollout = !!day;
          const windows = day ? dayWindows(day) : [];
          const availabilityFlags = windows.map(
            (s) => s.status === "available",
          );
          const anyAvailable = availabilityFlags.some(Boolean);
          const isSelected = selectedDate === iso && anyAvailable;
          const dayNum = parseInt(iso.slice(8), 10);

          // Out-of-rollout / past / closed / fully-unavailable: muted,
          // not clickable. We still render the date number so the
          // customer can reason about the calendar shape.
          if (!inRollout || isPast || !anyAvailable) {
            const reason = isPast
              ? "In the past"
              : !inRollout
                ? "Outside rollout"
                : "No availability";
            return (
              <div
                key={iso}
                data-testid={`day-card-${iso}`}
                title={reason}
                aria-label={`${reason} — ${dayNum}`}
                className={`flex ${dayPad} flex-col items-center justify-center rounded-lg text-slate-300 ${dayNumberSize}`}
              >
                <span>{dayNum}</span>
                {/* Empty dot row keeps cell height stable */}
                <span className={`mt-1 flex h-1.5 items-center gap-0.5`} aria-hidden="true">
                  <span className={`${dotSize} rounded-full bg-transparent`} />
                  <span className={`${dotSize} rounded-full bg-transparent`} />
                  <span className={`${dotSize} rounded-full bg-transparent`} />
                </span>
              </div>
            );
          }

          return (
            <button
              key={iso}
              type="button"
              data-testid={`day-card-${iso}`}
              onClick={() => onSelect(iso)}
              aria-pressed={isSelected}
              title={`Available — ${dayNum}`}
              className={`relative flex ${dayPad} flex-col items-center justify-center rounded-lg border font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-300 ${dayNumberSize} ${
                isSelected
                  ? "text-white shadow-sm"
                  : "border-slate-200 bg-white text-slate-900 hover:border-pink-300 hover:bg-pink-50"
              }`}
              style={
                isSelected
                  ? { backgroundColor: BRAND, borderColor: BRAND }
                  : undefined
              }
            >
              <span>{dayNum}</span>
              {/* Three-segment window-availability indicator. Fills
                  one dot per available window (morning / afternoon /
                  evening). Empty positions still take space so the
                  rhythm reads as "3 of 3" / "2 of 3" / "1 of 3" at a
                  glance. */}
              <span
                className={`mt-1 flex h-1.5 items-center gap-0.5`}
                aria-hidden="true"
              >
                {[0, 1, 2].map((i) => {
                  const present = i < availabilityFlags.length;
                  const filled = availabilityFlags[i];
                  const color = isSelected
                    ? filled
                      ? "rgba(255,255,255,0.95)"
                      : "rgba(255,255,255,0.35)"
                    : filled
                      ? BRAND
                      : "#E2E8F0";
                  return (
                    <span
                      key={i}
                      className={`${dotSize} rounded-full`}
                      style={{
                        backgroundColor: present ? color : "transparent",
                      }}
                    />
                  );
                })}
              </span>
              {isToday && !isSelected && (
                <span
                  className="pointer-events-none absolute inset-0.5 rounded-md"
                  style={{ boxShadow: `inset 0 0 0 1px ${BRAND_SOFT}` }}
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Tiny legend — anchors the dot indicator so the customer
          immediately understands what they're seeing. */}
      <div className="flex items-center justify-end gap-1.5 pt-1 text-[10px] text-slate-500">
        <span
          className={`${dotSize} rounded-full`}
          style={{ backgroundColor: BRAND }}
          aria-hidden="true"
        />
        <span>Available window</span>
      </div>
    </div>
  );
}
