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
import { useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import { useModalA11y } from "./use-modal-a11y";

function Dialog({ onClose }: { onClose: () => void }) {
  const ref = useModalA11y<HTMLDivElement>({ onClose });
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
});
