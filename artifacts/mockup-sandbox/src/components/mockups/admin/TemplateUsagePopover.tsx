/**
 * Drill-down popover for the "Referenced by N entries" line on Call /
 * Email template rows. Lists matching bookings (deduped per booking)
 * and lets ops jump straight to a booking's detail screen.
 *
 * Rendered via a portal with fixed positioning so the dropdown is not
 * clipped by the templates table's `overflow-hidden` card.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { TemplateUsageBooking } from "@/state/adminMockData";

export type TemplateUsagePopoverProps = {
  kind: "call" | "email";
  testIdSuffix: string;
  templateName: string;
  usage: number;
  bookings: ReadonlyArray<TemplateUsageBooking>;
  onOpenBooking?: (bookingId: string) => void;
};

const POPOVER_WIDTH = 320;

export function TemplateUsagePopover({
  kind,
  testIdSuffix,
  templateName,
  usage,
  bookings,
  onOpenBooking,
}: TemplateUsagePopoverProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null,
  );

  useLayoutEffect(() => {
    if (!open) return;
    function reposition() {
      const btn = buttonRef.current;
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
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (buttonRef.current && buttonRef.current.contains(target)) return;
      if (popoverRef.current && popoverRef.current.contains(target)) return;
      setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const channelLabel = kind === "call" ? "Call" : "Email";
  const usageLine =
    usage === 0
      ? "No timeline entries reference this template"
      : `Referenced by ${usage} timeline ${usage === 1 ? "entry" : "entries"}`;

  if (usage === 0) {
    return (
      <div
        data-testid={`${kind}-template-usage-${testIdSuffix}`}
        className="mt-0.5 text-[11px] text-slate-500"
      >
        {usageLine}
      </div>
    );
  }

  return (
    <div className="mt-0.5">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        data-testid={`${kind}-template-usage-${testIdSuffix}`}
        aria-expanded={open}
        className="text-left text-[11px] font-medium text-slate-500 underline decoration-dotted underline-offset-2 hover:text-slate-700"
      >
        {usageLine}
      </button>
      {open &&
        coords &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popoverRef}
            data-testid={`${kind}-template-usage-popover-${testIdSuffix}`}
            role="dialog"
            aria-label={`Bookings using ${channelLabel.toLowerCase()} template ${templateName}`}
            style={{
              position: "fixed",
              top: coords.top,
              left: coords.left,
              width: POPOVER_WIDTH,
            }}
            className="z-50 rounded-lg border border-slate-200 bg-white p-2 shadow-lg"
          >
            <div className="px-2 pb-2 pt-1 text-[10px] uppercase tracking-wider text-slate-500">
              {channelLabel} template · {bookings.length} booking
              {bookings.length === 1 ? "" : "s"}
            </div>
            <ul className="flex max-h-72 flex-col overflow-y-auto">
              {bookings.map((b) => (
                <li key={b.bookingId}>
                  <button
                    type="button"
                    onClick={() => {
                      onOpenBooking?.(b.bookingId);
                      setOpen(false);
                    }}
                    data-testid={`${kind}-template-usage-booking-${testIdSuffix}-${b.bookingId}`}
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
