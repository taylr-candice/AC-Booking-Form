import { useState } from "react";
import { Info } from "lucide-react";

import { type AccessMethod, type LeaveKeySubMethod } from "../../../state/bookingSession";
import {
  getAccessSchedulingMode,
  getSchedulerNoticeCopy,
  type AccessSchedulingMode,
} from "./accessSchedulingMode";
import { accessRecapLabel } from "./customerSlotData";

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
 *
 *  FLEXIBLE_TAYLR_MANAGED (parcel locker, collect & return, trade key,
 *    unattended leave-key sub-options):
 *    "Flexible access selected" — Taylr handles access logistics; the
 *    customer picks the window that suits their key arrangement and Taylr
 *    may adjust timing within the day for rollout coordination.
 *
 * The access-recap row ("Access: I'll be there · Change access method")
 * is present for both modes so the customer can always jump back to
 * change their method from the scheduler page.
 *
 * `size` controls padding so the same banner fits the tighter mobile
 * layouts and the more spacious desktop card.
 */
export function SlotsAccessBanner({
  accessMethod,
  leaveKeySub,
  size,
  testIdSuffix,
}: {
  accessMethod: AccessMethod | null;
  leaveKeySub?: LeaveKeySubMethod | null;
  size: "compact" | "regular";
  testIdSuffix: "mobile" | "mobile-lite" | "desktop";
}) {
  const [whyExpanded, setWhyExpanded] = useState(false);

  const schedulingMode: AccessSchedulingMode = getAccessSchedulingMode(
    accessMethod,
    leaveKeySub,
  );
  const { title, body } = getSchedulerNoticeCopy(schedulingMode);
  const recapLabel = accessRecapLabel(accessMethod);

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
          <div className={`mt-1.5 ${linkSize}`}>
            <button
              type="button"
              data-testid={`button-why-windows-${testIdSuffix}`}
              onClick={() => setWhyExpanded((v) => !v)}
              className="text-slate-400 underline underline-offset-2 hover:text-slate-600 transition-colors"
            >
              {whyExpanded ? "Hide explanation" : "Why can't I choose an exact time?"}
            </button>

            {whyExpanded && (
              <div
                className={`mt-2 rounded-md border border-pink-100 bg-white px-3 py-2.5 leading-relaxed text-slate-600 ${bodySize}`}
                data-testid={`panel-why-windows-${testIdSuffix}`}
              >
                <p className="font-semibold text-slate-800">Why we use service windows</p>
                <p className="mt-1.5">
                  This service is delivered as a building-wide rollout, with multiple apartments serviced on the same day.
                </p>
                <p className="mt-1.5">
                  To coordinate the technician's run efficiently, bookings are scheduled within set windows rather than exact appointment times.
                </p>
                <p className="mt-1.5">
                  If being available for the full window doesn't suit, you can change your access method and choose a flexible access option instead.
                </p>
              </div>
            )}
          </div>
        )}

        <div
          className={`mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 ${linkSize}`}
        >
          <span className="text-slate-900">
            Access:{" "}
            <span className="font-medium">{recapLabel}</span>
          </span>
          <button
            type="button"
            data-testid={`button-change-access-${testIdSuffix}`}
            className="font-semibold underline underline-offset-2 hover:opacity-80"
            style={{ color: BRAND }}
          >
            Change access method
          </button>
        </div>
      </div>
    </div>
  );
}
