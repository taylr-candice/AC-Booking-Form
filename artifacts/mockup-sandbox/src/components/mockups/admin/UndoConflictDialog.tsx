/**
 * Pivot dialog shown when "Undo cancellation" detects the original
 * slot has been given away. Tells the admin who's holding the slot
 * now (so they have a defensible answer if the customer calls in)
 * and lets them open the reschedule picker to put the booking back
 * on the calendar somewhere else.
 *
 * Extracted from `BookingDetail` so the inline-undo affordance on
 * the bookings/payments list (`BookingsView`) can share the exact
 * same pivot UX without duplicating markup.
 */

import { TriangleAlert } from "lucide-react";
import { useEffect } from "react";

import type { AdminBooking } from "@/state/adminMockData";

import { BRAND, BRAND_DEEP, BRAND_SOFT } from "./theme";

/**
 * Shape the "slot taken" branch of the undo result hands the dialog.
 * Intentionally minimal — only the fields the dialog renders.
 */
export type UndoConflictTakenBy = {
  name: string;
  role: AdminBooking["bookerRole"];
  /** May be `null` when the winning booking is itself an
   *  awaiting-coordination row that doesn't yet have a concrete
   *  date — the dialog handles the missing-slot copy. */
  date: AdminBooking["serviceDate"];
  slot: AdminBooking["serviceSlot"];
};

export function UndoConflictDialog({
  takenBy,
  onOpenReschedule,
  onDismiss,
}: {
  takenBy: UndoConflictTakenBy;
  onOpenReschedule: () => void;
  onDismiss: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onDismiss();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  // Coordination bookings can win the slot too, in which case they
  // don't have a real date / window — fall back to a softer phrase
  // so the admin still gets the actionable info.
  const slotLabel =
    takenBy.slot === "morning" || takenBy.slot === "afternoon"
      ? `${takenBy.date} · ${takenBy.slot}`
      : "an awaiting-coordination booking";
  const roleLabel = takenBy.role === "agent" ? "agent" : "owner";

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 p-6"
      data-testid="modal-undo-conflict"
      role="dialog"
      aria-modal="true"
      aria-labelledby="undo-conflict-title"
    >
      <div className="flex w-full max-w-md flex-col rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-start gap-2.5">
            <div
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
              style={{ backgroundColor: BRAND_SOFT, color: BRAND_DEEP }}
            >
              <TriangleAlert className="h-4 w-4" />
            </div>
            <div>
              <div
                id="undo-conflict-title"
                className="text-[15px] font-semibold text-slate-900"
              >
                That slot was given away
              </div>
              <div className="mt-0.5 text-[12px] text-slate-500">
                Original slot is no longer available
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 px-5 py-4 text-[13px] leading-relaxed text-slate-600">
          <p>
            <span className="font-semibold text-slate-900">{takenBy.name}</span>{" "}
            ({roleLabel}) has booked{" "}
            <span className="font-semibold text-slate-900">{slotLabel}</span>{" "}
            on the unit while this booking sat cancelled, so the original
            slot can't be reclaimed.
          </p>
          <p>
            Open the reschedule picker to restore this booking on a different
            date or window — capacity will be consumed at the new slot only.
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <button
            type="button"
            onClick={onDismiss}
            data-testid="button-undo-conflict-dismiss"
            className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-slate-600 hover:bg-slate-100"
          >
            Leave cancelled
          </button>
          <button
            type="button"
            onClick={onOpenReschedule}
            data-testid="button-undo-conflict-open-reschedule"
            className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white transition hover:brightness-110"
            style={{ backgroundColor: BRAND }}
          >
            Open Reschedule
          </button>
        </div>
      </div>
    </div>
  );
}
