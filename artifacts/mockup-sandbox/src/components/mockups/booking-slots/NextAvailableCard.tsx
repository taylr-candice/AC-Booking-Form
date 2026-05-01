import { ArrowRight, Sparkles } from "lucide-react";

import {
  windowDisplayLabel,
  type CustomerDay,
  type CustomerSlot,
} from "./customerSlotData";
import { AfternoonIcon, EveningIcon, MorningIcon } from "./TimeOfDayIcon";

function WindowIcon({ window, className }: { window: CustomerSlot["window"]; className?: string }) {
  if (window === "afternoon") return <AfternoonIcon className={className} />;
  if (window === "evening") return <EveningIcon className={className} />;
  return <MorningIcon className={className} />;
}

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
 *   ★  Next available      ← small pink label          (line 1)
 *      Friday 1 May        ← bold black headline        (line 2)
 *      Afternoon           ← bold black window name     (line 3)
 *      1pm – 5pm           ← grey time range            (line 4)
 *                                          [Book window →]
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
        {/* Star icon — anchored to top of text block */}
        <Sparkles
          aria-hidden
          className={`shrink-0 self-start mt-0.5 ${
            isCompact ? "h-4 w-4" : "h-[18px] w-[18px]"
          }`}
          style={{ color: BRAND }}
        />

        {/* 3-line text block */}
        <div className="min-w-0 flex-1">
          {/* Line 1 — "Next available" */}
          <div
            className={`font-semibold uppercase tracking-wide ${
              isCompact ? "text-[10px]" : "text-[11px]"
            }`}
            style={{ color: BRAND }}
          >
            Next available
          </div>

          {/* Line 2 — [icon] Window · weekday day month */}
          <div
            className={`mt-0.5 flex items-center gap-1.5 font-bold text-slate-900 ${
              isCompact ? "text-[13px]" : "text-sm"
            }`}
            data-testid={`next-available-headline-${testIdSuffix}`}
          >
            <WindowIcon
              window={slot.window}
              className={isCompact ? "h-3.5 w-3.5 shrink-0" : "h-4 w-4 shrink-0"}
            />
            <span>
              {windowLabel}
              <span className="mx-1 font-normal text-slate-400">·</span>
              {weekdayLong} {day.day} {monthTitle}
            </span>
          </div>

          {/* Line 3 — time range e.g. "1pm – 5pm" */}
          <div
            className={`text-slate-500 ${
              isCompact ? "text-[11px]" : "text-xs"
            }`}
          >
            {slot.timeLabel}
          </div>
        </div>

        {/* CTA */}
        <button
          type="button"
          onClick={() => onPick(day.date, slot.id)}
          data-testid={`button-book-next-available-${testIdSuffix}`}
          aria-label={`Book ${windowLabel} window on ${weekdayLong} ${day.day} ${monthTitle} (${slot.timeLabel})`}
          className={`shrink-0 self-end inline-flex items-center gap-1.5 rounded-full font-semibold text-white shadow-sm transition hover:opacity-90 ${
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
