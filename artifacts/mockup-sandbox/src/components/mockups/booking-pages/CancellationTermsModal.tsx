import { X } from "lucide-react";
import { CANCELLATION_CONTACT_EMAIL } from "../../../state/bookingHelpers";
import { useModalA11y } from "../../../hooks/use-modal-a11y";

const BRAND = "#ED017F";

/**
 * Which variant of the cancellation terms to display.
 *
 * "pre_order"  — State A: user is selecting a service window before payment.
 *                Neutral general expectations; no assumption about who the
 *                user is (owner / tenant / agent).
 *
 * "post_order" — State B: service already paid; user arriving via a
 *                third-party coordination link (e.g. tenant or agent
 *                arranging access). Emphasises access accountability and
 *                that the fee falls on the owner.
 *
 * "payment"    — User is proceeding to payment. Targets the payer directly
 *                with clear financial consequences.
 */
export type CancellationTermsMode = "pre_order" | "post_order" | "payment";

type Content = {
  title: string;
  paragraphs: string[];
  contactVerb: string;
};

const CONTENT: Record<CancellationTermsMode, Content> = {
  pre_order: {
    title: "Cancellation & rescheduling",
    paragraphs: [
      "You can reschedule or cancel your booking with at least 48 hours' notice before your selected service window.",
      "Changes made within 48 hours of the scheduled service may incur a $125 cancellation fee per unit. This fee covers the technician's allocated time.",
      "Please ensure access to the property and the air conditioning system is available at the scheduled time. If access is not possible, the service may not be completed and a cancellation fee may still apply.",
    ],
    contactVerb: "To request a cancellation or reschedule, email us at",
  },
  post_order: {
    title: "Important: access & cancellation",
    paragraphs: [
      "This service has already been arranged and paid for by the property owner.",
      "Please ensure access to the property and the air conditioning system is available at the scheduled time.",
      "If the booking is cancelled or rescheduled within 48 hours of the service window, a $125 cancellation fee will apply to the owner to cover the technician's allocated time.",
      "If access is not available on the day, the service may not be completed and the cancellation fee may still apply.",
      "If you need to make a change, please do so as early as possible.",
    ],
    contactVerb: "To request a change, email us at",
  },
  payment: {
    title: "Cancellation terms",
    paragraphs: [
      "You can reschedule or cancel your booking with at least 48 hours' notice before your selected service window.",
      "Changes made within 48 hours will incur a $125 cancellation fee per unit. This fee will be deducted from any refund issued.",
      "If access to the property or the air conditioning system is not available at the scheduled time, the service may not be completed and the cancellation fee may still apply.",
    ],
    contactVerb: "To request a cancellation or reschedule, email us at",
  },
};

/**
 * "View terms" modal shown from the Schedule step and the Pay step.
 *
 * Pass `mode` to select which content variant renders — see
 * `CancellationTermsMode` above for the exact conditions.
 *
 * Defaults to `"pre_order"` so existing call-sites that omit the prop
 * keep their current behaviour without any changes.
 */
export function CancellationTermsModal({
  onClose,
  mode = "pre_order",
}: {
  onClose: () => void;
  mode?: CancellationTermsMode;
}) {
  const containerRef = useModalA11y<HTMLDivElement>({ onClose });
  const { title, paragraphs, contactVerb } = CONTENT[mode];

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
            {title}
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
            {paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>

          <section className="mt-5">
            <h3 className="text-[13px] font-semibold text-slate-900">
              How to request a change
            </h3>
            <p
              className="mt-2 text-[13px] text-slate-700 leading-relaxed"
              data-testid="cancellation-terms-contact"
            >
              {contactVerb}{" "}
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
