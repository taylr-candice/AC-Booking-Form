import { useEffect } from "react";
import { CalendarCheck, X } from "lucide-react";

const BRAND = "#ED017F";
const SUPPORT_EMAIL = "support@taylr.com.au";

/**
 * Shown from the Step 1 unit picker when a customer selects a property
 * that already has a paid/confirmed service booked.
 *
 * Spec (Apr 2026): rather than disabling the row in the dropdown and
 * exposing the existing customer's name/date inline, every property is
 * presented as selectable; only when the customer commits to one that
 * is already booked do we surface this generic explainer. We never
 * reveal anything about the existing booking — no name, date, window
 * or contact details — only that there's an existing booking and where
 * to ask questions.
 */
export function UnitAlreadyBookedModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
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
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="unit-already-booked-title"
      data-testid="modal-unit-already-booked"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/55 backdrop-blur-sm"
        data-testid="modal-unit-already-booked-backdrop"
      />
      <div
        className="relative z-10 flex w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 pt-4 pb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
              style={{ backgroundColor: "rgba(237, 1, 127, 0.08)", color: BRAND }}
              aria-hidden="true"
            >
              <CalendarCheck className="h-4 w-4" />
            </span>
            <h2
              id="unit-already-booked-title"
              className="text-base font-semibold text-slate-900"
            >
              This property is already booked
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            data-testid="button-unit-already-booked-close"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 pt-4 pb-5">
          <p
            className="text-[13px] text-slate-700 leading-relaxed"
            data-testid="text-unit-already-booked-body"
          >
            There's already a service booked at this property, so it can't
            be booked again right now. If you have any questions or believe
            this is a mistake, please contact Taylr at{" "}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="font-medium underline"
              style={{ color: BRAND }}
              data-testid="link-unit-already-booked-support-email"
            >
              {SUPPORT_EMAIL}
            </a>
            .
          </p>

          <button
            type="button"
            onClick={onClose}
            data-testid="button-unit-already-booked-confirm"
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
