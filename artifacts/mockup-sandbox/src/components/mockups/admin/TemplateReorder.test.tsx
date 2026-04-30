// @vitest-environment happy-dom

/**
 * Regression tests for Task #164 — drag-and-drop reorder of the
 * non-default rows in the Call/Email templates panels.
 *
 * Three layers of coverage:
 *   1. Pure-helper tests for {@link reorderCallTemplates} /
 *      {@link reorderEmailTemplates} pin the array transform: drag
 *      down inserts after, drag up inserts before, and any move
 *      involving the default is refused (the default stays pinned at
 *      the top — see {@link findDefaultCallTemplate}).
 *   2. View-level drag tests confirm a real drag (dragstart on the
 *      handle of the source row, drop on a target row) calls
 *      `onReorder` with the right ids and updates the visible row
 *      order in a state-backed harness.
 *   3. View-level pin tests confirm the default row has no drag
 *      handle (it's `draggable={false}`) and that starring a
 *      different row hoists the new default to the top without
 *      disturbing the manual order of the remaining rows.
 */

import {
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  findDefaultCallTemplate,
  findDefaultEmailTemplate,
  reorderCallTemplates,
  reorderEmailTemplates,
  setDefaultCallTemplate,
  setDefaultEmailTemplate,
  type CallTemplate,
  type EmailTemplate,
} from "@/state/adminMockData";

import { CallTemplatesView } from "./CallTemplatesView";
import { EmailTemplatesView } from "./EmailTemplatesView";

afterEach(() => {
  cleanup();
});

function makeCallCatalog(): CallTemplate[] {
  return [
    { id: "a", name: "Aaaa", note: "a-note", isDefault: true },
    { id: "b", name: "Bbbb", note: "b-note" },
    { id: "c", name: "Cccc", note: "c-note" },
    { id: "d", name: "Dddd", note: "d-note" },
    { id: "e", name: "Eeee", note: "e-note" },
  ];
}

function makeEmailCatalog(): EmailTemplate[] {
  return [
    {
      id: "a",
      name: "Aaaa",
      subject: "a-subject",
      note: "a-note",
      isDefault: true,
    },
    { id: "b", name: "Bbbb", subject: "b-subject", note: "b-note" },
    { id: "c", name: "Cccc", subject: "c-subject", note: "c-note" },
    { id: "d", name: "Dddd", subject: "d-subject", note: "d-note" },
    { id: "e", name: "Eeee", subject: "e-subject", note: "e-note" },
  ];
}

function CallHarness({ initial }: { initial: CallTemplate[] }) {
  const [templates, setTemplates] = useState<CallTemplate[]>(initial);
  return (
    <CallTemplatesView
      templates={templates}
      onCreate={() => undefined}
      onUpdate={() => undefined}
      onRemove={() => undefined}
      onSetDefault={(id) =>
        setTemplates((prev) => setDefaultCallTemplate(prev, id))
      }
      onReorder={(fromId, toId) =>
        setTemplates((prev) => reorderCallTemplates(prev, fromId, toId))
      }
    />
  );
}

function EmailHarness({ initial }: { initial: EmailTemplate[] }) {
  const [templates, setTemplates] = useState<EmailTemplate[]>(initial);
  return (
    <EmailTemplatesView
      templates={templates}
      onCreate={() => undefined}
      onUpdate={() => undefined}
      onRemove={() => undefined}
      onSetDefault={(id) =>
        setTemplates((prev) => setDefaultEmailTemplate(prev, id))
      }
      onReorder={(fromId, toId) =>
        setTemplates((prev) => reorderEmailTemplates(prev, fromId, toId))
      }
    />
  );
}

const callRowIds = (): string[] =>
  Array.from(
    document.querySelectorAll<HTMLElement>(
      '[data-testid^="call-template-row-"]',
    ),
  ).map((row) =>
    (row.getAttribute("data-testid") ?? "").replace("call-template-row-", ""),
  );

const emailRowIds = (): string[] =>
  Array.from(
    document.querySelectorAll<HTMLElement>(
      '[data-testid^="email-template-row-"]',
    ),
  ).map((row) =>
    (row.getAttribute("data-testid") ?? "").replace("email-template-row-", ""),
  );

describe("reorderCallTemplates / reorderEmailTemplates · helpers", () => {
  it("drag down: moving b past d places b right after d in the array", () => {
    const before = makeCallCatalog();
    const after = reorderCallTemplates(before, "b", "d");
    expect(after.map((t) => t.id)).toEqual(["a", "c", "d", "b", "e"]);
    // Helper returns fresh objects so callers can hand the result
    // straight to setState without aliasing the input.
    expect(after).not.toBe(before);
    expect(after[0]).not.toBe(before[0]);
    // Default flag stays where it was — reorder never edits flags.
    expect(findDefaultCallTemplate(after)?.id).toBe("a");
  });

  it("drag up: moving e past b places e right before b in the array", () => {
    const before = makeCallCatalog();
    const after = reorderCallTemplates(before, "e", "b");
    expect(after.map((t) => t.id)).toEqual(["a", "e", "b", "c", "d"]);
  });

  it("dragging the default row is a no-op (returns a fresh-but-equal copy)", () => {
    const before = makeCallCatalog();
    const after = reorderCallTemplates(before, "a", "c");
    expect(after.map((t) => t.id)).toEqual(["a", "b", "c", "d", "e"]);
    expect(after).not.toBe(before);
  });

  it("dropping onto the default row is a no-op (default stays pinned)", () => {
    const before = makeCallCatalog();
    const after = reorderCallTemplates(before, "c", "a");
    expect(after.map((t) => t.id)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("same-id move is a no-op", () => {
    const before = makeCallCatalog();
    const after = reorderCallTemplates(before, "c", "c");
    expect(after.map((t) => t.id)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("unknown ids are silently no-op", () => {
    const before = makeCallCatalog();
    expect(reorderCallTemplates(before, "ghost", "c").map((t) => t.id)).toEqual(
      ["a", "b", "c", "d", "e"],
    );
    expect(reorderCallTemplates(before, "b", "ghost").map((t) => t.id)).toEqual(
      ["a", "b", "c", "d", "e"],
    );
  });

  it("email helper mirrors the call helper's contract", () => {
    const before = makeEmailCatalog();
    expect(
      reorderEmailTemplates(before, "b", "d").map((t) => t.id),
    ).toEqual(["a", "c", "d", "b", "e"]);
    expect(
      reorderEmailTemplates(before, "e", "b").map((t) => t.id),
    ).toEqual(["a", "e", "b", "c", "d"]);
    // Default is refused on either side.
    expect(
      reorderEmailTemplates(before, "a", "c").map((t) => t.id),
    ).toEqual(["a", "b", "c", "d", "e"]);
    expect(
      reorderEmailTemplates(before, "c", "a").map((t) => t.id),
    ).toEqual(["a", "b", "c", "d", "e"]);
    // Default flag survives every move attempt.
    expect(
      findDefaultEmailTemplate(reorderEmailTemplates(before, "b", "d"))?.id,
    ).toBe("a");
  });

  it("works when the default sits in the middle of the array (display still hoists it)", () => {
    // User created their own template, then promoted it — the default
    // is now at array idx 2 even though the panel renders it at the
    // top. Reorder should still walk the array indices, not the
    // display indices.
    const before: CallTemplate[] = [
      { id: "a", name: "A", note: "" },
      { id: "b", name: "B", note: "" },
      { id: "c", name: "C", note: "", isDefault: true },
      { id: "d", name: "D", note: "" },
      { id: "e", name: "E", note: "" },
    ];
    const after = reorderCallTemplates(before, "a", "e");
    expect(after.map((t) => t.id)).toEqual(["b", "c", "d", "e", "a"]);
    expect(findDefaultCallTemplate(after)?.id).toBe("c");
  });
});

describe("CallTemplatesView · drag-and-drop reorder", () => {
  it("dragging a non-default row onto another updates the visible order", () => {
    render(<CallHarness initial={makeCallCatalog()} />);

    // Initial visible order: default first, then array order.
    expect(callRowIds()).toEqual(["a", "b", "c", "d", "e"]);

    // Drag b past d: dragstart on b's row, dragover + drop on d's row.
    const bRow = screen.getByTestId("call-template-row-b");
    const dRow = screen.getByTestId("call-template-row-d");
    fireEvent.dragStart(bRow);
    // dragover must fire (and the default-prevented event must be
    // honoured by the drop target) for the drop to land.
    fireEvent.dragOver(dRow);
    fireEvent.drop(dRow);
    fireEvent.dragEnd(bRow);

    expect(callRowIds()).toEqual(["a", "c", "d", "b", "e"]);
  });

  it("dragging upward inserts the row before the drop target", () => {
    render(<CallHarness initial={makeCallCatalog()} />);

    const eRow = screen.getByTestId("call-template-row-e");
    const bRow = screen.getByTestId("call-template-row-b");
    fireEvent.dragStart(eRow);
    fireEvent.dragOver(bRow);
    fireEvent.drop(bRow);
    fireEvent.dragEnd(eRow);

    expect(callRowIds()).toEqual(["a", "e", "b", "c", "d"]);
  });

  it("the default row is not draggable and has no drag handle — it stays pinned during/after a drag", () => {
    render(<CallHarness initial={makeCallCatalog()} />);

    const defaultRow = screen.getByTestId("call-template-row-a");
    expect(defaultRow.getAttribute("draggable")).toBe("false");
    // Default row shows the Pin marker, not the grip handle, so a
    // mouse drag never starts on it.
    expect(screen.getByTestId("call-template-pinned-a")).toBeTruthy();
    expect(screen.queryByTestId("drag-handle-call-template-a")).toBeNull();
    // Every other row exposes a grip handle.
    expect(screen.getByTestId("drag-handle-call-template-b")).toBeTruthy();
    expect(screen.getByTestId("drag-handle-call-template-e")).toBeTruthy();

    // Reorder b past d — default should still be at the top before
    // and after.
    expect(callRowIds()[0]).toBe("a");
    fireEvent.dragStart(screen.getByTestId("call-template-row-b"));
    fireEvent.dragOver(screen.getByTestId("call-template-row-d"));
    fireEvent.drop(screen.getByTestId("call-template-row-d"));
    fireEvent.dragEnd(screen.getByTestId("call-template-row-b"));
    expect(callRowIds()[0]).toBe("a");
    expect(callRowIds()).toEqual(["a", "c", "d", "b", "e"]);
  });

  it("dropping a non-default row onto the default row is a no-op (the panel refuses the drop)", () => {
    render(<CallHarness initial={makeCallCatalog()} />);

    fireEvent.dragStart(screen.getByTestId("call-template-row-c"));
    fireEvent.dragOver(screen.getByTestId("call-template-row-a"));
    fireEvent.drop(screen.getByTestId("call-template-row-a"));
    fireEvent.dragEnd(screen.getByTestId("call-template-row-c"));

    expect(callRowIds()).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("starring a different row hoists it to the top without disturbing the rest of the manual order", () => {
    render(<CallHarness initial={makeCallCatalog()} />);

    // First, build a manual order: drag b past d so the array becomes
    // [a(default), c, d, b, e]. Display: [a, c, d, b, e].
    fireEvent.dragStart(screen.getByTestId("call-template-row-b"));
    fireEvent.dragOver(screen.getByTestId("call-template-row-d"));
    fireEvent.drop(screen.getByTestId("call-template-row-d"));
    fireEvent.dragEnd(screen.getByTestId("call-template-row-b"));
    expect(callRowIds()).toEqual(["a", "c", "d", "b", "e"]);

    // Promote `d` to default. Array becomes [a, c, d(default), b, e].
    // Display hoists d first; the rest keeps array order, so a's
    // previous "default" slot becomes a regular row that slots into
    // its array position. Manual order of c/b/e is preserved.
    fireEvent.click(screen.getByTestId("button-default-call-template-d"));

    expect(callRowIds()).toEqual(["d", "a", "c", "b", "e"]);
    // The newly-defaulted row is the only one carrying the pill /
    // pin marker.
    expect(screen.getByTestId("pill-default-call-template-d")).toBeTruthy();
    expect(screen.getByTestId("call-template-pinned-d")).toBeTruthy();
    expect(screen.queryByTestId("call-template-pinned-a")).toBeNull();
    expect(screen.queryByTestId("pill-default-call-template-a")).toBeNull();
    // The previously-pinned default has switched into a draggable
    // row, complete with grip handle.
    expect(screen.getByTestId("drag-handle-call-template-a")).toBeTruthy();
  });

  it("calls onReorder exactly once per drop with the dragged + target ids", () => {
    const onReorder = vi.fn();
    render(
      <CallTemplatesView
        templates={makeCallCatalog()}
        onCreate={() => undefined}
        onUpdate={() => undefined}
        onRemove={() => undefined}
        onSetDefault={() => undefined}
        onReorder={onReorder}
      />,
    );

    fireEvent.dragStart(screen.getByTestId("call-template-row-c"));
    fireEvent.dragOver(screen.getByTestId("call-template-row-e"));
    fireEvent.drop(screen.getByTestId("call-template-row-e"));

    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith("c", "e");
  });
});

describe("Templates panels · sandbox-only reorder note (Task #176)", () => {
  it("CallTemplatesView surfaces the inline note that reorder resets on refresh", () => {
    render(<CallHarness initial={makeCallCatalog()} />);
    const note = screen.getByTestId(
      "text-call-templates-reorder-sandbox-note",
    );
    expect(note).toBeTruthy();
    expect(note.textContent ?? "").toMatch(/sandbox/i);
    expect(note.textContent ?? "").toMatch(/refresh/i);
  });

  it("EmailTemplatesView surfaces the inline note that reorder resets on refresh", () => {
    render(<EmailHarness initial={makeEmailCatalog()} />);
    const note = screen.getByTestId(
      "text-email-templates-reorder-sandbox-note",
    );
    expect(note).toBeTruthy();
    expect(note.textContent ?? "").toMatch(/sandbox/i);
    expect(note.textContent ?? "").toMatch(/refresh/i);
  });
});

describe("EmailTemplatesView · drag-and-drop reorder", () => {
  it("dragging a non-default row onto another updates the visible order", () => {
    render(<EmailHarness initial={makeEmailCatalog()} />);

    expect(emailRowIds()).toEqual(["a", "b", "c", "d", "e"]);

    fireEvent.dragStart(screen.getByTestId("email-template-row-b"));
    fireEvent.dragOver(screen.getByTestId("email-template-row-d"));
    fireEvent.drop(screen.getByTestId("email-template-row-d"));
    fireEvent.dragEnd(screen.getByTestId("email-template-row-b"));

    expect(emailRowIds()).toEqual(["a", "c", "d", "b", "e"]);
  });

  it("the default row is not draggable and has no drag handle — it stays pinned during/after a drag", () => {
    render(<EmailHarness initial={makeEmailCatalog()} />);

    const defaultRow = screen.getByTestId("email-template-row-a");
    expect(defaultRow.getAttribute("draggable")).toBe("false");
    expect(screen.getByTestId("email-template-pinned-a")).toBeTruthy();
    expect(screen.queryByTestId("drag-handle-email-template-a")).toBeNull();
    expect(screen.getByTestId("drag-handle-email-template-b")).toBeTruthy();

    expect(emailRowIds()[0]).toBe("a");
    fireEvent.dragStart(screen.getByTestId("email-template-row-c"));
    fireEvent.dragOver(screen.getByTestId("email-template-row-e"));
    fireEvent.drop(screen.getByTestId("email-template-row-e"));
    fireEvent.dragEnd(screen.getByTestId("email-template-row-c"));
    expect(emailRowIds()[0]).toBe("a");
    expect(emailRowIds()).toEqual(["a", "b", "d", "e", "c"]);
  });

  it("starring a different row hoists it to the top without disturbing the rest of the manual order", () => {
    render(<EmailHarness initial={makeEmailCatalog()} />);

    // Build a manual order via drag: array becomes [a(default), c, d, b, e].
    fireEvent.dragStart(screen.getByTestId("email-template-row-b"));
    fireEvent.dragOver(screen.getByTestId("email-template-row-d"));
    fireEvent.drop(screen.getByTestId("email-template-row-d"));
    fireEvent.dragEnd(screen.getByTestId("email-template-row-b"));
    expect(emailRowIds()).toEqual(["a", "c", "d", "b", "e"]);

    // Promote `d`. Display hoists d to the top; everyone else stays
    // in array order so the manual c-before-b-before-e ordering
    // survives.
    fireEvent.click(screen.getByTestId("button-default-email-template-d"));

    expect(emailRowIds()).toEqual(["d", "a", "c", "b", "e"]);
    expect(screen.getByTestId("pill-default-email-template-d")).toBeTruthy();
    expect(screen.getByTestId("email-template-pinned-d")).toBeTruthy();
    expect(screen.queryByTestId("email-template-pinned-a")).toBeNull();
    expect(screen.queryByTestId("pill-default-email-template-a")).toBeNull();
    expect(screen.getByTestId("drag-handle-email-template-a")).toBeTruthy();
  });
});
