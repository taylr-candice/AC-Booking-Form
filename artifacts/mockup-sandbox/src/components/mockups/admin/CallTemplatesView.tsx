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

import { Edit3, Phone, Plus, Star, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  findDefaultCallTemplate,
  normalizeCallTemplateDraft,
  type CallTemplate,
  type TemplateUsageBooking,
} from "@/state/adminMockData";

import { FormField } from "./atoms";
import { TemplateUsagePopover } from "./TemplateUsagePopover";
import { BRAND } from "./theme";

/**
 * Build the `window.confirm` message shown when ops clicks Remove on
 * a Call template. Returns the reassuring copy when no timeline
 * entries reference the template, or a warning with the live count
 * when some do. Exported so tests can pin the exact string.
 */
export function buildCallTemplateRemoveConfirm(
  name: string,
  usage: number,
): string {
  if (usage === 0) {
    return `Remove "${name}" from the Call templates catalog? No timeline entries reference this template — nothing else changes.`;
  }
  const entryWord = usage === 1 ? "entry" : "entries";
  return `Remove "${name}" from the Call templates catalog? This template is referenced by ${usage} timeline ${entryWord} — historical entries are preserved (snapshot-on-use), but the shortcut will no longer be available in the per-row and bulk Log call dropdowns.`;
}

export function CallTemplatesView({
  templates,
  usageCounts,
  usageBookings,
  onOpenBooking,
  onCreate,
  onUpdate,
  onRemove,
  onSetDefault,
}: {
  templates: CallTemplate[];
  /** Per-template count of timeline entries referencing each template,
   *  keyed by template id. Defaults to 0 per template. */
  usageCounts?: Readonly<Record<string, number>>;
  /** Per-template list of bookings referencing each template, keyed
   *  by template id. Drives the drill-down popover. */
  usageBookings?: Readonly<Record<string, ReadonlyArray<TemplateUsageBooking>>>;
  /** Called when a booking row inside the drill-down popover is
   *  clicked. */
  onOpenBooking?: (bookingId: string) => void;
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
  /** Toggle the default flag on the given template. */
  onSetDefault: (id: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const rowRefs = useRef<Map<string, HTMLTableRowElement | null>>(new Map());

  // Auto-clear the row highlight a moment after it's set, so the panel
  // stays visually quiet once ops has spotted the matching row.
  useEffect(() => {
    if (!highlightedId) return;
    const t = setTimeout(() => setHighlightedId(null), 1500);
    return () => clearTimeout(t);
  }, [highlightedId]);

  const defaultTemplate = findDefaultCallTemplate(templates);

  // Pin the default row to the top of the list so ops never has to
  // scroll to find it once the catalog grows past a handful of
  // entries. The remaining rows keep their existing seed / catalog
  // order so non-default rows stay where ops expects them.
  const orderedTemplates = defaultTemplate
    ? [
        defaultTemplate,
        ...templates.filter((t) => t.id !== defaultTemplate.id),
      ]
    : templates;

  const focusDefaultRow = () => {
    if (!defaultTemplate) return;
    const row = rowRefs.current.get(defaultTemplate.id);
    if (row && typeof row.scrollIntoView === "function") {
      row.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    setHighlightedId(defaultTemplate.id);
  };

  return (
    <div className="flex flex-col gap-4">
      <div
        data-testid="call-templates-default-header"
        className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[12px] text-slate-600"
      >
        <Star
          className={
            defaultTemplate
              ? "h-3.5 w-3.5 text-amber-500"
              : "h-3.5 w-3.5 text-slate-300"
          }
          fill={defaultTemplate ? "currentColor" : "none"}
        />
        <span>Default Call template:</span>
        {defaultTemplate ? (
          <button
            type="button"
            onClick={focusDefaultRow}
            data-testid="link-call-templates-default"
            className="font-semibold text-slate-900 underline-offset-2 hover:underline"
            title="Jump to this template in the list below"
          >
            {defaultTemplate.name}
          </button>
        ) : (
          <span
            data-testid="text-call-templates-default-empty"
            className="italic text-slate-500"
          >
            No default set — Log-call dropdowns open on Custom…
          </span>
        )}
      </div>
      <div className="flex items-start justify-between gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-[12px] text-slate-600">
          Call templates prefill the Log call dropdowns on the per-row
          BookingDetail and bulk Awaiting-coordination forms so ops can
          drop a saved call note in one click. The template's note is
          copied into the form when picked — editing or removing a
          template here never changes timeline entries that were
          already logged.
          <div className="mt-2">
            Click the star in the <strong>Default</strong> column to
            promote a row — that template will pre-select in every
            Log-call dropdown. Click the active star again to clear the
            default and have the dropdowns open on Custom… instead.
          </div>
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
                <th className="px-4 py-3 font-semibold w-12">Default</th>
                <th className="px-4 py-3 font-semibold">Template</th>
                <th className="px-4 py-3 font-semibold">Suggested note</th>
                <th className="px-4 py-3 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {orderedTemplates.map((t) => {
                const usage = usageCounts?.[t.id] ?? 0;
                const bookings = usageBookings?.[t.id] ?? [];
                return (
                  <tr
                    key={t.id}
                    ref={(el) => {
                      rowRefs.current.set(t.id, el);
                    }}
                    data-testid={`call-template-row-${t.id}`}
                    data-highlighted={
                      highlightedId === t.id ? "true" : "false"
                    }
                    className={
                      highlightedId === t.id
                        ? "border-b border-slate-100 last:border-b-0 align-top bg-amber-50 transition-colors"
                        : "border-b border-slate-100 last:border-b-0 align-top transition-colors"
                    }
                  >
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => onSetDefault(t.id)}
                        data-testid={`button-default-call-template-${t.id}`}
                        data-default={t.isDefault ? "true" : "false"}
                        aria-pressed={t.isDefault ? true : false}
                        aria-label={
                          t.isDefault
                            ? `Unset "${t.name}" as the default Call template`
                            : `Set "${t.name}" as the default Call template`
                        }
                        title={
                          t.isDefault
                            ? "Default — Log-call dropdowns open pre-selected on this template. Click to unset."
                            : "Set as default — the per-row and bulk Log-call dropdowns will open pre-selected on this template."
                        }
                        className={
                          t.isDefault
                            ? "inline-flex h-7 w-7 items-center justify-center rounded-md text-amber-500 hover:bg-amber-50"
                            : "inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-300 hover:bg-slate-100 hover:text-slate-500"
                        }
                      >
                        <Star
                          className="h-4 w-4"
                          fill={t.isDefault ? "currentColor" : "none"}
                        />
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-900">
                          {t.name}
                        </span>
                        {t.isDefault ? (
                          <span
                            data-testid={`pill-default-call-template-${t.id}`}
                            className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700"
                            title="Default — Log-call dropdowns open pre-selected on this template."
                          >
                            <Star
                              className="h-2.5 w-2.5"
                              fill="currentColor"
                            />
                            Default
                          </span>
                        ) : null}
                      </div>
                      <TemplateUsagePopover
                        kind="call"
                        testIdSuffix={t.id}
                        templateName={t.name}
                        usage={usage}
                        bookings={bookings}
                        onOpenBooking={onOpenBooking}
                      />
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
                                buildCallTemplateRemoveConfirm(t.name, usage),
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
                );
              })}
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
