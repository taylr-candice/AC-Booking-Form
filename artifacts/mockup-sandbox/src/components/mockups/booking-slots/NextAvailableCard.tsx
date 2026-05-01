import { ArrowRight, Moon, Sparkles, Sun, Sunrise } from "lucide-react";

import {
  windowDisplayLabel,
  type CustomerDay,
  type CustomerSlot,
} from "./customerSlotData";

const BRAND = "#ED017F";

/**
 * Lucide glyph used in the smart-suggestion card body — same mapping
 * the day-card sneak peek and the slot panel windows use, so the
 * customer sees the *same* morning/afternoon/evening icon end-to-end.
 */
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

/** Long weekday name derived from the day's ISO date — the rollout
 *  carries a short uppercase label ("FRI") which is the right thing
 *  for tight day cards but reads awkwardly in the suggestion card's
 *  sentence. We derive "Friday" locally so the suggestion reads as
 *  natural body copy without requiring a schema change. */
function longWeekday(isoDate: string): string {
  // ISO `YYYY-MM-DD` parses as UTC midnight which can land on the
  // previous day in negative-UTC zones. Splitting and constructing
  // a local Date pins the weekday to the calendar day the rollout
  // intended.
  const [y, m, d] = isoDate.split("-").map((s) => parseInt(s, 10));
  const local = new Date(y, (m ?? 1) - 1, d ?? 1);
  return local.toLocaleDateString("en-AU", { weekday: "long" });
}

/**
 * Smart "Next available" suggestion card.
 *
 * Sits at the top of the scheduler — *above* the day picker — and
 * gives the customer a one-tap shortcut to book the soonest available
 * window. The intent (per UX direction) is a small, friendly hint
 * card, not a loud hero banner: pink-50 background + pink-100 border
 * so it whispers rather than shouts, with the brand-pink "Book this
 * time" CTA carrying the action weight.
 *
 * Tapping the CTA does everything in one step:
 *   1. selects the day  (picker highlights it + reveals the window panel)
 *   2. selects the window slot  (window card lights up brand pink)
 *   3. acknowledges the cancellation terms  (so the docked Confirm
 *      becomes enabled and the customer can move forward without
 *      hunting for the checkbox)
 *
 * To keep the third step legally honest (we are not silently ticking
 * a consent box for the customer), the CTA carries explicit
 * click-wrap microcopy directly beneath it: "By tapping Book this
 * time you accept the cancellation terms · View terms". The View
 * terms link opens the same `CancellationTermsModal` the docked ack
 * row uses, so the customer can review the same words before they
 * tap. This mirrors the Stripe/Uber/Klarna pattern where the consent
 * is bound to the action button rather than to a separate hidden
 * checkbox.
 *
 * Returns `null` when there is no available window — the suggestion
 * card simply hides itself and the customer falls back to the (also
 * empty) day picker / no-rollout banner upstream.
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
  /** Called with the picked day's ISO + the slot id. The host wires
   *  this to setSelectedDate + setSelectedSlotId + ack-terms so the
   *  one-tap promise holds end-to-end — see `pickSlotOneTap` in each
   *  picker. */
  onPick: (iso: string, slotId: string) => void;
  /** Opens the cancellation-terms modal so the customer can read
   *  what the click-wrap line below the CTA references. */
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
        {/* Sparkles glyph leads the eye to the suggestion — small,
            brand-pink, no chunky tinted disc. */}
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

      {/* Click-wrap consent line — sits beneath the CTA so the user
          sees the consent they're giving by tapping. The "View terms"
          link opens the same modal the docked ack row uses, so the
          customer can read the policy before tapping. */}
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
