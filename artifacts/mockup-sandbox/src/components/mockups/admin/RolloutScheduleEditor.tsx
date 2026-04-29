/**
 * Per-rollout schedule editor.
 *
 * Shown when an admin opens a single {@link AdminRollout}. Lets them:
 *   - toggle each day on/off
 *   - toggle each window's `openByAdmin` flag (stage vs. release)
 *   - edit per-window capacity inline (slot count or window minutes)
 *   - reset a window's utilization (with a confirm + toast undo)
 *
 * Capacity edits and reset both share the same confirm-then-undo pattern
 * so the admin can always recover from a wrong click without having to
 * dig into the database. The undo toast lives in component state — it's
 * not persisted, just a 6-second visual safety net.
 */

import {
  AlertTriangle,
  ArrowLeft,
  CalendarRange,
  Eye,
  EyeOff,
  Pencil,
  RotateCcw,
  Undo2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  formatRolloutDateRange,
  getRolloutById,
  resetRolloutSlotUtilization,
  rolloutSlotStatus,
  updateRolloutDay,
  updateRolloutSlot,
  type AdminBuilding,
  type AdminRollout,
  type RolloutDay,
  type RolloutSlot,
} from "@/state/adminMockData";

import { Card, FormField } from "./atoms";
import { BRAND, BRAND_DEEP, BRAND_SOFT } from "./theme";

const TIME_BUDGET = "time_budget_per_window" as const;
const SLOTS = "slots_per_window" as const;

export function RolloutScheduleEditor({
  rolloutId,
  buildings,
  onBack,
  /** Bumped on every mutation so the editor re-reads the
   *  module-level rollouts store. */
  refreshKey,
  bumpRefreshKey,
}: {
  rolloutId: string;
  buildings: AdminBuilding[];
  onBack: () => void;
  refreshKey: number;
  bumpRefreshKey: () => void;
}) {
  const rollout = useMemo(
    () => getRolloutById(rolloutId),
    [rolloutId, refreshKey],
  );
  const [editing, setEditing] = useState<{
    isoDate: string;
    window: "morning" | "afternoon";
  } | null>(null);
  const [confirmReset, setConfirmReset] = useState<{
    isoDate: string;
    window: "morning" | "afternoon";
  } | null>(null);
  const [undoToast, setUndoToast] = useState<{
    label: string;
    undo: () => void;
  } | null>(null);

  // Auto-dismiss the undo toast after 6 seconds — same window as the
  // existing Buildings-view "View bookings" undo so the muscle memory
  // carries over.
  useEffect(() => {
    if (!undoToast) return;
    const t = setTimeout(() => setUndoToast(null), 6000);
    return () => clearTimeout(t);
  }, [undoToast]);

  if (!rollout) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="text-slate-700">
          That rollout is no longer available.{" "}
          <button
            type="button"
            onClick={onBack}
            className="font-semibold underline"
            style={{ color: BRAND }}
          >
            Back to rollouts
          </button>
        </div>
      </div>
    );
  }

  const building = buildings.find((b) => b.id === rollout.buildingId);

  function applyAndRefresh(action: () => void) {
    action();
    bumpRefreshKey();
  }

  function toggleDay(day: RolloutDay) {
    applyAndRefresh(() =>
      updateRolloutDay(rollout!.id, day.isoDate, { open: !day.open }),
    );
  }

  function toggleWindow(day: RolloutDay, window: "morning" | "afternoon") {
    const current = day[window];
    applyAndRefresh(() =>
      updateRolloutSlot(rollout!.id, day.isoDate, window, {
        openByAdmin: !current.openByAdmin,
      }),
    );
  }

  function saveCapacity(
    isoDate: string,
    window: "morning" | "afternoon",
    patch: Partial<RolloutSlot>,
    prev: Partial<RolloutSlot>,
  ) {
    applyAndRefresh(() =>
      updateRolloutSlot(rollout!.id, isoDate, window, patch),
    );
    setUndoToast({
      label: "Capacity updated.",
      undo: () => {
        applyAndRefresh(() =>
          updateRolloutSlot(rollout!.id, isoDate, window, prev),
        );
        setUndoToast(null);
      },
    });
    setEditing(null);
  }

  function performReset(isoDate: string, window: "morning" | "afternoon") {
    const day = rollout!.days.find((d) => d.isoDate === isoDate);
    if (!day) return;
    const slot = day[window];
    const prevPatch: Partial<RolloutSlot> = {
      bookedMinutes: slot.bookedMinutes,
      bookedCount: slot.bookedCount,
    };
    const result = resetRolloutSlotUtilization(rollout!.id, isoDate, window);
    if (!result) return;
    bumpRefreshKey();
    setConfirmReset(null);
    setUndoToast({
      label: "Utilization reset.",
      undo: () => {
        applyAndRefresh(() =>
          updateRolloutSlot(rollout!.id, isoDate, window, prevPatch),
        );
        setUndoToast(null);
      },
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to rollouts
        </button>
      </div>

      <Card>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[18px] font-semibold leading-tight text-slate-900">
              <CalendarRange className="h-4 w-4" style={{ color: BRAND }} />
              {rollout.name}
            </div>
            <div className="mt-0.5 text-[13px] text-slate-500">
              {building ? building.name : rollout.buildingId} ·{" "}
              {formatRolloutDateRange({
                from: rollout.startDate,
                to: rollout.endDate,
              })}{" "}
              ·{" "}
              {rollout.capacityModel === SLOTS
                ? "Slots per window"
                : "Time budget per window"}
            </div>
          </div>
        </div>
      </Card>

      <Card
        title="Schedule"
        subtitle="Click a window to edit capacity. Toggle the eye icon to stage / release a window. Click a date to take the whole day off."
      >
        <Legend mode={rollout.capacityModel} />
        <ScheduleGrid
          rollout={rollout}
          onToggleDay={toggleDay}
          onToggleWindow={toggleWindow}
          onEdit={(isoDate, window) => setEditing({ isoDate, window })}
          onReset={(isoDate, window) =>
            setConfirmReset({ isoDate, window })
          }
        />
      </Card>

      {editing && (
        <CapacityEditModal
          rollout={rollout}
          isoDate={editing.isoDate}
          window={editing.window}
          onCancel={() => setEditing(null)}
          onSave={(patch, prev) =>
            saveCapacity(editing.isoDate, editing.window, patch, prev)
          }
        />
      )}

      {confirmReset && (
        <ResetUtilizationConfirm
          rollout={rollout}
          isoDate={confirmReset.isoDate}
          window={confirmReset.window}
          onCancel={() => setConfirmReset(null)}
          onConfirm={() =>
            performReset(confirmReset.isoDate, confirmReset.window)
          }
        />
      )}

      {undoToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg">
          <span className="text-[13px] font-medium text-slate-800">
            {undoToast.label}
          </span>
          <button
            type="button"
            onClick={undoToast.undo}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-semibold"
            style={{ backgroundColor: BRAND_SOFT, color: BRAND_DEEP }}
          >
            <Undo2 className="h-3 w-3" /> Undo
          </button>
          <button
            type="button"
            onClick={() => setUndoToast(null)}
            className="text-slate-400 hover:text-slate-700"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Legend ────────────────────────────────────────────────────────────────

function Legend({ mode }: { mode: "time_budget_per_window" | "slots_per_window" }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
      <span className="inline-flex items-center gap-1.5">
        <span
          className="inline-block h-2 w-2 rounded-sm"
          style={{ backgroundColor: BRAND }}
        />
        Open & has bookings
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-sm border border-slate-300 bg-white" />
        Open & empty
      </span>
      <span className="inline-flex items-center gap-1.5">
        <EyeOff className="h-3 w-3 text-slate-400" />
        Staged (not released)
      </span>
      <span className="inline-flex items-center gap-1.5">
        Mode:{" "}
        <strong className="text-slate-900">
          {mode === SLOTS ? "Slots per window" : "Time budget per window"}
        </strong>
      </span>
    </div>
  );
}

// ─── Schedule grid ─────────────────────────────────────────────────────────

function ScheduleGrid({
  rollout,
  onToggleDay,
  onToggleWindow,
  onEdit,
  onReset,
}: {
  rollout: AdminRollout;
  onToggleDay: (day: RolloutDay) => void;
  onToggleWindow: (day: RolloutDay, window: "morning" | "afternoon") => void;
  onEdit: (isoDate: string, window: "morning" | "afternoon") => void;
  onReset: (isoDate: string, window: "morning" | "afternoon") => void;
}) {
  return (
    <div className="grid grid-cols-7 gap-2">
      {rollout.days.map((day) => (
        <DayCell
          key={day.isoDate}
          day={day}
          mode={rollout.capacityModel}
          onToggleDay={() => onToggleDay(day)}
          onToggleWindow={(w) => onToggleWindow(day, w)}
          onEdit={(w) => onEdit(day.isoDate, w)}
          onReset={(w) => onReset(day.isoDate, w)}
        />
      ))}
    </div>
  );
}

function DayCell({
  day,
  mode,
  onToggleDay,
  onToggleWindow,
  onEdit,
  onReset,
}: {
  day: RolloutDay;
  mode: "time_budget_per_window" | "slots_per_window";
  onToggleDay: () => void;
  onToggleWindow: (w: "morning" | "afternoon") => void;
  onEdit: (w: "morning" | "afternoon") => void;
  onReset: (w: "morning" | "afternoon") => void;
}) {
  return (
    <div
      className={`flex flex-col gap-1.5 rounded-lg border p-2 ${
        day.open
          ? "border-slate-200 bg-white"
          : "border-slate-200 bg-slate-50 opacity-70"
      }`}
    >
      <button
        type="button"
        onClick={onToggleDay}
        className="flex items-baseline justify-between rounded px-1 py-0.5 text-left transition hover:bg-slate-50"
        title={day.open ? "Click to take this day off" : "Click to re-open this day"}
      >
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          {day.weekdayLabel}
        </div>
        <div className="text-[14px] font-semibold leading-none text-slate-900">
          {day.dayLabel}
        </div>
      </button>
      {day.open ? (
        <>
          <SlotCell
            label="AM"
            slot={day.morning}
            mode={mode}
            onToggle={() => onToggleWindow("morning")}
            onEdit={() => onEdit("morning")}
            onReset={() => onReset("morning")}
          />
          <SlotCell
            label="PM"
            slot={day.afternoon}
            mode={mode}
            onToggle={() => onToggleWindow("afternoon")}
            onEdit={() => onEdit("afternoon")}
            onReset={() => onReset("afternoon")}
          />
        </>
      ) : (
        <div className="rounded bg-slate-100 px-1.5 py-1 text-center text-[10px] font-medium text-slate-500">
          Day off
        </div>
      )}
    </div>
  );
}

function SlotCell({
  label,
  slot,
  mode,
  onToggle,
  onEdit,
  onReset,
}: {
  label: string;
  slot: RolloutSlot;
  mode: "time_budget_per_window" | "slots_per_window";
  onToggle: () => void;
  onEdit: () => void;
  onReset: () => void;
}) {
  const isOpen = slot.openByAdmin;
  const utilizationLabel =
    mode === SLOTS
      ? `${slot.bookedCount ?? 0} / ${slot.slotCount ?? 0}`
      : `${slot.bookedMinutes} / ${slot.windowMinutes} min`;
  const hasBookings =
    mode === SLOTS ? (slot.bookedCount ?? 0) > 0 : slot.bookedMinutes > 0;
  const accent = BRAND;
  return (
    <div
      className={`rounded border px-1.5 py-1 ${
        isOpen && hasBookings
          ? ""
          : isOpen
            ? "border-slate-200"
            : "border-dashed border-slate-200 bg-slate-50"
      }`}
      style={
        isOpen && hasBookings
          ? { borderColor: accent, backgroundColor: `${accent}14` }
          : undefined
      }
    >
      <div className="flex items-center justify-between gap-1">
        <span className="text-[10px] font-semibold text-slate-600">
          {label}
        </span>
        <button
          type="button"
          onClick={onToggle}
          className="text-slate-400 hover:text-slate-700"
          title={isOpen ? "Stage (hide from customers)" : "Release to customers"}
          aria-label={isOpen ? "Hide window" : "Show window"}
        >
          {isOpen ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
        </button>
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="mt-1 flex w-full items-center justify-between gap-1 rounded px-1 py-0.5 text-left text-[10px] text-slate-700 hover:bg-white"
        title="Edit capacity"
      >
        <span>{utilizationLabel}</span>
        <Pencil className="h-2.5 w-2.5 text-slate-400" />
      </button>
      {hasBookings && (
        <button
          type="button"
          onClick={onReset}
          className="mt-1 inline-flex items-center gap-0.5 text-[9px] text-slate-400 hover:text-slate-700"
          title="Reset utilization"
        >
          <RotateCcw className="h-2.5 w-2.5" />
          Reset
        </button>
      )}
    </div>
  );
}

// ─── Capacity edit modal ───────────────────────────────────────────────────

function CapacityEditModal({
  rollout,
  isoDate,
  window,
  onCancel,
  onSave,
}: {
  rollout: AdminRollout;
  isoDate: string;
  window: "morning" | "afternoon";
  onCancel: () => void;
  onSave: (patch: Partial<RolloutSlot>, prev: Partial<RolloutSlot>) => void;
}) {
  const day = rollout.days.find((d) => d.isoDate === isoDate)!;
  const slot = day[window];
  const isSlotMode = rollout.capacityModel === SLOTS;
  const [windowMinutes, setWindowMinutes] = useState(slot.windowMinutes);
  const [slotCount, setSlotCount] = useState(slot.slotCount ?? 6);

  function submit() {
    if (isSlotMode) {
      onSave(
        { slotCount },
        { slotCount: slot.slotCount },
      );
    } else {
      onSave(
        { windowMinutes },
        { windowMinutes: slot.windowMinutes },
      );
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-[14px] font-semibold text-slate-900">
            Edit capacity ·{" "}
            {window === "morning" ? "Morning" : "Afternoon"} ·{" "}
            {day.weekdayLabel} {day.dayLabel} {day.monthLabel}
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-slate-400 hover:text-slate-700"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {isSlotMode ? (
          <FormField label="Slots in this window">
            <input
              type="number"
              min={1}
              max={20}
              value={slotCount}
              onChange={(e) =>
                setSlotCount(
                  Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 1)),
                )
              }
              className="w-full rounded-lg border border-slate-200 bg-white p-2 text-[13px] text-slate-800"
            />
          </FormField>
        ) : (
          <FormField label="Window length (minutes)">
            <input
              type="number"
              min={15}
              max={600}
              step={15}
              value={windowMinutes}
              onChange={(e) =>
                setWindowMinutes(
                  Math.max(15, Math.min(600, parseInt(e.target.value, 10) || 15)),
                )
              }
              className="w-full rounded-lg border border-slate-200 bg-white p-2 text-[13px] text-slate-800"
            />
          </FormField>
        )}
        <div className="mt-2 text-[11px] text-slate-500">
          Currently used:{" "}
          {isSlotMode
            ? `${slot.bookedCount ?? 0} of ${slot.slotCount ?? 0} slots`
            : `${slot.bookedMinutes} of ${slot.windowMinutes} min`}
          .
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white"
            style={{ backgroundColor: BRAND }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Reset utilization confirm ─────────────────────────────────────────────

function ResetUtilizationConfirm({
  rollout,
  isoDate,
  window,
  onCancel,
  onConfirm,
}: {
  rollout: AdminRollout;
  isoDate: string;
  window: "morning" | "afternoon";
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const day = rollout.days.find((d) => d.isoDate === isoDate)!;
  const slot = day[window];
  const isSlotMode = rollout.capacityModel === SLOTS;
  const usageLabel = isSlotMode
    ? `${slot.bookedCount ?? 0} of ${slot.slotCount ?? 0} slots`
    : `${slot.bookedMinutes} of ${slot.windowMinutes} min`;
  const status = rolloutSlotStatus(day, slot, rollout.capacityModel, 0);
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
        <div className="flex items-start gap-3">
          <div
            className="rounded-lg p-2"
            style={{ backgroundColor: "#FFF4F0" }}
          >
            <AlertTriangle className="h-4 w-4 text-amber-600" />
          </div>
          <div className="flex-1">
            <div className="text-[14px] font-semibold text-slate-900">
              Reset this window's utilization?
            </div>
            <div className="mt-1 text-[12px] text-slate-600">
              {window === "morning" ? "Morning" : "Afternoon"} ·{" "}
              {day.weekdayLabel} {day.dayLabel} {day.monthLabel}. This
              window is currently using {usageLabel}
              {status === "full" ? " (full)" : "."} Resetting will mark
              the window as empty — useful when you've closed the
              wrong day or seeded test data — but it does <strong>not</strong>{" "}
              cancel any real bookings already on the books. Use the
              undo toast if you change your mind.
            </div>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-amber-500 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-amber-600"
          >
            Reset utilization
          </button>
        </div>
      </div>
    </div>
  );
}

