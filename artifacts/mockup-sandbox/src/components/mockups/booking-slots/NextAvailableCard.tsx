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
 * "Next available" shortcut card. Sits above the day picker. Tapping
 * the CTA selects the day and slot via `onPick`; the customer still
 * acknowledges the cancellation terms via the docked checkbox below.
 *
 * Layout (three stacked lines, no per-window icon):
 *   Friday 1 May   ← bold black
 *   Afternoon      ← regular black
 *   1pm – 5pm      ← light grey
 */
export function NextAvailableCard({
  day,
  slot,
  onPick,
  size = "compact",
  testIdSuffix,
}: {
  day: CustomerDay;
  slot: CustomerSlot;
  onPick: (iso: string, slotId: string) => void;
  size?: "compact" | "regular";
  testIdSuffix: string;
}) {
  const isCompact = size === "compact";
  const weekdayLong = longWeekday(day.date);
  const monthTitle =
    day.month.charAt(0) + day.month.slice(1).toLowerCase();
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
          <div
            className={`font-semibold uppercase tracking-wide ${
              isCompact ? "text-[10px]" : "text-[11px]"
            }`}
            style={{ color: BRAND }}
          >
            Next available
          </div>

          {/* Line 1: date — bold black */}
          <div
            className={`mt-0.5 font-bold text-slate-900 ${
              isCompact ? "text-[13px]" : "text-sm"
            }`}
            data-testid={`next-available-headline-${testIdSuffix}`}
          >
            {weekdayLong} {day.day} {monthTitle}
          </div>

          {/* Line 2: window label — regular weight, black */}
          <div
            className={`text-slate-900 ${
              isCompact ? "text-[13px]" : "text-sm"
            }`}
          >
            {windowLabel}
          </div>

          {/* Line 3: time range — light grey */}
          <div
            className={`text-slate-500 ${
              isCompact ? "text-[11px]" : "text-xs"
            }`}
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
          Book window
          <ArrowRight className={isCompact ? "h-3.5 w-3.5" : "h-4 w-4"} />
        </button>
      </div>
    </div>
  );
}
