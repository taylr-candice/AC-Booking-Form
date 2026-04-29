/**
 * Admin "Cancel booking" modal — Task #49.
 *
 * The note is mandatory: it's surfaced in the cancellation entry on
 * the booking's service timeline so the audit trail always answers
 * "why was this cancelled and by whom?" Cancel is disabled until the
 * note has at least one non-whitespace character.
 *
 * The modal stays presentation-only. The parent (BookingDetail) owns
 * confirm/dismiss handlers; the parent's `AdminApp` then mutates the
 * seeded bookings + frees the rollout slot capacity.
 */

import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";

import type { AdminBooking } from "@/state/adminMockData";
import { BRAND, BRAND_DEEP, BRAND_SOFT } from "./theme";

export function CancelBookingModal({
  booking,
  onConfirm,
  onDismiss,
}: {
  booking: AdminBooking;
  onConfirm: (note: string) => void;
  onDismiss: () => void;
}) {
  const [note, setNote] = useState("");
  const trimmed = note.trim();
  const canConfirm = trimmed.length > 0;
  const wasPaid = booking.paymentStatus === "paid";

  // Esc-to-close — basic keyboard accessibility so an admin who
  // opens this by accident can dismiss without reaching for the
  // mouse. Listener attaches at the document level since the modal
  // doesn't own the focused element on mount.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onDismiss();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 p-6"
      data-testid="modal-cancel-booking"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-booking-title"
    >
      <div className="flex w-full max-w-md flex-col rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-start gap-2.5">
            <div
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
              style={{ backgroundColor: BRAND_SOFT, color: BRAND_DEEP }}
            >
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div>
              <div
                id="cancel-booking-title"
                className="text-[15px] font-semibold text-slate-900"
              >
                Cancel booking
              </div>
              <div className="mt-0.5 text-[12px] text-slate-500">
                {booking.customerName} · {booking.id}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Close"
            className="grid h-7 w-7 place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-3 px-5 py-4">
          <p className="text-[13px] leading-relaxed text-slate-600">
            This frees the slot on the rollout and writes a cancellation
            entry on the booking's service timeline.
            {wasPaid && (
              <>
                {" "}
                The payment status will flip to{" "}
                <span className="font-semibold text-slate-900">
                  refund pending
                </span>
                .
              </>
            )}
          </p>

          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-slate-700">
              Reason <span style={{ color: BRAND }}>*</span>
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              autoFocus
              placeholder="e.g. Customer called to cancel — moving overseas next week."
              data-testid="textarea-cancel-note"
              className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-[13px] text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
            />
            <span className="text-[11px] text-slate-400">
              Required — saved with the cancellation in the timeline.
            </span>
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <button
            type="button"
            onClick={onDismiss}
            data-testid="button-cancel-dismiss"
            className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-slate-600 hover:bg-slate-100"
          >
            Keep booking
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={() => canConfirm && onConfirm(trimmed)}
            data-testid="button-cancel-confirm"
            className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50 hover:brightness-110"
            style={{ backgroundColor: BRAND }}
          >
            Cancel booking
          </button>
        </div>
      </div>
    </div>
  );
}
