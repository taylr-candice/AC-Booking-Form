import { ArrowRight, Moon, Sparkles, Sun, Sunrise } from "lucide-react";

import {
  windowDisplayLabel,
  type CustomerDay,
  type CustomerSlot,
} from "./customerSlotData";

const BRAND = "#ED017F";

function WindowGlyph({
  window,
  className,
}: {
  window: CustomerSlot["window"];
  className: string;
}) {
  if (window === "morning")
    return <Sunrise aria-hidden className={className} style={{ color: BRAND }} />;
  if (window === "afternoon")
    return (
      <Sun
        aria-hidden
        className={className}
        style={{ color: BRAND }}
        fill="currentColor"
      />
    );
  return (
    <Moon
      aria-hidden
      className={className}
      style={{ color: BRAND }}
      fill="currentColor"
    />
  );
}

function longWeekday(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map((s) => parseInt(s, 10));
  const local = new Date(y, (m ?? 1) - 1, d ?? 1);
  return local.toLocaleDateString("en-AU", { weekday: "long" });
}

/**
 * One-tap "Next available" shortcut card. Sits above the day picker.
 * Tapping the CTA selects the day, selects the slot, and acks the
 * cancellation terms via `onPick`. The visible click-wrap microcopy
 * + `onViewTerms` modal preserve informed consent.
 */
export function NextAvailableCard({
  day,
  slot,
  onPick,
  onViewTerms,
  size = "compact",
  testIdSuffix,
}: {
  day: CustomerDay;
  slot: CustomerSlot;
  onPick: (iso: string, slotId: string) => void;
  onViewTerms: () => void;
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
      className={`rounded-xl border bg-pink-50 ${
        isCompact ? "px-3 py-2.5" : "px-4 py-3"
      }`}
      style={{ borderColor: "#FBCFE0" }}
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
          <div
            className={`mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-semibold text-slate-900 ${
              isCompact ? "text-[13px]" : "text-sm"
            }`}
            data-testid={`next-available-headline-${testIdSuffix}`}
          >
            <span>
              {weekdayLong} {day.day} {monthTitle}
            </span>
            <span className="text-slate-300" aria-hidden="true">
              ·
            </span>
            <span className="inline-flex items-center gap-1">
              <WindowGlyph
                window={slot.window}
                className={isCompact ? "h-3.5 w-3.5" : "h-4 w-4"}
              />
              {windowLabel}
            </span>
          </div>
          <div
            className={`mt-0.5 text-slate-500 ${
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
          aria-label={`Book ${weekdayLong} ${day.day} ${monthTitle} ${windowLabel} ${slot.timeLabel}`}
          className={`shrink-0 inline-flex items-center gap-1.5 rounded-full font-semibold text-white shadow-sm transition hover:opacity-90 ${
            isCompact ? "px-3 py-2 text-[12px]" : "px-4 py-2 text-[13px]"
          }`}
          style={{ backgroundColor: BRAND }}
        >
          Book this time
          <ArrowRight className={isCompact ? "h-3.5 w-3.5" : "h-4 w-4"} />
        </button>
      </div>

      <div
        className={`mt-2 text-slate-500 ${
          isCompact ? "text-[10.5px] leading-snug" : "text-[11px] leading-snug"
        }`}
        data-testid={`next-available-consent-${testIdSuffix}`}
      >
        By tapping{" "}
        <span className="font-medium text-slate-600">Book this time</span> you
        accept the cancellation and rescheduling terms.{" "}
        <button
          type="button"
          onClick={onViewTerms}
          data-testid={`button-view-next-available-terms-${testIdSuffix}`}
          className="font-medium underline underline-offset-2 hover:opacity-80"
          style={{ color: BRAND }}
        >
          View terms
        </button>
      </div>
    </div>
  );
}
