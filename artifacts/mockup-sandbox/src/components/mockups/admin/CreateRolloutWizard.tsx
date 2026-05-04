/**
 * 7-step wizard for creating a new rollout.
 *
 * Steps:
 *  1. Building & service
 *  2. Cycle label & date range
 *  3. Windows (morning / afternoon / evening toggles + times)
 *  4. Capacity model
 *  5. Release strategy
 *  6. Vendor (optional)
 *  7. Review & create
 */

import { Check, ChevronLeft, ChevronRight, Truck, X } from "lucide-react";
import { useState } from "react";

import {
  createRollout,
  getVendorRate,
  type AdminBuilding,
  type AdminRollout,
  type AdminVendor,
  type ReleaseStrategyMode,
  type ReleaseUnit,
  type ServiceCapacityModel,
  type VendorServiceRate,
  type WindowTimeRange,
} from "@/state/adminMockData";
import { persistRolloutsToStore } from "@/state/protoStore";

import { BRAND, BRAND_DEEP, BRAND_SOFT } from "./theme";

const TOTAL_STEPS = 7;

type WizardState = {
  // Step 1
  buildingId: string;
  serviceId: string;
  serviceName: string;
  // Step 2
  cycleLabel: string;
  selectedDates: string[];
  // Step 3
  windowMorning: boolean;
  windowAfternoon: boolean;
  windowEvening: boolean;
  morningStart: string;
  morningEnd: string;
  afternoonStart: string;
  afternoonEnd: string;
  eveningStart: string;
  eveningEnd: string;
  // Step 4
  capacityModel: ServiceCapacityModel;
  defaultSlotCount: number;
  windowMinutes: number;
  // Step 5
  releaseMode: ReleaseStrategyMode;
  releaseUnit: ReleaseUnit;
  releaseBatchSize: number;
  releaseThresholdPct: number;
  // Step 6
  defaultVendorId: string | null;
};

function defaultState(
  buildings: AdminBuilding[],
  services: { id: string; name: string }[],
  prefill?: Partial<WizardState>,
): WizardState {
  return {
    buildingId: prefill?.buildingId ?? buildings[0]?.id ?? "",
    serviceId: prefill?.serviceId ?? services[0]?.id ?? "",
    serviceName: prefill?.serviceName ?? services[0]?.name ?? "",
    cycleLabel: prefill?.cycleLabel ?? "",
    selectedDates: prefill?.selectedDates ?? [],
    windowMorning: prefill?.windowMorning ?? true,
    windowAfternoon: prefill?.windowAfternoon ?? true,
    windowEvening: prefill?.windowEvening ?? false,
    morningStart: prefill?.morningStart ?? "08:00",
    morningEnd: prefill?.morningEnd ?? "12:00",
    afternoonStart: prefill?.afternoonStart ?? "12:00",
    afternoonEnd: prefill?.afternoonEnd ?? "17:00",
    eveningStart: prefill?.eveningStart ?? "17:00",
    eveningEnd: prefill?.eveningEnd ?? "21:00",
    capacityModel: prefill?.capacityModel ?? "time_budget_per_window",
    defaultSlotCount: prefill?.defaultSlotCount ?? 6,
    windowMinutes: prefill?.windowMinutes ?? 240,
    releaseMode: prefill?.releaseMode ?? "manual_nudge",
    releaseUnit: prefill?.releaseUnit ?? "days",
    releaseBatchSize: prefill?.releaseBatchSize ?? 1,
    releaseThresholdPct: prefill?.releaseThresholdPct ?? 80,
    defaultVendorId: prefill?.defaultVendorId ?? null,
  };
}

export function CreateRolloutWizard({
  buildings,
  services,
  existing,
  vendors,
  vendorRates,
  prefill,
  onCreated,
  onCancel,
}: {
  buildings: AdminBuilding[];
  services: { id: string; name: string }[];
  existing: AdminRollout[];
  vendors: readonly AdminVendor[];
  vendorRates: readonly VendorServiceRate[];
  prefill?: Partial<WizardState>;
  onCreated: (rollout: AdminRollout) => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState(1);
  const [state, setState] = useState<WizardState>(() =>
    defaultState(buildings, services, prefill),
  );
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(patch: Partial<WizardState>) {
    setTouched(true);
    setState((prev) => ({ ...prev, ...patch }));
    setError(null);
  }

  function validateStep(): string | null {
    if (step === 1) {
      if (!state.buildingId) return "Select a building.";
      if (!state.serviceId) return "Select a service.";
      const dup = existing.find(
        (r) => r.serviceId === state.serviceId && r.buildingId === state.buildingId,
      );
      if (dup) return "A rollout for this service + building already exists.";
    }
    if (step === 2) {
      if (state.selectedDates.length === 0) return "Select at least one date on the calendar.";
    }
    if (step === 3) {
      if (!state.windowMorning && !state.windowAfternoon && !state.windowEvening)
        return "Enable at least one window.";
    }
    if (step === 4) {
      if (state.capacityModel === "slots_per_window" && state.defaultSlotCount < 1)
        return "Slot count must be at least 1.";
    }
    return null;
  }

  function goNext() {
    const err = validateStep();
    if (err) { setError(err); return; }
    setError(null);
    if (step < TOTAL_STEPS) setStep((s) => s + 1);
    else submit();
  }

  function goBack() {
    setError(null);
    if (step > 1) setStep((s) => s - 1);
  }

  function submit() {
    const building = buildings.find((b) => b.id === state.buildingId);
    const service = services.find((s) => s.id === state.serviceId);
    const label = state.cycleLabel.trim() || `${service?.name ?? "Service"} · ${building?.name ?? "Building"}`;

    const windowDefaults: { morning: WindowTimeRange; afternoon: WindowTimeRange; evening: WindowTimeRange } = {
      morning: { start: state.morningStart, end: state.morningEnd },
      afternoon: { start: state.afternoonStart, end: state.afternoonEnd },
      evening: { start: state.eveningStart, end: state.eveningEnd },
    };

    const created = createRollout({
      serviceId: state.serviceId,
      buildingId: state.buildingId,
      name: label,
      dates: state.selectedDates,
      capacityModel: state.capacityModel,
      defaultSlotCount: state.capacityModel === "slots_per_window" ? state.defaultSlotCount : undefined,
      defaultVendorId: state.defaultVendorId ?? undefined,
      releaseStrategy: {
        mode: state.releaseMode,
        thresholdPct: state.releaseThresholdPct,
        unit: state.releaseUnit,
        batchSize: state.releaseBatchSize,
      },
      windowDefaults,
    });
    persistRolloutsToStore();
    onCreated(created);
  }

  const isLastStep = step === TOTAL_STEPS;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="relative flex h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <div className="text-[15px] font-semibold text-slate-900">New rollout</div>
            <div className="text-[12px] text-slate-500">Step {step} of {TOTAL_STEPS}</div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close wizard"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Stepper bar */}
        <StepperBar step={step} total={TOTAL_STEPS} />

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === 1 && (
            <Step1BuildingService
              state={state}
              buildings={buildings}
              services={services}
              existing={existing}
              onChange={update}
            />
          )}
          {step === 2 && (
            <Step2CycleLabel state={state} onChange={update} />
          )}
          {step === 3 && (
            <Step3Windows state={state} onChange={update} />
          )}
          {step === 4 && (
            <Step4Capacity state={state} onChange={update} />
          )}
          {step === 5 && (
            <Step5ReleaseStrategy state={state} onChange={update} />
          )}
          {step === 6 && (
            <Step6Vendor
              state={state}
              vendors={vendors}
              vendorRates={vendorRates}
              onChange={update}
            />
          )}
          {step === 7 && (
            <Step7Review
              state={state}
              buildings={buildings}
              services={services}
              vendors={vendors}
              vendorRates={vendorRates}
            />
          )}
          {error && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[12px] text-amber-800">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
          <button
            type="button"
            onClick={goBack}
            disabled={step === 1}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Back
          </button>
          <button
            type="button"
            onClick={goNext}
            className="inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-[12px] font-semibold text-white transition hover:brightness-110"
            style={{ backgroundColor: BRAND }}
          >
            {isLastStep ? (
              <>
                <Check className="h-3.5 w-3.5" />
                Create rollout
              </>
            ) : (
              <>
                {step === 6 ? (state.defaultVendorId ? "Next" : "Skip & next") : "Next"}
                <ChevronRight className="h-3.5 w-3.5" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function StepperBar({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex h-1 w-full bg-slate-100">
      <div
        className="h-full transition-all duration-300"
        style={{ width: `${(step / total) * 100}%`, backgroundColor: BRAND }}
      />
    </div>
  );
}

// ─── Step 1: Building & service ───────────────────────────────────────────────

function Step1BuildingService({
  state,
  buildings,
  services,
  existing,
  onChange,
}: {
  state: WizardState;
  buildings: AdminBuilding[];
  services: { id: string; name: string }[];
  existing: AdminRollout[];
  onChange: (patch: Partial<WizardState>) => void;
}) {
  const conflict = existing.find(
    (r) => r.serviceId === state.serviceId && r.buildingId === state.buildingId,
  );
  return (
    <div className="flex flex-col gap-5">
      <StepHeader
        title="Building & service"
        subtitle="Choose the building and service type for this rollout."
      />
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
            Building
          </span>
          <select
            value={state.buildingId}
            onChange={(e) => onChange({ buildingId: e.target.value })}
            className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-[13px] text-slate-800 focus:border-slate-400 focus:outline-none"
          >
            {buildings.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
            Service
          </span>
          <select
            value={state.serviceId}
            onChange={(e) => {
              const svc = services.find((s) => s.id === e.target.value);
              onChange({ serviceId: e.target.value, serviceName: svc?.name ?? "" });
            }}
            className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-[13px] text-slate-800 focus:border-slate-400 focus:outline-none"
          >
            {services.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
        {conflict && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-800">
            A rollout already exists for this combination. Open it from the list instead.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Step 2: Cycle label & date range ────────────────────────────────────────

function Step2CycleLabel({
  state,
  onChange,
}: {
  state: WizardState;
  onChange: (patch: Partial<WizardState>) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <StepHeader
        title="Cycle label & dates"
        subtitle="Give this rollout a name and pick specific service dates — they don't have to be consecutive."
      />
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
            Cycle label (optional)
          </span>
          <input
            type="text"
            value={state.cycleLabel}
            onChange={(e) => onChange({ cycleLabel: e.target.value })}
            placeholder="e.g. Winter 2026, Phase 2, May rollout"
            className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-[13px] text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
          />
          <span className="text-[11px] text-slate-400">
            Defaults to "{state.serviceName} · {state.buildingId}" if left blank.
          </span>
        </label>

        <div>
          <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
            Service dates
          </span>
          <p className="mb-3 mt-0.5 text-[12px] text-slate-400">
            Click any date to add or remove it. Dates don't need to be consecutive.
          </p>
          <MonthCalendar
            selectedDates={state.selectedDates}
            onToggle={(iso) => {
              const next = state.selectedDates.includes(iso)
                ? state.selectedDates.filter((d) => d !== iso)
                : [...state.selectedDates, iso].sort();
              onChange({ selectedDates: next });
            }}
          />
        </div>

        {state.selectedDates.length > 0 && (
          <>
            <div
              className="rounded-lg p-3 text-[12px] font-medium"
              style={{ backgroundColor: BRAND_SOFT, color: BRAND_DEEP }}
            >
              {state.selectedDates.length} date{state.selectedDates.length !== 1 ? "s" : ""} selected
            </div>
            <div className="flex flex-wrap gap-1.5">
              {state.selectedDates.map((iso) => (
                <span
                  key={iso}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700"
                >
                  {new Date(iso).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}
                  <button
                    type="button"
                    onClick={() => {
                      onChange({ selectedDates: state.selectedDates.filter((d) => d !== iso) });
                    }}
                    className="ml-0.5 text-slate-400 hover:text-slate-700"
                    aria-label={`Remove ${iso}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Month Calendar ────────────────────────────────────────────────────────────

function MonthCalendar({
  selectedDates,
  onToggle,
}: {
  selectedDates: string[];
  onToggle: (iso: string) => void;
}) {
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const selectedSet = new Set(selectedDates);

  const firstDay = new Date(calYear, calMonth, 1);
  const lastDay = new Date(calYear, calMonth + 1, 0);
  const startDow = firstDay.getDay();

  const cells: (string | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) {
    cells.push(
      `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
    );
  }

  const monthLabel = firstDay.toLocaleDateString("en-AU", { month: "long", year: "numeric" });

  function prevMonth(e: React.MouseEvent) {
    e.preventDefault();
    if (calMonth === 0) { setCalYear((y) => y - 1); setCalMonth(11); }
    else setCalMonth((m) => m - 1);
  }
  function nextMonth(e: React.MouseEvent) {
    e.preventDefault();
    if (calMonth === 11) { setCalYear((y) => y + 1); setCalMonth(0); }
    else setCalMonth((m) => m + 1);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={prevMonth}
          className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
          aria-label="Previous month"
        >
          ‹
        </button>
        <span className="text-[13px] font-semibold text-slate-900">{monthLabel}</span>
        <button
          type="button"
          onClick={nextMonth}
          className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
          aria-label="Next month"
        >
          ›
        </button>
      </div>
      <div className="mb-1 grid grid-cols-7">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <div key={d} className="py-1 text-center text-[10px] font-medium text-slate-400">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((iso, i) => {
          if (!iso) return <div key={`e-${i}`} />;
          const isPast = iso < todayIso;
          const isSelected = selectedSet.has(iso);
          const isWknd = new Date(iso).getDay() === 0 || new Date(iso).getDay() === 6;
          return (
            <button
              key={iso}
              type="button"
              disabled={isPast}
              onClick={() => onToggle(iso)}
              className={`h-8 rounded text-[12px] font-medium transition ${
                isSelected
                  ? "text-white"
                  : isPast
                    ? "cursor-not-allowed text-slate-200"
                    : isWknd
                      ? "text-slate-400 hover:bg-slate-100"
                      : "text-slate-700 hover:bg-slate-100"
              }`}
              style={isSelected ? { backgroundColor: BRAND } : undefined}
              title={iso}
            >
              {parseInt(iso.slice(-2), 10)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Step 3: Windows ─────────────────────────────────────────────────────────

function Step3Windows({
  state,
  onChange,
}: {
  state: WizardState;
  onChange: (patch: Partial<WizardState>) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <StepHeader
        title="Service windows"
        subtitle="Choose which time windows are active and set their start/end times."
      />
      <div className="flex flex-col gap-3">
        <WindowRow
          label="Morning"
          active={state.windowMorning}
          start={state.morningStart}
          end={state.morningEnd}
          onToggle={() => onChange({ windowMorning: !state.windowMorning })}
          onStart={(v) => onChange({ morningStart: v })}
          onEnd={(v) => onChange({ morningEnd: v })}
        />
        <WindowRow
          label="Afternoon"
          active={state.windowAfternoon}
          start={state.afternoonStart}
          end={state.afternoonEnd}
          onToggle={() => onChange({ windowAfternoon: !state.windowAfternoon })}
          onStart={(v) => onChange({ afternoonStart: v })}
          onEnd={(v) => onChange({ afternoonEnd: v })}
        />
        <WindowRow
          label="Evening"
          active={state.windowEvening}
          start={state.eveningStart}
          end={state.eveningEnd}
          onToggle={() => onChange({ windowEvening: !state.windowEvening })}
          onStart={(v) => onChange({ eveningStart: v })}
          onEnd={(v) => onChange({ eveningEnd: v })}
        />
      </div>
      <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-[12px] text-slate-500">
        Preview: {[
          state.windowMorning ? `Morning (${state.morningStart}–${state.morningEnd})` : null,
          state.windowAfternoon ? `Afternoon (${state.afternoonStart}–${state.afternoonEnd})` : null,
          state.windowEvening ? `Evening (${state.eveningStart}–${state.eveningEnd})` : null,
        ].filter(Boolean).join(" · ") || "No windows selected"}
      </div>
    </div>
  );
}

function WindowRow({
  label,
  active,
  start,
  end,
  onToggle,
  onStart,
  onEnd,
}: {
  label: string;
  active: boolean;
  start: string;
  end: string;
  onToggle: () => void;
  onStart: (v: string) => void;
  onEnd: (v: string) => void;
}) {
  return (
    <div
      className={`rounded-lg border p-3 transition ${active ? "border-slate-300 bg-white" : "border-slate-100 bg-slate-50 opacity-60"}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold text-slate-800">{label}</span>
        <button
          type="button"
          onClick={onToggle}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${active ? "bg-[#ED017F]" : "bg-slate-200"}`}
          aria-pressed={active}
        >
          <span
            className={`absolute h-4 w-4 rounded-full bg-white shadow transition-all ${active ? "left-4" : "left-0.5"}`}
          />
        </button>
      </div>
      {active && (
        <div className="mt-3 flex items-center gap-3">
          <label className="flex items-center gap-2 text-[12px] text-slate-600">
            Start
            <input
              type="time"
              value={start}
              onChange={(e) => onStart(e.target.value)}
              className="rounded border border-slate-200 bg-white px-2 py-1 text-[12px] text-slate-800 focus:outline-none"
            />
          </label>
          <span className="text-slate-400">–</span>
          <label className="flex items-center gap-2 text-[12px] text-slate-600">
            End
            <input
              type="time"
              value={end}
              onChange={(e) => onEnd(e.target.value)}
              className="rounded border border-slate-200 bg-white px-2 py-1 text-[12px] text-slate-800 focus:outline-none"
            />
          </label>
        </div>
      )}
    </div>
  );
}

// ─── Step 4: Capacity ─────────────────────────────────────────────────────────

function Step4Capacity({
  state,
  onChange,
}: {
  state: WizardState;
  onChange: (patch: Partial<WizardState>) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <StepHeader
        title="Capacity"
        subtitle="How should this rollout track available space in each window?"
      />
      <div className="flex flex-col gap-3">
        <CapacityOption
          selected={state.capacityModel === "time_budget_per_window"}
          title="Time budget per window"
          description="The window has a total number of minutes. Each booking consumes its estimated job duration. Works best when job times vary a lot (e.g. different number of systems per unit)."
          onClick={() => onChange({ capacityModel: "time_budget_per_window" })}
        />
        <CapacityOption
          selected={state.capacityModel === "slots_per_window"}
          title="Fixed slots per window"
          description="The window has a fixed number of booking slots. Each booking takes exactly one slot regardless of size. Simpler to reason about but less precise for mixed-duration jobs."
          onClick={() => onChange({ capacityModel: "slots_per_window" })}
        />
      </div>
      {state.capacityModel === "slots_per_window" && (
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
            Default slots per window
          </span>
          <input
            type="number"
            min={1}
            max={20}
            value={state.defaultSlotCount}
            onChange={(e) =>
              onChange({ defaultSlotCount: Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 1)) })
            }
            className="w-32 rounded-lg border border-slate-200 bg-white p-2.5 text-[13px] text-slate-800 focus:border-slate-400 focus:outline-none"
          />
          <span className="text-[11px] text-slate-400">You can adjust per-day later in the schedule editor.</span>
        </label>
      )}
    </div>
  );
}

function CapacityOption({
  selected,
  title,
  description,
  onClick,
}: {
  selected: boolean;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border p-4 text-left transition ${selected ? "border-[#ED017F] bg-[#FCE7F1]" : "border-slate-200 bg-white hover:border-slate-300"}`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition ${selected ? "border-[#ED017F] bg-[#ED017F]" : "border-slate-300"}`}
        >
          {selected && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
        </div>
        <div>
          <div className="text-[13px] font-semibold text-slate-900">{title}</div>
          <div className="mt-0.5 text-[12px] text-slate-500">{description}</div>
        </div>
      </div>
    </button>
  );
}

// ─── Step 5: Release strategy ─────────────────────────────────────────────────

const RELEASE_OPTIONS: { mode: ReleaseStrategyMode; title: string; note: string }[] = [
  {
    mode: "manual_nudge",
    title: "Manual",
    note: "You decide when to release dates. Safest while you're still setting things up. Use the 'Release next batch' button in the schedule editor.",
  },
  {
    mode: "auto_at_threshold",
    title: "Auto — when threshold reached",
    note: "Automatically releases the next batch of dates once the current released windows reach a fill threshold (e.g. 80% booked). Great for staggered demand.",
  },
  {
    mode: "auto_when_full",
    title: "Auto — when fully booked",
    note: "Automatically releases the next batch once every released window is 100% full. More aggressive than the threshold mode.",
  },
];

function Step5ReleaseStrategy({
  state,
  onChange,
}: {
  state: WizardState;
  onChange: (patch: Partial<WizardState>) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <StepHeader
        title="Release strategy"
        subtitle="How should staged dates be released to customers?"
      />
      <div className="flex flex-col gap-3">
        {RELEASE_OPTIONS.map((opt) => (
          <button
            key={opt.mode}
            type="button"
            onClick={() => onChange({ releaseMode: opt.mode })}
            className={`rounded-lg border p-4 text-left transition ${state.releaseMode === opt.mode ? "border-[#ED017F] bg-[#FCE7F1]" : "border-slate-200 bg-white hover:border-slate-300"}`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition ${state.releaseMode === opt.mode ? "border-[#ED017F] bg-[#ED017F]" : "border-slate-300"}`}
              >
                {state.releaseMode === opt.mode && (
                  <div className="h-1.5 w-1.5 rounded-full bg-white" />
                )}
              </div>
              <div>
                <div className="text-[13px] font-semibold text-slate-900">{opt.title}</div>
                <div className="mt-0.5 text-[12px] text-slate-500">{opt.note}</div>
              </div>
            </div>
          </button>
        ))}
      </div>
      {state.releaseMode === "auto_at_threshold" && (
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
            Threshold (%)
          </span>
          <input
            type="number"
            min={1}
            max={100}
            value={state.releaseThresholdPct}
            onChange={(e) =>
              onChange({ releaseThresholdPct: Math.max(1, Math.min(100, parseInt(e.target.value, 10) || 80)) })
            }
            className="w-24 rounded-lg border border-slate-200 bg-white p-2.5 text-[13px] text-slate-800 focus:border-slate-400 focus:outline-none"
          />
        </label>
      )}
      {(state.releaseMode === "auto_at_threshold" || state.releaseMode === "auto_when_full") && (
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
            Batch size (dates to release at once)
          </span>
          <input
            type="number"
            min={1}
            max={10}
            value={state.releaseBatchSize}
            onChange={(e) =>
              onChange({ releaseBatchSize: Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 1)) })
            }
            className="w-24 rounded-lg border border-slate-200 bg-white p-2.5 text-[13px] text-slate-800 focus:border-slate-400 focus:outline-none"
          />
        </label>
      )}
    </div>
  );
}

// ─── Step 6: Vendor ──────────────────────────────────────────────────────────

function Step6Vendor({
  state,
  vendors,
  vendorRates,
  onChange,
}: {
  state: WizardState;
  vendors: readonly AdminVendor[];
  vendorRates: readonly VendorServiceRate[];
  onChange: (patch: Partial<WizardState>) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <StepHeader
        title="Vendor"
        subtitle="Assign a default vendor for this rollout — or skip and assign later per day or booking."
      />
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => onChange({ defaultVendorId: null })}
          className={`rounded-lg border p-4 text-left transition ${state.defaultVendorId === null ? "border-[#ED017F] bg-[#FCE7F1]" : "border-slate-200 bg-white hover:border-slate-300"}`}
        >
          <div className="flex items-start gap-3">
            <div
              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition ${state.defaultVendorId === null ? "border-[#ED017F] bg-[#ED017F]" : "border-slate-300"}`}
            >
              {state.defaultVendorId === null && (
                <div className="h-1.5 w-1.5 rounded-full bg-white" />
              )}
            </div>
            <div>
              <div className="text-[13px] font-semibold text-slate-900">Skip — assign later</div>
              <div className="mt-0.5 text-[12px] text-slate-500">
                Taylr manages. You can set a vendor per date or per booking from the schedule editor.
              </div>
            </div>
          </div>
        </button>
        {vendors.map((vendor) => {
          const rate = getVendorRate(vendor.id, state.serviceId, vendorRates);
          const customerPrice = 179;
          const margin = rate != null ? customerPrice - rate : null;
          const marginPct = rate != null && customerPrice > 0 ? ((customerPrice - rate) / customerPrice * 100) : null;
          return (
            <button
              key={vendor.id}
              type="button"
              onClick={() => onChange({ defaultVendorId: vendor.id })}
              className={`rounded-lg border p-4 text-left transition ${state.defaultVendorId === vendor.id ? "border-[#ED017F] bg-[#FCE7F1]" : "border-slate-200 bg-white hover:border-slate-300"}`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition ${state.defaultVendorId === vendor.id ? "border-[#ED017F] bg-[#ED017F]" : "border-slate-300"}`}
                >
                  {state.defaultVendorId === vendor.id && (
                    <div className="h-1.5 w-1.5 rounded-full bg-white" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div className="text-[13px] font-semibold text-slate-900">{vendor.company}</div>
                    {rate != null && (
                      <div className="text-[11px] font-semibold text-slate-500">
                        Cost ${rate} · Margin ${margin?.toFixed(0)} ({marginPct?.toFixed(0)}%)
                      </div>
                    )}
                  </div>
                  <div className="mt-0.5 text-[12px] text-slate-500">
                    {vendor.contactName} · {vendor.email}
                  </div>
                  {rate == null && (
                    <div className="mt-0.5 text-[11px] text-amber-600">No rate configured for this service</div>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Step 7: Review ──────────────────────────────────────────────────────────

function Step7Review({
  state,
  buildings,
  services,
  vendors,
  vendorRates,
}: {
  state: WizardState;
  buildings: AdminBuilding[];
  services: { id: string; name: string }[];
  vendors: readonly AdminVendor[];
  vendorRates: readonly VendorServiceRate[];
}) {
  const building = buildings.find((b) => b.id === state.buildingId);
  const service = services.find((s) => s.id === state.serviceId);
  const vendor = state.defaultVendorId
    ? vendors.find((v) => v.id === state.defaultVendorId)
    : null;
  const rate = state.defaultVendorId
    ? getVendorRate(state.defaultVendorId, state.serviceId, vendorRates)
    : null;
  const label = state.cycleLabel.trim() || `${service?.name ?? "Service"} · ${building?.name ?? "Building"}`;
  const windows = [
    state.windowMorning ? `Morning ${state.morningStart}–${state.morningEnd}` : null,
    state.windowAfternoon ? `Afternoon ${state.afternoonStart}–${state.afternoonEnd}` : null,
    state.windowEvening ? `Evening ${state.eveningStart}–${state.eveningEnd}` : null,
  ].filter(Boolean);

  const releaseLabel =
    state.releaseMode === "manual_nudge"
      ? "Manual"
      : state.releaseMode === "auto_at_threshold"
        ? `Auto at ${state.releaseThresholdPct}% fill (batch ${state.releaseBatchSize})`
        : `Auto when full (batch ${state.releaseBatchSize})`;

  return (
    <div className="flex flex-col gap-4">
      <StepHeader
        title="Review & create"
        subtitle="Check everything looks right, then create the rollout."
      />
      <div className="rounded-xl border border-slate-200 bg-white">
        <Row label="Name" value={label} />
        <Row label="Building" value={building?.name ?? state.buildingId} />
        <Row label="Service" value={service?.name ?? state.serviceId} />
        <Row
          label="Dates"
          value={
            state.selectedDates.length === 0
              ? "No dates selected"
              : `${state.selectedDates.length} date${state.selectedDates.length !== 1 ? "s" : ""}: ${state.selectedDates[0]}${state.selectedDates.length > 1 ? ` → ${state.selectedDates[state.selectedDates.length - 1]}` : ""}`
          }
        />
        <Row label="Windows" value={windows.join(" · ") || "None"} />
        <Row
          label="Capacity"
          value={
            state.capacityModel === "slots_per_window"
              ? `${state.defaultSlotCount} slots per window`
              : "Time budget per window"
          }
        />
        <Row label="Release strategy" value={releaseLabel} />
        <Row
          label="Default vendor"
          value={
            vendor
              ? `${vendor.company}${rate != null ? ` · Cost $${rate} · Margin $${(179 - rate).toFixed(0)} (${((179 - rate) / 179 * 100).toFixed(0)}%)` : ""}`
              : "Unassigned — set per day or booking later"
          }
        />
      </div>
      <div
        className="rounded-lg p-3 text-[12px]"
        style={{ backgroundColor: BRAND_SOFT, color: BRAND_DEEP }}
      >
        <Truck className="mb-1 h-3.5 w-3.5 inline mr-1" />
        After creating, open the rollout to release dates to customers and fine-tune per-day vendor assignments.
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between border-b border-slate-100 px-4 py-3 last:border-b-0">
      <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500 shrink-0 w-32">
        {label}
      </span>
      <span className="text-right text-[13px] font-medium text-slate-900">{value}</span>
    </div>
  );
}

function StepHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-1">
      <div className="text-[16px] font-semibold text-slate-900">{title}</div>
      <div className="mt-0.5 text-[13px] text-slate-500">{subtitle}</div>
    </div>
  );
}
