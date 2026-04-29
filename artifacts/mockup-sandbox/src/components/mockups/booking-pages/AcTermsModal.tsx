import { useEffect } from "react";
import { X } from "lucide-react";
import type { AcType } from "../../../state/bookingHelpers";

const BRAND = "#ED017F";

/**
 * Type-aware "View terms" modal shown from the AC step's
 * acknowledgement checkbox in `overridden` and `no-record` mode.
 *
 * Combines two clauses:
 *  1. Price-adjustment clause — mirrors the existing checkbox label,
 *     spelled out in detail (more on the day → invoice the unpaid
 *     difference; fewer on the day → credit or refund the difference).
 *  2. Subsequent-visit / rebook clause — new in Task #50: if what's
 *     on-site genuinely doesn't match what was booked (e.g. the
 *     technician finds extra systems that need separate scheduling
 *     to fit the day's window) we may need to rebook a follow-up
 *     visit to complete the work.
 */
export function AcTermsModal({
  acType,
  onClose,
}: {
  acType: AcType;
  onClose: () => void;
}) {
  const noun = acType === "ducted" ? "return-air grilles" : "indoor units";

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ac-terms-title"
      data-testid="modal-ac-terms"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/55 backdrop-blur-sm"
        data-testid="modal-terms-backdrop"
      />
      <div
        className="relative z-10 flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 pt-4 pb-3">
          <h2 id="ac-terms-title" className="text-base font-semibold text-slate-900">
            What happens if the on-site setup is different
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            data-testid="button-terms-close"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pt-4 pb-5">
          <p className="text-[13px] text-slate-700 leading-relaxed">
            These terms apply only when the booking selection doesn't match
            what's actually on-site. Taylr will not perform any work beyond the
            preventative maintenance service shown above.
          </p>

          <section className="mt-5">
            <h3 className="text-[13px] font-semibold text-slate-900">
              Price may be adjusted
            </h3>
            <ul
              className="mt-2 list-disc space-y-1.5 pl-5 text-[13px] text-slate-700 leading-relaxed"
              data-testid="terms-price-bullets"
            >
              <li>
                If there are more systems or {noun} on the day, Taylr will
                service all of them and invoice the unpaid difference
                afterward.
              </li>
              <li>
                If there are fewer, Taylr will credit or refund the difference.
              </li>
            </ul>
          </section>

          <section className="mt-5">
            <h3 className="text-[13px] font-semibold text-slate-900">
              A follow-up visit may be required
            </h3>
            <p
              className="mt-2 text-[13px] text-slate-700 leading-relaxed"
              data-testid="terms-rebook-clause"
            >
              The number of systems and {noun} you book here sets how long the
              technician will need at your unit. If what's on-site is materially
              different from what was booked (for example, more systems than the
              day's window can fit), the technician may not be able to finish
              the service in one visit and a subsequent visit or rebook may be
              required to complete the work.
            </p>
          </section>

          <button
            type="button"
            onClick={onClose}
            data-testid="button-terms-close-footer"
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
