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

import { ArrowDownWideNarrow, Edit3, GripVertical, Phone, Pin, Plus, Star, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  findDefaultCallTemplate,
  normalizeCallTemplateDraft,
  type CallTemplate,
  type TemplateUsageBooking,
  type TemplateUsageTrendPoint,
} from "@/state/adminMockData";

import { FormField } from "./atoms";
import { LatestTouchBadge } from "./LatestTouchBadge";
import { TemplateUsagePopover } from "./TemplateUsagePopover";
import { TemplateUsageSparkline } from "./TemplateUsageSparkline";
import { BRAND, BRAND_SOFT } from "./theme";

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
  latestTouchCounts,
  usageTrends,
  usageBookingsByDay,
  onOpenFilteredBookings,
  onOpenBooking,
  onCreate,
  onUpdate,
  onRemove,
  onSetDefault,
  onReorder,
  focusedTemplateId,
}: {
  templates: CallTemplate[];
  /** Per-template count of timeline entries referencing each template,
   *  keyed by template id. Defaults to 0 per template. */
  usageCounts?: Readonly<Record<string, number>>;
  /** Per-template list of bookings referencing each template, keyed
   *  by template id. Drives the drill-down popover. */
  usageBookings?: Readonly<Record<string, ReadonlyArray<TemplateUsageBooking>>>;
  /** Per-template count of bookings whose **latest** call touch
   *  references each template, keyed by template id (Task #160).
   *  Drives the "Used in N bookings" pivot badge — same predicate
   *  the BookingsView template filter uses, so the count rendered
   *  here equals the row count the admin will see after clicking
   *  through. Defaults to 0 per template. */
  latestTouchCounts?: Readonly<Record<string, number>>;
  /** Per-template rolling 7-day usage trend keyed by template id
   *  (Task #171). Each entry is an oldest-first → most-recent-last
   *  array of `{ date, count }` buckets sourced from
   *  {@link getTemplateUsageTrend}; the sparkline renders the
   *  underlying numbers in its hover `title`. Omit to suppress the
   *  sparkline entirely (the templates panel still works). */
  usageTrends?: Readonly<Record<string, ReadonlyArray<TemplateUsageTrendPoint>>>;
  /** Per-template, per-day list of bookings whose timeline touched
   *  each template on each UTC day in the sparkline window
   *  (Task #197). Outer key is the template id, inner key is the
   *  same `YYYY-MM-DD` date key the matching `usageTrends` entry
   *  carries. Drives the click-to-filter drill-down popover that
   *  opens when an admin clicks a non-zero sparkline bar. Omit to
   *  leave bars non-interactive (the trend itself still renders). */
  usageBookingsByDay?: Readonly<
    Record<string, Readonly<Record<string, ReadonlyArray<TemplateUsageBooking>>>>
  >;
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
  /** Reorder the catalog so the row with `fromId` is moved to the
   *  position currently held by `toId`. Wired to the per-row drag
   *  handles — both rows are always non-default (the default stays
   *  pinned at the top, see {@link reorderCallTemplates}). When
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
  //   - the "Default Call template" header link (transient amber
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

  // Sort toggle (Task #170 + #193). `default` keeps the natural
  // catalog order; `mostUsed` re-sorts the non-default rows by the
  // "Used in N bookings" badge that LatestTouchBadge renders (latest-
  // touch-only — the same predicate the BookingsView template filter
  // uses) so an admin spotting an over-used template can push the
  // busiest rows to the top in one click; `mostReferenced` re-sorts
  // by the history-wide reference count surfaced on the
  // TemplateUsagePopover ("Referenced by N timeline entries"), which
  // is dedup-per-booking but counts every booking the template was
  // ever sent on rather than just bookings whose freshest touch is
  // this template — useful for hygiene work like spotting the
  // template the team has historically leaned on the most. The
  // default row stays pinned at the top regardless of sort mode —
  // the per-row Pin icon and copy already promise that, and re-
  // sorting it down would conflict with the existing default-pinning
  // contract.
  const [sortMode, setSortMode] = useState<
    "default" | "mostUsed" | "mostReferenced"
  >("default");

  const defaultTemplate = findDefaultCallTemplate(templates);

  // Pin the default row to the top of the list so ops never has to
  // scroll to find it once the catalog grows past a handful of
  // entries. The remaining rows keep their existing seed / catalog
  // order so non-default rows stay where ops expects them — unless
  // the admin has flipped the sort toggle to "Most used first", in
  // which case non-default rows are stable-sorted by their latest-
  // touch usage count (descending). Ties are broken by the rows'
  // current order so the list stays stable across re-renders. The
  // sort happens at render time only — the underlying catalog state
  // is not mutated, so flipping the toggle back restores the seed
  // order verbatim.
  const orderedTemplates = useMemo(() => {
    const nonDefault = defaultTemplate
      ? templates.filter((t) => t.id !== defaultTemplate.id)
      : templates;
    let sortedNonDefault: typeof nonDefault;
    if (sortMode === "mostUsed") {
      sortedNonDefault = [...nonDefault].sort(
        (a, b) =>
          (latestTouchCounts?.[b.id] ?? 0) -
          (latestTouchCounts?.[a.id] ?? 0),
      );
    } else if (sortMode === "mostReferenced") {
      sortedNonDefault = [...nonDefault].sort(
        (a, b) => (usageCounts?.[b.id] ?? 0) - (usageCounts?.[a.id] ?? 0),
      );
    } else {
      sortedNonDefault = nonDefault;
    }
    return defaultTemplate
      ? [defaultTemplate, ...sortedNonDefault]
      : sortedNonDefault;
  }, [templates, defaultTemplate, sortMode, latestTouchCounts, usageCounts]);

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
    if (!onReorder || sortMode !== "default") return;
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
          <div
            data-testid="text-call-templates-reorder-sandbox-note"
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
          data-testid="button-add-call-template"
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
        data-testid="call-templates-reorder-live-region"
        className="sr-only"
      >
        {liveMessage}
      </div>

      {templates.length > 0 ? (
        <div className="flex items-center justify-end gap-2 text-[12px] text-slate-600">
          <span className="text-slate-500">Sort:</span>
          <div
            className="inline-flex items-center rounded-lg border border-slate-200 bg-white p-0.5"
            data-testid="sort-toggle-call-templates"
            data-sort-mode={sortMode}
          >
            <button
              type="button"
              onClick={() => setSortMode("default")}
              data-testid="button-sort-call-templates-default"
              aria-pressed={sortMode === "default"}
              title="Show templates in their natural catalog order. The default row stays pinned at the top."
              className={
                sortMode === "default"
                  ? "rounded-md bg-slate-900 px-2.5 py-1 text-[12px] font-semibold text-white"
                  : "rounded-md px-2.5 py-1 text-[12px] font-semibold text-slate-600 hover:bg-slate-100"
              }
            >
              Default order
            </button>
            <button
              type="button"
              onClick={() => setSortMode("mostUsed")}
              data-testid="button-sort-call-templates-most-used"
              aria-pressed={sortMode === "mostUsed"}
              title="Sort non-default rows by the 'Used in N bookings' badge — busiest templates jump to the top. Ties keep their current order."
              className={
                sortMode === "mostUsed"
                  ? "inline-flex items-center gap-1 rounded-md bg-slate-900 px-2.5 py-1 text-[12px] font-semibold text-white"
                  : "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[12px] font-semibold text-slate-600 hover:bg-slate-100"
              }
            >
              <ArrowDownWideNarrow className="h-3 w-3" />
              Most used first
            </button>
            <button
              type="button"
              onClick={() => setSortMode("mostReferenced")}
              data-testid="button-sort-call-templates-most-referenced"
              aria-pressed={sortMode === "mostReferenced"}
              title="Sort non-default rows by the 'Referenced by N timeline entries' history-wide count — templates the team has leaned on the most overall jump to the top. Ties keep their current order."
              className={
                sortMode === "mostReferenced"
                  ? "inline-flex items-center gap-1 rounded-md bg-slate-900 px-2.5 py-1 text-[12px] font-semibold text-white"
                  : "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[12px] font-semibold text-slate-600 hover:bg-slate-100"
              }
            >
              <ArrowDownWideNarrow className="h-3 w-3" />
              Most referenced overall
            </button>
          </div>
        </div>
      ) : null}

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
                <th className="px-2 py-3 font-semibold w-8" aria-label="Drag to reorder"></th>
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
                const latestTouch = latestTouchCounts?.[t.id] ?? 0;
                const trend = usageTrends?.[t.id];
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
                    data-testid={`call-template-row-${t.id}`}
                    data-highlighted={
                      highlightedId === t.id ? "true" : "false"
                    }
                    data-focused={isFocused ? "true" : undefined}
                    data-pulsing={isPulsing ? "true" : undefined}
                    data-dragging={isDragging ? "true" : undefined}
                    data-drop-target={isDropTarget ? "true" : undefined}
                    draggable={!t.isDefault && sortMode === "default"}
                    onDragStart={(e) => {
                      if (t.isDefault || sortMode !== "default") return;
                      // Some browsers refuse to start a drag without
                      // any payload on the dataTransfer — empty string
                      // is enough to satisfy them, the actual id is
                      // tracked in component state so reorder works
                      // even when the synthetic test event has no
                      // dataTransfer at all.
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
                      if (
                        !draggingId ||
                        t.isDefault ||
                        draggingId === t.id ||
                        sortMode !== "default"
                      ) {
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
                      if (
                        !from ||
                        t.isDefault ||
                        from === t.id ||
                        sortMode !== "default"
                      ) {
                        return;
                      }
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
                          data-testid={`call-template-pinned-${t.id}`}
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
                          const isDefaultOrder = sortMode === "default";
                          return (
                            <button
                              type="button"
                              disabled={!isDefaultOrder}
                              ref={(el) => {
                                dragHandleRefs.current.set(t.id, el);
                              }}
                              data-testid={`drag-handle-call-template-${t.id}`}
                              aria-label={
                                isDefaultOrder
                                  ? `Reorder "${t.name}".${positionLabel} Press Up or Down arrow to move, Home or End to jump to top or bottom.`
                                  : `Reorder is disabled while sorted by usage`
                              }
                              aria-keyshortcuts={isDefaultOrder ? "ArrowUp ArrowDown Home End" : undefined}
                              title={
                                isDefaultOrder
                                  ? "Drag, or press Up/Down arrow keys to reorder"
                                  : "Reorder is disabled while sorted by usage"
                              }
                              onKeyDown={(e) => {
                                if (!isDefaultOrder) return;
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
                              className={
                                isDefaultOrder
                                  ? "inline-flex h-7 w-5 cursor-grab items-center justify-center rounded text-slate-400 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-1 active:cursor-grabbing"
                                  : "inline-flex h-7 w-5 cursor-not-allowed items-center justify-center text-slate-300"
                              }
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
                      <LatestTouchBadge
                        kind="call"
                        templateId={t.id}
                        templateName={t.name}
                        count={latestTouch}
                        onOpenFilteredBookings={onOpenFilteredBookings}
                      />
                      {trend ? (
                        <TemplateUsageSparkline
                          kind="call"
                          templateId={t.id}
                          trend={trend}
                          templateName={t.name}
                          bookingsByDay={usageBookingsByDay?.[t.id]}
                          onOpenBooking={onOpenBooking}
                        />
                      ) : null}
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
