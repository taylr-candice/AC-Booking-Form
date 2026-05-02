import { ArrowRight, Sparkles } from "lucide-react";

import {
  windowDisplayLabel,
  type CustomerDay,
  type CustomerSlot,
} from "./customerSlotData";

const BRAND = "#ED017F";

function longWeekday(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map((s) => parseInt(s, 10));
  const local = new Date(y, (m ?? 1) - 1, d ?? 1);
  return local.toLocaleDateString("en-AU", { weekday: "long" });
}

/**
 * "Next available" shortcut card. Sits above the day picker.
 *
 * Layout:
 *   ★  Next available                    ← small pink label     (line 1)
 *      [☀] Afternoon · Friday 2 May      ← icon + window + date (line 2, bold)
 *      1pm–5pm                           ← grey time range      (line 3)
 *                            [Book window →]
 */
export function NextAvailableCard({
  day,
  slot,
  onPick,
  size = "compact",
  ctaLabel = "Book window",
  testIdSuffix,
}: {
  day: CustomerDay;
  slot: CustomerSlot;
  onPick: (iso: string, slotId: string) => void;
  size?: "compact" | "regular";
  /** Label text for the book-this-window pill. Defaults to "Book window". */
  ctaLabel?: string;
  testIdSuffix: string;
}) {
  const isCompact = size === "compact";
  const weekdayLong = longWeekday(day.date);
  const monthTitle = day.month.charAt(0) + day.month.slice(1).toLowerCase();
  const windowLabel = windowDisplayLabel(slot.window);

  return (
    <div
      data-testid={`next-available-card-${testIdSuffix}`}
      className={`rounded-xl border border-slate-200 bg-white ${
        isCompact ? "px-3 py-2.5" : "px-4 py-3"
      }`}
    >
      <div className="flex items-center gap-3">
        <Sparkles
          aria-hidden
          className={
            isCompact ? "h-4 w-4 shrink-0" : "h-[18px] w-[18px] shrink-0"
          }
          style={{ color: BRAND }}
        />

        <div className="min-w-0 flex-1">
          {/* "Next available" label */}
          <div
            className={`font-semibold uppercase tracking-wide ${
              isCompact ? "text-[10px]" : "text-[11px]"
            }`}
            style={{ color: BRAND }}
          >
            Next available
          </div>

          {/* Window · weekday day month — text only, no icon prefix */}
          <div
            className={`mt-0.5 font-semibold text-slate-900 ${
              isCompact ? "text-[13px]" : "text-sm"
            }`}
            data-testid={`next-available-headline-${testIdSuffix}`}
          >
            {windowLabel} · {weekdayLong} {day.day} {monthTitle}
          </div>

          {/* Grey time range */}
          <div
            className={`text-slate-500 ${
              isCompact ? "text-[11px]" : "text-xs"
            }`}
            data-testid={`next-available-time-${testIdSuffix}`}
          >
            {slot.timeLabel}
          </div>
        </div>

        <button
          type="button"
          onClick={() => onPick(day.date, slot.id)}
          data-testid={`button-book-next-available-${testIdSuffix}`}
          aria-label={`Book ${windowLabel} window on ${weekdayLong} ${day.day} ${monthTitle} (${slot.timeLabel})`}
          className={`shrink-0 inline-flex items-center gap-1.5 rounded-full font-semibold text-white shadow-sm transition hover:opacity-90 ${
            isCompact ? "px-3 py-2 text-[12px]" : "px-4 py-2 text-[13px]"
          }`}
          style={{ backgroundColor: BRAND }}
        >
          {ctaLabel}
          <ArrowRight className={isCompact ? "h-3.5 w-3.5" : "h-4 w-4"} />
        </button>
      </div>
    </div>
  );
}
