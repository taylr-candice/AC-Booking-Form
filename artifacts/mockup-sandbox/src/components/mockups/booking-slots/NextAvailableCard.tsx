import { ArrowRight, Sparkles } from "lucide-react";

import {
  windowDisplayLabel,
  type CustomerDay,
  type CustomerSlot,
} from "./customerSlotData";
import { MorningIcon, AfternoonIcon, EveningIcon } from "./TimeOfDayIcon";

const BRAND = "#ED017F";

function longWeekday(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map((s) => parseInt(s, 10));
  const local = new Date(y, (m ?? 1) - 1, d ?? 1);
  return local.toLocaleDateString("en-AU", { weekday: "long" });
}

function WindowIcon({
  window,
  className,
}: {
  window: CustomerSlot["window"];
  className?: string;
}) {
  if (window === "morning") return <MorningIcon className={className} />;
  if (window === "afternoon") return <AfternoonIcon className={className} />;
  return <EveningIcon className={className} />;
}

/**
 * "Next available" shortcut card. Sits above the day picker. Tapping
 * the CTA selects the day and slot via `onPick`; the customer still
 * acknowledges the cancellation terms via the docked checkbox below.
 *
 * Layout:
 *   Next available                ← small pink uppercase label
 *   [icon] Morning · Friday 1 May ← bold black headline (time-of-day first)
 *   1pm – 5pm                     ← light grey time range
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
  const iconSize = isCompact ? "h-[13px] w-[13px]" : "h-[14px] w-[14px]";

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

          {/* Headline: [time-of-day icon] Window · Weekday Day Month */}
          <div
            className={`mt-0.5 flex items-center gap-1 font-bold text-slate-900 ${
              isCompact ? "text-[13px]" : "text-sm"
            }`}
            data-testid={`next-available-headline-${testIdSuffix}`}
          >
            <WindowIcon window={slot.window} className={iconSize} />
            <span>
              {windowLabel}
              <span className="mx-1 font-normal text-slate-400">·</span>
              {weekdayLong} {day.day} {monthTitle}
            </span>
          </div>

          {/* Time range — light grey */}
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
