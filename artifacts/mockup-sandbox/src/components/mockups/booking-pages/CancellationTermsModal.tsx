import { X } from "lucide-react";
import {
  CANCELLATION_CONTACT_EMAIL,
  CANCELLATION_POLICY_PARAGRAPHS,
} from "../../../state/bookingHelpers";
import { useModalA11y } from "../../../hooks/use-modal-a11y";

const BRAND = "#ED017F";

/**
 * "View terms" modal shown from the Schedule step's cancellation ack.
 * Mirrors the visual pattern of `AcTermsModal`.
 */
export function CancellationTermsModal({ onClose }: { onClose: () => void }) {
  const containerRef = useModalA11y<HTMLDivElement>({ onClose });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      data-testid="modal-cancellation-terms"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        tabIndex={-1}
        className="absolute inset-0 bg-slate-900/55 backdrop-blur-sm"
        data-testid="modal-cancellation-terms-backdrop"
      />
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancellation-terms-title"
        className="relative z-10 flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 pt-4 pb-3">
          <h2
            id="cancellation-terms-title"
            className="text-base font-semibold text-slate-900"
          >
            Cancellation &amp; rescheduling terms
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            data-testid="button-cancellation-terms-close"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pt-4 pb-5">
          <div
            className="space-y-3 text-[13px] text-slate-700 leading-relaxed"
            data-testid="cancellation-terms-paragraphs"
          >
            {CANCELLATION_POLICY_PARAGRAPHS.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>

          <section className="mt-5">
            <h3 className="text-[13px] font-semibold text-slate-900">
              Who the fee applies to
            </h3>
            <p
              className="mt-2 text-[13px] text-slate-700 leading-relaxed"
              data-testid="cancellation-terms-liability"
            >
              Cancellation fees apply to the unit owner or leaseholder,
              regardless of who books or attends the service. If you're
              booking on someone else's behalf, please make sure they're
              aware of these terms before you confirm the booking.
            </p>
          </section>

          <section className="mt-5">
            <h3 className="text-[13px] font-semibold text-slate-900">
              How to request a change
            </h3>
            <p
              className="mt-2 text-[13px] text-slate-700 leading-relaxed"
              data-testid="cancellation-terms-contact"
            >
              To request a cancellation or reschedule, email us at{" "}
              <a
                href={`mailto:${CANCELLATION_CONTACT_EMAIL}`}
                className="font-medium underline underline-offset-2"
                style={{ color: "#A30058" }}
              >
                {CANCELLATION_CONTACT_EMAIL}
              </a>
              .
            </p>
          </section>

          <button
            type="button"
            onClick={onClose}
            data-testid="button-cancellation-terms-close-footer"
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
