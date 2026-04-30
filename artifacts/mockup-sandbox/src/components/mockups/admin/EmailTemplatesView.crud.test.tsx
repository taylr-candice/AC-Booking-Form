// @vitest-environment happy-dom

/**
 * Regression tests for the admin "Email templates" CRUD panel.
 *
 * The view itself is a thin shell over four affordances — Add (modal),
 * Edit (modal pre-filled with the row's fields), Remove (window.confirm
 * guard), and the Save-disabled-when-blank rule on the editor modal.
 * Each path is wired through `EmailTemplatesView`'s `onCreate` /
 * `onUpdate` / `onRemove` callbacks, which `AdminApp` then routes into
 * the shared `emailTemplates` state that the bulk Log-email dropdown on
 * the Awaiting-coordination queue reads from.
 *
 * The hand-test loop (Add → Save → row appears, Edit → Save → fields
 * update, Remove → confirm → row disappears) was previously only
 * covered by the broader 605-test suite passing — refactoring the
 * editor modal or the AdminApp handlers could silently regress the
 * panel without anything failing. These tests pin the four CRUD paths
 * down explicitly.
 *
 * The companion AdminApp-mounted test at the bottom mirrors the
 * `AwaitingCoordinationView.bulkLogEmail.test.tsx` style: it confirms
 * a template added via the panel is immediately pickable in the bulk
 * Log-email dropdown without any propagation step, because both views
 * read from the same `emailTemplates` state held by `AdminApp`.
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
  EMAIL_TEMPLATES,
  setDefaultEmailTemplate,
  type EmailTemplate,
} from "@/state/adminMockData";

import { AdminApp } from "./AdminApp";
import {
  buildEmailTemplateRemoveConfirm,
  EmailTemplatesView,
} from "./EmailTemplatesView";

afterEach(() => {
  cleanup();
});

function makeTemplates(): EmailTemplate[] {
  return [
    {
      id: "tpl-seed-1",
      name: "Sent rebook link",
      subject: "Booking access — please pick a new window",
      note: "Sent rebook link so the tenant can grab a fresh appointment slot directly.",
    },
    {
      id: "tpl-seed-2",
      name: "Awaiting confirmation nudge",
      subject: "Quick nudge — please confirm your AC service window",
      note: "Polite nudge after no reply to the previous email.",
    },
  ];
}

/**
 * State harness so the panel re-renders after each callback fires —
 * matches how `AdminApp` wires the view, and is what makes the
 * row-appears / row-disappears assertions meaningful (without it the
 * `templates` prop would be frozen to the initial fixture).
 */
function Harness({ initial }: { initial: EmailTemplate[] }) {
  const [templates, setTemplates] = useState<EmailTemplate[]>(initial);
  return (
    <EmailTemplatesView
      templates={templates}
      onCreate={(draft) =>
        setTemplates((prev) => [
          ...prev,
          { id: `tpl-${prev.length + 1}`, ...draft },
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
      onSetDefault={(id) =>
        setTemplates((prev) => setDefaultEmailTemplate(prev, id))
      }
    />
  );
}

describe("EmailTemplatesView · CRUD", () => {
  it("Add → Save creates a new row visible in the panel", () => {
    render(<Harness initial={makeTemplates()} />);

    // Open the editor modal in "create" mode — it starts blank.
    fireEvent.click(screen.getByTestId("button-add-email-template"));
    expect(screen.getByTestId("email-template-editor")).toBeTruthy();

    // Fill in name + subject (the only two required fields) plus the
    // optional suggested-note. We pad each value with surrounding
    // whitespace so we also confirm the editor's normalize step
    // strips it before the row lands in the catalog — the trim must
    // run on Save, not on every keystroke (otherwise typing trailing
    // spaces becomes impossible).
    fireEvent.change(screen.getByTestId("input-email-template-name"), {
      target: { value: "  Sent parcel-locker instructions  " },
    });
    fireEvent.change(screen.getByTestId("input-email-template-subject"), {
      target: { value: "  Building access — parcel-locker instructions  " },
    });
    fireEvent.change(screen.getByTestId("input-email-template-note"), {
      target: {
        value:
          "  Sent parcel-locker / building access instructions so the tech can let themselves in on the day.  ",
      },
    });

    fireEvent.click(screen.getByTestId("button-save-email-template"));

    // Modal closes after a successful save.
    expect(screen.queryByTestId("email-template-editor")).toBeNull();

    // The new template is now rendered as a third row alongside the
    // two seeded ones — name + (trimmed) subject + (trimmed) note are
    // all visible.
    expect(screen.getByText("Sent parcel-locker instructions")).toBeTruthy();
    expect(
      screen.getByText("Building access — parcel-locker instructions"),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Sent parcel-locker / building access instructions so the tech can let themselves in on the day.",
      ),
    ).toBeTruthy();
  });

  it("Edit → Save updates the row's fields in place (no duplicate row)", () => {
    render(<Harness initial={makeTemplates()} />);

    // Open the editor pre-filled with the first seeded template.
    fireEvent.click(screen.getByTestId("button-edit-email-template-tpl-seed-1"));
    const editor = within(screen.getByTestId("email-template-editor"));
    const nameInput = editor.getByTestId(
      "input-email-template-name",
    ) as HTMLInputElement;
    const subjectInput = editor.getByTestId(
      "input-email-template-subject",
    ) as HTMLInputElement;
    const noteInput = editor.getByTestId(
      "input-email-template-note",
    ) as HTMLTextAreaElement;

    // The form is pre-filled with the existing row's values — that's
    // the contract that lets ops tweak a single field without re-
    // typing the rest. We assert it explicitly so a future refactor
    // of the modal can't quietly break the pre-fill.
    expect(nameInput.value).toBe("Sent rebook link");
    expect(subjectInput.value).toBe(
      "Booking access — please pick a new window",
    );
    expect(noteInput.value).toBe(
      "Sent rebook link so the tenant can grab a fresh appointment slot directly.",
    );

    // Edit all three fields and save.
    fireEvent.change(nameInput, { target: { value: "Sent rebook link (v2)" } });
    fireEvent.change(subjectInput, {
      target: { value: "Booking access — pick a new window" },
    });
    fireEvent.change(noteInput, {
      target: { value: "Updated body copy after legal review." },
    });
    fireEvent.click(screen.getByTestId("button-save-email-template"));

    // Modal closes; the row's fields now reflect the edit and the old
    // values are gone (no duplicate row appeared). The other seeded
    // template is untouched as a control.
    expect(screen.queryByTestId("email-template-editor")).toBeNull();
    expect(screen.getByText("Sent rebook link (v2)")).toBeTruthy();
    expect(screen.queryByText("Sent rebook link")).toBeNull();
    expect(
      screen.getByText("Booking access — pick a new window"),
    ).toBeTruthy();
    expect(screen.getByText("Updated body copy after legal review.")).toBeTruthy();
    expect(screen.getByText("Awaiting confirmation nudge")).toBeTruthy();
  });

  it("Remove → confirm removes the row; cancelling confirm leaves it in place", () => {
    render(<Harness initial={makeTemplates()} />);

    // Stub window.confirm to deny — the row must stay put. The
    // editor modal should never open as a side effect of Remove.
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(screen.getByTestId("button-remove-email-template-tpl-seed-1"));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Sent rebook link")).toBeTruthy();
    expect(screen.queryByTestId("email-template-editor")).toBeNull();

    // Now confirm Remove — the row disappears, the other seeded row
    // is untouched.
    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getByTestId("button-remove-email-template-tpl-seed-1"));
    expect(confirmSpy).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("Sent rebook link")).toBeNull();
    expect(screen.queryByTestId("email-template-row-tpl-seed-1")).toBeNull();
    expect(screen.getByText("Awaiting confirmation nudge")).toBeTruthy();

    confirmSpy.mockRestore();
  });

  it("Remove confirm → 0 references path: shows the reassuring copy when usage is zero", () => {
    render(<Harness initial={makeTemplates()} />);

    expect(
      screen.getByTestId("email-template-usage-tpl-seed-1").textContent,
    ).toBe("No timeline entries reference this template");

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(
      screen.getByTestId("button-remove-email-template-tpl-seed-1"),
    );
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy).toHaveBeenCalledWith(
      buildEmailTemplateRemoveConfirm("Sent rebook link", 0),
    );
    const message = confirmSpy.mock.calls[0]?.[0] as string;
    expect(message).toContain("No timeline entries reference this template");
    expect(message).not.toMatch(/Referenced by/i);
    expect(message).not.toMatch(/historical entries/i);

    confirmSpy.mockRestore();
  });

  it("Remove confirm → N>0 references path: warns with the count and reassurance; cancelling leaves the row in place", () => {
    function PinnedHarness({ initial }: { initial: EmailTemplate[] }) {
      const [templates, setTemplates] = useState<EmailTemplate[]>(initial);
      return (
        <EmailTemplatesView
          templates={templates}
          usageCounts={{
            "tpl-seed-1": 4,
            "tpl-seed-2": 1,
          }}
          onCreate={() => {}}
          onUpdate={() => {}}
          onRemove={(id) =>
            setTemplates((prev) => prev.filter((t) => t.id !== id))
          }
          onSetDefault={() => {}}
        />
      );
    }
    render(<PinnedHarness initial={makeTemplates()} />);

    expect(
      screen.getByTestId("email-template-usage-tpl-seed-1").textContent,
    ).toBe("Referenced by 4 timeline entries");
    expect(
      screen.getByTestId("email-template-usage-tpl-seed-2").textContent,
    ).toBe("Referenced by 1 timeline entry");

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(
      screen.getByTestId("button-remove-email-template-tpl-seed-1"),
    );
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy).toHaveBeenCalledWith(
      buildEmailTemplateRemoveConfirm("Sent rebook link", 4),
    );
    const pluralMsg = confirmSpy.mock.calls[0]?.[0] as string;
    expect(pluralMsg).toContain("4 timeline entries");
    expect(pluralMsg).toContain("historical entries are preserved");
    expect(screen.getByTestId("email-template-row-tpl-seed-1")).toBeTruthy();

    confirmSpy.mockReturnValue(true);
    fireEvent.click(
      screen.getByTestId("button-remove-email-template-tpl-seed-2"),
    );
    expect(confirmSpy).toHaveBeenCalledTimes(2);
    expect(confirmSpy).toHaveBeenLastCalledWith(
      buildEmailTemplateRemoveConfirm("Awaiting confirmation nudge", 1),
    );
    const singularMsg = confirmSpy.mock.calls[1]?.[0] as string;
    expect(singularMsg).toContain("1 timeline entry");
    expect(singularMsg).not.toContain("1 timeline entries");
    expect(screen.queryByTestId("email-template-row-tpl-seed-2")).toBeNull();

    confirmSpy.mockRestore();
  });

  it("Save is disabled while name or subject is blank/whitespace; a fully whitespace draft never reaches onCreate", () => {
    const onCreate = vi.fn();
    const onUpdate = vi.fn();
    const onRemove = vi.fn();
    render(
      <EmailTemplatesView
        templates={makeTemplates()}
        onCreate={onCreate}
        onUpdate={onUpdate}
        onRemove={onRemove}
        onSetDefault={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("button-add-email-template"));
    const saveBtn = screen.getByTestId(
      "button-save-email-template",
    ) as HTMLButtonElement;
    const nameInput = screen.getByTestId(
      "input-email-template-name",
    ) as HTMLInputElement;
    const subjectInput = screen.getByTestId(
      "input-email-template-subject",
    ) as HTMLInputElement;

    // Both inputs start empty — Save is disabled out of the gate.
    expect(saveBtn.disabled).toBe(true);

    // Name only → still disabled (subject is required too).
    fireEvent.change(nameInput, { target: { value: "Just a name" } });
    expect(saveBtn.disabled).toBe(true);

    // Whitespace-only subject → Save stays disabled. The form trims
    // before checking validity, so a "looks-filled" subject of pure
    // spaces must NOT enable Save (otherwise the AdminApp handler's
    // own trim would turn it back into the empty string and we'd
    // ship a blank-subject template).
    fireEvent.change(subjectInput, { target: { value: "   " } });
    expect(saveBtn.disabled).toBe(true);

    // Same trap on the name field.
    fireEvent.change(nameInput, { target: { value: "   " } });
    fireEvent.change(subjectInput, { target: { value: "Real subject" } });
    expect(saveBtn.disabled).toBe(true);

    // Both fields populated with real text → Save enables. Clicking
    // it fires onCreate exactly once with the normalized draft. We
    // didn't fill the optional note, so it should round-trip as the
    // empty string.
    fireEvent.change(nameInput, { target: { value: "Sent agent intro" } });
    fireEvent.change(subjectInput, {
      target: { value: "Coordinating your AC service" },
    });
    expect(saveBtn.disabled).toBe(false);
    fireEvent.click(saveBtn);
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate).toHaveBeenCalledWith({
      name: "Sent agent intro",
      subject: "Coordinating your AC service",
      note: "",
    });
    expect(onUpdate).not.toHaveBeenCalled();
    expect(onRemove).not.toHaveBeenCalled();
  });
});

/**
 * Companion test — mirrors the harness style of the existing
 * `AwaitingCoordinationView.bulkLogEmail.test.tsx`. We mount the full
 * `<AdminApp />`, add a template through the panel, then jump to the
 * Awaiting-coordination queue and open the bulk Log-email form. The
 * dropdown reads from the same `emailTemplates` state held by AdminApp,
 * so the new template must appear without any save / refresh / re-mount
 * step in between.
 *
 * This is the cross-view consistency anchor for the panel: a future
 * refactor that accidentally splits the catalog state in two (e.g. a
 * panel-local copy that doesn't propagate up) would silently break ops'
 * "add a template, fire a batch with it" workflow — this test catches
 * that.
 */
describe("EmailTemplatesView ↔ bulk Log email cross-view consistency", () => {
  it("a template added via the panel is immediately pickable in the bulk Log-email dropdown", () => {
    render(<AdminApp />);

    // Switch to the "Email templates" view via the sidebar nav. The
    // sidebar buttons are plain <button> elements with the view label
    // as their accessible name.
    fireEvent.click(
      screen.getByRole("button", { name: "Email templates" }),
    );

    // Add a uniquely-named template so we can prove it landed in the
    // dropdown without colliding with any of the seeded entries.
    const uniqueName = "QA-only — bulk dropdown smoke";
    fireEvent.click(screen.getByTestId("button-add-email-template"));
    fireEvent.change(screen.getByTestId("input-email-template-name"), {
      target: { value: uniqueName },
    });
    fireEvent.change(screen.getByTestId("input-email-template-subject"), {
      target: { value: "Smoke test subject" },
    });
    fireEvent.change(screen.getByTestId("input-email-template-note"), {
      target: { value: "Smoke test note" },
    });
    fireEvent.click(screen.getByTestId("button-save-email-template"));

    // The new row should be visible in the panel right away — sanity
    // check that the panel itself wired Save through to the catalog.
    expect(screen.getByText(uniqueName)).toBeTruthy();

    // Jump to the Awaiting-coordination queue and open the bulk Log-
    // email form. We pick a seeded coordination booking that's known
    // to be in the queue; the same row id used by the existing bulk-
    // timeline e2e test (`bk-1038`) so we don't have to re-prove the
    // queue contents here.
    fireEvent.click(
      screen.getByRole("button", { name: "Awaiting coordination" }),
    );
    fireEvent.click(screen.getByTestId("checkbox-coordination-row-bk-1038"));
    fireEvent.click(screen.getByTestId("button-bulk-log-email"));

    // Dropdown contains the seeded `Custom…` sentinel + every entry
    // from the live catalog, including the one we just added.
    const select = screen.getByTestId(
      "select-bulk-email-template",
    ) as HTMLSelectElement;
    const optionLabels = Array.from(select.options).map((o) => o.textContent);
    expect(optionLabels).toContain("Custom…");
    expect(optionLabels).toContain(uniqueName);
    // Sanity: the seeded templates that AdminApp starts with are also
    // present, so the new entry was appended to (not replacing) the
    // existing catalog.
    for (const seeded of EMAIL_TEMPLATES) {
      expect(optionLabels).toContain(seeded.name);
    }
  });

  it("bulk-logging an email through a seeded template surfaces the live reference count on the panel and in the Remove confirm", () => {
    render(<AdminApp />);

    const tpl = EMAIL_TEMPLATES[0];

    fireEvent.click(
      screen.getByRole("button", { name: "Awaiting coordination" }),
    );
    fireEvent.click(screen.getByTestId("checkbox-coordination-row-bk-1038"));
    fireEvent.click(screen.getByTestId("checkbox-coordination-row-bk-1044"));
    fireEvent.click(screen.getByTestId("button-bulk-log-email"));
    fireEvent.change(screen.getByTestId("select-bulk-email-template"), {
      target: { value: tpl.id },
    });
    fireEvent.click(screen.getByTestId("button-bulk-confirm-log-email"));

    fireEvent.click(
      screen.getByRole("button", { name: "Email templates" }),
    );
    expect(
      screen.getByTestId(`email-template-usage-${tpl.id}`).textContent,
    ).toBe("Referenced by 2 timeline entries");

    const untouched = EMAIL_TEMPLATES.find((t) => t.id !== tpl.id);
    if (untouched) {
      expect(
        screen.getByTestId(`email-template-usage-${untouched.id}`).textContent,
      ).toBe("No timeline entries reference this template");
    }

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(
      screen.getByTestId(`button-remove-email-template-${tpl.id}`),
    );
    const message = confirmSpy.mock.calls[0]?.[0] as string;
    expect(message).toContain(`"${tpl.name}"`);
    expect(message).toContain("2 timeline entries");
    expect(message).toContain("historical entries are preserved");
    expect(screen.getByTestId(`email-template-row-${tpl.id}`)).toBeTruthy();

    confirmSpy.mockRestore();
  });
});
