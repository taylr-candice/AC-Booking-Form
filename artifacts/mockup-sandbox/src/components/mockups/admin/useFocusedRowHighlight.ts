/**
 * Shared source-row highlight machinery for the admin list views
 * (BookingsView, AwaitingCoordinationView, RolloutsView, and any
 * future list view that wants the same "land on a clearly marked
 * source row after a pivot" behaviour).
 *
 * Consolidates the byte-identical state machine that was previously
 * copy-pasted into each consumer view: a one-shot `initialFocusedRowId`
 * seed (re-applied via an effect when the parent hands us a fresh
 * non-null value mid-life), a row-ref map, a scroll-into-view effect,
 * a 1100ms pulse-clear timer, and a global mousedown / scroll / keydown
 * dismiss listener. Pulling it here means a future tweak — respecting
 * `prefers-reduced-motion` from JS, lengthening the pulse, swapping
 * the dismiss trigger, etc. — happens in one place instead of three+.
 *
 * The persistent BRAND_SOFT background tint and the
 * `template-row-focus-pulse` class are owned by the consumer view's
 * row markup (so each view can compose them with its own existing
 * className / style logic), but the hook tells the caller WHEN to
 * apply them via the props returned from {@link UseFocusedRowHighlightResult.focusedRowProps}.
 */

import { useEffect, useRef, useState, type CSSProperties } from "react";

import { BRAND_SOFT } from "./theme";

export type FocusedRowProps<T extends HTMLElement> = {
  /** Ref callback the consumer must spread onto the row element so
   *  the scroll-into-view effect can find it by id. Safe to call
   *  with `null` on unmount — the hook removes the entry. */
  ref: (el: T | null) => void;
  /** Marks the row that received the seed. Only set on the focused
   *  row; `undefined` everywhere else so the attribute is absent
   *  rather than `data-focused="false"`. */
  "data-focused": "true" | undefined;
  /** Companion to {@link FocusedRowProps."data-focused"} — set only
   *  while the one-shot `template-row-focus-pulse` class is also
   *  applied, dropped after ~1100ms when the keyframe has played. */
  "data-pulsing": "true" | undefined;
  /** Either `" template-row-focus-pulse"` (with a leading space so
   *  it concatenates cleanly into an existing className template
   *  literal) or `""`. Keeps the consumer's row className expression
   *  identical to the pre-extraction shape. */
  pulseClassName: string;
  /** `{ backgroundColor: BRAND_SOFT }` when the row is the focused
   *  one, `undefined` otherwise. Consumers either pass it straight
   *  to `style` (when no other inline styles apply) or merge it with
   *  their existing style object. */
  style: CSSProperties | undefined;
};

export type UseFocusedRowHighlightResult<T extends HTMLElement> = {
  focusedRowProps: (id: string) => FocusedRowProps<T>;
};

/**
 * One hook per list view. Pass the one-shot `initialFocusedRowId`
 * the parent hands down, and the matching `onFocusedRowConsumed`
 * callback so the parent can clear its seed slot the moment we've
 * absorbed it. Optional both — omitting them is equivalent to "no
 * row is ever pre-focused", which keeps consumers that don't yet
 * wire a pivot source compiling.
 *
 * The generic `T` parameter pins the row element type so the ref
 * callback narrows correctly at the call site (e.g.
 * `HTMLTableRowElement` for the bookings tables, `HTMLButtonElement`
 * for the rollouts list rows).
 */
export function useFocusedRowHighlight<T extends HTMLElement = HTMLElement>(
  opts: {
    initialFocusedRowId?: string | null;
    onFocusedRowConsumed?: () => void;
  } = {},
): UseFocusedRowHighlightResult<T> {
  const { initialFocusedRowId, onFocusedRowConsumed } = opts;
  // Seeded from `initialFocusedRowId` so first paint already carries
  // the highlight; re-seeded via the effect below if a fresh
  // non-null value lands mid-life. Dismissed on first interaction
  // (scroll / click / keydown) so it doesn't linger.
  const [focusedRowId, setFocusedRowId] = useState<string | null>(
    initialFocusedRowId ?? null,
  );
  const [pulseRowId, setPulseRowId] = useState<string | null>(null);
  const rowRefs = useRef<Map<string, T | null>>(new Map());

  // Re-apply when the parent hands us a fresh non-null seed mid-life
  // (admin pivots, dismisses, navigates away, pivots again into the
  // same component instance). Notify the parent so it can clear its
  // slot — otherwise unrelated re-renders would re-apply the
  // highlight after dismissal.
  useEffect(() => {
    if (initialFocusedRowId) {
      setFocusedRowId(initialFocusedRowId);
      setPulseRowId(initialFocusedRowId);
      onFocusedRowConsumed?.();
    }
    // Depend on seed value only, not callback identity — re-running
    // on consume-callback re-creation would defeat the one-shot
    // handoff invariant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFocusedRowId]);

  // Scroll the focused row into view on a fresh seed. Guarded on
  // `scrollIntoView` existing because happy-dom / jsdom don't
  // implement it, and the consumer tests render against those.
  useEffect(() => {
    if (!focusedRowId) return;
    const row = rowRefs.current.get(focusedRowId);
    if (row && typeof row.scrollIntoView === "function") {
      row.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [focusedRowId]);

  // Drop the pulse marker after the keyframe plays (1100ms = 1s
  // animation + small buffer so the class survives the final frame).
  useEffect(() => {
    if (!pulseRowId) return;
    const t = setTimeout(() => setPulseRowId(null), 1100);
    return () => clearTimeout(t);
  }, [pulseRowId]);

  // Dismiss on first interaction. Listeners are scoped to the
  // focus-id lifecycle so the originating click can't dismiss
  // mid-flight, and a subsequent pivot re-arms a fresh dismissal.
  // Filter changes flow through clicks / keystrokes / selects that
  // already fire these events, so the global listener catches them
  // without us enumerating every filter knob.
  useEffect(() => {
    if (!focusedRowId) return;
    function dismiss() {
      setFocusedRowId(null);
    }
    window.addEventListener("scroll", dismiss, {
      passive: true,
      capture: true,
    });
    window.addEventListener("mousedown", dismiss, true);
    window.addEventListener("keydown", dismiss, true);
    return () => {
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("mousedown", dismiss, true);
      window.removeEventListener("keydown", dismiss, true);
    };
  }, [focusedRowId]);

  function focusedRowProps(id: string): FocusedRowProps<T> {
    const isFocused = focusedRowId === id;
    const isPulsing = pulseRowId === id;
    return {
      ref: (el: T | null) => {
        rowRefs.current.set(id, el);
      },
      "data-focused": isFocused ? "true" : undefined,
      "data-pulsing": isPulsing ? "true" : undefined,
      pulseClassName: isPulsing ? " template-row-focus-pulse" : "",
      style: isFocused ? { backgroundColor: BRAND_SOFT } : undefined,
    };
  }

  return { focusedRowProps };
}
