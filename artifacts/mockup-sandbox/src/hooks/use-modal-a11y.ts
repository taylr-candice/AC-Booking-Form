import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "button:not([disabled])",
  "iframe",
  "object",
  "embed",
  "[contenteditable='true']",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function isVisible(el: HTMLElement): boolean {
  if (el.hasAttribute("hidden")) return false;
  if (el.getAttribute("aria-hidden") === "true") return false;
  if (el.tabIndex < 0) return false;
  const rects = el.getClientRects();
  if (rects.length === 0) return false;
  const style = window.getComputedStyle(el);
  if (style.visibility === "hidden" || style.display === "none") return false;
  return true;
}

function getFocusable(container: HTMLElement): HTMLElement[] {
  const nodes = Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  );
  return nodes.filter(isVisible);
}

/**
 * Accessibility helpers shared by modal dialogs in the booking flow.
 *
 * When the dialog mounts (or `enabled` flips to true) this hook:
 *   - Records the element that currently has focus, so it can be
 *     restored when the dialog closes.
 *   - Moves focus into the dialog (preferring the first focusable
 *     child, falling back to the container itself).
 *   - Locks body scrolling.
 *   - Listens for `Escape` (calls `onClose`) and `Tab` (cycles focus
 *     within the dialog so the user can't tab out into the page
 *     underneath).
 *
 * On unmount / disable it tears the listeners down, restores body
 * scrolling, and returns focus to the previously focused element.
 *
 * If `restoreFocusRef` is supplied and points at an element still
 * connected to the document when the dialog closes, focus is sent
 * there instead of the previously-focused element. This is needed
 * when the trigger control is removed from the DOM while the dialog
 * is open (e.g. the modal is opened from a row inside a dropdown
 * that closes in the same action) — without an explicit fallback
 * focus would land on `<body>`.
 *
 * Attach the returned ref to the dialog's content container.
 */
export function useModalA11y<T extends HTMLElement = HTMLDivElement>({
  enabled = true,
  onClose,
  restoreFocusRef,
}: {
  enabled?: boolean;
  onClose: () => void;
  restoreFocusRef?: RefObject<HTMLElement | null>;
}) {
  const containerRef = useRef<T | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const container = containerRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    if (container) {
      if (!container.hasAttribute("tabindex")) {
        container.setAttribute("tabindex", "-1");
      }
      const focusable = getFocusable(container);
      const target = focusable[0] ?? container;
      window.requestAnimationFrame(() => {
        target.focus();
      });
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !container) return;

      const focusable = getFocusable(container);
      if (focusable.length === 0) {
        e.preventDefault();
        container.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        if (active === first || !container.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !container.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      document.body.style.overflow = prevOverflow;
      const explicitTarget = restoreFocusRef?.current ?? null;
      const target =
        explicitTarget &&
        typeof explicitTarget.focus === "function" &&
        document.contains(explicitTarget)
          ? explicitTarget
          : previouslyFocused &&
              typeof previouslyFocused.focus === "function" &&
              document.contains(previouslyFocused)
            ? previouslyFocused
            : null;
      if (target) {
        target.focus();
      }
    };
  }, [enabled, onClose, restoreFocusRef]);

  return containerRef;
}
