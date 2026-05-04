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
  Plus,
  RotateCcw,
  Undo2,
  X,
} from "lucide-react";
import { persistRolloutsToStore } from "@/state/protoStore";
import { useEffect, useMemo, useState } from "react";

import {
  addRolloutEveningWindow,
  clearReleaseAutoToast,
  formatRolloutDateRange,
  formatSlotTimeRange,
  formatWindowTimeRange,
  getRolloutById,
  isSlotTimeOverridden,
  popLatestReleaseAuditEvent,
  releaseNextBatchManual,
  removeRolloutEveningWindow,
  resetRolloutSlotUtilization,
  resolveSlotTimes,
  rolloutSlotStatus,
  setRolloutReleaseStrategy,
  setRolloutSlotTimeOverride,
  setRolloutWindowDefault,
  shouldNudgeManualRelease,
  stagedSlotsChrono,
  updateRolloutDay,
  updateRolloutDayVendor,
  updateRolloutDefaultVendor,
  updateRolloutSlot,
  type AdminBuilding,
  type AdminRollout,
  type AdminVendor,
  type ReleaseAuditEvent,
  type ReleaseStrategy,
  type ReleaseStrategyMode,
  type ReleaseUnit,
  type RolloutDay,
  type RolloutSlot,
  type VendorServiceRate,
  type WindowTimeRange,
} from "@/state/adminMockData";

import { Card, FormField } from "./atoms";
import { BRAND, BRAND_DEEP, BRAND_SOFT } from "./theme";

const TIME_BUDGET = "time_budget_per_window" as const;
const SLOTS = "slots_per_window" as const;

export function RolloutScheduleEditor({
  rolloutId,
  buildings,
  vendors = [],
  vendorRates = [],
  onBack,
  /** Bumped on every mutation so the editor re-reads the
   *  module-level rollouts store. */
  refreshKey,
  bumpRefreshKey,
}: {
  rolloutId: string;
  buildings: AdminBuilding[];
  vendors?: readonly AdminVendor[];
  vendorRates?: readonly VendorServiceRate[];
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
    window: "morning" | "afternoon" | "evening";
  } | null>(null);
  const [confirmReset, setConfirmReset] = useState<{
    isoDate: string;
    window: "morning" | "afternoon" | "evening";
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
    persistRolloutsToStore();
  }

  function toggleDay(day: RolloutDay) {
    applyAndRefresh(() =>
      updateRolloutDay(rollout!.id, day.isoDate, { open: !day.open }),
    );
  }

  function toggleWindow(
    day: RolloutDay,
    window: "morning" | "afternoon" | "evening",
  ) {
    const current = day[window];
    if (!current) return;
    applyAndRefresh(() =>
      updateRolloutSlot(rollout!.id, day.isoDate, window, {
        openByAdmin: !current.openByAdmin,
      }),
    );
  }

  function saveCapacity(
    isoDate: string,
    window: "morning" | "afternoon" | "evening",
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

  function addEvening(isoDate: string) {
    const added = addRolloutEveningWindow(rollout!.id, isoDate);
    if (!added) return;
    bumpRefreshKey();
    persistRolloutsToStore();
    setUndoToast({
      label: "Evening window added.",
      undo: () => {
        removeRolloutEveningWindow(rollout!.id, isoDate);
        bumpRefreshKey();
        persistRolloutsToStore();
        setUndoToast(null);
      },
    });
  }

  function saveSlotTimeOverride(
    isoDate: string,
    window: "morning" | "afternoon" | "evening",
    next: WindowTimeRange | null,
    prev: WindowTimeRange | null,
  ) {
    applyAndRefresh(() =>
      setRolloutSlotTimeOverride(rollout!.id, isoDate, window, next),
    );
    setUndoToast({
      label: next ? "Slot time overridden." : "Slot time reset to default.",
      undo: () => {
        applyAndRefresh(() =>
          setRolloutSlotTimeOverride(rollout!.id, isoDate, window, prev),
        );
        setUndoToast(null);
      },
    });
  }

  function saveWindowDefault(
    window: "morning" | "afternoon" | "evening",
    next: WindowTimeRange,
    prev: WindowTimeRange,
  ) {
    applyAndRefresh(() =>
      setRolloutWindowDefault(rollout!.id, window, next),
    );
    setUndoToast({
      label: `${windowLabel(window)} default updated.`,
      undo: () => {
        applyAndRefresh(() =>
          setRolloutWindowDefault(rollout!.id, window, prev),
        );
        setUndoToast(null);
      },
    });
  }

  function saveReleaseStrategy(
    patch: Partial<Omit<ReleaseStrategy, "audit" | "hasUnseenAuto">>,
    prev: Partial<Omit<ReleaseStrategy, "audit" | "hasUnseenAuto">>,
  ) {
    applyAndRefresh(() => setRolloutReleaseStrategy(rollout!.id, patch));
    setUndoToast({
      label: "Release strategy updated.",
      undo: () => {
        applyAndRefresh(() =>
          setRolloutReleaseStrategy(rollout!.id, prev),
        );
        setUndoToast(null);
      },
    });
  }

  function manualRelease() {
    const flipped = releaseNextBatchManual(rollout!.id);
    if (flipped.length === 0) {
      setUndoToast({
        label: "Nothing left to release.",
        undo: () => setUndoToast(null),
      });
      return;
    }
    bumpRefreshKey();
    persistRolloutsToStore();
    setUndoToast({
      label: `Released ${flipped.length} window${flipped.length === 1 ? "" : "s"}.`,
      undo: () => {
        // Re-stage every flipped window and drop the manual audit row
        // we just appended so the audit list mirrors the visible state.
        // Both go through immutable mutators so subsequent reads see
        // a fresh rollout snapshot.
        for (const f of flipped) {
          if (f.window) {
            updateRolloutSlot(rollout!.id, f.isoDate, f.window, {
              openByAdmin: false,
            });
          }
        }
        popLatestReleaseAuditEvent(rollout!.id);
        bumpRefreshKey();
        persistRolloutsToStore();
        setUndoToast(null);
      },
    });
  }

  // Surface an "auto-released by system" notice once whenever the
  // editor mounts on a rollout with the `hasUnseenAuto` flag set —
  // the booking-confirm pipeline writes it from outside the editor,
  // so we need to catch it on next open instead of inline.
  useEffect(() => {
    if (!rollout || !rollout.releaseStrategy.hasUnseenAuto) return;
    const latest = rollout.releaseStrategy.audit.find(
      (e) => e.by === "system",
    );
    if (latest) {
      setUndoToast({
        label: `Auto-released ${latest.released.length} window${latest.released.length === 1 ? "" : "s"} since you last looked.`,
        undo: () => setUndoToast(null),
      });
    }
    clearReleaseAutoToast(rollout.id);
    bumpRefreshKey();
    // We only want to react when the rollout id flips or the unseen
    // flag flips on — adding more deps would re-fire the toast every
    // time we bumpRefreshKey from any other action.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rollout?.id, rollout?.releaseStrategy.hasUnseenAuto]);

  function performReset(
    isoDate: string,
    window: "morning" | "afternoon" | "evening",
  ) {
    const day = rollout!.days.find((d) => d.isoDate === isoDate);
    if (!day) return;
    const slot = day[window];
    if (!slot) return;
    const prevPatch: Partial<RolloutSlot> = {
      bookedMinutes: slot.bookedMinutes,
      bookedCount: slot.bookedCount,
    };
    const result = resetRolloutSlotUtilization(rollout!.id, isoDate, window);
    if (!result) return;
    bumpRefreshKey();
    persistRolloutsToStore();
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

        {vendors.length > 0 && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500 whitespace-nowrap">
                Default vendor
              </span>
              <select
                value={rollout.defaultVendorId ?? ""}
                onChange={(e) => {
                  const val = e.target.value || null;
                  applyAndRefresh(() => updateRolloutDefaultVendor(rollout!.id, val));
                  setUndoToast({
                    label: val
                      ? `Default vendor set to ${vendors.find((v) => v.id === val)?.company ?? val}.`
                      : "Default vendor cleared.",
                    undo: () => {
                      applyAndRefresh(() =>
                        updateRolloutDefaultVendor(rollout!.id, rollout!.defaultVendorId ?? null),
                      );
                      setUndoToast(null);
                    },
                  });
                }}
                className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[13px] text-slate-900 focus:border-slate-400 focus:outline-none"
              >
                <option value="">— No vendor assigned —</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.company}
                  </option>
                ))}
              </select>
              {rollout.defaultVendorId && (
                <button
                  type="button"
                  onClick={() => {
                    const vid = rollout!.defaultVendorId ?? null;
                    for (const day of rollout!.days) {
                      updateRolloutDayVendor(rollout!.id, day.isoDate, vid);
                    }
                    bumpRefreshKey();
                    persistRolloutsToStore();
                    setUndoToast({
                      label: `Vendor assigned to all ${rollout!.days.length} days.`,
                      undo: () => {
                        for (const day of rollout!.days) {
                          updateRolloutDayVendor(rollout!.id, day.isoDate, null);
                        }
                        bumpRefreshKey();
                        persistRolloutsToStore();
                        setUndoToast(null);
                      },
                    });
                  }}
                  className="whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Assign to all days
                </button>
              )}
            </div>
            {rollout.defaultVendorId && (() => {
              const rate = vendorRates.find(
                (r) => r.vendorId === rollout!.defaultVendorId && r.serviceId === rollout!.serviceId,
              );
              return rate ? (
                <div className="mt-1.5 text-[11px] text-slate-500">
                  Wholesale rate: <strong className="text-slate-700">${rate.wholesalePriceAud.toFixed(2)}</strong> for this service
                </div>
              ) : (
                <div className="mt-1.5 text-[11px] text-amber-600">
                  No rate configured for this vendor × service combination.
                </div>
              );
            })()}
          </div>
        )}
      </Card>

      {shouldNudgeManualRelease(rollout) && (
        <NudgeBanner rollout={rollout} onRelease={manualRelease} />
      )}

      <WindowTimesCard
        rollout={rollout}
        onSave={saveWindowDefault}
      />

      <ReleaseStrategyCard
        rollout={rollout}
        onSave={saveReleaseStrategy}
        onManualRelease={manualRelease}
      />

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
          onAddEvening={addEvening}
        />
      </Card>

      <ReleaseAuditCard rollout={rollout} />

      {editing && (
        <CapacityEditModal
          rollout={rollout}
          isoDate={editing.isoDate}
          window={editing.window}
          onCancel={() => setEditing(null)}
          onSave={(patch, prev) =>
            saveCapacity(editing.isoDate, editing.window, patch, prev)
          }
          onSaveTimeOverride={(next, prev) =>
            saveSlotTimeOverride(
              editing.isoDate,
              editing.window,
              next,
              prev,
            )
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
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: BRAND }}
        />
        Custom time
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
  onAddEvening,
}: {
  rollout: AdminRollout;
  onToggleDay: (day: RolloutDay) => void;
  onToggleWindow: (
    day: RolloutDay,
    window: "morning" | "afternoon" | "evening",
  ) => void;
  onEdit: (
    isoDate: string,
    window: "morning" | "afternoon" | "evening",
  ) => void;
  onReset: (
    isoDate: string,
    window: "morning" | "afternoon" | "evening",
  ) => void;
  onAddEvening: (isoDate: string) => void;
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
          onAddEvening={() => onAddEvening(day.isoDate)}
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
  onAddEvening,
}: {
  day: RolloutDay;
  mode: "time_budget_per_window" | "slots_per_window";
  onToggleDay: () => void;
  onToggleWindow: (w: "morning" | "afternoon" | "evening") => void;
  onEdit: (w: "morning" | "afternoon" | "evening") => void;
  onReset: (w: "morning" | "afternoon" | "evening") => void;
  onAddEvening: () => void;
}) {
  const morningOverridden = isSlotTimeOverridden(day.morning);
  const afternoonOverridden = isSlotTimeOverridden(day.afternoon);
  const eveningOverridden = day.evening
    ? isSlotTimeOverridden(day.evening)
    : false;
  return (
    <div
      data-testid={`rollout-day-${day.isoDate}`}
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
            isoDate={day.isoDate}
            window="morning"
            label="AM"
            slot={day.morning}
            mode={mode}
            isOverridden={morningOverridden}
            onToggle={() => onToggleWindow("morning")}
            onEdit={() => onEdit("morning")}
            onReset={() => onReset("morning")}
          />
          <SlotCell
            isoDate={day.isoDate}
            window="afternoon"
            label="PM"
            slot={day.afternoon}
            mode={mode}
            isOverridden={afternoonOverridden}
            onToggle={() => onToggleWindow("afternoon")}
            onEdit={() => onEdit("afternoon")}
            onReset={() => onReset("afternoon")}
          />
          {day.evening ? (
            <SlotCell
              isoDate={day.isoDate}
              window="evening"
              label="EV"
              slot={day.evening}
              mode={mode}
              isOverridden={eveningOverridden}
              onToggle={() => onToggleWindow("evening")}
              onEdit={() => onEdit("evening")}
              onReset={() => onReset("evening")}
            />
          ) : (
            <button
              type="button"
              onClick={onAddEvening}
              data-testid={`rollout-add-evening-${day.isoDate}`}
              className="inline-flex items-center justify-center gap-1 rounded border border-dashed border-slate-200 px-1.5 py-1 text-[10px] font-medium text-slate-500 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
              title="Add an Evening window to this day"
            >
              <Plus className="h-2.5 w-2.5" />
              Add EV
            </button>
          )}
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
  isoDate,
  window,
  label,
  slot,
  mode,
  isOverridden,
  onToggle,
  onEdit,
  onReset,
}: {
  isoDate: string;
  window: "morning" | "afternoon" | "evening";
  label: string;
  slot: RolloutSlot;
  mode: "time_budget_per_window" | "slots_per_window";
  isOverridden: boolean;
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
      data-testid={`rollout-slot-${isoDate}-${window}`}
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
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-600">
          {label}
          {isOverridden && (
            <span
              data-testid={`rollout-slot-${isoDate}-${window}-overridden`}
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: accent }}
              aria-label="Custom time"
              title="Custom time for this slot"
            />
          )}
          {!isOpen && (
            <span
              data-testid={`rollout-slot-${isoDate}-${window}-staged-pill`}
              className="inline-flex items-center rounded-sm bg-slate-200 px-1 text-[9px] font-semibold uppercase tracking-wide text-slate-600"
              title="Staged — not visible to customers"
            >
              Staged
            </span>
          )}
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
        data-testid={`rollout-slot-${isoDate}-${window}-utilization`}
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
  onSaveTimeOverride,
}: {
  rollout: AdminRollout;
  isoDate: string;
  window: "morning" | "afternoon" | "evening";
  onCancel: () => void;
  onSave: (patch: Partial<RolloutSlot>, prev: Partial<RolloutSlot>) => void;
  onSaveTimeOverride: (
    next: WindowTimeRange | null,
    prev: WindowTimeRange | null,
  ) => void;
}) {
  const day = rollout.days.find((d) => d.isoDate === isoDate)!;
  const slot = day[window]!;
  const isSlotMode = rollout.capacityModel === SLOTS;
  const [windowMinutes, setWindowMinutes] = useState(slot.windowMinutes);
  const [slotCount, setSlotCount] = useState(slot.slotCount ?? 6);
  const resolved = resolveSlotTimes(rollout, {
    window,
    startTime: slot.startTime,
    endTime: slot.endTime,
  });
  const overridden = isSlotTimeOverridden(slot);
  const [start, setStart] = useState(resolved.start);
  const [end, setEnd] = useState(resolved.end);
  const timeDirty = start !== resolved.start || end !== resolved.end;
  const timeValid = start && end && start < end;
  const prevOverride: WindowTimeRange | null =
    overridden && slot.startTime && slot.endTime
      ? { start: slot.startTime, end: slot.endTime }
      : null;

  function submit() {
    // Block invalid time edits — partial submits leave the modal open
    // with the inline error visible so the admin can correct it.
    if (timeDirty && !timeValid) return;

    // Capacity patch first, time override second so the audit trail
    // is "capacity then time" if both changed. The two helpers each
    // overwrite the prior undo toast (intentional: only the most
    // recent action is undoable in this editor), so for combined
    // edits the single visible toast undoes the time change. The
    // capacity change is still surfaced in the audit trail and can
    // be reverted by re-opening the modal.
    const capacityDirty = isSlotMode
      ? slotCount !== (slot.slotCount ?? 6)
      : windowMinutes !== slot.windowMinutes;
    if (capacityDirty) {
      if (isSlotMode) {
        onSave({ slotCount }, { slotCount: slot.slotCount });
      } else {
        onSave({ windowMinutes }, { windowMinutes: slot.windowMinutes });
      }
    }
    if (timeDirty && timeValid) {
      onSaveTimeOverride({ start, end }, prevOverride);
    }
    // Always close — the parent's `saveCapacity` already does this
    // for the capacity-only case, but the time-only and "no change"
    // cases need an explicit close.
    onCancel();
  }

  function clearOverride() {
    onSaveTimeOverride(null, prevOverride);
    // Close so the modal re-opens with fresh local `start`/`end`
    // synced to the rollout default the next time the admin clicks
    // the slot.
    onCancel();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-[14px] font-semibold text-slate-900">
            Edit capacity ·{" "}
            {window === "morning"
              ? "Morning"
              : window === "afternoon"
                ? "Afternoon"
                : "Evening"}{" "}
            · {day.weekdayLabel} {day.dayLabel} {day.monthLabel}
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
        <div
          className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3"
          data-testid={`capacity-modal-time-${window}`}
        >
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[12px] font-semibold text-slate-700">
              Time for this slot
            </div>
            {overridden ? (
              <button
                type="button"
                onClick={clearOverride}
                data-testid={`capacity-modal-time-${window}-reset`}
                className="text-[11px] font-semibold underline"
                style={{ color: BRAND_DEEP }}
              >
                Use rollout defaults
              </button>
            ) : (
              <span className="text-[11px] text-slate-500">
                Using rollout default
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-1.5 text-[12px] text-slate-600">
              <span className="text-slate-500">Start</span>
              <input
                type="time"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                data-testid={`capacity-modal-time-${window}-start`}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[13px] text-slate-800"
              />
            </label>
            <label className="inline-flex items-center gap-1.5 text-[12px] text-slate-600">
              <span className="text-slate-500">End</span>
              <input
                type="time"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                data-testid={`capacity-modal-time-${window}-end`}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[13px] text-slate-800"
              />
            </label>
          </div>
          {timeDirty && !timeValid && (
            <div className="mt-1 text-[11px] font-medium text-amber-600">
              Start must be before end.
            </div>
          )}
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
  window: "morning" | "afternoon" | "evening";
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const day = rollout.days.find((d) => d.isoDate === isoDate)!;
  const slot = day[window]!;
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
              {window === "morning"
                ? "Morning"
                : window === "afternoon"
                  ? "Afternoon"
                  : "Evening"}{" "}
              · {day.weekdayLabel} {day.dayLabel} {day.monthLabel}. This
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


// ─── Window-times card ─────────────────────────────────────────────────────

function windowLabel(window: "morning" | "afternoon" | "evening"): string {
  return window === "morning"
    ? "Morning"
    : window === "afternoon"
      ? "Afternoon"
      : "Evening";
}

/**
 * Per-rollout default time ranges. One row per window, each with a
 * pair of `<input type="time">` controls. Saving fires the
 * {@link setRolloutWindowDefault} mutator and surfaces an undo toast
 * via the parent. Per-day overrides live on the slot itself and are
 * unaffected by changes here — that contract is what makes the
 * defaults card safe to edit at any time.
 */
function WindowTimesCard({
  rollout,
  onSave,
}: {
  rollout: AdminRollout;
  onSave: (
    window: "morning" | "afternoon" | "evening",
    next: WindowTimeRange,
    prev: WindowTimeRange,
  ) => void;
}) {
  return (
    <Card
      title="Window times"
      subtitle="Default start / end for every window in this rollout. Per-day overrides on individual slots stay put when these change."
    >
      <div
        className="flex flex-col gap-3"
        data-testid="rollout-window-defaults"
      >
        <WindowTimeRow
          rollout={rollout}
          window="morning"
          onSave={onSave}
        />
        <WindowTimeRow
          rollout={rollout}
          window="afternoon"
          onSave={onSave}
        />
        <WindowTimeRow
          rollout={rollout}
          window="evening"
          onSave={onSave}
        />
      </div>
    </Card>
  );
}

function WindowTimeRow({
  rollout,
  window,
  onSave,
}: {
  rollout: AdminRollout;
  window: "morning" | "afternoon" | "evening";
  onSave: (
    window: "morning" | "afternoon" | "evening",
    next: WindowTimeRange,
    prev: WindowTimeRange,
  ) => void;
}) {
  const current = rollout.windowDefaults[window];
  const [start, setStart] = useState(current.start);
  const [end, setEnd] = useState(current.end);
  // Re-sync when the rollout's defaults change underneath us (e.g.
  // an undo toast). React state would otherwise hold the stale draft.
  useEffect(() => {
    setStart(current.start);
    setEnd(current.end);
  }, [current.start, current.end]);
  const dirty = start !== current.start || end !== current.end;
  const valid = start && end && start < end;
  return (
    <div
      data-testid={`rollout-window-default-${window}`}
      className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2"
    >
      <div className="w-20 text-[13px] font-semibold text-slate-800">
        {windowLabel(window)}
      </div>
      <label className="inline-flex items-center gap-1.5 text-[12px] text-slate-600">
        <span className="text-slate-500">Start</span>
        <input
          type="time"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          data-testid={`rollout-window-default-${window}-start`}
          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[13px] text-slate-800"
        />
      </label>
      <label className="inline-flex items-center gap-1.5 text-[12px] text-slate-600">
        <span className="text-slate-500">End</span>
        <input
          type="time"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          data-testid={`rollout-window-default-${window}-end`}
          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[13px] text-slate-800"
        />
      </label>
      <button
        type="button"
        disabled={!dirty || !valid}
        onClick={() =>
          onSave(window, { start, end }, { start: current.start, end: current.end })
        }
        data-testid={`rollout-window-default-${window}-save`}
        className="rounded-md px-2.5 py-1 text-[12px] font-semibold text-white disabled:opacity-30"
        style={{ backgroundColor: BRAND }}
      >
        Save
      </button>
      {!valid && dirty && (
        <span className="text-[11px] font-medium text-amber-600">
          Start must be before end.
        </span>
      )}
    </div>
  );
}

// ─── Release strategy ──────────────────────────────────────────────────────

const MODE_OPTIONS: Array<{
  value: ReleaseStrategyMode;
  label: string;
  hint: string;
}> = [
  {
    value: "auto_when_full",
    label: "Auto · when full",
    hint: "Release the next batch automatically once every released window is fully booked.",
  },
  {
    value: "auto_at_threshold",
    label: "Auto · at threshold",
    hint: "Release the next batch automatically once every released window crosses the threshold.",
  },
  {
    value: "manual_nudge",
    label: "Manual nudge",
    hint: "We'll nudge you when released windows fill, but only release when you click the button.",
  },
];

/**
 * Per-rollout release ladder controls. Mode radio at the top, then
 * threshold / unit / batch-size, then the always-visible "Release
 * next batch" button. The threshold input is only meaningful for the
 * threshold mode but stays mounted (greyed out) so flipping back and
 * forth doesn't reset the value.
 */
function ReleaseStrategyCard({
  rollout,
  onSave,
  onManualRelease,
}: {
  rollout: AdminRollout;
  onSave: (
    patch: Partial<Omit<ReleaseStrategy, "audit" | "hasUnseenAuto">>,
    prev: Partial<Omit<ReleaseStrategy, "audit" | "hasUnseenAuto">>,
  ) => void;
  onManualRelease: () => void;
}) {
  const strat = rollout.releaseStrategy;
  const stagedCount = stagedSlotsChrono(rollout).length;
  const thresholdActive = strat.mode === "auto_at_threshold";
  return (
    <Card
      title="Release strategy"
      subtitle="How staged windows flip to released. The manual button always works regardless of mode."
    >
      <div className="flex flex-col gap-3">
        <div
          className="flex flex-col gap-2"
          data-testid="release-strategy-modes"
          role="radiogroup"
          aria-label="Release mode"
        >
          {MODE_OPTIONS.map((opt) => {
            const checked = strat.mode === opt.value;
            return (
              <label
                key={opt.value}
                data-testid={`release-strategy-mode-${opt.value}`}
                className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2 ${
                  checked ? "" : "border-slate-200 bg-white"
                }`}
                style={
                  checked
                    ? {
                        borderColor: BRAND,
                        backgroundColor: `${BRAND}10`,
                      }
                    : undefined
                }
              >
                <input
                  type="radio"
                  name="release-mode"
                  value={opt.value}
                  checked={checked}
                  onChange={() =>
                    onSave({ mode: opt.value }, { mode: strat.mode })
                  }
                  className="mt-1"
                  style={{ accentColor: BRAND }}
                />
                <div className="flex flex-col">
                  <span className="text-[13px] font-semibold text-slate-800">
                    {opt.label}
                  </span>
                  <span className="text-[11.5px] text-slate-500">
                    {opt.hint}
                  </span>
                </div>
              </label>
            );
          })}
        </div>

        <div
          className={`flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 ${
            thresholdActive ? "" : "opacity-60"
          }`}
        >
          <label className="inline-flex items-center gap-1.5 text-[12px] text-slate-700">
            <span className="font-semibold">Threshold</span>
            <input
              type="number"
              min={1}
              max={100}
              value={strat.thresholdPct}
              disabled={!thresholdActive}
              onChange={(e) => {
                const next = Math.max(
                  1,
                  Math.min(100, parseInt(e.target.value, 10) || 1),
                );
                if (next === strat.thresholdPct) return;
                onSave(
                  { thresholdPct: next },
                  { thresholdPct: strat.thresholdPct },
                );
              }}
              data-testid="release-strategy-threshold"
              className="w-16 rounded-md border border-slate-200 bg-white px-2 py-1 text-[13px] text-slate-800"
            />
            <span className="text-slate-500">%</span>
          </label>
          <span className="text-[11px] text-slate-500">
            (only for "at threshold")
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
          <div className="flex min-w-[120px] flex-1 flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Batch unit
            </span>
            <select
              value={strat.unit}
              onChange={(e) =>
                onSave(
                  { unit: e.target.value as ReleaseUnit },
                  { unit: strat.unit },
                )
              }
              data-testid="release-strategy-unit"
              className="w-full rounded-md border border-slate-200 bg-white p-2 text-[13px] text-slate-800"
            >
              <option value="days">Days</option>
              <option value="windows">Windows</option>
            </select>
          </div>
          <div className="flex min-w-[120px] flex-1 flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Batch size (N)
            </span>
            <input
              type="number"
              min={1}
              max={14}
              value={strat.batchSize}
              onChange={(e) => {
                const next = Math.max(
                  1,
                  Math.min(14, parseInt(e.target.value, 10) || 1),
                );
                if (next === strat.batchSize) return;
                onSave(
                  { batchSize: next },
                  { batchSize: strat.batchSize },
                );
              }}
              data-testid="release-strategy-batch-size"
              className="w-full rounded-md border border-slate-200 bg-white p-2 text-[13px] text-slate-800"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onManualRelease}
            disabled={stagedCount === 0}
            data-testid="release-strategy-manual"
            className="rounded-lg px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-30"
            style={{ backgroundColor: BRAND }}
          >
            Release next batch
          </button>
          <span className="text-[11.5px] text-slate-500">
            {stagedCount === 0
              ? "Nothing left to release."
              : `${stagedCount} window${stagedCount === 1 ? "" : "s"} still staged.`}
          </span>
        </div>
      </div>
    </Card>
  );
}

// ─── Nudge banner ──────────────────────────────────────────────────────────

function NudgeBanner({
  rollout,
  onRelease,
}: {
  rollout: AdminRollout;
  onRelease: () => void;
}) {
  const stagedCount = stagedSlotsChrono(rollout).length;
  return (
    <div
      data-testid="release-nudge-banner"
      className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900"
    >
      <AlertTriangle className="h-4 w-4 text-amber-600" />
      <div className="flex-1 text-[12.5px]">
        <strong className="font-semibold">Released windows are at 80%+.</strong>{" "}
        {stagedCount > 0
          ? `${stagedCount} window${stagedCount === 1 ? "" : "s"} are still staged — release the next batch when you're ready.`
          : "No staged windows left to release."}
      </div>
      <button
        type="button"
        onClick={onRelease}
        disabled={stagedCount === 0}
        data-testid="release-nudge-banner-button"
        className="rounded-md px-2.5 py-1 text-[12px] font-semibold text-white disabled:opacity-30"
        style={{ backgroundColor: BRAND }}
      >
        Release next batch
      </button>
    </div>
  );
}

// ─── Release audit ─────────────────────────────────────────────────────────

function describeTrigger(t: ReleaseAuditEvent["trigger"]): string {
  return t === "manual"
    ? "Manual"
    : t === "auto_full"
      ? "Auto · all full"
      : "Auto · threshold";
}

function describeReleased(
  rollout: AdminRollout,
  released: ReleaseAuditEvent["released"],
): string {
  if (released.length === 0) return "—";
  const byDate = new Map<string, Set<string>>();
  for (const r of released) {
    if (!byDate.has(r.isoDate)) byDate.set(r.isoDate, new Set());
    if (r.window) byDate.get(r.isoDate)!.add(r.window);
  }
  const parts: string[] = [];
  for (const [iso, windows] of byDate) {
    const day = rollout.days.find((d) => d.isoDate === iso);
    const datePart = day
      ? `${day.weekdayLabel} ${day.dayLabel}`
      : iso;
    if (windows.size === 0) {
      parts.push(datePart);
    } else {
      const wlist = Array.from(windows)
        .map((w) =>
          w === "morning" ? "AM" : w === "afternoon" ? "PM" : "EV",
        )
        .join("/");
      parts.push(`${datePart} ${wlist}`);
    }
  }
  return parts.join(", ");
}

function ReleaseAuditCard({ rollout }: { rollout: AdminRollout }) {
  const audit = rollout.releaseStrategy.audit;
  return (
    <Card
      title="Release history"
      subtitle="Every release flip on this rollout, newest first. Manual rows come from this page; auto rows come from booking-confirm hooks."
    >
      {audit.length === 0 ? (
        <div
          data-testid="release-audit-empty"
          className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-[12px] text-slate-500"
        >
          No releases yet. Stage some windows above and click{" "}
          <strong>Release next batch</strong> to start the trail.
        </div>
      ) : (
        <div
          className="overflow-hidden rounded-lg border border-slate-200"
          data-testid="release-audit-list"
        >
          <table className="w-full text-left text-[12px]">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-1.5 font-semibold">When</th>
                <th className="px-3 py-1.5 font-semibold">By</th>
                <th className="px-3 py-1.5 font-semibold">Trigger</th>
                <th className="px-3 py-1.5 font-semibold">Released</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((e) => (
                <tr
                  key={e.id}
                  data-testid={`release-audit-row-${e.id}`}
                  className="border-t border-slate-100"
                >
                  <td className="px-3 py-1.5 text-slate-700">{e.at}</td>
                  <td className="px-3 py-1.5 capitalize text-slate-700">
                    {e.by}
                  </td>
                  <td className="px-3 py-1.5 text-slate-700">
                    {describeTrigger(e.trigger)}
                  </td>
                  <td className="px-3 py-1.5 text-slate-800">
                    {describeReleased(rollout, e.released)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
