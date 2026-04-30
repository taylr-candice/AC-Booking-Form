/**
 * Custom-dropdown picker for the Log call / Log email template
 * selection — shared between the bulk forms on
 * `AwaitingCoordinationView` and the per-row forms on
 * `BookingDetail`. Shows the same per-template 7-day usage sparkline
 * the templates panels render, which a native `<option>` can't hold.
 *
 * Paired at each call site with an sr-only `<select>` that keeps the
 * existing form-control plumbing (and existing change-event tests)
 * working — the listbox is purely visual, the `<select>` is the
 * source of truth.
 *
 * Behaviour beyond the basic listbox (preserved when this component
 * was extracted from the previously-inline `BulkTemplatePickerDropdown`
 * on AwaitingCoordinationView):
 *  - Full keyboard navigation (ArrowUp/Down/Home/End/Enter/Space/
 *    Escape/Tab) driven from the listbox via aria-activedescendant
 *    (Task #206).
 *  - Each option row is rendered as a `div role="option"` rather than
 *    a `<button>` so the per-option sparkline can host its own nested
 *    `<button>` bars and the day-scoped drill-down popover (Task #209)
 *    without nesting buttons.
 *  - The outside-click handler treats clicks landing inside the
 *    sparkline's portaled drill-down popover as inside the dropdown,
 *    so a booking-row click inside the popover lands before the
 *    listbox unmounts.
 */
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { ChevronDown, Star } from "lucide-react";

import type {
  TemplateUsageBooking,
  TemplateUsageTrendPoint,
} from "@/state/adminMockData";

import { TemplateUsageSparkline } from "./TemplateUsageSparkline";
import { BRAND, BRAND_SOFT } from "./theme";

export type TemplatePickerOption = {
  id: string;
  label: string;
  isDefault: boolean;
  /** Rolling 7-day usage trend rendered as a sparkline next to the
   *  option. Omit on the synthetic "Custom…" row so it stays
   *  sparkline-free, matching the templates panel's behaviour. */
  trend?: ReadonlyArray<TemplateUsageTrendPoint>;
  /** Per-day list of bookings whose timeline touched this template on
   *  each UTC day in the trend window (Task #209). Outer key is the
   *  same `YYYY-MM-DD` date key the matching `trend` entry carries.
   *  Drives the sparkline's day-scoped drill-down popover so admins
   *  can investigate a spike from the picker without bouncing back
   *  to the Templates panel. Omit to leave bars non-interactive. */
  bookingsByDay?: Readonly<Record<string, ReadonlyArray<TemplateUsageBooking>>>;
};

export function TemplatePickerDropdown({
  triggerId,
  triggerTestId,
  optionTestIdPrefix,
  sparklineTemplateIdPrefix,
  kind,
  customId,
  customLabel,
  options,
  value,
  onChange,
  onOpenBooking,
}: {
  triggerId: string;
  triggerTestId: string;
  optionTestIdPrefix: string;
  /** Prefixed onto each option's template id when forming the
   *  sparkline's `data-testid`. Lets each call site namespace its
   *  sparklines (e.g. `bulk-` for the bulk forms vs `row-` for the
   *  per-row forms) so multiple instances on the same page can't
   *  collide. */
  sparklineTemplateIdPrefix: string;
  kind: "call" | "email";
  customId: string;
  customLabel: string;
  options: ReadonlyArray<TemplatePickerOption>;
  value: string;
  onChange: (id: string) => void;
  /** Click-through handler for a booking row inside a sparkline's
   *  day-scoped drill-down popover (Task #209). Wired to the same
   *  `onOpen` the queue rows use so the admin lands on the matching
   *  BookingDetail. Omit to leave the sparkline bars non-interactive. */
  onOpenBooking?: (bookingId: string) => void;
}) {
  const allRows: TemplatePickerOption[] = [
    { id: customId, label: customLabel, isDefault: false },
    ...options,
  ];
  const selectedIndex = Math.max(
    0,
    allRows.findIndex((r) => r.id === value),
  );
  const selected = allRows[selectedIndex]!;
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listboxRef = useRef<HTMLUListElement | null>(null);
  // Type-to-jump buffer (printable characters typed inside the open
  // listbox accumulate here so the highlight jumps to the next matching
  // option, mirroring what a native <select> does for free). Repeated
  // single-letter presses cycle through matches; the buffer resets
  // after a short idle so a new search can start fresh.
  const typeAheadBufferRef = useRef("");
  const typeAheadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const optionDomId = (rowId: string) => `${optionTestIdPrefix}-${rowId}-opt`;

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      if (!containerRef.current) return;
      const target = e.target as Node | null;
      if (!target) return;
      if (containerRef.current.contains(target)) return;
      // The per-option sparkline's day-scoped drill-down popover is
      // portaled outside this dropdown's container (Task #209). Treat
      // clicks landing inside it as inside the dropdown so the
      // listbox stays mounted long enough for a booking-row click to
      // fire its onClick before unmounting — otherwise the React
      // re-render triggered by `setOpen(false)` here would unmount
      // the popover before the click event lands on the row.
      if (
        target instanceof Element &&
        target.closest(
          `[data-testid^="${kind}-template-usage-sparkline-popover-"]`,
        )
      ) {
        return;
      }
      setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [open, kind]);

  // When the popover opens, move focus to the listbox so keyboard
  // navigation (ArrowUp/Down/Home/End) is announced via
  // aria-activedescendant. The initial activeIndex is set by whichever
  // open path ran (click, ArrowDown, Home, End, ...).
  useEffect(() => {
    if (!open) return;
    const node = listboxRef.current;
    if (node) node.focus();
  }, [open]);

  // Keep the highlighted option scrolled into view as the user
  // arrow-keys through a long list.
  useEffect(() => {
    if (!open) return;
    const list = listboxRef.current;
    if (!list) return;
    const active = list.querySelector(
      `#${CSS.escape(optionDomId(allRows[activeIndex]!.id))}`,
    );
    if (active && "scrollIntoView" in active) {
      (active as HTMLElement).scrollIntoView({ block: "nearest" });
    }
  }, [open, activeIndex, allRows, optionTestIdPrefix]);

  // Drop any pending type-to-jump search when the popover closes (or
  // the picker unmounts) so the next open starts with a fresh buffer
  // and no stray timer fires after teardown.
  useEffect(() => {
    if (!open) {
      typeAheadBufferRef.current = "";
      if (typeAheadTimerRef.current !== null) {
        clearTimeout(typeAheadTimerRef.current);
        typeAheadTimerRef.current = null;
      }
    }
    return () => {
      if (typeAheadTimerRef.current !== null) {
        clearTimeout(typeAheadTimerRef.current);
        typeAheadTimerRef.current = null;
      }
    };
  }, [open]);

  function closeAndRefocusTrigger() {
    setOpen(false);
    // Wait for the listbox to unmount before returning focus, so the
    // trigger doesn't fight the popover's focus management.
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  // Move the highlight to the next option whose label starts with the
  // accumulated typed buffer (case-insensitive). Behaviour mirrors a
  // native <select>:
  //   - First printable key sets the buffer and jumps to the first
  //     match starting at the current highlight (so a row that already
  //     matches stays put).
  //   - Pressing the same single letter again cycles to the next match
  //     starting *after* the current highlight (wraps around).
  //   - Pressing a different letter within the idle window appends to
  //     the buffer and re-searches from the current highlight.
  // The buffer resets after ~500ms of no typing so a fresh prefix can
  // start a new search.
  function handleTypeAhead(char: string) {
    const lower = char.toLowerCase();
    if (typeAheadTimerRef.current !== null) {
      clearTimeout(typeAheadTimerRef.current);
    }
    typeAheadTimerRef.current = setTimeout(() => {
      typeAheadBufferRef.current = "";
      typeAheadTimerRef.current = null;
    }, 500);

    let newBuffer: string;
    let startIdx: number;
    if (typeAheadBufferRef.current === lower) {
      // Same single letter pressed again — cycle to the next match.
      newBuffer = lower;
      startIdx = (activeIndex + 1) % allRows.length;
    } else {
      newBuffer = typeAheadBufferRef.current + lower;
      startIdx = activeIndex;
    }

    for (let i = 0; i < allRows.length; i++) {
      const idx = (startIdx + i) % allRows.length;
      const row = allRows[idx]!;
      if (row.label.toLowerCase().startsWith(newBuffer)) {
        setActiveIndex(idx);
        break;
      }
    }

    typeAheadBufferRef.current = newBuffer;
  }

  function commitOption(index: number) {
    const row = allRows[index];
    if (!row) return;
    onChange(row.id);
    closeAndRefocusTrigger();
  }

  function handleTriggerKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (open) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex(
        e.key === "ArrowDown"
          ? Math.min(allRows.length - 1, selectedIndex)
          : selectedIndex,
      );
      setOpen(true);
    } else if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      setOpen(true);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIndex(0);
      setOpen(true);
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveIndex(allRows.length - 1);
      setOpen(true);
    }
  }

  function handleListboxKeyDown(e: KeyboardEvent<HTMLUListElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(allRows.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveIndex(allRows.length - 1);
    } else if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      commitOption(activeIndex);
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeAndRefocusTrigger();
    } else if (e.key === "Tab") {
      // Let Tab move focus away naturally, but close the popover so the
      // hidden <select> isn't shadowed by a stale highlight.
      setOpen(false);
    } else if (
      // Type-to-jump: any single printable character (letters,
      // digits, punctuation) without a modifier moves the highlight
      // to the next matching option. Space is reserved above for
      // commit, so it never falls through to here.
      e.key.length === 1 &&
      e.key !== " " &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey
    ) {
      e.preventDefault();
      handleTypeAhead(e.key);
    }
  }

  const activeRow = allRows[activeIndex];
  const activeDescendantId =
    open && activeRow ? optionDomId(activeRow.id) : undefined;

  return (
    <div ref={containerRef} className="relative flex-1">
      <button
        ref={triggerRef}
        type="button"
        id={triggerId}
        data-testid={triggerTestId}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${optionTestIdPrefix}-listbox` : undefined}
        onClick={() => {
          setOpen((o) => {
            if (!o) setActiveIndex(selectedIndex);
            return !o;
          });
        }}
        onKeyDown={handleTriggerKeyDown}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-left text-[12px] text-slate-800 hover:border-slate-400"
      >
        <span className="truncate">{selected.label}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 flex-none text-slate-500 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open ? (
        <ul
          ref={listboxRef}
          id={`${optionTestIdPrefix}-listbox`}
          role="listbox"
          aria-labelledby={triggerId}
          aria-activedescendant={activeDescendantId}
          tabIndex={-1}
          onKeyDown={handleListboxKeyDown}
          data-testid={`${optionTestIdPrefix}-listbox`}
          className="absolute z-20 mt-1 flex w-full flex-col gap-0.5 rounded-lg border border-slate-200 bg-white p-1 shadow-lg focus:outline-none"
        >
          {allRows.map((row, idx) => {
            const isSelected = row.id === value;
            const isActive = idx === activeIndex;
            return (
              <li key={row.id} className="m-0 list-none">
                {/* Option row is a `div` (not a `button`) so the
                    sparkline's day-scoped drill-down popover (Task #209)
                    — which renders its own nested `<button>` bars and
                    booking-row buttons — can sit legally inside this
                    row without nesting buttons. Keyboard navigation
                    (ArrowUp/Down/Home/End/Enter/Space — Task #206) is
                    driven by the parent listbox via aria-activedescendant,
                    so this row only needs an `id` for the
                    aria-activedescendant pointer plus mouse-enter sync
                    so hover and the keyboard highlight stay aligned. */}
                <div
                  id={optionDomId(row.id)}
                  role="option"
                  aria-selected={isSelected}
                  tabIndex={-1}
                  onClick={() => commitOption(idx)}
                  onMouseEnter={() => setActiveIndex(idx)}
                  data-testid={`${optionTestIdPrefix}-${row.id}`}
                  data-value={row.id}
                  data-selected={isSelected ? "true" : "false"}
                  data-active={isActive ? "true" : "false"}
                  className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-[12px] hover:bg-slate-50"
                  style={
                    isSelected
                      ? {
                          backgroundColor: BRAND_SOFT,
                          boxShadow: `inset 0 0 0 1px ${BRAND}`,
                        }
                      : isActive
                        ? { backgroundColor: "#f1f5f9" }
                        : undefined
                  }
                >
                  <span className="flex min-w-0 flex-1 items-center gap-1.5">
                    <span className="truncate font-medium text-slate-800">
                      {row.label}
                    </span>
                    {row.isDefault ? (
                      <span
                        className="inline-flex flex-none items-center gap-0.5 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700"
                        title={`Default ${kind === "call" ? "Call" : "Email"} template`}
                        aria-label="Default template"
                      >
                        <Star className="h-2.5 w-2.5" fill="currentColor" />
                        Default
                      </span>
                    ) : null}
                  </span>
                  {row.trend ? (
                    /* Stop click propagation so a sparkline-bar click
                       (open day-scoped popover) doesn't bubble up and
                       trigger this option row's `onClick`, which would
                       select the template and close the listbox before
                       the popover ever opens. */
                    <span
                      className="flex-none"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <TemplateUsageSparkline
                        kind={kind}
                        templateId={`${sparklineTemplateIdPrefix}${row.id}`}
                        trend={row.trend}
                        templateName={row.label}
                        bookingsByDay={row.bookingsByDay}
                        onOpenBooking={onOpenBooking}
                      />
                    </span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
