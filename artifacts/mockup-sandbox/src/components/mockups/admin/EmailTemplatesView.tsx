/**
 * Admin "Email templates" panel.
 *
 * CRUD over the saved email templates that prefill the bulk Log-email
 * dropdown on the Awaiting-coordination queue. The dropdown reads
 * directly from the live state held in `AdminApp`, so any add / edit /
 * remove from this view is reflected on the next render of that form
 * — no propagation step required.
 *
 * Snapshot-on-use: this view (and the bulk form it feeds) only owns
 * the *catalog* of templates. When ops actually picks one in the
 * Log-email form, the form copies the template's subject + note into
 * its own input state, and `buildBulkLogEmailEntry` writes those
 * literal strings into the timeline. Editing or deleting a template
 * here therefore cannot rewrite history — entries already on a
 * booking's timeline keep the wording they were sent with.
 *
 * Mirror of {@link AgentsView} in shape: list + Add button + modal
 * editor for create / edit, with a single tabular row per template.
 */

import { Edit3, Mail, Plus, Star, Trash2, X } from "lucide-react";
import { useState } from "react";

import {
  normalizeEmailTemplateDraft,
  type EmailTemplate,
  type TemplateUsageBooking,
} from "@/state/adminMockData";

import { FormField } from "./atoms";
import { TemplateUsagePopover } from "./TemplateUsagePopover";
import { BRAND } from "./theme";

/** Mirror of {@link buildCallTemplateRemoveConfirm} for the email
 *  channel. Exported so tests can pin the exact string. */
export function buildEmailTemplateRemoveConfirm(
  name: string,
  usage: number,
): string {
  if (usage === 0) {
    return `Remove "${name}" from the Email templates catalog? No timeline entries reference this template — nothing else changes.`;
  }
  const entryWord = usage === 1 ? "entry" : "entries";
  return `Remove "${name}" from the Email templates catalog? This template is referenced by ${usage} timeline ${entryWord} — historical entries are preserved (snapshot-on-use), but the shortcut will no longer be available in the bulk Log email dropdown.`;
}

export function EmailTemplatesView({
  templates,
  usageCounts,
  usageBookings,
  onOpenBooking,
  onCreate,
  onUpdate,
  onRemove,
  onSetDefault,
}: {
  templates: EmailTemplate[];
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
   *  for stamping a fresh id (via {@link nextEmailTemplateId}) so the
   *  view doesn't have to know how the rest of the catalog is keyed. */
  onCreate: (draft: { name: string; subject: string; note: string }) => void;
  /** Replace the template with `id`'s mutable fields. */
  onUpdate: (
    id: string,
    draft: { name: string; subject: string; note: string },
  ) => void;
  /** Drop the template with `id` from the catalog. The bulk Log-email
   *  form silently falls back to `Custom…` if the dropdown was on the
   *  removed template — historical timeline entries are never
   *  affected (snapshot-on-use). */
  onRemove: (id: string) => void;
  /** Toggle the default flag on the given template. */
  onSetDefault: (id: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-[12px] text-slate-600">
          Email templates prefill the bulk Log email form on the Awaiting
          coordination queue so ops can fire a templated email-out across a
          batch in one click. The template's subject + note are copied into
          the form when picked — editing or removing a template here never
          changes timeline entries that were already logged.
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          data-testid="button-add-email-template"
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
            <Mail className="h-5 w-5 text-slate-400" />
            <div className="text-[13px] font-medium text-slate-700">
              No saved templates yet
            </div>
            <div className="text-[12px]">
              Add one and it'll show up in the bulk Log email dropdown
              immediately. The Custom… option always stays available for
              free-text emails.
            </div>
          </div>
        ) : (
          <table className="w-full text-left text-[13px]">
            <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold w-12">Default</th>
                <th className="px-4 py-3 font-semibold">Template</th>
                <th className="px-4 py-3 font-semibold">Subject</th>
                <th className="px-4 py-3 font-semibold">Suggested note</th>
                <th className="px-4 py-3 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => {
                const usage = usageCounts?.[t.id] ?? 0;
                const bookings = usageBookings?.[t.id] ?? [];
                return (
                  <tr
                    key={t.id}
                    data-testid={`email-template-row-${t.id}`}
                    className="border-b border-slate-100 last:border-b-0 align-top"
                  >
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => onSetDefault(t.id)}
                        data-testid={`button-default-email-template-${t.id}`}
                        data-default={t.isDefault ? "true" : "false"}
                        aria-pressed={t.isDefault ? true : false}
                        aria-label={
                          t.isDefault
                            ? `Unset "${t.name}" as the default Email template`
                            : `Set "${t.name}" as the default Email template`
                        }
                        title={
                          t.isDefault
                            ? "Default — Log-email dropdowns open pre-selected on this template. Click to unset."
                            : "Set as default — the per-row and bulk Log-email dropdowns will open pre-selected on this template."
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
                      <div className="font-medium text-slate-900">{t.name}</div>
                      <TemplateUsagePopover
                        kind="email"
                        testIdSuffix={t.id}
                        templateName={t.name}
                        usage={usage}
                        bookings={bookings}
                        onOpenBooking={onOpenBooking}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-[12px] text-slate-700">
                        {t.subject || (
                          <span className="italic text-slate-400">—</span>
                        )}
                      </div>
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
                          data-testid={`button-edit-email-template-${t.id}`}
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
                                buildEmailTemplateRemoveConfirm(t.name, usage),
                              )
                            ) {
                              onRemove(t.id);
                            }
                          }}
                          data-testid={`button-remove-email-template-${t.id}`}
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
        <EmailTemplateEditor
          template={
            editingId
              ? templates.find((t) => t.id === editingId)!
              : { id: "", name: "", subject: "", note: "" }
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

function EmailTemplateEditor({
  template,
  isCreate,
  onSave,
  onCancel,
}: {
  template: EmailTemplate;
  isCreate: boolean;
  onSave: (draft: { name: string; subject: string; note: string }) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState({
    name: template.name,
    subject: template.subject,
    note: template.note,
  });

  // Trim before checking validity so a Name field padded with spaces
  // doesn't sneak past the disabled state. The same trim runs in the
  // AdminApp handler before the template lands in the catalog, so the
  // form-level validity check can't get out of sync with the saved
  // shape.
  const normalized = normalizeEmailTemplateDraft(draft);
  const canSave =
    normalized.name.length > 0 && normalized.subject.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl"
        data-testid="email-template-editor"
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-500">
              {isCreate ? "New template" : "Edit template"}
            </div>
            <div className="text-[16px] font-semibold text-slate-900">
              Email template
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            data-testid="button-cancel-email-template"
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
              placeholder="e.g. Sent NSW Fair Trading explainer"
              data-testid="input-email-template-name"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] focus:border-slate-400 focus:outline-none"
            />
          </FormField>
          <FormField label="Subject">
            <input
              type="text"
              value={draft.subject}
              onChange={(e) =>
                setDraft({ ...draft, subject: e.target.value })
              }
              placeholder="e.g. Booking access — please confirm window"
              data-testid="input-email-template-subject"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] focus:border-slate-400 focus:outline-none"
            />
          </FormField>
          <FormField label="Suggested note (optional)">
            <textarea
              value={draft.note}
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
              rows={3}
              placeholder="e.g. Sent rebook link so the tenant can grab a fresh appointment slot directly."
              data-testid="input-email-template-note"
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
            data-testid="button-save-email-template"
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
