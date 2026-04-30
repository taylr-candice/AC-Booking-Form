import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

import type {
  TemplateUsageBooking,
  TemplateUsageTrendPoint,
} from "@/state/adminMockData";

import { BRAND, BRAND_DEEP } from "./theme";

export type TemplateUsageSparklineProps = {
  kind: "call" | "email";
  templateId: string;
  trend: ReadonlyArray<TemplateUsageTrendPoint>;
  templateName?: string;
  bookingsByDay?: Readonly<Record<string, ReadonlyArray<TemplateUsageBooking>>>;
  onOpenBooking?: (bookingId: string) => void;
};

const SVG_WIDTH = 60;
const SVG_HEIGHT = 16;
const BAR_GAP = 1;
const POPOVER_WIDTH = 320;

function shortDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

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
  templateName,
  bookingsByDay,
  onOpenBooking,
}: TemplateUsageSparklineProps) {
  const total = trend.reduce((sum, p) => sum + p.count, 0);
  const max = trend.reduce((m, p) => (p.count > m ? p.count : m), 0);
  const tooltip = buildSparklineTooltip(trend);

  const [openDay, setOpenDay] = useState<string | null>(null);
  const barRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null,
  );

  useLayoutEffect(() => {
    if (!openDay) return;
    function reposition() {
      const btn = barRefs.current.get(openDay!);
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const viewportWidth =
        typeof window === "undefined" ? POPOVER_WIDTH : window.innerWidth;
      const left = Math.max(
        8,
        Math.min(rect.left, viewportWidth - POPOVER_WIDTH - 8),
      );
      setCoords({ top: rect.bottom + 4, left });
    }
    reposition();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [openDay]);

  useEffect(() => {
    if (!openDay) return;
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      const btn = barRefs.current.get(openDay!);
      if (btn && btn.contains(target)) return;
      if (popoverRef.current && popoverRef.current.contains(target)) return;
      setOpenDay(null);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenDay(null);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openDay]);

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
  const channelLabel = kind === "call" ? "Call" : "Email";
  const dayBookings =
    openDay && bookingsByDay ? bookingsByDay[openDay] ?? [] : [];

  return (
    <div
      data-testid={`${kind}-template-usage-sparkline-${templateId}`}
      data-total={total}
      data-trend-days={barCount}
      className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-medium"
      style={{ color: BRAND_DEEP }}
      aria-label={`Used ${total} ${total === 1 ? "time" : "times"} across the last ${barCount} days`}
    >
      <div
        className="inline-flex items-end"
        style={{ height: SVG_HEIGHT, gap: `${BAR_GAP}px` }}
      >
        {trend.map((p) => {
          const ratio = max === 0 ? 0 : p.count / max;
          const h = p.count === 0 ? 0 : Math.max(1, ratio * SVG_HEIGHT);
          const dayLabel = shortDay(p.date);
          const tipLine = `${dayLabel} · ${p.count}`;
          const dayList = bookingsByDay?.[p.date] ?? [];
          const interactive =
            p.count > 0 &&
            !!bookingsByDay &&
            !!onOpenBooking &&
            dayList.length > 0;

          if (interactive) {
            const isOpen = openDay === p.date;
            const bookingWord = dayList.length === 1 ? "booking" : "bookings";
            const buttonStyle: CSSProperties & Record<string, string> = {
              width: `${barWidth}px`,
              height: `${SVG_HEIGHT}px`,
              "--tw-ring-color": BRAND,
            };
            return (
              <button
                key={p.date}
                type="button"
                ref={(el) => {
                  barRefs.current.set(p.date, el);
                }}
                onClick={() =>
                  setOpenDay((current) => (current === p.date ? null : p.date))
                }
                data-testid={`${kind}-template-usage-sparkline-bar-${templateId}-${p.date}`}
                data-count={p.count}
                data-interactive="true"
                data-day={p.date}
                aria-haspopup="dialog"
                aria-expanded={isOpen}
                aria-label={`${tipLine} · open ${dayList.length} ${bookingWord}`}
                title={tipLine}
                className="inline-flex items-end justify-center p-0 align-bottom border-0 bg-transparent cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
                style={buttonStyle}
              >
                <span
                  aria-hidden="true"
                  style={{
                    display: "inline-block",
                    width: "100%",
                    height: `${h}px`,
                    backgroundColor: BRAND,
                    borderRadius: "0.5px",
                  }}
                />
              </button>
            );
          }

          const isZero = p.count === 0;
          return (
            <span
              key={p.date}
              data-testid={`${kind}-template-usage-sparkline-bar-${templateId}-${p.date}`}
              data-count={p.count}
              data-interactive="false"
              data-day={p.date}
              {...(isZero ? {} : { title: tipLine })}
              aria-hidden="true"
              className="inline-flex items-end justify-center"
              style={{
                width: `${barWidth}px`,
                height: `${SVG_HEIGHT}px`,
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  width: "100%",
                  height: `${h}px`,
                  backgroundColor: isZero ? "#E2E8F0" : BRAND,
                  borderRadius: "0.5px",
                }}
              />
            </span>
          );
        })}
      </div>
      <span
        data-testid={`${kind}-template-usage-sparkline-delta-${templateId}`}
        title={tooltip}
      >
        {`+${total} this week`}
      </span>
      {openDay &&
        coords &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popoverRef}
            data-testid={`${kind}-template-usage-sparkline-popover-${templateId}`}
            data-day={openDay}
            role="dialog"
            aria-label={`Bookings using ${channelLabel.toLowerCase()} template${templateName ? ` ${templateName}` : ""} on ${shortDay(openDay)}`}
            style={{
              position: "fixed",
              top: coords.top,
              left: coords.left,
              width: POPOVER_WIDTH,
            }}
            className="z-50 rounded-lg border border-slate-200 bg-white p-2 shadow-lg"
          >
            <div className="px-2 pb-2 pt-1 text-[10px] uppercase tracking-wider text-slate-500">
              {channelLabel} template · {shortDay(openDay)} ·{" "}
              {dayBookings.length} booking
              {dayBookings.length === 1 ? "" : "s"}
            </div>
            <ul className="flex max-h-72 flex-col overflow-y-auto">
              {dayBookings.map((b) => (
                <li key={b.bookingId}>
                  <button
                    type="button"
                    onClick={() => {
                      onOpenBooking?.(b.bookingId);
                      setOpenDay(null);
                    }}
                    data-testid={`${kind}-template-usage-sparkline-booking-${templateId}-${openDay}-${b.bookingId}`}
                    className="flex w-full flex-col gap-0.5 rounded-md px-2 py-2 text-left hover:bg-slate-50"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12px] font-semibold text-slate-900">
                        {b.customerName}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">
                        {b.bookingId}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-600">
                      {b.addressLine1}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {b.whenLabel}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>,
          document.body,
        )}
    </div>
  );
}
