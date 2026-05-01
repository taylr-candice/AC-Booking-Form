import { Info } from "lucide-react";

import { isBeThereMethod } from "../../../state/accessMethodCatalog";
import { type AccessMethod } from "../../../state/bookingSession";
import { accessRecapLabel } from "./customerSlotData";

const BRAND = "#ED017F";

/**
 * Top-of-page notification used by the customer slot pickers
 * (`SlotsMobile`, `SlotsMobileLite`, `SlotsDesktop`) to make two
 * things clear before the customer picks a window:
 *
 *   1. The slot is a *window*, not a fixed appointment time. The
 *      technician arrives anywhere inside that window, and can
 *      take any time within it to finish the job.
 *
 *   2. For "I'll be there" access methods, the property must be
 *      available for the entire window. So the banner pairs that
 *      reminder with an inline "Change access method" prompt for
 *      customers who'd rather pick a key-holder / lockbox / agent
 *      coordinated method after reading the heads-up.
 *
 * The cancellation-terms ack still lives above Confirm — that's a
 * separate legal acknowledgement. This banner replaces the older
 * "I'll be available for the entire window" tickbox-style ack so
 * the same information becomes a piece of guidance the customer
 * reads up front, not a checkbox they have to remember to tick.
 *
 * `size` controls vertical/horizontal padding so the same banner
 * fits the tighter mobile layouts and the more spacious desktop
 * card.
 */
export function SlotsAccessBanner({
  accessMethod,
  size,
  testIdSuffix,
}: {
  accessMethod: AccessMethod | null;
  size: "compact" | "regular";
  /** Suffix appended to the testids so each variant exposes its
   *  own banner / change-access link in the DOM. */
  testIdSuffix: "mobile" | "mobile-lite" | "desktop";
}) {
  const beThere = isBeThereMethod(accessMethod);
  const recapLabel = accessRecapLabel(accessMethod);
  // Treat "no method picked yet" as the be-there case so the
  // canvas-isolated mockup still leads with the more cautious copy.
  const showWindowHeadsUp = beThere || accessMethod === null;

  const padding =
    size === "compact" ? "px-3 py-2.5" : "px-4 py-3";
  const headingSize = size === "compact" ? "text-[13px]" : "text-sm";
  const bodySize = size === "compact" ? "text-[12px]" : "text-sm";
  const linkSize = size === "compact" ? "text-[11px]" : "text-xs";

  return (
    <div
      className={`mb-4 flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 ${padding}`}
      data-testid={`banner-window-notice-${testIdSuffix}`}
      data-access-mode={
        showWindowHeadsUp ? "be-there" : "unattended"
      }
    >
      <Info
        className="mt-0.5 h-4 w-4 shrink-0 text-slate-500"
        aria-hidden="true"
      />
      <div className="flex-1">
        <div className={`font-semibold text-slate-900 ${headingSize}`}>
          This is a window, not a set time
        </div>
        <div
          className={`mt-1 leading-relaxed text-slate-700 ${bodySize}`}
          data-testid={`banner-window-notice-body-${testIdSuffix}`}
        >
          {showWindowHeadsUp ? (
            <>
              We can't confirm an exact arrival or finish time within
              the window you pick, so please make sure the property
              is available for the entire window.
            </>
          ) : (
            <>
              The service will be carried out sometime within the
              window you pick — there's no set arrival time.
            </>
          )}
        </div>
        <div
          className={`mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 ${linkSize}`}
        >
          <span className="text-slate-500">
            Access:{" "}
            <span className="font-medium text-slate-900">
              {recapLabel}
            </span>
          </span>
          <button
            type="button"
            data-testid={`button-change-access-${testIdSuffix}`}
            className="font-semibold underline underline-offset-2 hover:opacity-80"
            style={{ color: BRAND }}
          >
            {showWindowHeadsUp
              ? "Change access method"
              : "Change access"}
          </button>
        </div>
      </div>
    </div>
  );
}
