// @vitest-environment happy-dom

/**
 * Regression tests for the admin "Call templates" CRUD panel.
 *
 * Mirror of `EmailTemplatesView.crud.test.tsx` for the call channel.
 * The view itself is a thin shell over four affordances — Add (modal),
 * Edit (modal pre-filled with the row's fields), Remove (window.confirm
 * guard), and the Save-disabled-when-blank rule on the editor modal.
 * Each path is wired through `CallTemplatesView`'s `onCreate` /
 * `onUpdate` / `onRemove` callbacks, which `AdminApp` then routes into
 * the shared `callTemplates` state that the per-row Log-call form on
 * `BookingDetail` and the bulk Log-call form on
 * `AwaitingCoordinationView` both read from.
 *
 * Pinning the four CRUD paths down explicitly catches a future
 * refactor of the editor modal or the AdminApp handlers that would
 * otherwise silently regress the panel without breaking the broader
 * suite.
 *
 * Two companion AdminApp-mounted tests at the bottom mirror the
 * existing email-template cross-view test: they confirm a template
 * added via the panel is immediately pickable in BOTH the per-row and
 * bulk Log-call dropdowns without any propagation step, because all
 * three views read from the same `callTemplates` state held by
 * `AdminApp`. The fourth test pins the "Custom… is always present and
 * can't be deleted" guarantee — there's no Remove control on the
 * sentinel because it isn't a real catalog row, and the dropdown still
 * renders it after every seeded template has been removed.
 */

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CALL_TEMPLATES,
  type CallTemplate,
} from "@/state/adminMockData";

import { AdminApp } from "./AdminApp";
import { CallTemplatesView } from "./CallTemplatesView";

afterEach(() => {
  cleanup();
});

function makeTemplates(): CallTemplate[] {
  return [
    {
      id: "call-tpl-seed-1",
      name: "No answer — left voicemail",
      note: "No answer on the listed number — left a voicemail with the booking ref and a callback number.",
    },
    {
      id: "call-tpl-seed-2",
      name: "Spoke to them — confirmed window",
      note: "Spoke briefly and confirmed the proposed service window — happy to proceed.",
    },
  ];
}

/**
 * State harness so the panel re-renders after each callback fires —
 * matches how `AdminApp` wires the view, and is what makes the
 * row-appears / row-disappears assertions meaningful (without it the
 * `templates` prop would be frozen to the initial fixture).
 */
function Harness({ initial }: { initial: CallTemplate[] }) {
  const [templates, setTemplates] = useState<CallTemplate[]>(initial);
  return (
    <CallTemplatesView
      templates={templates}
      onCreate={(draft) =>
        setTemplates((prev) => [
          ...prev,
          { id: `call-tpl-${prev.length + 1}`, ...draft },
        ])
      }
      onUpdate={(id, draft) =>
        setTemplates((prev) =>
          prev.map((t) => (t.id === id ? { ...t, ...draft } : t)),
        )
      }
      onRemove={(id) =>
        setTemplates((prev) => prev.filter((t) => t.id !== id))
      }
    />
  );
}

describe("CallTemplatesView · CRUD", () => {
  it("Add → Save creates a new row visible in the panel", () => {
    render(<Harness initial={makeTemplates()} />);

    // Open the editor modal in "create" mode — it starts blank.
    fireEvent.click(screen.getByTestId("button-add-call-template"));
    expect(screen.getByTestId("call-template-editor")).toBeTruthy();

    // Fill in name (the only required field) plus the optional
    // suggested-note. We pad each value with surrounding whitespace so
    // we also confirm the editor's normalize step strips it before the
    // row lands in the catalog — the trim must run on Save, not on
    // every keystroke (otherwise typing trailing spaces becomes
    // impossible).
    fireEvent.change(screen.getByTestId("input-call-template-name"), {
      target: { value: "  Wrong number on file  " },
    });
    fireEvent.change(screen.getByTestId("input-call-template-note"), {
      target: {
        value:
          "  Number on file is wrong or disconnected — flag with agent for an updated tenant contact.  ",
      },
    });

    fireEvent.click(screen.getByTestId("button-save-call-template"));

    // Modal closes after a successful save.
    expect(screen.queryByTestId("call-template-editor")).toBeNull();

    // The new template is now rendered as a third row alongside the
    // two seeded ones — name + (trimmed) note are both visible.
    expect(screen.getByText("Wrong number on file")).toBeTruthy();
    expect(
      screen.getByText(
        "Number on file is wrong or disconnected — flag with agent for an updated tenant contact.",
      ),
    ).toBeTruthy();
  });

  it("Edit → Save updates the row's fields in place (no duplicate row)", () => {
    render(<Harness initial={makeTemplates()} />);

    // Open the editor pre-filled with the first seeded template.
    fireEvent.click(
      screen.getByTestId("button-edit-call-template-call-tpl-seed-1"),
    );
    const editor = within(screen.getByTestId("call-template-editor"));
    const nameInput = editor.getByTestId(
      "input-call-template-name",
    ) as HTMLInputElement;
    const noteInput = editor.getByTestId(
      "input-call-template-note",
    ) as HTMLTextAreaElement;

    // The form is pre-filled with the existing row's values — that's
    // the contract that lets ops tweak a single field without re-
    // typing the rest. We assert it explicitly so a future refactor
    // of the modal can't quietly break the pre-fill.
    expect(nameInput.value).toBe("No answer — left voicemail");
    expect(noteInput.value).toBe(
      "No answer on the listed number — left a voicemail with the booking ref and a callback number.",
    );

    // Edit both fields and save.
    fireEvent.change(nameInput, {
      target: { value: "No answer — left voicemail (v2)" },
    });
    fireEvent.change(noteInput, {
      target: { value: "Updated voicemail copy after legal review." },
    });
    fireEvent.click(screen.getByTestId("button-save-call-template"));

    // Modal closes; the row's fields now reflect the edit and the old
    // values are gone (no duplicate row appeared). The other seeded
    // template is untouched as a control.
    expect(screen.queryByTestId("call-template-editor")).toBeNull();
    expect(screen.getByText("No answer — left voicemail (v2)")).toBeTruthy();
    expect(screen.queryByText("No answer — left voicemail")).toBeNull();
    expect(
      screen.getByText("Updated voicemail copy after legal review."),
    ).toBeTruthy();
    expect(screen.getByText("Spoke to them — confirmed window")).toBeTruthy();
  });

  it("Remove → confirm removes the row; cancelling confirm leaves it in place", () => {
    render(<Harness initial={makeTemplates()} />);

    // Stub window.confirm to deny — the row must stay put. The
    // editor modal should never open as a side effect of Remove.
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(
      screen.getByTestId("button-remove-call-template-call-tpl-seed-1"),
    );
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByText("No answer — left voicemail")).toBeTruthy();
    expect(screen.queryByTestId("call-template-editor")).toBeNull();

    // Now confirm Remove — the row disappears, the other seeded row
    // is untouched.
    confirmSpy.mockReturnValue(true);
    fireEvent.click(
      screen.getByTestId("button-remove-call-template-call-tpl-seed-1"),
    );
    expect(confirmSpy).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("No answer — left voicemail")).toBeNull();
    expect(
      screen.queryByTestId("call-template-row-call-tpl-seed-1"),
    ).toBeNull();
    expect(screen.getByText("Spoke to them — confirmed window")).toBeTruthy();

    confirmSpy.mockRestore();
  });

  it("Save is disabled while name is blank/whitespace; a fully whitespace draft never reaches onCreate", () => {
    const onCreate = vi.fn();
    const onUpdate = vi.fn();
    const onRemove = vi.fn();
    render(
      <CallTemplatesView
        templates={makeTemplates()}
        onCreate={onCreate}
        onUpdate={onUpdate}
        onRemove={onRemove}
      />,
    );

    fireEvent.click(screen.getByTestId("button-add-call-template"));
    const saveBtn = screen.getByTestId(
      "button-save-call-template",
    ) as HTMLButtonElement;
    const nameInput = screen.getByTestId(
      "input-call-template-name",
    ) as HTMLInputElement;
    const noteInput = screen.getByTestId(
      "input-call-template-note",
    ) as HTMLTextAreaElement;

    // Name input starts empty → Save is disabled out of the gate.
    expect(saveBtn.disabled).toBe(true);

    // Whitespace-only name → Save stays disabled. The form trims
    // before checking validity, so a "looks-filled" name of pure
    // spaces must NOT enable Save (otherwise the AdminApp handler's
    // own trim would turn it back into the empty string and we'd
    // ship a blank-name template).
    fireEvent.change(nameInput, { target: { value: "   " } });
    expect(saveBtn.disabled).toBe(true);

    // A non-blank note alone is NOT enough — name is the only
    // required field but it's still required.
    fireEvent.change(noteInput, { target: { value: "Some note text" } });
    expect(saveBtn.disabled).toBe(true);

    // Real name + (still-present) note → Save enables. Clicking
    // it fires onCreate exactly once with the normalized draft.
    fireEvent.change(nameInput, {
      target: { value: "Spoke briefly — they'll call back" },
    });
    expect(saveBtn.disabled).toBe(false);
    fireEvent.click(saveBtn);
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate).toHaveBeenCalledWith({
      name: "Spoke briefly — they'll call back",
      note: "Some note text",
    });
    expect(onUpdate).not.toHaveBeenCalled();
    expect(onRemove).not.toHaveBeenCalled();
  });
});

/**
 * Companion tests — mirror the harness style of the existing
 * `EmailTemplatesView.crud.test.tsx` cross-view block. We mount the
 * full `<AdminApp />`, add / edit a template through the panel, then
 * jump to the bulk Log-call form (Awaiting coordination) and the
 * per-row Log-call form (BookingDetail) and prove the picker reflects
 * the new shape immediately. All three views read from the same
 * `callTemplates` state held by AdminApp, so the change must show up
 * without any save / refresh / re-mount step in between.
 *
 * This is the cross-view consistency anchor for the panel: a future
 * refactor that accidentally splits the catalog state in two (e.g. a
 * panel-local copy that doesn't propagate up) would silently break
 * ops' "add a template, fire a batch with it" workflow — these tests
 * catch that.
 */
describe("CallTemplatesView ↔ Log-call cross-view consistency", () => {
  it("a template added via the panel is immediately pickable in the bulk Log-call dropdown", () => {
    render(<AdminApp />);

    // Switch to the "Call templates" view via the sidebar nav. The
    // sidebar buttons are plain <button> elements with the view label
    // as their accessible name.
    fireEvent.click(screen.getByRole("button", { name: "Call templates" }));

    // Add a uniquely-named template so we can prove it landed in the
    // dropdown without colliding with any of the seeded entries.
    const uniqueName = "QA-only — bulk dropdown smoke";
    fireEvent.click(screen.getByTestId("button-add-call-template"));
    fireEvent.change(screen.getByTestId("input-call-template-name"), {
      target: { value: uniqueName },
    });
    fireEvent.change(screen.getByTestId("input-call-template-note"), {
      target: { value: "Smoke test note" },
    });
    fireEvent.click(screen.getByTestId("button-save-call-template"));

    // The new row should be visible in the panel right away — sanity
    // check that the panel itself wired Save through to the catalog.
    expect(screen.getByText(uniqueName)).toBeTruthy();

    // Jump to the Awaiting-coordination queue and open the bulk Log-
    // call form. We pick a seeded coordination booking that's known
    // to be in the queue — `bk-1038`, the same row id used by the
    // existing bulk-timeline e2e and email-template cross-view
    // tests, so we don't have to re-prove the queue contents here.
    fireEvent.click(
      screen.getByRole("button", { name: "Awaiting coordination" }),
    );
    fireEvent.click(screen.getByTestId("checkbox-coordination-row-bk-1038"));
    fireEvent.click(screen.getByTestId("button-bulk-log-call"));

    // Dropdown contains the seeded `Custom…` sentinel + every entry
    // from the live catalog, including the one we just added.
    const select = screen.getByTestId(
      "select-bulk-call-template",
    ) as HTMLSelectElement;
    const optionLabels = Array.from(select.options).map((o) => o.textContent);
    expect(optionLabels).toContain("Custom…");
    expect(optionLabels).toContain(uniqueName);
    // Sanity: the seeded templates that AdminApp starts with are also
    // present, so the new entry was appended to (not replacing) the
    // existing catalog.
    for (const seeded of CALL_TEMPLATES) {
      expect(optionLabels).toContain(seeded.name);
    }
  });

  it("editing a template's name + note updates the per-row Log-call dropdown and the prefilled note for new submissions", () => {
    render(<AdminApp />);

    // Edit the first seeded template ("No answer — left voicemail")
    // through the panel — both the dropdown label and the suggested
    // note change. The panel writes through to the same
    // `callTemplates` state the per-row form reads from.
    fireEvent.click(screen.getByRole("button", { name: "Call templates" }));
    fireEvent.click(
      screen.getByTestId("button-edit-call-template-voicemail_left"),
    );
    const editor = within(screen.getByTestId("call-template-editor"));
    fireEvent.change(editor.getByTestId("input-call-template-name"), {
      target: { value: "Left voicemail (v2)" },
    });
    fireEvent.change(editor.getByTestId("input-call-template-note"), {
      target: {
        value: "Updated voicemail copy — references the new callback number.",
      },
    });
    fireEvent.click(screen.getByTestId("button-save-call-template"));

    // Jump to a coordination booking's detail screen and open the
    // per-row Log call form. `bk-1038` is the same anchor row used by
    // the cross-view bulk test.
    fireEvent.click(
      screen.getByRole("button", { name: "Awaiting coordination" }),
    );
    // Open the booking-detail screen by clicking the coordination row
    // (the `<tr>` is `role="button"` with the booking id baked into
    // its aria-label — same affordance ops use in the live UI).
    fireEvent.click(
      screen.getByRole("button", { name: /^Open booking bk-1038/ }),
    );
    fireEvent.click(screen.getByTestId("button-log-call"));

    // The per-row dropdown now shows the renamed template (and not
    // the old name) — same `callTemplates` state powers both forms.
    const select = screen.getByTestId(
      "select-call-template",
    ) as HTMLSelectElement;
    const optionLabels = Array.from(select.options).map((o) => o.textContent);
    expect(optionLabels).toContain("Left voicemail (v2)");
    expect(optionLabels).not.toContain("No answer — left voicemail");

    // Picking the renamed template prefills the new suggested note —
    // the per-row form reads `note` straight off the live catalog
    // entry, so the edit is visible to ops on the next pick.
    fireEvent.change(select, { target: { value: "voicemail_left" } });
    const noteInput = screen.getByTestId(
      "input-call-note",
    ) as HTMLTextAreaElement;
    expect(noteInput.value).toBe(
      "Updated voicemail copy — references the new callback number.",
    );
  });

  it("removing a template drops it from both Log-call dropdowns; the Custom… sentinel always stays and has no Remove control", () => {
    render(<AdminApp />);

    // Confirm the Custom… sentinel is NOT a real catalog row in the
    // panel — there's no Remove button keyed off the `custom` id, so
    // ops can't accidentally delete the free-text fallback by
    // clicking through the same affordance.
    fireEvent.click(screen.getByRole("button", { name: "Call templates" }));
    expect(
      screen.queryByTestId("button-remove-call-template-custom"),
    ).toBeNull();

    // Auto-confirm window.confirm so the Remove path actually fires
    // for every seeded template. Walking the full list also pins down
    // the "Custom… stays even with zero saved templates" guarantee
    // below.
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    for (const seeded of CALL_TEMPLATES) {
      fireEvent.click(
        screen.getByTestId(`button-remove-call-template-${seeded.id}`),
      );
    }
    confirmSpy.mockRestore();

    // Bulk Log-call dropdown — only Custom… remains; none of the
    // seeded names are still there.
    fireEvent.click(
      screen.getByRole("button", { name: "Awaiting coordination" }),
    );
    fireEvent.click(screen.getByTestId("checkbox-coordination-row-bk-1038"));
    fireEvent.click(screen.getByTestId("button-bulk-log-call"));
    const bulkSelect = screen.getByTestId(
      "select-bulk-call-template",
    ) as HTMLSelectElement;
    const bulkLabels = Array.from(bulkSelect.options).map(
      (o) => o.textContent,
    );
    expect(bulkLabels).toEqual(["Custom…"]);
    for (const seeded of CALL_TEMPLATES) {
      expect(bulkLabels).not.toContain(seeded.name);
    }
    // Cancel the bulk form so the per-row form below isn't competing
    // with the bulk panel for the action bar.
    fireEvent.click(screen.getByTestId("button-bulk-cancel-log-call"));

    // Per-row Log-call dropdown — same story. We open the same
    // `bk-1038` booking detail used by the other cross-view test
    // (the `<tr>` is `role="button"` with the booking id baked into
    // its aria-label).
    fireEvent.click(
      screen.getByRole("button", { name: /^Open booking bk-1038/ }),
    );
    fireEvent.click(screen.getByTestId("button-log-call"));
    const rowSelect = screen.getByTestId(
      "select-call-template",
    ) as HTMLSelectElement;
    const rowLabels = Array.from(rowSelect.options).map((o) => o.textContent);
    expect(rowLabels).toEqual(["Custom…"]);

    // Submitting through the empty-catalog state still works: the
    // form falls back to the Custom branch (sentinel value, no note),
    // so a previously-removed template can't break new submissions.
    // We type a free-text note + save and assert the form closed
    // (which is the per-row form's success exit) without throwing.
    fireEvent.change(screen.getByTestId("input-call-note"), {
      target: { value: "Free-text fallback after the catalog was emptied." },
    });
    fireEvent.click(screen.getByTestId("button-confirm-log-call"));
    expect(screen.queryByTestId("log-call-form")).toBeNull();
  });
});
