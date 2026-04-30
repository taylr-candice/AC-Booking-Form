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
 *   - Optional `variant` prop — "success" (default, brand pink) or
 *     "info" (amber tint with an Info icon) for non-blocking hints.
 *     Both share layout, auto-dismiss, and dismiss controls.
 */

import { useEffect } from "react";
import { CheckCircle2, Info, Undo2, X } from "lucide-react";

import { BRAND_DEEP, BRAND_SOFT } from "./theme";

export type ToastVariant = "success" | "info";

export function Toast({
  id,
  message,
  onDismiss,
  onUndo,
  variant = "success",
  durationMs = 4000,
}: {
  /** Stable per-toast id so the auto-dismiss timer resets on a new toast. */
  id: string;
  message: string;
  onDismiss: () => void;
  /** Optional one-click undo. When provided, an "Undo" pill is rendered. */
  onUndo?: () => void;
  /** Visual treatment + leading icon. Defaults to "success". */
  variant?: ToastVariant;
  durationMs?: number;
}) {
  useEffect(() => {
    const t = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(t);
  }, [id, durationMs, onDismiss]);

  const isInfo = variant === "info";
  const containerClass = isInfo
    ? "fixed bottom-6 right-6 z-50 flex cursor-pointer items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-lg"
    : "fixed bottom-6 right-6 z-50 flex cursor-pointer items-center gap-3 rounded-xl border border-pink-200 bg-white px-4 py-3 shadow-lg";
  const messageClass = isInfo
    ? "text-[13px] font-medium text-amber-900"
    : "text-[13px] font-medium text-slate-800";
  const dismissClass = isInfo
    ? "text-amber-500 hover:text-amber-800"
    : "text-slate-400 hover:text-slate-700";

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid={isInfo ? "toast-info" : "toast-success"}
      data-variant={variant}
      onClick={onDismiss}
      className={containerClass}
    >
      {isInfo ? (
        <Info className="h-4 w-4 shrink-0 text-amber-600" />
      ) : (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-[#ED017F]" />
      )}
      <span className={messageClass}>{message}</span>
      {onUndo && (
        <button
          type="button"
          data-testid="button-toast-undo"
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
        className={dismissClass}
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
