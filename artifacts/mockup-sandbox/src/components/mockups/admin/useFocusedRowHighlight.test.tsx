// @vitest-environment happy-dom

/**
 * Task #217: pins the lifecycle of the shared
 * {@link useFocusedRowHighlight} hook so the four list views
 * (BookingsView, AwaitingCoordinationView, RolloutsView, and any
 * future BuildingsView consumer) can't drift on the source-row
 * highlight machinery.
 *
 * The consumer-level focused-row tests
 * (BookingsView.focusedRowSeed.test.tsx,
 *  AwaitingCoordinationView.focusedRowSeed.test.tsx,
 *  RolloutsView.focusedRowSeed.test.tsx) still cover the end-to-end
 * pivot handoff via <AdminApp />. This file complements them by
 * exercising the hook in isolation so any change to the seed /
 * scroll / pulse-clear / dismiss-on-interaction state machine
 * surfaces here surgically rather than as a cascade of failures
 * across the consumer suites.
 */

import { act, cleanup, render } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useFocusedRowHighlight } from "./useFocusedRowHighlight";
import { BRAND_SOFT } from "./theme";

afterEach(() => {
  cleanup();
});

/**
 * Minimal harness that exposes the hook's per-row props on a real
 * DOM element so we can assert against `data-focused`, `data-pulsing`,
 * and the `template-row-focus-pulse` className directly. The
 * `id`-prop is mutable across renders so we can drive the
 * "fresh seed mid-life" path the same way a parent component would
 * (changing the prop value re-runs the hook's seed effect).
 *
 * The harness also forwards the `onFocusedRowConsumed` callback so a
 * spy in the test can confirm the parent gets exactly one notification
 * per fresh seed (mirroring how AdminApp clears its seed slot).
 */
function Harness({
  initialFocusedRowId,
  onFocusedRowConsumed,
  rowIds = ["row-1", "row-2"],
}: {
  initialFocusedRowId?: string | null;
  onFocusedRowConsumed?: () => void;
  rowIds?: ReadonlyArray<string>;
}) {
  const { focusedRowProps } = useFocusedRowHighlight<HTMLDivElement>({
    initialFocusedRowId,
    onFocusedRowConsumed,
  });
  return (
    <div>
      {rowIds.map((id) => {
        const props = focusedRowProps(id);
        return (
          <div
            key={id}
            data-testid={`row-${id}`}
            ref={props.ref}
            data-focused={props["data-focused"]}
            data-pulsing={props["data-pulsing"]}
            className={`row-base${props.pulseClassName}`}
            style={props.style}
          >
            {id}
          </div>
        );
      })}
    </div>
  );
}

describe("useFocusedRowHighlight — lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("seeds focus + pulse + style on the matching row when initialFocusedRowId is set", () => {
    const { getByTestId } = render(
      <Harness initialFocusedRowId="row-1" />,
    );
    const row1 = getByTestId("row-row-1");
    const row2 = getByTestId("row-row-2");
    expect(row1.getAttribute("data-focused")).toBe("true");
    expect(row1.getAttribute("data-pulsing")).toBe("true");
    expect(row1.className).toContain("template-row-focus-pulse");
    // Inline style applied via React serialises to an inline `style`
    // attribute. We assert on the resolved `style.backgroundColor`
    // so a future tweak to the BRAND_SOFT hex value flows through.
    expect((row1 as HTMLDivElement).style.backgroundColor).toBeTruthy();
    // Untouched siblings stay un-marked (no `data-focused="false"`,
    // the attribute is simply absent).
    expect(row2.getAttribute("data-focused")).toBeNull();
    expect(row2.getAttribute("data-pulsing")).toBeNull();
    expect(row2.className).not.toContain("template-row-focus-pulse");
    expect((row2 as HTMLDivElement).style.backgroundColor).toBe("");
  });

  it("renders nothing focused when initialFocusedRowId is omitted", () => {
    const { getByTestId } = render(<Harness />);
    const row1 = getByTestId("row-row-1");
    expect(row1.getAttribute("data-focused")).toBeNull();
    expect(row1.getAttribute("data-pulsing")).toBeNull();
    expect(row1.className).not.toContain("template-row-focus-pulse");
  });

  it("notifies the parent exactly once via onFocusedRowConsumed when a non-null seed lands", () => {
    const consumed = vi.fn();
    render(
      <Harness initialFocusedRowId="row-1" onFocusedRowConsumed={consumed} />,
    );
    expect(consumed).toHaveBeenCalledTimes(1);
  });

  it("does NOT notify when the seed is null/undefined", () => {
    const consumed = vi.fn();
    render(
      <Harness initialFocusedRowId={null} onFocusedRowConsumed={consumed} />,
    );
    expect(consumed).not.toHaveBeenCalled();
  });

  it("calls scrollIntoView on the focused row's element with the centered+smooth options", () => {
    // happy-dom doesn't ship `scrollIntoView`, so the hook's
    // `typeof row.scrollIntoView === "function"` guard would skip
    // the call by default. Patch it onto Element.prototype as a
    // jest.fn() before render so the focus effect invokes our spy
    // on first paint, with the focused row as `this`.
    const scrollSpy = vi.fn();
    const proto = Element.prototype as unknown as {
      scrollIntoView?: (...args: unknown[]) => void;
    };
    const original = proto.scrollIntoView;
    proto.scrollIntoView = scrollSpy;
    try {
      const { getByTestId } = render(
        <Harness initialFocusedRowId="row-1" />,
      );
      expect(scrollSpy).toHaveBeenCalledTimes(1);
      // The hook calls `row.scrollIntoView(opts)` with `row` as the
      // implicit `this` binding, so we read it back via the
      // call's invocation context.
      expect(scrollSpy.mock.contexts[0]).toBe(getByTestId("row-row-1"));
      expect(scrollSpy).toHaveBeenCalledWith({
        block: "center",
        behavior: "smooth",
      });
    } finally {
      if (original) {
        proto.scrollIntoView = original;
      } else {
        delete proto.scrollIntoView;
      }
    }
  });

  it("clears the pulse marker after ~1100ms while keeping data-focused", () => {
    const { getByTestId } = render(
      <Harness initialFocusedRowId="row-1" />,
    );
    const row1 = getByTestId("row-row-1");
    expect(row1.getAttribute("data-pulsing")).toBe("true");
    expect(row1.className).toContain("template-row-focus-pulse");

    act(() => {
      vi.advanceTimersByTime(1100);
    });

    // Pulse drops, but the persistent BRAND_SOFT tint and the
    // data-focused marker stay until the user dismisses.
    expect(row1.getAttribute("data-pulsing")).toBeNull();
    expect(row1.className).not.toContain("template-row-focus-pulse");
    expect(row1.getAttribute("data-focused")).toBe("true");
    expect((row1 as HTMLDivElement).style.backgroundColor).toBeTruthy();
  });

  it("dismisses on a global mousedown (capture-phase listener)", () => {
    const { getByTestId } = render(
      <Harness initialFocusedRowId="row-1" />,
    );
    const row1 = getByTestId("row-row-1");
    expect(row1.getAttribute("data-focused")).toBe("true");

    act(() => {
      document.body.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true }),
      );
    });

    expect(row1.getAttribute("data-focused")).toBeNull();
  });

  it("dismisses on a global keydown", () => {
    const { getByTestId } = render(
      <Harness initialFocusedRowId="row-1" />,
    );
    const row1 = getByTestId("row-row-1");
    expect(row1.getAttribute("data-focused")).toBe("true");

    act(() => {
      document.body.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" }),
      );
    });

    expect(row1.getAttribute("data-focused")).toBeNull();
  });

  it("dismisses on a global scroll", () => {
    const { getByTestId } = render(
      <Harness initialFocusedRowId="row-1" />,
    );
    const row1 = getByTestId("row-row-1");
    expect(row1.getAttribute("data-focused")).toBe("true");

    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });

    expect(row1.getAttribute("data-focused")).toBeNull();
  });

  it("does not re-apply the highlight when the parent re-renders without a fresh seed", () => {
    const consumed = vi.fn();
    function Driver() {
      // Mimics the AdminApp shell: hands a non-null seed once, then
      // clears it via `onFocusedRowConsumed` so subsequent re-renders
      // pass `null`.
      const [seed, setSeed] = useState<string | null>("row-1");
      const [tick, setTick] = useState(0);
      return (
        <>
          <button
            type="button"
            data-testid="bump"
            onClick={() => setTick((n) => n + 1)}
          >
            bump {tick}
          </button>
          <Harness
            initialFocusedRowId={seed}
            onFocusedRowConsumed={() => {
              setSeed(null);
              consumed();
            }}
          />
        </>
      );
    }

    const { getByTestId } = render(<Driver />);
    const row1 = getByTestId("row-row-1");
    expect(row1.getAttribute("data-focused")).toBe("true");
    expect(consumed).toHaveBeenCalledTimes(1);

    // Dismiss via mousedown.
    act(() => {
      document.body.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true }),
      );
    });
    expect(row1.getAttribute("data-focused")).toBeNull();

    // Force a benign re-render — the seed is already null so the
    // hook must NOT re-light the highlight.
    act(() => {
      getByTestId("bump").click();
    });
    expect(row1.getAttribute("data-focused")).toBeNull();
    // And the parent was only ever notified once across the
    // dismiss + re-render lifecycle.
    expect(consumed).toHaveBeenCalledTimes(1);
  });

  it("re-arms the highlight when the parent hands down a fresh non-null seed mid-life", () => {
    const consumed = vi.fn();
    function Driver() {
      const [seed, setSeed] = useState<string | null>("row-1");
      return (
        <>
          <button
            type="button"
            data-testid="reseed"
            onClick={() => setSeed("row-2")}
          >
            reseed
          </button>
          <Harness
            initialFocusedRowId={seed}
            onFocusedRowConsumed={consumed}
          />
        </>
      );
    }

    const { getByTestId } = render(<Driver />);
    expect(getByTestId("row-row-1").getAttribute("data-focused")).toBe("true");
    expect(getByTestId("row-row-2").getAttribute("data-focused")).toBeNull();
    expect(consumed).toHaveBeenCalledTimes(1);

    // Dismiss the first highlight, then drive a fresh seed at row-2.
    act(() => {
      document.body.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true }),
      );
    });
    act(() => {
      getByTestId("reseed").click();
    });

    expect(getByTestId("row-row-1").getAttribute("data-focused")).toBeNull();
    expect(getByTestId("row-row-2").getAttribute("data-focused")).toBe("true");
    expect(getByTestId("row-row-2").className).toContain(
      "template-row-focus-pulse",
    );
    expect(consumed).toHaveBeenCalledTimes(2);
  });

  it("uses BRAND_SOFT for the focused row's inline backgroundColor", () => {
    // Pin the BRAND_SOFT contract: any future palette swap that
    // changes the constant flows through here without a separate
    // test edit, but a refactor that accidentally wires a different
    // colour to the hook fails loudly.
    const { getByTestId } = render(
      <Harness initialFocusedRowId="row-1" />,
    );
    const row1 = getByTestId("row-row-1") as HTMLDivElement;
    // Browsers normalise hex to rgb in `style`; compare both forms
    // by reconstructing a temporary element with the same colour.
    const probe = document.createElement("div");
    probe.style.backgroundColor = BRAND_SOFT;
    expect(row1.style.backgroundColor).toBe(probe.style.backgroundColor);
  });
});

/**
 * Task #231: Controlled-mode contract for the Call/EmailTemplatesView
 * panels. The templates panels reuse the same hook but the parent
 * (AdminApp) keeps `focusedTemplateId` set until the next sidebar
 * nav, so the hook must NOT install global dismiss listeners and
 * must NOT fire `onFocusedRowConsumed` — the prop IS the source of
 * truth, not a one-shot seed. The pulse-clear timer + scroll-into-
 * view + BRAND_SOFT tint stay identical to interaction mode so the
 * visual + a11y contract pinned by the lifecycle tests above flows
 * through both consumer surfaces from the same module.
 */
function ControlledHarness({
  focusedRowId,
  onFocusedRowConsumed,
  rowIds = ["row-1", "row-2"],
}: {
  focusedRowId: string | null;
  onFocusedRowConsumed?: () => void;
  rowIds?: ReadonlyArray<string>;
}) {
  const { focusedRowProps } = useFocusedRowHighlight<HTMLDivElement>({
    initialFocusedRowId: focusedRowId,
    onFocusedRowConsumed,
    dismissal: "controlled",
  });
  return (
    <div>
      {rowIds.map((id) => {
        const props = focusedRowProps(id);
        return (
          <div
            key={id}
            data-testid={`row-${id}`}
            ref={props.ref}
            data-focused={props["data-focused"]}
            data-pulsing={props["data-pulsing"]}
            className={`row-base${props.pulseClassName}`}
            style={props.style}
          >
            {id}
          </div>
        );
      })}
    </div>
  );
}

describe("useFocusedRowHighlight — controlled dismissal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("seeds focus + pulse + BRAND_SOFT on the matching row when the prop is non-null", () => {
    const { getByTestId } = render(
      <ControlledHarness focusedRowId="row-1" />,
    );
    const row1 = getByTestId("row-row-1") as HTMLDivElement;
    expect(row1.getAttribute("data-focused")).toBe("true");
    expect(row1.getAttribute("data-pulsing")).toBe("true");
    expect(row1.className).toContain("template-row-focus-pulse");
    const probe = document.createElement("div");
    probe.style.backgroundColor = BRAND_SOFT;
    expect(row1.style.backgroundColor).toBe(probe.style.backgroundColor);
  });

  it("does NOT call onFocusedRowConsumed when a non-null prop arrives (parent owns the lifecycle)", () => {
    const consumed = vi.fn();
    render(
      <ControlledHarness focusedRowId="row-1" onFocusedRowConsumed={consumed} />,
    );
    expect(consumed).not.toHaveBeenCalled();
  });

  it("does NOT dismiss on a global mousedown (parent decides when to clear)", () => {
    const { getByTestId } = render(
      <ControlledHarness focusedRowId="row-1" />,
    );
    const row1 = getByTestId("row-row-1");
    expect(row1.getAttribute("data-focused")).toBe("true");

    act(() => {
      document.body.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true }),
      );
    });

    // Focus persists — only the parent flipping the prop to null
    // can clear it in controlled mode.
    expect(row1.getAttribute("data-focused")).toBe("true");
  });

  it("does NOT dismiss on a global keydown or scroll", () => {
    const { getByTestId } = render(
      <ControlledHarness focusedRowId="row-1" />,
    );
    const row1 = getByTestId("row-row-1");
    expect(row1.getAttribute("data-focused")).toBe("true");

    act(() => {
      document.body.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" }),
      );
    });
    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });

    expect(row1.getAttribute("data-focused")).toBe("true");
  });

  it("clears focus + tint when the parent flips the prop back to null", () => {
    function Driver() {
      const [focused, setFocused] = useState<string | null>("row-1");
      return (
        <>
          <button
            type="button"
            data-testid="clear"
            onClick={() => setFocused(null)}
          >
            clear
          </button>
          <ControlledHarness focusedRowId={focused} />
        </>
      );
    }
    const { getByTestId } = render(<Driver />);
    const row1 = getByTestId("row-row-1") as HTMLDivElement;
    expect(row1.getAttribute("data-focused")).toBe("true");

    act(() => {
      getByTestId("clear").click();
    });

    expect(row1.getAttribute("data-focused")).toBeNull();
    expect(row1.style.backgroundColor).toBe("");
  });

  it("re-arms the pulse on the new row when the parent swaps the focused id mid-life", () => {
    function Driver() {
      const [focused, setFocused] = useState<string | null>("row-1");
      return (
        <>
          <button
            type="button"
            data-testid="swap"
            onClick={() => setFocused("row-2")}
          >
            swap
          </button>
          <ControlledHarness focusedRowId={focused} />
        </>
      );
    }
    const { getByTestId } = render(<Driver />);
    expect(getByTestId("row-row-1").getAttribute("data-focused")).toBe("true");
    expect(getByTestId("row-row-1").getAttribute("data-pulsing")).toBe("true");

    // Let the first pulse expire so the next swap demonstrably
    // re-arms it on a fresh row rather than coasting on the
    // outgoing timer.
    act(() => {
      vi.advanceTimersByTime(1200);
    });
    expect(getByTestId("row-row-1").getAttribute("data-pulsing")).toBeNull();

    act(() => {
      getByTestId("swap").click();
    });

    expect(getByTestId("row-row-1").getAttribute("data-focused")).toBeNull();
    expect(getByTestId("row-row-2").getAttribute("data-focused")).toBe("true");
    expect(getByTestId("row-row-2").getAttribute("data-pulsing")).toBe("true");
    expect(getByTestId("row-row-2").className).toContain(
      "template-row-focus-pulse",
    );
  });

  it("clears the pulse marker after ~1100ms while keeping data-focused (matches interaction mode)", () => {
    const { getByTestId } = render(
      <ControlledHarness focusedRowId="row-1" />,
    );
    const row1 = getByTestId("row-row-1") as HTMLDivElement;
    expect(row1.getAttribute("data-pulsing")).toBe("true");

    act(() => {
      vi.advanceTimersByTime(1100);
    });

    // Pulse drops, but the BRAND_SOFT tint + data-focused stay
    // because the parent still has the prop set — exactly how the
    // templates panels keep the highlight visible until sidebar nav.
    expect(row1.getAttribute("data-pulsing")).toBeNull();
    expect(row1.className).not.toContain("template-row-focus-pulse");
    expect(row1.getAttribute("data-focused")).toBe("true");
    expect(row1.style.backgroundColor).toBeTruthy();
  });

  it("calls scrollIntoView on the focused row when a fresh non-null prop lands", () => {
    const scrollSpy = vi.fn();
    const proto = Element.prototype as unknown as {
      scrollIntoView?: (...args: unknown[]) => void;
    };
    const original = proto.scrollIntoView;
    proto.scrollIntoView = scrollSpy;
    try {
      const { getByTestId } = render(
        <ControlledHarness focusedRowId="row-1" />,
      );
      expect(scrollSpy).toHaveBeenCalledTimes(1);
      expect(scrollSpy.mock.contexts[0]).toBe(getByTestId("row-row-1"));
      expect(scrollSpy).toHaveBeenCalledWith({
        block: "center",
        behavior: "smooth",
      });
    } finally {
      if (original) {
        proto.scrollIntoView = original;
      } else {
        delete proto.scrollIntoView;
      }
    }
  });

  it("exposes scrollRowIntoView so external callers (default-header link) can scroll a row by id", () => {
    const scrollSpy = vi.fn();
    const proto = Element.prototype as unknown as {
      scrollIntoView?: (...args: unknown[]) => void;
    };
    const original = proto.scrollIntoView;
    proto.scrollIntoView = scrollSpy;
    try {
      // Mount with no seed so the scroll-on-seed effect doesn't fire,
      // then explicitly invoke `scrollRowIntoView` from a click
      // handler — mirrors how Call/EmailTemplatesView's "Default
      // <kind> template" header link calls it.
      function ExternalCallerHarness() {
        const { focusedRowProps, scrollRowIntoView } =
          useFocusedRowHighlight<HTMLDivElement>({
            dismissal: "controlled",
          });
        return (
          <div>
            <button
              type="button"
              data-testid="scroll-to-row-2"
              onClick={() => scrollRowIntoView("row-2")}
            >
              scroll
            </button>
            {["row-1", "row-2"].map((id) => {
              const props = focusedRowProps(id);
              return (
                <div
                  key={id}
                  data-testid={`row-${id}`}
                  ref={props.ref}
                >
                  {id}
                </div>
              );
            })}
          </div>
        );
      }
      const { getByTestId } = render(<ExternalCallerHarness />);
      // No seed, so no scroll yet.
      expect(scrollSpy).not.toHaveBeenCalled();

      act(() => {
        getByTestId("scroll-to-row-2").click();
      });

      expect(scrollSpy).toHaveBeenCalledTimes(1);
      expect(scrollSpy.mock.contexts[0]).toBe(getByTestId("row-row-2"));
      expect(scrollSpy).toHaveBeenCalledWith({
        block: "center",
        behavior: "smooth",
      });
    } finally {
      if (original) {
        proto.scrollIntoView = original;
      } else {
        delete proto.scrollIntoView;
      }
    }
  });
});
