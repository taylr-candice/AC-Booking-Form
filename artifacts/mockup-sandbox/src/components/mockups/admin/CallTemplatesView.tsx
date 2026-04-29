/**
 * Admin "Call templates" panel.
 *
 * CRUD over the saved call-note templates that prefill the per-row
 * (`BookingDetail.LogCallForm`) and bulk (`AwaitingCoordinationView`)
 * Log-call dropdowns. Both forms read from the live state held in
 * `AdminApp`, so any add / edit / remove from this view is reflected
 * on the next render of those forms — no propagation step required.
 *
 * Snapshot-on-use: this view (and the forms it feeds) only own the
 * *catalog* of templates. When ops actually picks one in a Log-call
 * form, the form copies the template's note into its own input
 * state, and the bulk / per-row writers persist that literal string
 * onto the timeline. Editing or deleting a template here therefore
 * cannot rewrite history — entries already on a booking's timeline
 * keep the wording they were sent with.
 *
 * Mirror of {@link EmailTemplatesView} in shape — list + Add button
 * + modal editor for create / edit, with a single tabular row per
 * template — minus the Subject column (call notes are a single
 * free-text field, the outcome chip lives on a separate dropdown
 * and is intentionally NOT tied to a template).
 */

import { Edit3, Phone, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";

import {
  normalizeCallTemplateDraft,
  type CallTemplate,
} from "@/state/adminMockData";

import { FormField } from "./atoms";
import { BRAND } from "./theme";

export function CallTemplatesView({
  templates,
  onCreate,
  onUpdate,
  onRemove,
}: {
  templates: CallTemplate[];
  /** Append a new template to the catalog. The handler is responsible
   *  for stamping a fresh id (via {@link nextCallTemplateId}) so the
   *  view doesn't have to know how the rest of the catalog is keyed. */
  onCreate: (draft: { name: string; note: string }) => void;
  /** Replace the template with `id`'s mutable fields. */
  onUpdate: (id: string, draft: { name: string; note: string }) => void;
  /** Drop the template with `id` from the catalog. The per-row and
   *  bulk Log-call forms silently fall back to `Custom…` if the
   *  dropdown was on the removed template — historical timeline
   *  entries are never affected (snapshot-on-use). */
  onRemove: (id: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-[12px] text-slate-600">
          Call templates prefill the Log call dropdowns on the per-row
          BookingDetail and bulk Awaiting-coordination forms so ops can
          drop a saved call note in one click. The template's note is
          copied into the form when picked — editing or removing a
          template here never changes timeline entries that were
          already logged.
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          data-testid="button-add-call-template"
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold text-white"
          style={{ backgroundColor: BRAND }}
        >
          <Plus className="h-4 w-4" />
          Add template
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {templates.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-slate-500">
            <Phone className="h-5 w-5 text-slate-400" />
            <div className="text-[13px] font-medium text-slate-700">
              No saved templates yet
            </div>
            <div className="text-[12px]">
              Add one and it'll show up in the per-row and bulk Log
              call dropdowns immediately. The Custom… option always
              stays available for free-text notes.
            </div>
          </div>
        ) : (
          <table className="w-full text-left text-[13px]">
            <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Template</th>
                <th className="px-4 py-3 font-semibold">Suggested note</th>
                <th className="px-4 py-3 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr
                  key={t.id}
                  data-testid={`call-template-row-${t.id}`}
                  className="border-b border-slate-100 last:border-b-0 align-top"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{t.name}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-[12px] text-slate-600 whitespace-pre-wrap">
                      {t.note || (
                        <span className="italic text-slate-400">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setEditingId(t.id)}
                        data-testid={`button-edit-call-template-${t.id}`}
                        className="inline-flex items-center gap-1 text-[12px] font-semibold text-slate-600 hover:text-slate-900"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (
                            window.confirm(
                              `Remove "${t.name}" from the Call templates catalog? Timeline entries already logged with this template are kept as-is.`,
                            )
                          ) {
                            onRemove(t.id);
                          }
                        }}
                        data-testid={`button-remove-call-template-${t.id}`}
                        className="inline-flex items-center gap-1 text-[12px] font-semibold text-rose-600 hover:text-rose-800"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {(editingId || creating) && (
        <CallTemplateEditor
          template={
            editingId
              ? templates.find((t) => t.id === editingId)!
              : { id: "", name: "", note: "" }
          }
          isCreate={creating}
          onCancel={() => {
            setEditingId(null);
            setCreating(false);
          }}
          onSave={(draft) => {
            if (editingId) {
              onUpdate(editingId, draft);
              setEditingId(null);
            } else {
              onCreate(draft);
              setCreating(false);
            }
          }}
        />
      )}
    </div>
  );
}

function CallTemplateEditor({
  template,
  isCreate,
  onSave,
  onCancel,
}: {
  template: CallTemplate;
  isCreate: boolean;
  onSave: (draft: { name: string; note: string }) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState({
    name: template.name,
    note: template.note,
  });

  // Trim before checking validity so a Name field padded with spaces
  // doesn't sneak past the disabled state. The same trim runs in the
  // AdminApp handler before the template lands in the catalog, so the
  // form-level validity check can't get out of sync with the saved
  // shape. Note is optional (mirrors the per-row LogCallForm, where
  // a saved template can be a one-line label with no preset body).
  const normalized = normalizeCallTemplateDraft(draft);
  const canSave = normalized.name.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl"
        data-testid="call-template-editor"
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-500">
              {isCreate ? "New template" : "Edit template"}
            </div>
            <div className="text-[16px] font-semibold text-slate-900">
              Call template
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            data-testid="button-cancel-call-template"
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 flex flex-col gap-3">
          <FormField label="Name (shown in dropdown)">
            <input
              type="text"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="e.g. No answer — left voicemail"
              data-testid="input-call-template-name"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] focus:border-slate-400 focus:outline-none"
            />
          </FormField>
          <FormField label="Suggested note (optional)">
            <textarea
              value={draft.note}
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
              rows={3}
              placeholder="e.g. No answer on the listed number — left a voicemail with the booking ref and a callback number."
              data-testid="input-call-template-note"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] focus:border-slate-400 focus:outline-none"
            />
          </FormField>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave(normalized)}
            disabled={!canSave}
            data-testid="button-save-call-template"
            className="rounded-lg px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: BRAND }}
          >
            {isCreate ? "Create" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
