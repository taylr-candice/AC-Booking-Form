/**
 * Shared source-row highlight machinery for the admin list views
 * (BookingsView, AwaitingCoordinationView, RolloutsView, BuildingsView)
 * AND the templates panels (CallTemplatesView, EmailTemplatesView)
 * — every "land on a clearly marked source row after a pivot" surface
 * in the admin shell resolves through this single hook so a future
 * tweak (palette, animation, a11y) can't drift between consumers.
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
 * Two dismissal strategies are supported via {@link UseFocusedRowHighlightOptions.dismissal}:
 *
 *   - `"interaction"` (default): the seed is one-shot — focus is
 *     dismissed by the next global mousedown / keydown / scroll, and
 *     the parent is notified via `onFocusedRowConsumed` so it can
 *     clear its seed slot. Used by every list view.
 *
 *   - `"controlled"`: the focused-row id mirrors the prop directly,
 *     no global dismiss listeners are installed, and
 *     `onFocusedRowConsumed` is never fired — the parent owns the
 *     full lifecycle (e.g. the templates panels keep the highlight
 *     until the AdminApp shell clears `focusedTemplateId` on the
 *     next sidebar nav). The pulse-clear timer + scroll-into-view
 *     still fire on each fresh non-null id so the visual + a11y
 *     contract stays identical across modes.
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

/**
 * Dismissal strategies — see the module doc comment for the full
 * contract. New consumers should pick the one that matches their
 * pivot lifecycle rather than re-introducing a bespoke state
 * machine.
 */
export type FocusedRowDismissal = "interaction" | "controlled";

export type UseFocusedRowHighlightResult<T extends HTMLElement> = {
  focusedRowProps: (id: string) => FocusedRowProps<T>;
  /** Programmatically scroll the row registered under `id` into view
   *  using the same options the focus-seed effect uses, so external
   *  callers (e.g. the templates panel's "Default <kind> template"
   *  header link) can reuse the hook's row-ref map rather than
   *  threading a parallel ref map through the view. No-op when
   *  `scrollIntoView` is unavailable (happy-dom / jsdom test
   *  environments) or no row is registered under the id yet. */
  scrollRowIntoView: (id: string) => void;
};

/**
 * One hook per list / templates view. Pass the
 * `initialFocusedRowId` the parent hands down, the matching
 * `onFocusedRowConsumed` callback (interaction mode only), and the
 * dismissal strategy. All three are optional — omitting the seed is
 * equivalent to "no row is ever pre-focused", which keeps consumers
 * that don't yet wire a pivot source compiling.
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
    dismissal?: FocusedRowDismissal;
  } = {},
): UseFocusedRowHighlightResult<T> {
  const {
    initialFocusedRowId,
    onFocusedRowConsumed,
    dismissal = "interaction",
  } = opts;
  const isControlled = dismissal === "controlled";
  // Interaction mode: focus is seeded from `initialFocusedRowId` and
  // then owned internally — global mousedown / scroll / keydown
  // dismisses it. Controlled mode: focus mirrors the prop directly,
  // the parent owns the lifecycle (e.g. the templates panel keeps
  // the highlight until the AdminApp shell clears `focusedTemplateId`
  // on sidebar nav). The internal `useState` is still allocated in
  // controlled mode (cheap, and avoids hook-order branches), but
  // `focusedRowId` below resolves to the prop value so writes to it
  // would have no effect — we never call the setter outside the
  // interaction-mode branches.
  const [internalFocusedRowId, setInternalFocusedRowId] = useState<
    string | null
  >(initialFocusedRowId ?? null);
  const focusedRowId = isControlled
    ? initialFocusedRowId ?? null
    : internalFocusedRowId;
  const [pulseRowId, setPulseRowId] = useState<string | null>(null);
  const rowRefs = useRef<Map<string, T | null>>(new Map());

  // Re-apply when the parent hands us a fresh non-null seed mid-life
  // (admin pivots, dismisses, navigates away, pivots again into the
  // same component instance). Interaction mode notifies the parent
  // so it can clear its seed slot — otherwise unrelated re-renders
  // would re-apply the highlight after dismissal. Controlled mode
  // skips both the internal state write (the prop IS the source of
  // truth) and the consume callback (the parent doesn't want to
  // clear its slot — it owns the full lifecycle).
  useEffect(() => {
    if (initialFocusedRowId) {
      if (!isControlled) {
        setInternalFocusedRowId(initialFocusedRowId);
        onFocusedRowConsumed?.();
      }
      setPulseRowId(initialFocusedRowId);
    }
    // Depend on seed value only, not callback identity or mode —
    // re-running on consume-callback re-creation would defeat the
    // one-shot handoff invariant in interaction mode, and the mode
    // flag is fixed for the lifetime of a hook instance anyway.
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
  // without us enumerating every filter knob. Skipped entirely in
  // controlled mode — the parent owns dismissal there (e.g. the
  // templates panel keeps focus until the next sidebar nav).
  useEffect(() => {
    if (isControlled) return;
    if (!focusedRowId) return;
    function dismiss() {
      setInternalFocusedRowId(null);
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
  }, [focusedRowId, isControlled]);

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

  function scrollRowIntoView(id: string) {
    const row = rowRefs.current.get(id);
    if (row && typeof row.scrollIntoView === "function") {
      row.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }

  return { focusedRowProps, scrollRowIntoView };
}
