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

import { AlertTriangle, CalendarRange, Copy, Plus, Truck } from "lucide-react";
import { useMemo, useState } from "react";

import {
  createRollout,
  formatRolloutDateRange,
  getRollouts,
  getServices,
  persistRolloutsToStore,
  shouldNudgeManualRelease,
  type AdminBooking,
  type AdminBuilding,
  type AdminRollout,
  type AdminVendor,
  type VendorServiceRate,
} from "@/state/adminMockData";

import { Card } from "./atoms";
import { CreateRolloutWizard } from "./CreateRolloutWizard";
import { BRAND, BRAND_DEEP, BRAND_SOFT } from "./theme";
import {
  useFocusedRowHighlight,
  type FocusedRowProps,
} from "./useFocusedRowHighlight";

type WizardPrefill = Parameters<typeof CreateRolloutWizard>[0]["prefill"];

export function RolloutsView({
  buildings,
  bookings,
  vendors,
  vendorRates,
  onCreated,
  onOpen,
  /** Bumped on every create so the list refreshes from the
   *  module-level store. */
  refreshKey,
  initialFocusedRowId,
  onFocusedRowConsumed,
}: {
  buildings: AdminBuilding[];
  bookings: AdminBooking[];
  vendors: readonly AdminVendor[];
  vendorRates: readonly VendorServiceRate[];
  onCreated: (rollout: AdminRollout) => void;
  onOpen: (rolloutId: string) => void;
  refreshKey: number;
  initialFocusedRowId?: string | null;
  onFocusedRowConsumed?: () => void;
}) {
  const rollouts = useMemo(() => getRollouts(), [refreshKey]);
  const services = getServices();
  const [showWizard, setShowWizard] = useState(false);
  const [wizardPrefill, setWizardPrefill] = useState<WizardPrefill>(undefined);

  const { focusedRowProps } = useFocusedRowHighlight<HTMLButtonElement>({
    initialFocusedRowId,
    onFocusedRowConsumed,
  });

  function openWizard(prefill?: WizardPrefill) {
    setWizardPrefill(prefill);
    setShowWizard(true);
  }

  function handleDuplicate(source: AdminRollout) {
    // Shift dates by 14 days and pre-fill the wizard
    const shiftDate = (iso: string, days: number) => {
      const d = new Date(iso);
      d.setDate(d.getDate() + days);
      return d.toISOString().slice(0, 10);
    };
    openWizard({
      buildingId: source.buildingId,
      serviceId: source.serviceId,
      capacityModel: source.capacityModel,
      defaultVendorId: source.defaultVendorId ?? null,
      startDate: shiftDate(source.endDate, 1),
      endDate: shiftDate(source.endDate, 14),
      cycleLabel: source.name + " (copy)",
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="text-[13px] text-slate-500">
          {rollouts.length} rollout{rollouts.length === 1 ? "" : "s"} ·
          one (service × building) pairing per row
        </div>
        <button
          type="button"
          onClick={() => openWizard()}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white transition hover:brightness-110"
          style={{ backgroundColor: BRAND }}
        >
          <Plus className="h-3.5 w-3.5" />
          New rollout
        </button>
      </div>

      <Card>
        {rollouts.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-[13px] text-slate-500">
            No rollouts yet — click <strong>New rollout</strong> to open
            a building for bookings.
          </div>
        ) : (
          <ol className="flex flex-col gap-2">
            {rollouts.map((r) => (
              <li key={r.id}>
                <RolloutListRow
                  rollout={r}
                  buildings={buildings}
                  bookings={bookings}
                  vendors={vendors}
                  onOpen={() => onOpen(r.id)}
                  onDuplicate={() => handleDuplicate(r)}
                  focusProps={focusedRowProps(r.id)}
                />
              </li>
            ))}
          </ol>
        )}
      </Card>

      {showWizard && (
        <CreateRolloutWizard
          buildings={buildings}
          services={services}
          existing={rollouts}
          vendors={vendors}
          vendorRates={vendorRates}
          prefill={wizardPrefill}
          onCreated={(rollout) => {
            setShowWizard(false);
            onCreated(rollout);
          }}
          onCancel={() => setShowWizard(false)}
        />
      )}
    </div>
  );
}

function RolloutListRow({
  rollout,
  buildings,
  bookings,
  vendors,
  onOpen,
  onDuplicate,
  focusProps,
}: {
  rollout: AdminRollout;
  buildings: AdminBuilding[];
  bookings: AdminBooking[];
  vendors: readonly AdminVendor[];
  onOpen: () => void;
  onDuplicate: () => void;
  focusProps: FocusedRowProps<HTMLButtonElement>;
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
  const defaultVendor = rollout.defaultVendorId
    ? vendors.find((v) => v.id === rollout.defaultVendorId)
    : null;

  return (
    <div className="group flex items-center gap-2">
      <button
        type="button"
        ref={focusProps.ref}
        onClick={onOpen}
        data-testid={`rollouts-row-${rollout.id}`}
        data-focused={focusProps["data-focused"]}
        data-pulsing={focusProps["data-pulsing"]}
        className={`flex flex-1 items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 text-left transition hover:border-slate-300 hover:bg-slate-50${focusProps.pulseClassName}`}
        style={focusProps.style}
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
          {shouldNudgeManualRelease(rollout) && (
            <span
              data-testid={`rollouts-row-${rollout.id}-nudge-badge`}
              className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800"
              title="Released windows are at 80%+. Release the next batch when ready."
            >
              <AlertTriangle className="h-3 w-3" />
              Release nudge
            </span>
          )}
          {defaultVendor && (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600"
              title={`Default vendor: ${defaultVendor.company}`}
            >
              <Truck className="h-3 w-3" />
              {defaultVendor.company}
            </span>
          )}
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
      <button
        type="button"
        onClick={onDuplicate}
        className="shrink-0 rounded-lg border border-slate-200 bg-white p-2 text-slate-400 opacity-0 transition hover:border-slate-300 hover:text-slate-700 group-hover:opacity-100"
        title="Duplicate rollout (pre-fills wizard)"
        aria-label="Duplicate rollout"
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
