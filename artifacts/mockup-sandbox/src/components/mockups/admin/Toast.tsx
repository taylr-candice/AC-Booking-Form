/**
 * Lightweight bottom-right toast for the admin shell.
 *
 * Used today by AdminApp to confirm a successful
 * scheduleCoordinationBooking ("bk-1038 scheduled for 29 Apr ·
 * Morning"). Built as its own small component (rather than reusing
 * the shadcn Toaster, which isn't mounted in the mockup shell) to
 * match the inline pattern already in RolloutScheduleEditor and to
 * stay easy to extend later.
 *
 * Behaviour:
 *   - Fixed bottom-right, above everything (z-50).
 *   - Auto-dismisses after `durationMs` (default 4000ms).
 *   - Dismissible by clicking anywhere on the toast or the X.
 *   - Re-mounts the timer when `id` changes so back-to-back toasts
 *     each get a fresh 4s window.
 *   - Optional Undo button (Task #92) — when an `onUndo` callback is
 *     supplied an "Undo" pill appears between the message and the
 *     dismiss X, styled the same as the inline undo toast in
 *     RolloutScheduleEditor. Clicking it runs the callback and then
 *     dismisses the toast.
 */

import { useEffect } from "react";
import { CheckCircle2, Undo2, X } from "lucide-react";

import { BRAND_DEEP, BRAND_SOFT } from "./theme";

export function Toast({
  id,
  message,
  onDismiss,
  onUndo,
  durationMs = 4000,
}: {
  /** Stable per-toast id so the auto-dismiss timer resets on a new toast. */
  id: string;
  message: string;
  onDismiss: () => void;
  /** Optional one-click undo. When provided, an "Undo" pill is rendered. */
  onUndo?: () => void;
  durationMs?: number;
}) {
  useEffect(() => {
    const t = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(t);
  }, [id, durationMs, onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      onClick={onDismiss}
      className="fixed bottom-6 right-6 z-50 flex cursor-pointer items-center gap-3 rounded-xl border border-emerald-200 bg-white px-4 py-3 shadow-lg"
    >
      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
      <span className="text-[13px] font-medium text-slate-800">{message}</span>
      {onUndo && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onUndo();
            onDismiss();
          }}
          className="inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-[12px] font-semibold"
          style={{ backgroundColor: BRAND_SOFT, color: BRAND_DEEP }}
        >
          <Undo2 className="h-3 w-3" /> Undo
        </button>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
        className="text-slate-400 hover:text-slate-700"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
