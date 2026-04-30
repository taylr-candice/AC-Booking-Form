/**
 * Rollouts admin view — replaces the legacy global slot calendar.
 *
 * Lists every (service × building) rollout in the workspace and lets
 * admins create new ones. Picking a rollout drops into the per-rollout
 * schedule editor (see {@link RolloutScheduleEditor}) where the actual
 * day/window toggles + capacity edits happen.
 *
 * Read-only summaries on the list (date range, capacity model, # of
 * open windows, # of bookings) — destructive edits live in the editor.
 */

import { CalendarRange, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  formatRolloutDateRange,
  getRollouts,
  getServices,
  type AdminBooking,
  type AdminBuilding,
  type AdminRollout,
  type ServiceCapacityModel,
} from "@/state/adminMockData";

import { Card, FormField } from "./atoms";
import { BRAND, BRAND_DEEP, BRAND_SOFT } from "./theme";

export function RolloutsView({
  buildings,
  bookings,
  onCreate,
  onOpen,
  /** Bumped on every create so the list refreshes from the
   *  module-level store. */
  refreshKey,
  initialFocusedRowId,
  onFocusedRowConsumed,
}: {
  buildings: AdminBuilding[];
  bookings: AdminBooking[];
  onCreate: (input: {
    serviceId: string;
    buildingId: string;
    name: string;
    startDate: string;
    endDate: string;
    capacityModel: ServiceCapacityModel;
    defaultSlotCount?: number;
  }) => void;
  onOpen: (rolloutId: string) => void;
  refreshKey: number;
  /** One-shot seed for the source-row highlight: id of the rollout
   *  the admin pivoted FROM (e.g. via the `RolloutScheduleEditor`'s
   *  "Back to rollouts" button). Mirrors the `initialFocusedRowId`
   *  prop on {@link BookingsView} / {@link AwaitingCoordinationView}
   *  so a pivot back into the rollouts list keeps the same
   *  source-row highlight + scroll-into-view behaviour the other
   *  list views have. Applied on first paint (BRAND_SOFT tint +
   *  pulse + scroll-into-view), dismissed on first interaction,
   *  then cleared via {@link onFocusedRowConsumed} so re-renders
   *  never re-apply it. Optional. */
  initialFocusedRowId?: string | null;
  /** Fires once after RolloutsView consumes
   *  {@link initialFocusedRowId} so the parent can clear its seed
   *  slot. Mirrors the BookingsView / AwaitingCoordinationView
   *  callback. */
  onFocusedRowConsumed?: () => void;
}) {
  const rollouts = useMemo(() => getRollouts(), [refreshKey]);
  const services = getServices();
  const [showCreate, setShowCreate] = useState(false);

  // Source-row highlight (Task #190): mirror of the same machinery
  // in {@link BookingsView} / {@link AwaitingCoordinationView} so an
  // admin pivoting back into this list (via the
  // RolloutScheduleEditor "Back to rollouts" button) lands on a
  // visibly highlighted source row instead of losing their place.
  // Persistent BRAND_SOFT tint + one-shot pulse + scroll-into-view,
  // dismissed on first interaction (scroll / mousedown / keydown).
  // Seeded from `initialFocusedRowId` so first paint already carries
  // the highlight; re-seeded via the effect below when a fresh
  // non-null value lands mid-life.
  const [focusedRowId, setFocusedRowId] = useState<string | null>(
    initialFocusedRowId ?? null,
  );
  const [pulseRowId, setPulseRowId] = useState<string | null>(null);
  const rowRefs = useRef<Map<string, HTMLElement | null>>(new Map());
  // Re-apply when the parent hands us a fresh non-null seed mid-life
  // (admin pivots, dismisses, navigates away, pivots again into the
  // same component instance). Notify the parent so it can clear its
  // slot — otherwise unrelated re-renders would re-apply the
  // highlight after dismissal.
  useEffect(() => {
    if (initialFocusedRowId) {
      setFocusedRowId(initialFocusedRowId);
      setPulseRowId(initialFocusedRowId);
      onFocusedRowConsumed?.();
    }
    // Depend on seed value only, not callback identity — re-running
    // on consume-callback re-creation would defeat the one-shot
    // handoff invariant. Mirrors BookingsView's approach.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFocusedRowId]);
  useEffect(() => {
    if (!focusedRowId) return;
    const row = rowRefs.current.get(focusedRowId);
    if (row && typeof row.scrollIntoView === "function") {
      row.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [focusedRowId]);
  // Drop the pulse marker after the keyframe plays (1100ms = 1s
  // animation + small buffer so the class survives the final frame).
  useEffect(() => {
    if (!pulseRowId) return;
    const t = setTimeout(() => setPulseRowId(null), 1100);
    return () => clearTimeout(t);
  }, [pulseRowId]);
  // Dismiss on first interaction. Listeners are scoped to the
  // focus-id lifecycle so the originating click can't dismiss
  // mid-flight, and a subsequent pivot re-arms a fresh dismissal.
  useEffect(() => {
    if (!focusedRowId) return;
    function dismiss() {
      setFocusedRowId(null);
    }
    window.addEventListener("scroll", dismiss, { passive: true, capture: true });
    window.addEventListener("mousedown", dismiss, true);
    window.addEventListener("keydown", dismiss, true);
    return () => {
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("mousedown", dismiss, true);
      window.removeEventListener("keydown", dismiss, true);
    };
  }, [focusedRowId]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="text-[13px] text-slate-500">
          {rollouts.length} rollout{rollouts.length === 1 ? "" : "s"} ·
          one (service × building) pairing per row
        </div>
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white transition hover:brightness-110"
          style={{ backgroundColor: BRAND }}
        >
          <Plus className="h-3.5 w-3.5" />
          {showCreate ? "Cancel" : "New rollout"}
        </button>
      </div>

      {showCreate && (
        <Card title="New rollout" subtitle="Pick a service, a building, and capacity rules.">
          <CreateRolloutForm
            buildings={buildings}
            services={services}
            existing={rollouts}
            onCancel={() => setShowCreate(false)}
            onCreate={(input) => {
              onCreate(input);
              setShowCreate(false);
            }}
          />
        </Card>
      )}

      <Card>
        {rollouts.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-[13px] text-slate-500">
            No rollouts yet — click <strong>New rollout</strong> to open
            a building for bookings.
          </div>
        ) : (
          <ol className="flex flex-col gap-2">
            {rollouts.map((r) => {
              const isFocused = focusedRowId === r.id;
              const isPulsing = pulseRowId === r.id;
              return (
                <li key={r.id}>
                  <RolloutListRow
                    rollout={r}
                    buildings={buildings}
                    bookings={bookings}
                    onOpen={() => onOpen(r.id)}
                    isFocused={isFocused}
                    isPulsing={isPulsing}
                    rowRef={(el) => {
                      rowRefs.current.set(r.id, el);
                    }}
                  />
                </li>
              );
            })}
          </ol>
        )}
      </Card>
    </div>
  );
}

function RolloutListRow({
  rollout,
  buildings,
  bookings,
  onOpen,
  isFocused = false,
  isPulsing = false,
  rowRef,
}: {
  rollout: AdminRollout;
  buildings: AdminBuilding[];
  bookings: AdminBooking[];
  onOpen: () => void;
  isFocused?: boolean;
  isPulsing?: boolean;
  rowRef?: (el: HTMLButtonElement | null) => void;
}) {
  const building = buildings.find((b) => b.id === rollout.buildingId);
  const openWindows = rollout.days.reduce(
    (acc, d) =>
      acc +
      (d.open && d.morning.openByAdmin ? 1 : 0) +
      (d.open && d.afternoon.openByAdmin ? 1 : 0) +
      (d.open && d.evening?.openByAdmin ? 1 : 0),
    0,
  );
  const totalWindows = rollout.days.reduce(
    (acc, d) => acc + 2 + (d.evening ? 1 : 0),
    0,
  );
  const bookingsHere = bookings.filter((b) => b.rolloutId === rollout.id).length;
  const modeLabel =
    rollout.capacityModel === "slots_per_window"
      ? "Slots per window"
      : "Time budget per window";
  return (
    <button
      type="button"
      ref={rowRef}
      onClick={onOpen}
      data-testid={`rollouts-row-${rollout.id}`}
      data-focused={isFocused ? "true" : undefined}
      data-pulsing={isPulsing ? "true" : undefined}
      className={`flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 text-left transition hover:border-slate-300 hover:bg-slate-50${
        isPulsing ? " template-row-focus-pulse" : ""
      }`}
      style={isFocused ? { backgroundColor: BRAND_SOFT } : undefined}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <CalendarRange className="h-4 w-4 shrink-0" style={{ color: BRAND }} />
          <div className="truncate text-[14px] font-semibold text-slate-900">
            {rollout.name}
          </div>
        </div>
        <div className="mt-0.5 text-[12px] text-slate-500">
          {building ? building.name : rollout.buildingId} ·{" "}
          {formatRolloutDateRange({
            from: rollout.startDate,
            to: rollout.endDate,
          })}{" "}
          · {modeLabel}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">
          {openWindows}/{totalWindows} windows open
        </span>
        <span
          className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
          style={{ backgroundColor: BRAND_SOFT, color: BRAND_DEEP }}
        >
          {bookingsHere} booking{bookingsHere === 1 ? "" : "s"}
        </span>
      </div>
    </button>
  );
}

// ─── Create rollout form ───────────────────────────────────────────────────

function CreateRolloutForm({
  buildings,
  services,
  existing,
  onCancel,
  onCreate,
}: {
  buildings: AdminBuilding[];
  services: { id: string; name: string }[];
  existing: AdminRollout[];
  onCancel: () => void;
  onCreate: (input: {
    serviceId: string;
    buildingId: string;
    name: string;
    startDate: string;
    endDate: string;
    capacityModel: ServiceCapacityModel;
    defaultSlotCount?: number;
  }) => void;
}) {
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [buildingId, setBuildingId] = useState(buildings[0]?.id ?? "");
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("2026-05-01");
  const [endDate, setEndDate] = useState("2026-05-15");
  const [capacityModel, setCapacityModel] =
    useState<ServiceCapacityModel>("time_budget_per_window");
  const [defaultSlotCount, setDefaultSlotCount] = useState(6);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    if (!serviceId || !buildingId) {
      setError("Pick a service and a building.");
      return;
    }
    if (startDate > endDate) {
      setError("End date must be on or after the start date.");
      return;
    }
    if (existing.some((r) => r.serviceId === serviceId && r.buildingId === buildingId)) {
      setError(
        "A rollout for that service + building already exists. Open it from the list instead.",
      );
      return;
    }
    const building = buildings.find((b) => b.id === buildingId);
    const service = services.find((s) => s.id === serviceId);
    const finalName =
      name.trim() ||
      `${service?.name ?? "Service"} · ${building?.name ?? "Building"}`;
    onCreate({
      serviceId,
      buildingId,
      name: finalName,
      startDate,
      endDate,
      capacityModel,
      defaultSlotCount:
        capacityModel === "slots_per_window" ? defaultSlotCount : undefined,
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Service">
          <select
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white p-2 text-[13px] text-slate-800"
          >
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Building">
          <select
            value={buildingId}
            onChange={(e) => setBuildingId(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white p-2 text-[13px] text-slate-800"
          >
            {buildings.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Display name (optional)">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Phase 2 — May rollout"
            className="w-full rounded-lg border border-slate-200 bg-white p-2 text-[13px] text-slate-800 placeholder:text-slate-400"
          />
        </FormField>
        <FormField label="Capacity model">
          <select
            value={capacityModel}
            onChange={(e) =>
              setCapacityModel(e.target.value as ServiceCapacityModel)
            }
            className="w-full rounded-lg border border-slate-200 bg-white p-2 text-[13px] text-slate-800"
          >
            <option value="time_budget_per_window">Time budget per window</option>
            <option value="slots_per_window">Slots per window</option>
          </select>
        </FormField>
        <FormField label="Start date">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white p-2 text-[13px] text-slate-800"
          />
        </FormField>
        <FormField label="End date">
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white p-2 text-[13px] text-slate-800"
          />
        </FormField>
        {capacityModel === "slots_per_window" && (
          <FormField label="Default slots per window">
            <input
              type="number"
              min={1}
              max={20}
              value={defaultSlotCount}
              onChange={(e) =>
                setDefaultSlotCount(
                  Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 1)),
                )
              }
              className="w-full rounded-lg border border-slate-200 bg-white p-2 text-[13px] text-slate-800"
            />
          </FormField>
        )}
      </div>
      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-[12px] text-amber-800">
          {error}
        </div>
      )}
      <div className="flex items-center justify-end gap-2">
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
          className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white transition hover:brightness-110"
          style={{ backgroundColor: BRAND }}
        >
          Create rollout
        </button>
      </div>
    </div>
  );
}
