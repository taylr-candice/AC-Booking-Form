// @vitest-environment happy-dom

/**
 * Pins down the modal accessibility helpers shared by `AcTermsModal`
 * and `AcExampleModal`. The hook is responsible for:
 *
 *   - Moving keyboard focus into the dialog when it opens.
 *   - Trapping focus inside the dialog while it is open (Tab from
 *     the last focusable cycles to the first; Shift+Tab from the
 *     first cycles to the last).
 *   - Closing on Escape.
 *   - Restoring focus to the element that opened the dialog after
 *     it unmounts.
 *   - Locking body scrolling while open and restoring it on close.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { useRef, useState, type RefObject } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import { useModalA11y } from "./use-modal-a11y";

function Dialog({
  onClose,
  restoreFocusRef,
}: {
  onClose: () => void;
  restoreFocusRef?: RefObject<HTMLElement | null>;
}) {
  const ref = useModalA11y<HTMLDivElement>({ onClose, restoreFocusRef });
  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label="Test dialog"
      data-testid="dialog"
    >
      <button type="button" data-testid="first">First</button>
      <button type="button" data-testid="middle">Middle</button>
      <button type="button" data-testid="last">Last</button>
    </div>
  );
}

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        data-testid="trigger"
        onClick={() => setOpen(true)}
      >
        Open
      </button>
      {open && <Dialog onClose={() => setOpen(false)} />}
    </div>
  );
}

async function flushFocus() {
  await act(async () => {
    await new Promise<void>((resolve) =>
      window.requestAnimationFrame(() => resolve()),
    );
  });
}

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

describe("useModalA11y", () => {
  it("moves focus into the dialog when it opens", async () => {
    render(<Harness />);
    const trigger = screen.getByTestId("trigger");
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);
    await flushFocus();

    expect(document.activeElement).toBe(screen.getByTestId("first"));
  });

  it("locks body scroll while open and restores it on close", async () => {
    document.body.style.overflow = "auto";
    render(<Harness />);
    const trigger = screen.getByTestId("trigger");

    fireEvent.click(trigger);
    await flushFocus();
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.keyDown(window, { key: "Escape" });
    await flushFocus();
    expect(document.body.style.overflow).toBe("auto");
  });

  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    render(<Dialog onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("traps Tab inside the dialog (Tab from last cycles to first)", async () => {
    render(<Dialog onClose={() => {}} />);
    await flushFocus();

    const last = screen.getByTestId("last");
    last.focus();
    expect(document.activeElement).toBe(last);

    fireEvent.keyDown(window, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByTestId("first"));
  });

  it("traps Shift+Tab inside the dialog (Shift+Tab from first cycles to last)", async () => {
    render(<Dialog onClose={() => {}} />);
    await flushFocus();

    const first = screen.getByTestId("first");
    first.focus();
    expect(document.activeElement).toBe(first);

    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(screen.getByTestId("last"));
  });

  it("returns focus to the element that opened the dialog after it closes", async () => {
    render(<Harness />);
    const trigger = screen.getByTestId("trigger");
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);
    await flushFocus();
    expect(document.activeElement).toBe(screen.getByTestId("first"));

    fireEvent.keyDown(window, { key: "Escape" });
    await flushFocus();

    expect(document.activeElement).toBe(trigger);
  });

  it(
    "uses restoreFocusRef as the close target when the original trigger is " +
      "removed from the DOM while the dialog is open",
    async () => {
      // Mirrors the unit-already-booked flow: the modal is opened
      // from a button inside a dropdown; opening the dialog also
      // collapses the dropdown, so the row that triggered it is
      // unmounted while the dialog is open. The dropdown's stable
      // trigger button (rendered outside the dropdown) is the
      // intended fallback focus target.
      function FlowHarness() {
        const [open, setOpen] = useState(false);
        const [dialog, setDialog] = useState(false);
        const fallbackRef = useRef<HTMLButtonElement | null>(null);
        return (
          <div>
            <button
              ref={fallbackRef}
              type="button"
              data-testid="dropdown-toggle"
              onClick={() => setOpen((v) => !v)}
            >
              Toggle
            </button>
            {open && (
              <button
                type="button"
                data-testid="row-trigger"
                onClick={() => {
                  setOpen(false);
                  setDialog(true);
                }}
              >
                Row
              </button>
            )}
            {dialog && (
              <Dialog
                onClose={() => setDialog(false)}
                restoreFocusRef={fallbackRef}
              />
            )}
          </div>
        );
      }

      render(<FlowHarness />);
      fireEvent.click(screen.getByTestId("dropdown-toggle"));
      const row = screen.getByTestId("row-trigger");
      row.focus();
      expect(document.activeElement).toBe(row);

      fireEvent.click(row);
      await flushFocus();
      // Row is unmounted (dropdown collapsed) and focus moved into
      // the dialog.
      expect(screen.queryByTestId("row-trigger")).toBeNull();
      expect(document.activeElement).toBe(screen.getByTestId("first"));

      fireEvent.keyDown(window, { key: "Escape" });
      await flushFocus();

      // Falls back to the dropdown trigger rather than the body.
      expect(document.activeElement).toBe(screen.getByTestId("dropdown-toggle"));
    },
  );
});
