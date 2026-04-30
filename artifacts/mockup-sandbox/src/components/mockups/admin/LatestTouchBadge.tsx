/**
 * Per-row "Used in N bookings" badge for the Call / Email templates
 * panels (Task #160).
 *
 * Surfaces the natural complement to the Tasks #149 + #155 popover:
 * the popover lists every booking whose timeline ever referenced the
 * template (history-wide, dedup-per-booking), this badge counts only
 * the bookings whose **latest** call / email touch is currently the
 * template — exactly the predicate {@link BookingsView}'s template
 * filter uses (Task #153). Clicking the badge drills through to the
 * filtered queue so an admin who notices an over-used template can
 * pivot straight into the rows it's currently in front of.
 *
 * The count and click-through stay in sync because they both use the
 * literal `templateLabel` snapshot string. Templates that are not
 * the freshest touch on any booking render a dim, non-interactive
 * placeholder so the row still acknowledges the metric exists.
 */

import { ListFilter } from "lucide-react";

import { BRAND, BRAND_DEEP } from "./theme";

export type LatestTouchBadgeProps = {
  kind: "call" | "email";
  templateId: string;
  templateName: string;
  count: number;
  /** Click-through handler. Optional so a templates view rendered
   *  outside the AdminApp shell (e.g. the popover-only test
   *  harness) can omit it without the badge throwing. */
  onOpenFilteredBookings?: (templateName: string) => void;
};

export function LatestTouchBadge({
  kind,
  templateId,
  templateName,
  count,
  onOpenFilteredBookings,
}: LatestTouchBadgeProps) {
  const bookingsWord = count === 1 ? "booking" : "bookings";
  const channelWord = kind === "call" ? "call" : "email";

  if (count === 0) {
    return (
      <div
        data-testid={`${kind}-template-latest-touch-${templateId}`}
        data-count="0"
        className="mt-1 inline-flex items-center gap-1 text-[11px] text-slate-400"
        title={`No bookings currently have this template as their latest ${channelWord} touch.`}
      >
        <ListFilter className="h-3 w-3" />
        <span>Not the latest touch on any booking</span>
      </div>
    );
  }

  const interactive = typeof onOpenFilteredBookings === "function";

  if (!interactive) {
    return (
      <div
        data-testid={`${kind}-template-latest-touch-${templateId}`}
        data-count={count}
        className="mt-1 inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600"
      >
        <ListFilter className="h-3 w-3" />
        <span>Used in {count} {bookingsWord} (latest {channelWord} touch)</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpenFilteredBookings(templateName)}
      data-testid={`${kind}-template-latest-touch-${templateId}`}
      data-count={count}
      data-template-name={templateName}
      title={`Open the bookings list filtered to rows whose latest ${channelWord} touch used "${templateName}"`}
      aria-label={`Open ${count} ${bookingsWord} where the latest ${channelWord} touch used "${templateName}"`}
      className="mt-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold transition-colors hover:bg-white"
      style={{
        color: BRAND_DEEP,
        borderColor: BRAND,
        backgroundColor: "rgba(255,255,255,0.8)",
      }}
    >
      <ListFilter className="h-3 w-3" />
      <span>Used in {count} {bookingsWord}</span>
    </button>
  );
}
