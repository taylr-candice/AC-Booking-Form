/**
 * Per-row 7-day usage trend sparkline shown next to the
 * {@link LatestTouchBadge} on the Call / Email templates panels
 * (Task #171).
 *
 * The "Used in N bookings" badge (Task #160) only shows the
 * point-in-time count — admins also want to know whether a
 * template's usage is climbing or steady so they can spot an
 * over-used template before it goes off the rails. This component
 * surfaces the rolling trend without claiming the screen real
 * estate of a full analytics view: a tiny inline bar chart of the
 * last N days plus a "+N this week" delta, each bar carrying the
 * day's count in its `title` so a hover reveals the underlying
 * numbers per day.
 *
 * Snapshot-on-use lineage: the trend buckets are computed from the
 * literal `templateLabel` snapshot stamped on each timeline entry
 * (see {@link getTemplateUsageTrend}). A template rename does NOT
 * retroactively reattribute its historical bars — same rule the
 * popover (Task #149) and the "Used in N bookings" badge follow.
 */

import type { TemplateUsageTrendPoint } from "@/state/adminMockData";

import { BRAND, BRAND_DEEP } from "./theme";

export type TemplateUsageSparklineProps = {
  kind: "call" | "email";
  templateId: string;
  /** Per-day usage buckets, oldest first → most recent last. The
   *  caller is expected to pass a fixed-length array (typically 7
   *  days) — see {@link getTemplateUsageTrend}. */
  trend: ReadonlyArray<TemplateUsageTrendPoint>;
};

const SVG_WIDTH = 60;
const SVG_HEIGHT = 16;
const BAR_GAP = 1;

/** Format a YYYY-MM-DD day key into the "Apr 30" short label that
 *  matches the rest of the admin app's date copy. UTC-based parse so
 *  the bucket label and the bucket key stay aligned regardless of
 *  the renderer's local timezone. */
function shortDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Build the ready-to-render `title` tooltip — one `Day · count` line
 *  per bucket, oldest first. Exported so the test can pin the exact
 *  copy without reaching into the SVG. */
export function buildSparklineTooltip(
  trend: ReadonlyArray<TemplateUsageTrendPoint>,
): string {
  if (trend.length === 0) return "No usage data";
  return trend
    .map((p) => `${shortDay(p.date)} · ${p.count}`)
    .join("\n");
}

export function TemplateUsageSparkline({
  kind,
  templateId,
  trend,
}: TemplateUsageSparklineProps) {
  const total = trend.reduce((sum, p) => sum + p.count, 0);
  const max = trend.reduce((m, p) => (p.count > m ? p.count : m), 0);
  const tooltip = buildSparklineTooltip(trend);

  if (trend.length === 0 || total === 0) {
    return (
      <div
        data-testid={`${kind}-template-usage-sparkline-${templateId}`}
        data-total={total}
        data-trend-days={trend.length}
        title={tooltip}
        className="mt-1 inline-flex items-center gap-1.5 text-[11px] text-slate-400"
        aria-label={`No ${kind} template usage in the last ${trend.length} days`}
      >
        <span aria-hidden="true" className="font-mono text-[10px]">
          ▁▁▁▁▁▁▁
        </span>
        <span>Steady · no usage in the last {trend.length} days</span>
      </div>
    );
  }

  const barCount = trend.length;
  const barWidth = Math.max(
    1,
    (SVG_WIDTH - BAR_GAP * (barCount - 1)) / barCount,
  );

  return (
    <div
      data-testid={`${kind}-template-usage-sparkline-${templateId}`}
      data-total={total}
      data-trend-days={barCount}
      title={tooltip}
      className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-medium"
      style={{ color: BRAND_DEEP }}
      aria-label={`Used ${total} ${total === 1 ? "time" : "times"} across the last ${barCount} days`}
    >
      <svg
        width={SVG_WIDTH}
        height={SVG_HEIGHT}
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        role="img"
        aria-hidden="true"
        className="overflow-visible"
      >
        {trend.map((p, i) => {
          // 1px floor for non-zero days so a single use still draws a
          // visible tick instead of vanishing to a 0-height bar.
          const ratio = max === 0 ? 0 : p.count / max;
          const h = p.count === 0 ? 0 : Math.max(1, ratio * SVG_HEIGHT);
          const x = i * (barWidth + BAR_GAP);
          const y = SVG_HEIGHT - h;
          return (
            <rect
              key={p.date}
              data-testid={`${kind}-template-usage-sparkline-bar-${templateId}-${p.date}`}
              data-count={p.count}
              x={x}
              y={y}
              width={barWidth}
              height={h}
              fill={p.count === 0 ? "#E2E8F0" : BRAND}
              rx={0.5}
            >
              <title>{`${shortDay(p.date)} · ${p.count}`}</title>
            </rect>
          );
        })}
      </svg>
      <span data-testid={`${kind}-template-usage-sparkline-delta-${templateId}`}>
        {`+${total} this week`}
      </span>
    </div>
  );
}
