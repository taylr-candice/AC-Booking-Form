import { useState } from "react";
import { Plus, X } from "lucide-react";

import { bookingActions, useBookingSelector } from "../../../state/bookingSession";

const BRAND = "#ED017F";
const MAX_LENGTH = 280;

/**
 * Step-4 (slot picker) optional disclosure for *additional* access
 * notes. The customer can leave a free-text note for the technician
 * — for example "buzzer is broken, knock on door 3" or "the key is
 * the silver one, not the gold one" — once they've picked a window.
 *
 * The textarea is bound to the same `access_notes` field used by
 * the Step-3 be-there textarea so the customer's notes survive
 * back-navigation between steps. If they already entered notes on
 * Step 3, the disclosure starts auto-expanded so they can see /
 * edit them in context rather than discovering them only after
 * Confirm.
 *
 * `size` controls vertical padding so the same control fits the
 * tighter mobile layouts and the more spacious desktop card.
 *
 * `testIdSuffix` makes the toggle button + textarea addressable
 * per-variant (mobile / mobile-lite / desktop) for behaviour tests.
 */
export function SlotsAccessNotesDisclosure({
  size,
  testIdSuffix,
}: {
  size: "compact" | "regular";
  testIdSuffix: "mobile" | "mobile-lite" | "desktop";
}) {
  const value = useBookingSelector((s) => s.access_notes);
  const [open, setOpen] = useState(value.trim().length > 0);

  const isCompact = size === "compact";
  const linkSize = isCompact ? "text-[12px]" : "text-[13px]";
  const textareaPadding = isCompact ? "px-3 py-2.5 text-[13px]" : "px-3 py-3 text-sm";
  const counterSize = isCompact ? "text-[10px]" : "text-[11px]";

  if (!open) {
    return (
      <div className={isCompact ? "mt-3" : "mt-4"}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          data-testid={`button-open-access-notes-${testIdSuffix}`}
          className={`inline-flex items-center gap-1 font-semibold underline-offset-2 hover:underline ${linkSize}`}
          style={{ color: BRAND }}
        >
          <Plus className={isCompact ? "h-3.5 w-3.5" : "h-4 w-4"} aria-hidden />
          Additional access notes (optional)
        </button>
      </div>
    );
  }

  return (
    <div
      className={isCompact ? "mt-3" : "mt-4"}
      data-testid={`access-notes-panel-${testIdSuffix}`}
    >
      <div className="flex items-center justify-between">
        <label
          htmlFor={`access-notes-${testIdSuffix}`}
          className={`font-semibold text-slate-900 ${linkSize}`}
        >
          Additional access notes
          <span className="ml-1 font-normal text-slate-500">(optional)</span>
        </label>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Hide access notes"
          data-testid={`button-close-access-notes-${testIdSuffix}`}
          className="rounded p-1 text-slate-500 hover:text-slate-900"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <textarea
        id={`access-notes-${testIdSuffix}`}
        data-testid={`textarea-access-notes-${testIdSuffix}`}
        value={value}
        onChange={(e) => bookingActions.setAccessNotes(e.target.value.slice(0, MAX_LENGTH))}
        rows={isCompact ? 3 : 4}
        placeholder="Anything the technician should know — gate code, parking spot, where to find the key, pets, etc."
        className={`mt-1.5 w-full resize-none rounded-lg border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-100 ${textareaPadding}`}
      />
      <div
        className={`mt-1 text-right text-slate-400 ${counterSize}`}
        data-testid={`access-notes-counter-${testIdSuffix}`}
      >
        {value.length}/{MAX_LENGTH}
      </div>
    </div>
  );
}
