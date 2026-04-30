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

import { Edit3, GripVertical, Mail, Pin, Plus, Star, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  findDefaultEmailTemplate,
  normalizeEmailTemplateDraft,
  type EmailTemplate,
  type TemplateUsageBooking,
} from "@/state/adminMockData";

import { FormField } from "./atoms";
import { LatestTouchBadge } from "./LatestTouchBadge";
import { TemplateUsagePopover } from "./TemplateUsagePopover";
import { BRAND, BRAND_SOFT } from "./theme";

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
  latestTouchCounts,
  onOpenFilteredBookings,
  onOpenBooking,
  onCreate,
  onUpdate,
  onRemove,
  onSetDefault,
  onReorder,
  focusedTemplateId,
}: {
  templates: EmailTemplate[];
  /** Per-template count of timeline entries referencing each template,
   *  keyed by template id. Defaults to 0 per template. */
  usageCounts?: Readonly<Record<string, number>>;
  /** Per-template list of bookings referencing each template, keyed
   *  by template id. Drives the drill-down popover. */
  usageBookings?: Readonly<Record<string, ReadonlyArray<TemplateUsageBooking>>>;
  /** Per-template count of bookings whose **latest** email touch
   *  references each template, keyed by template id (Task #160).
   *  Drives the "Used in N bookings" pivot badge — same predicate
   *  the BookingsView template filter uses, so the count rendered
   *  here equals the row count the admin will see after clicking
   *  through. Defaults to 0 per template. */
  latestTouchCounts?: Readonly<Record<string, number>>;
  /** Click-through handler for the "Used in N bookings" badge.
   *  Receives the template's current name (the filter is
   *  snapshot-on-use so it matches the literal string the timeline
   *  carries). The AdminApp shell switches to the bookings list,
   *  clears the other filters, and seeds the "latest touch used
   *  this template" pivot on the freshly-mounted BookingsView. */
  onOpenFilteredBookings?: (templateName: string) => void;
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
  /** Reorder the catalog so the row with `fromId` is moved to the
   *  position currently held by `toId`. Wired to the per-row drag
   *  handles — both rows are always non-default (the default stays
   *  pinned at the top, see {@link reorderEmailTemplates}). When
   *  omitted the drag handles still render but do nothing, which
   *  keeps the per-view tests that don't care about reorder simple. */
  onReorder?: (fromId: string, toId: string) => void;
  /** Round-trip with Task #149's "Referenced by N entries" popover:
   *  when the admin clicks a `From template: <name>` chip on a
   *  booking timeline (Task #155), the AdminApp shell switches to
   *  this view and stamps the matched template id here. The matching
   *  row gets a soft brand-tinted background and is scrolled into
   *  view so the admin can immediately see which row was opened.
   *  `null` means no row is focused (the default). The shell drops
   *  the focus state on the next sidebar nav (see `handleNav` in
   *  `AdminApp`) so a subsequent re-entry to this panel opens clean. */
  focusedTemplateId?: string | null;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  // Drag-and-drop reorder state (Task #164). `draggingId` is the row
  // currently being dragged; `dragOverId` is the row the cursor is
  // hovering over and would drop onto. Both are scoped to non-default
  // rows — the default row is `draggable={false}` and refuses drops
  // (the row stays pinned regardless of drag state). Cleared on
  // `dragend` so a cancelled drag (Esc, drop outside) leaves no
  // visual residue.
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  // Keyboard reorder support (Task #174). The grip handle is a real
  // focusable button — ArrowUp/ArrowDown swap the row past its
  // immediate neighbour in the movable (non-default) list, Home/End
  // jump to the top/bottom of that list. After every keyboard move
  // we re-focus the moved row's grip handle so consecutive presses
  // keep nudging the same row, and we update the screen-reader live
  // region with the row's new 1-based position.
  const dragHandleRefs = useRef<Map<string, HTMLButtonElement | null>>(
    new Map(),
  );
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);
  const [liveMessage, setLiveMessage] = useState<string>("");
  // Single shared ref-map covering both row-scroll callers:
  //   - the "Default Email template" header link (transient amber
  //     highlight that auto-clears),
  //   - the AdminApp round-trip from a booking timeline chip
  //     (Task #155, persistent BRAND_SOFT highlight cleared on
  //     sidebar nav).
  const rowRefs = useRef<Map<string, HTMLTableRowElement | null>>(new Map());
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  // One-shot pulse marker (Task #165). Set whenever the AdminApp
  // shell hands us a fresh `focusedTemplateId` so the matching row
  // briefly flashes a deeper-pink background on top of the persistent
  // BRAND_SOFT tint — making the landing row unmistakable on long
  // template lists. Tied to the focus-id change (not the scroll
  // position), so scrolling away and back doesn't replay it. Reduced-
  // motion users still get the static BRAND_SOFT highlight; the CSS
  // `prefers-reduced-motion` rule simply suppresses the animation.
  const [pulseId, setPulseId] = useState<string | null>(null);

  // Auto-clear the row highlight a moment after it's set, so the panel
  // stays visually quiet once ops has spotted the matching row.
  useEffect(() => {
    if (!highlightedId) return;
    const t = setTimeout(() => setHighlightedId(null), 1500);
    return () => clearTimeout(t);
  }, [highlightedId]);

  // Whenever the AdminApp shell hands us a fresh focus id (round-trip
  // from a booking timeline chip), scroll the matching row into view
  // so the admin doesn't have to hunt for it on long template lists,
  // and trigger the one-shot pulse marker so the landing is obvious.
  // We intentionally don't drop the persistent focus highlight here —
  // it stays until the user navigates away via the sidebar so a quick
  // scroll back doesn't lose the marker.
  useEffect(() => {
    if (!focusedTemplateId) return;
    const row = rowRefs.current.get(focusedTemplateId);
    if (row && typeof row.scrollIntoView === "function") {
      row.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    setPulseId(focusedTemplateId);
  }, [focusedTemplateId]);

  // Drop the one-shot pulse marker once the animation has had time to
  // play. 1100ms gives the 1s keyframe a small buffer so the class is
  // still on the row through the final frame. The marker re-arms the
  // next time `focusedTemplateId` changes.
  useEffect(() => {
    if (!pulseId) return;
    const t = setTimeout(() => setPulseId(null), 1100);
    return () => clearTimeout(t);
  }, [pulseId]);

  const defaultTemplate = findDefaultEmailTemplate(templates);

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

  // Reorderable rows in display order — the default is pinned and
  // refuses both ends of a reorder, so it's intentionally excluded
  // from the movable list. Used for both the keyboard move targets
  // and the per-row "position N of M" label that the grip handle
  // exposes to assistive tech.
  const movableTemplates = orderedTemplates.filter((t) => !t.isDefault);

  // Re-focus the grip handle of the row that was just moved by the
  // keyboard. The reorder runs through `onReorder` so the templates
  // prop (and therefore the rendered row order) updates *before* this
  // effect fires; resetting `pendingFocusId` afterwards prevents the
  // focus from following the row across an unrelated re-render.
  useEffect(() => {
    if (!pendingFocusId) return;
    const handle = dragHandleRefs.current.get(pendingFocusId);
    if (handle && typeof handle.focus === "function") {
      handle.focus();
    }
    setPendingFocusId(null);
  }, [templates, pendingFocusId]);

  const handleKeyboardMove = (
    currentId: string,
    direction: "up" | "down" | "first" | "last",
  ) => {
    if (!onReorder) return;
    const idx = movableTemplates.findIndex((t) => t.id === currentId);
    if (idx === -1) return;
    let targetIdx: number;
    if (direction === "up") targetIdx = idx - 1;
    else if (direction === "down") targetIdx = idx + 1;
    else if (direction === "first") targetIdx = 0;
    else targetIdx = movableTemplates.length - 1;
    if (
      targetIdx < 0 ||
      targetIdx >= movableTemplates.length ||
      targetIdx === idx
    ) {
      return;
    }
    const targetId = movableTemplates[targetIdx].id;
    const moved = movableTemplates[idx];
    onReorder(currentId, targetId);
    setPendingFocusId(currentId);
    setLiveMessage(
      `Moved "${moved.name}" to position ${targetIdx + 1} of ${movableTemplates.length}.`,
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div
        data-testid="email-templates-default-header"
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
        <span>Default Email template:</span>
        {defaultTemplate ? (
          <button
            type="button"
            onClick={focusDefaultRow}
            data-testid="link-email-templates-default"
            className="font-semibold text-slate-900 underline-offset-2 hover:underline"
            title="Jump to this template in the list below"
          >
            {defaultTemplate.name}
          </button>
        ) : (
          <span
            data-testid="text-email-templates-default-empty"
            className="italic text-slate-500"
          >
            No default set — Log-email dropdowns open on Custom…
          </span>
        )}
      </div>
      <div className="flex items-start justify-between gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-[12px] text-slate-600">
          Email templates prefill the bulk Log email form on the Awaiting
          coordination queue so ops can fire a templated email-out across a
          batch in one click. The template's subject + note are copied into
          the form when picked — editing or removing a template here never
          changes timeline entries that were already logged.
          <div className="mt-2">
            Click the star in the <strong>Default</strong> column to
            promote a row — that template will pre-select in every
            Log-email dropdown. Click the active star again to clear the
            default and have the dropdowns open on Custom… instead.
          </div>
          <div
            data-testid="text-email-templates-reorder-sandbox-note"
            className="mt-2 italic text-slate-500"
          >
            Drag the grip handle to reorder rows. Heads-up: this is a
            sandbox preview, so the manual order resets to the seed on
            a full page refresh.
          </div>
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

      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid="email-templates-reorder-live-region"
        className="sr-only"
      >
        {liveMessage}
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
                <th className="px-2 py-3 font-semibold w-8" aria-label="Drag to reorder"></th>
                <th className="px-4 py-3 font-semibold w-12">Default</th>
                <th className="px-4 py-3 font-semibold">Template</th>
                <th className="px-4 py-3 font-semibold">Subject</th>
                <th className="px-4 py-3 font-semibold">Suggested note</th>
                <th className="px-4 py-3 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {orderedTemplates.map((t) => {
                const usage = usageCounts?.[t.id] ?? 0;
                const bookings = usageBookings?.[t.id] ?? [];
                const latestTouch = latestTouchCounts?.[t.id] ?? 0;
                const isFocused = focusedTemplateId === t.id;
                const isPulsing = pulseId === t.id;
                const isDragging = draggingId === t.id;
                const isDropTarget =
                  dragOverId === t.id &&
                  draggingId !== null &&
                  draggingId !== t.id &&
                  !t.isDefault;
                return (
                  <tr
                    key={t.id}
                    ref={(el) => {
                      rowRefs.current.set(t.id, el);
                    }}
                    data-testid={`email-template-row-${t.id}`}
                    data-highlighted={
                      highlightedId === t.id ? "true" : "false"
                    }
                    data-focused={isFocused ? "true" : undefined}
                    data-pulsing={isPulsing ? "true" : undefined}
                    data-dragging={isDragging ? "true" : undefined}
                    data-drop-target={isDropTarget ? "true" : undefined}
                    draggable={!t.isDefault}
                    onDragStart={(e) => {
                      if (t.isDefault) return;
                      try {
                        e.dataTransfer.setData("text/plain", t.id);
                        e.dataTransfer.effectAllowed = "move";
                      } catch {
                        // happy-dom / older test envs
                      }
                      setDraggingId(t.id);
                    }}
                    onDragEnd={() => {
                      setDraggingId(null);
                      setDragOverId(null);
                    }}
                    onDragOver={(e) => {
                      if (!draggingId || t.isDefault || draggingId === t.id) {
                        return;
                      }
                      e.preventDefault();
                      try {
                        e.dataTransfer.dropEffect = "move";
                      } catch {
                        // happy-dom / older test envs
                      }
                      if (dragOverId !== t.id) setDragOverId(t.id);
                    }}
                    onDragLeave={() => {
                      if (dragOverId === t.id) setDragOverId(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const from = draggingId;
                      setDraggingId(null);
                      setDragOverId(null);
                      if (!from || t.isDefault || from === t.id) return;
                      onReorder?.(from, t.id);
                    }}
                    className={
                      isDropTarget
                        ? "border-b border-slate-100 last:border-b-0 align-top bg-slate-50 outline outline-2 outline-offset-[-2px] transition-colors"
                        : highlightedId === t.id
                        ? "border-b border-slate-100 last:border-b-0 align-top bg-amber-50 transition-colors"
                        : `border-b border-slate-100 last:border-b-0 align-top transition-colors${
                            isPulsing ? " template-row-focus-pulse" : ""
                          }${isDragging ? " opacity-50" : ""}${
                            isDropTarget ? " outline outline-2 outline-offset-[-2px]" : ""
                          }`
                    }
                    style={{
                      ...(isFocused && highlightedId !== t.id && !isDropTarget
                        ? { backgroundColor: BRAND_SOFT }
                        : null),
                      ...(isDropTarget ? { outlineColor: BRAND } : null),
                      ...(isDragging ? { opacity: 0.5 } : null),
                    }}
                  >
                    <td className="px-2 py-3 align-middle">
                      {t.isDefault ? (
                        <span
                          data-testid={`email-template-pinned-${t.id}`}
                          aria-label="Pinned to the top — default template"
                          title="Default templates stay pinned at the top of the list and can't be reordered."
                          className="inline-flex h-7 w-5 items-center justify-center text-amber-400"
                        >
                          <Pin className="h-3.5 w-3.5" fill="currentColor" />
                        </span>
                      ) : (
                        (() => {
                          const movableIdx = movableTemplates.findIndex(
                            (m) => m.id === t.id,
                          );
                          const movableTotal = movableTemplates.length;
                          const positionLabel =
                            movableIdx >= 0
                              ? ` Currently at position ${movableIdx + 1} of ${movableTotal}.`
                              : "";
                          return (
                            <button
                              type="button"
                              ref={(el) => {
                                dragHandleRefs.current.set(t.id, el);
                              }}
                              data-testid={`drag-handle-email-template-${t.id}`}
                              aria-label={`Reorder "${t.name}".${positionLabel} Press Up or Down arrow to move, Home or End to jump to top or bottom.`}
                              aria-keyshortcuts="ArrowUp ArrowDown Home End"
                              title="Drag, or press Up/Down arrow keys to reorder"
                              onKeyDown={(e) => {
                                if (e.key === "ArrowUp") {
                                  e.preventDefault();
                                  handleKeyboardMove(t.id, "up");
                                } else if (e.key === "ArrowDown") {
                                  e.preventDefault();
                                  handleKeyboardMove(t.id, "down");
                                } else if (e.key === "Home") {
                                  e.preventDefault();
                                  handleKeyboardMove(t.id, "first");
                                } else if (e.key === "End") {
                                  e.preventDefault();
                                  handleKeyboardMove(t.id, "last");
                                }
                              }}
                              className="inline-flex h-7 w-5 cursor-grab items-center justify-center rounded text-slate-400 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-1 active:cursor-grabbing"
                            >
                              <GripVertical className="h-4 w-4" />
                            </button>
                          );
                        })()
                      )}
                    </td>
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
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-900">
                          {t.name}
                        </span>
                        {t.isDefault ? (
                          <span
                            data-testid={`pill-default-email-template-${t.id}`}
                            className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700"
                            title="Default — Log-email dropdowns open pre-selected on this template."
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
                        kind="email"
                        testIdSuffix={t.id}
                        templateName={t.name}
                        usage={usage}
                        bookings={bookings}
                        onOpenBooking={onOpenBooking}
                      />
                      <LatestTouchBadge
                        kind="email"
                        templateId={t.id}
                        templateName={t.name}
                        count={latestTouch}
                        onOpenFilteredBookings={onOpenFilteredBookings}
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
