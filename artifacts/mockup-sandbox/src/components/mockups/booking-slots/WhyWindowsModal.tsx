import { X } from "lucide-react";
import { useModalA11y } from "../../../hooks/use-modal-a11y";

const BRAND = "#ED017F";

/**
 * Pop-up explaining why exact appointment times aren't available —
 * triggered by the "Why can't I book a specific date/time?" link in
 * `SlotsAccessBanner` (WINDOW_REQUIRED mode only).
 *
 * Follows the same pattern as `CancellationTermsModal`:
 *  - backdrop + centred card
 *  - header with title + close ×
 *  - scrollable body
 *  - "Got it" close button at the foot
 */
export function WhyWindowsModal({ onClose }: { onClose: () => void }) {
  const containerRef = useModalA11y<HTMLDivElement>({ onClose });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      data-testid="modal-why-windows"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        tabIndex={-1}
        className="absolute inset-0 bg-slate-900/55 backdrop-blur-sm"
        data-testid="modal-why-windows-backdrop"
      />
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="why-windows-title"
        className="relative z-10 flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 pt-4 pb-3">
          <h2
            id="why-windows-title"
            className="text-base font-semibold text-slate-900"
          >
            Why can't I book a specific date/time?
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            data-testid="button-why-windows-close"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pt-4 pb-5">
          <div
            className="space-y-3 text-[13px] text-slate-700 leading-relaxed"
            data-testid="why-windows-paragraphs"
          >
            <p>
              This service is delivered as a building-wide rollout, with
              multiple apartments serviced on the same day. To coordinate the
              technician's run efficiently, bookings are scheduled within set
              windows rather than exact appointment times.
            </p>
            <p>
              The service itself typically takes around 45–60 minutes per unit
              (depending on the system type and any extras). However, because
              the technician may need to work across several apartments, the
              window is the only arrival time we can guarantee.
            </p>
            <p>
              If being available for the full window doesn't suit you, you can
              switch to a flexible access option — such as leaving a key or
              using a trade key arrangement — so the technician can access
              without you needing to be home.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            data-testid="button-why-windows-close-footer"
            className="mt-6 w-full rounded-full px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
            style={{ backgroundColor: BRAND }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
