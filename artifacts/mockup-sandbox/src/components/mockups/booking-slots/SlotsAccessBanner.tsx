import { Info } from "lucide-react";

import { type AccessMethod, type LeaveKeySubMethod } from "../../../state/bookingSession";
import {
  getAccessSchedulingMode,
  getSchedulerNoticeCopy,
  type AccessSchedulingMode,
} from "./accessSchedulingMode";

const BRAND = "#ED017F";

/**
 * Top-of-page notification used by the customer slot pickers
 * (`SlotsMobile`, `SlotsMobileLite`, `SlotsDesktop`).
 *
 * The banner title and body copy are driven by the customer's access
 * scheduling mode:
 *
 *  WINDOW_REQUIRED (be-there, leave-key-with-someone, default):
 *    "These are windows, not set times" — the property / key-holder
 *    must be available for the entire window.
 *    Shows a "Why can't I book a specific date/time?" link that opens
 *    a focused modal (passed in via `onWhyWindows`).
 *
 *  FLEXIBLE_TAYLR_MANAGED (parcel locker, collect & return, trade key,
 *    unattended leave-key sub-options):
 *    "Flexible access selected" — Taylr handles access logistics.
 *
 * The bottom row always shows "Can't wait the window? Change access option"
 * so the customer can jump back to change their access method.
 *
 * `size` controls padding so the same banner fits the tighter mobile
 * layouts and the more spacious desktop card.
 */
export function SlotsAccessBanner({
  accessMethod,
  leaveKeySub,
  size,
  testIdSuffix,
  onWhyWindows,
}: {
  accessMethod: AccessMethod | null;
  leaveKeySub?: LeaveKeySubMethod | null;
  size: "compact" | "regular";
  testIdSuffix: "mobile" | "mobile-lite" | "desktop";
  onWhyWindows: () => void;
}) {
  const schedulingMode: AccessSchedulingMode = getAccessSchedulingMode(
    accessMethod,
    leaveKeySub,
  );
  const { title, body } = getSchedulerNoticeCopy(schedulingMode);

  const padding = size === "compact" ? "px-3 py-2.5" : "px-4 py-3";
  const headingSize = size === "compact" ? "text-[13px]" : "text-sm";
  const bodySize = size === "compact" ? "text-[12px]" : "text-sm";
  const linkSize = size === "compact" ? "text-[11px]" : "text-xs";

  const bodyParagraphs = body.split("\n\n");

  return (
    <div
      className={`mb-4 flex items-start gap-2.5 rounded-lg border bg-pink-50 ${padding}`}
      data-testid={`banner-window-notice-${testIdSuffix}`}
      data-access-mode={schedulingMode}
      style={{ borderColor: "#FBCFE0" }}
    >
      <Info
        className="mt-0.5 h-4 w-4 shrink-0"
        aria-hidden="true"
        style={{ color: BRAND }}
      />
      <div className="flex-1">
        <div className={`font-semibold text-slate-900 ${headingSize}`}>
          {title}
        </div>
        <div
          className={`mt-1 leading-relaxed text-slate-700 ${bodySize}`}
          data-testid={`banner-window-notice-body-${testIdSuffix}`}
        >
          {bodyParagraphs.map((para, i) => (
            <p key={i} className={i > 0 ? "mt-2" : ""}>
              {para}
            </p>
          ))}
        </div>

        {schedulingMode === "WINDOW_REQUIRED" && (
          <div className={`mt-1.5 ${bodySize}`}>
            <button
              type="button"
              data-testid={`button-why-windows-${testIdSuffix}`}
              onClick={onWhyWindows}
              className="text-slate-700 underline underline-offset-2 hover:text-slate-900 transition-colors"
            >
              Why can't I book a specific date/time?
            </button>
          </div>
        )}

        <div
          className={`mt-2 flex flex-wrap items-center gap-x-1 gap-y-1 ${bodySize}`}
        >
          <button
            type="button"
            data-testid={`button-change-access-${testIdSuffix}`}
            className="font-semibold underline underline-offset-2 hover:opacity-80"
            style={{ color: BRAND }}
          >
            Change access option
          </button>
        </div>
      </div>
    </div>
  );
}
