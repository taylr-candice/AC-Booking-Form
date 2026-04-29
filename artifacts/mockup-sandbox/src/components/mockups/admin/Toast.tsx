/**
 * Lightweight bottom-right toast for the admin shell.
 *
 * Used today by AdminApp to confirm a successful
 * scheduleCoordinationBooking ("bk-1038 scheduled for 29 Apr ·
 * Morning"). Built as its own small component (rather than reusing
 * the shadcn Toaster, which isn't mounted in the mockup shell) to
 * match the inline pattern already in RolloutScheduleEditor and to
 * stay easy to extend later — e.g. an "Undo" affordance per the
 * Task #78 follow-up note.
 *
 * Behaviour:
 *   - Fixed bottom-right, above everything (z-50).
 *   - Auto-dismisses after `durationMs` (default 4000ms).
 *   - Dismissible by clicking anywhere on the toast or the X.
 *   - Re-mounts the timer when `id` changes so back-to-back toasts
 *     each get a fresh 4s window.
 */

import { useEffect } from "react";
import { CheckCircle2, X } from "lucide-react";

export function Toast({
  id,
  message,
  onDismiss,
  durationMs = 4000,
}: {
  /** Stable per-toast id so the auto-dismiss timer resets on a new toast. */
  id: string;
  message: string;
  onDismiss: () => void;
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
