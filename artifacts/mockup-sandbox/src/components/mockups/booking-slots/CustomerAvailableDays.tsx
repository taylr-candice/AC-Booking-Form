import { useEffect, useMemo, useRef } from "react";
import { Moon, Sun, Sunrise } from "lucide-react";

import { dayWindows, type CustomerDay, type CustomerSlot } from "./customerSlotData";

const SELECTED_PINK_BG = "#5FBB97";
const SELECTED_PINK_TEXT = "#FFFFFF";
const SELECTED_PINK_BORDER = "#5FBB97";

function isoToday(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Tiny weather/celestial glyph paired with each available window.
 * Mirrors the window-card icons inside the slot panel below so the
 * customer can connect "the sneak peek glyph" to "the window I'll
 * pick on the next screen":
 *   morning   → Sunrise (horizon arrow up + rays)
 *   afternoon → Sun     (filled centre with rays)
 *   evening   → Moon    (filled crescent)
 *
 * The afternoon and evening glyphs use `fill="currentColor"` so the
 * sun's centre and the moon's crescent read as solid shapes — they
 * pop at the small size used in the day card grid where outline-only
 * lucide strokes were too faint.
 */
function WindowIcon({
  window,
  className,
  style,
}: {
  window: CustomerSlot["window"];
  className: string;
  style?: React.CSSProperties;
}) {
  if (window === "morning")
    return <Sunrise aria-hidden className={className} style={style} />;
  if (window === "afternoon")
    return (
      <Sun
        aria-hidden
        className={className}
        style={style}
        fill="currentColor"
      />
    );
  return (
    <Moon
      aria-hidden
      className={className}
      style={style}
      fill="currentColor"
    />
  );
}

function windowSrLabel(window: CustomerSlot["window"]): string {
  if (window === "morning") return "morning";
  if (window === "afternoon") return "afternoon";
  return "evening";
}

/**
 * Customer-side day picker shared by `SlotsMobile`, `SlotsMobileLite`,
 * and `SlotsDesktop`.
 *
 * Design: instead of a generic full-month grid (which forces the
 * customer to scan rows of greyed-out cells), we render only the
 * future days in the rollout. Each card shows the weekday + date,
 * and — for available days — a "sneak peek" row of glyphs hinting at
 * which windows are still open (☀ morning, 🌤 afternoon, 🌙 evening).
 * Booked / fully-unavailable future days appear as muted cards with
 * no glyph row so the customer can see them passively but can't pick
 * them. Selected day fills with brand pink; today is ringed with the
 * soft brand tint.
 *
 * Layout uses a horizontally-scrolling row on compact (mobile)
 * viewports — keeps the picker above the fold while still showing
 * glyphs comfortably — and a wider grid on desktop. testIds match the
 * existing `day-card-${iso}` contract so behaviour and e2e tests
 * keep working.
 */
export function CustomerAvailableDays({
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
  const todayIso = useMemo(() => isoToday(), []);

  // Show today + future days only. Past days never need to render in
  // the customer flow.
  const visibleDays = useMemo(
    () => days.filter((d) => d.date >= todayIso),
    [days, todayIso],
  );

  const isCompact = size === "compact";

  // Auto-scroll the selected date into view on mobile so picking a
  // far-out date doesn't leave the highlight off-screen.
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!isCompact || !selectedDate || !scrollerRef.current) return;
    const el = scrollerRef.current.querySelector<HTMLElement>(
      `[data-testid="day-card-${selectedDate}"]`,
    );
    el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [selectedDate, isCompact]);

  if (visibleDays.length === 0) return null;

  const cardBase =
    "relative shrink-0 flex flex-col items-center justify-center rounded-xl border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-300";
  const cardSize = isCompact
    ? "w-[78px] py-2.5"
    : "w-[104px] py-3";
  const weekdaySize = isCompact ? "text-[10px]" : "text-[11px]";
  const daySize = isCompact ? "text-xl" : "text-2xl";
  const monthSize = isCompact ? "text-[10px]" : "text-[11px]";
  const iconSize = isCompact ? "h-4 w-4" : "h-[18px] w-[18px]";

  // On compact viewports, render a horizontal scroller so a long
  // rollout doesn't force a tall multi-row grid above the window
  // panel. Desktop gets a full-width wrapping grid.
  const containerClass = isCompact
    ? "flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x snap-mandatory scroll-smooth no-scrollbar"
    : "grid grid-cols-5 gap-2.5";

  return (
    <div
      className="flex flex-col gap-2"
      data-testid={`customer-days-${testIdSuffix}`}
    >
      <div ref={scrollerRef} className={containerClass}>
        {visibleDays.map((day) => {
          const windows = dayWindows(day);
          const availableWindows = windows.filter(
            (w) => w.status === "available",
          );
          const isAvailable = availableWindows.length > 0;
          const isToday = day.date === todayIso;
          const isSelected = selectedDate === day.date && isAvailable;

          // Booked / closed / fully-unavailable future day: muted card,
          // no glyph row, not clickable. Rendered as a disabled
          // <button> so the existing e2e contract (the booked day
          // satisfies toBeDisabled() / `:not([disabled])` selectors)
          // keeps holding while the visual stays a passive grey card.
          if (!isAvailable) {
            return (
              <button
                key={day.date}
                type="button"
                disabled
                data-testid={`day-card-${day.date}`}
                title="Booked"
                aria-label={`${day.weekday} ${day.day} ${day.month} — booked`}
                className={`${cardBase} ${cardSize} cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 ${isCompact ? "snap-start" : ""}`}
              >
                <div className={`${weekdaySize} font-medium uppercase tracking-wide`}>
                  {day.weekday}
                </div>
                <div className={`${daySize} font-bold leading-tight`}>{day.day}</div>
                <div className={`${monthSize} font-medium uppercase tracking-wide`}>
                  {day.month}
                </div>
                <div
                  className="mt-1 text-[10px] uppercase tracking-wide"
                  aria-hidden="true"
                >
                  Booked
                </div>
              </button>
            );
          }

          const iconColor = isSelected ? "rgba(255,255,255,0.95)" : "#0F172A";

          return (
            <button
              key={day.date}
              type="button"
              data-testid={`day-card-${day.date}`}
              onClick={() => onSelect(day.date)}
              aria-pressed={isSelected}
              aria-label={`${day.weekday} ${day.day} ${day.month} — ${availableWindows.length} window${availableWindows.length === 1 ? "" : "s"} available`}
              className={`${cardBase} ${cardSize} ${isCompact ? "snap-start" : ""} ${
                isSelected
                  ? "shadow-sm"
                  : "border-slate-200 bg-white text-slate-900 hover:border-slate-300 hover:bg-slate-50"
              }`}
              style={
                isSelected
                  ? {
                      backgroundColor: SELECTED_PINK_BG,
                      borderColor: SELECTED_PINK_BORDER,
                      color: SELECTED_PINK_TEXT,
                    }
                  : undefined
              }
            >
              <div
                className={`${weekdaySize} font-medium uppercase tracking-wide ${
                  isSelected ? "" : "text-slate-500"
                }`}
                style={isSelected ? { color: SELECTED_PINK_TEXT, opacity: 0.85 } : undefined}
              >
                {day.weekday}
              </div>
              <div className={`${daySize} font-bold leading-tight`}>{day.day}</div>
              <div
                className={`${monthSize} font-medium uppercase tracking-wide ${
                  isSelected ? "" : "text-slate-500"
                }`}
                style={isSelected ? { color: SELECTED_PINK_TEXT, opacity: 0.85 } : undefined}
              >
                {day.month}
              </div>
              {/* Sneak-peek glyph row — one icon per still-available
                  window (☀ morning / 🌤 afternoon / 🌙 evening). */}
              <div className="mt-1.5 flex items-center gap-1.5">
                {availableWindows.map((w) => (
                  <span key={w.id} className="sr-only">
                    {windowSrLabel(w.window)} available
                  </span>
                ))}
                {availableWindows.map((w) => (
                  <WindowIcon
                    key={`${w.id}-icon`}
                    window={w.window}
                    className={iconSize}
                    style={{ color: iconColor }}
                  />
                ))}
              </div>
              {isToday && !isSelected && (
                <span
                  className="pointer-events-none absolute inset-1 rounded-lg"
                  style={{ boxShadow: `inset 0 0 0 1px #CBD5E1` }}
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
