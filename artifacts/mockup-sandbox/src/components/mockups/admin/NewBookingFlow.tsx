/**
 * Admin "New booking" flow — book on behalf of a customer who called in.
 *
 * Full-screen overlay rendered inside the admin shell, walking through:
 *   1. Unit + customer    (search / building filter / customer details)
 *   2. AC config          (pre-filled from unit, editable, discrepancy)
 *   3. Schedule           (per-window availability OR "to be coordinated")
 *   4. Review + confirm   (creates pending-payment booking)
 *
 * State is local — cancel-from-anywhere just unmounts the overlay so
 * nothing leaks back into the admin shell. On confirm the parent gets
 * an `AdminBooking` (built via {@link buildAdminCreatedBooking}) plus
 * the schedule choice so it can also bump the global slot calendar.
 */

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Building2,
  Check,
  ChevronRight,
  Clock,
  Hash,
  Search,
  TriangleAlert,
  X,
} from "lucide-react";

import {
  bookingDurationMinutes,
  buildAdminCreatedBooking,
  computeAdminAcDiscrepancy,
  getBuildingForUnit,
  nextBookingId,
  PRICE_PER_ADDITIONAL_INDOOR_AUD,
  PRICE_PER_SYSTEM_AUD,
  slotIsAvailable,
  type AdminBooking,
  type AdminBuilding,
  type AdminCalendarDay,
  type AdminCreatedScheduleChoice,
  type AdminSlot,
  type AdminUnit,
} from "@/state/adminMockData";
import {
  DEMO_MANAGING_AGENCIES,
  isOtherAgency,
  OTHER_AGENCY_ID,
} from "@/state/accessMethodCatalog";
import { formatDurationMinutes } from "@/state/bookingDerived";

import { FormField } from "./atoms";
import { BRAND, BRAND_DEEP, BRAND_SOFT, modeColor } from "./theme";

// ─── Local form state ──────────────────────────────────────────────────────

type AcType = "split" | "ducted" | "unsure";

type FormState = {
  // Step 1
  buildingFilter: string; // building id, "all" = no filter
  search: string;
  unitId: string | null;
  bookerRole: "owner" | "agent";
  agencyId: string | null;
  agencyOtherName: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  // Step 2
  acType: AcType;
  acSystems: number;
  acAdditional: number;
  // Step 3
  scheduleMode: "pick_slot" | "to_be_coordinated";
  pickedDate: string | null;
  pickedWindow: "morning" | "afternoon" | null;
};

function initialForm(presetBuildingId: string | null): FormState {
  return {
    buildingFilter: presetBuildingId ?? "all",
    search: "",
    unitId: null,
    bookerRole: "owner",
    agencyId: null,
    agencyOtherName: "",
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    acType: "split",
    acSystems: 1,
    acAdditional: 0,
    scheduleMode: "pick_slot",
    pickedDate: null,
    pickedWindow: null,
  };
}

// ─── Top-level component ───────────────────────────────────────────────────

export function NewBookingFlow({
  units,
  buildings,
  bookings,
  calendar,
  presetBuildingId,
  onCancel,
  onConfirm,
}: {
  units: AdminUnit[];
  buildings: AdminBuilding[];
  bookings: AdminBooking[];
  calendar: AdminCalendarDay[];
  /** When opened from a building detail screen, the building filter is
   *  pre-applied so the admin only sees units in that building. */
  presetBuildingId: string | null;
  onCancel: () => void;
  onConfirm: (booking: AdminBooking, schedule: AdminCreatedScheduleChoice) => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [form, setForm] = useState<FormState>(() => initialForm(presetBuildingId));

  const selectedUnit = useMemo(
    () => units.find((u) => u.id === form.unitId) ?? null,
    [units, form.unitId],
  );

  // Whenever the admin picks a unit, pre-fill the AC fields from the
  // unit's record. We do this in a derived effect-style callback rather
  // than a `useEffect` so the prefill happens atomically with the click.
  function selectUnit(unitId: string) {
    const u = units.find((x) => x.id === unitId);
    if (!u) return;
    const recordedKnown = u.ac.type === "split" || u.ac.type === "ducted";
    setForm((prev) => ({
      ...prev,
      unitId,
      acType: recordedKnown ? (u.ac.type as AcType) : "unsure",
      acSystems: recordedKnown ? Math.max(1, u.ac.systems) : 1,
      acAdditional: recordedKnown ? u.ac.additional : 0,
    }));
  }

  // ── Gating per step ───────────────────────────────────────────────────
  const step1Valid = (() => {
    if (!form.unitId) return false;
    if (form.customerName.trim().length === 0) return false;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.customerEmail.trim())) return false;
    if (form.customerPhone.trim().length === 0) return false;
    if (form.bookerRole === "agent") {
      if (!form.agencyId) return false;
      if (
        isOtherAgency(form.agencyId) &&
        form.agencyOtherName.trim().length === 0
      ) {
        return false;
      }
    }
    return true;
  })();

  const step2Valid = (() => {
    if (form.acType === "unsure") return true;
    return form.acSystems >= 1 && form.acAdditional >= 0;
  })();

  // Step 3 is only valid when the picked slot still fits the *current*
  // job duration. This guards against the user picking a slot, going
  // back to Step 2, bumping AC counts so the job no longer fits, and
  // then sailing through Continue with a stale (now-disabled) slot.
  const step3Valid = (() => {
    if (form.scheduleMode === "to_be_coordinated") return true;
    if (form.pickedDate === null || form.pickedWindow === null) return false;
    const day = calendar.find((d) => d.isoDate === form.pickedDate);
    if (!day || !day.open) return false;
    const slot = form.pickedWindow === "morning" ? day.morning : day.afternoon;
    return slotIsAvailable(slot, derivedJobMinutes(form));
  })();

  function go(next: 1 | 2 | 3 | 4) {
    setStep(next);
  }

  function handleConfirm() {
    if (!selectedUnit) return;
    // Belt-and-suspenders: even though Step 3 / Continue gating prevents
    // a stale slot from reaching Step 4, re-check at the confirm
    // boundary so we never write an over-booked slot into the calendar.
    if (!step3Valid) return;
    const schedule: AdminCreatedScheduleChoice =
      form.scheduleMode === "to_be_coordinated"
        ? { kind: "to_be_coordinated" }
        : {
            kind: "slot",
            date: form.pickedDate!,
            window: form.pickedWindow!,
          };
    const booking = buildAdminCreatedBooking(
      {
        unit: selectedUnit,
        customerName: form.customerName.trim(),
        customerEmail: form.customerEmail.trim(),
        customerPhone: form.customerPhone.trim(),
        bookerRole: form.bookerRole,
        bookerAgencyId: form.bookerRole === "agent" ? form.agencyId : null,
        bookerAgencyOtherName: form.agencyOtherName.trim(),
        ac: {
          type: form.acType,
          systems: form.acSystems,
          additional: form.acAdditional,
        },
        schedule,
      },
      nextBookingId(bookings),
    );
    onConfirm(booking, schedule);
  }

  return (
    <div
      className="fixed inset-0 z-30 flex items-stretch justify-center bg-slate-900/40 p-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="New phone booking"
    >
      <div className="flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <header className="flex shrink-0 items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Phone booking
            </div>
            <div className="text-[18px] font-semibold leading-tight text-slate-900">
              New booking on behalf of customer
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel new booking"
            className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {/* Step indicator */}
        <StepIndicator step={step} />

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === 1 && (
            <Step1UnitCustomer
              units={units}
              buildings={buildings}
              form={form}
              setForm={setForm}
              onSelectUnit={selectUnit}
            />
          )}
          {step === 2 && selectedUnit && (
            <Step2Ac unit={selectedUnit} form={form} setForm={setForm} />
          )}
          {step === 3 && (
            <Step3Schedule
              calendar={calendar}
              jobMinutes={derivedJobMinutes(form)}
              form={form}
              setForm={setForm}
            />
          )}
          {step === 4 && selectedUnit && (
            <Step4Review
              unit={selectedUnit}
              buildings={buildings}
              form={form}
            />
          )}
        </div>

        {/* Footer */}
        <footer className="flex shrink-0 items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-3">
          <div className="flex items-center gap-2">
            {step > 1 ? (
              <button
                type="button"
                onClick={() => go((step - 1) as 1 | 2 | 3)}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium text-slate-700 transition hover:bg-slate-200"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
            ) : (
              <button
                type="button"
                onClick={onCancel}
                className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-slate-700 transition hover:bg-slate-200"
              >
                Cancel
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {step < 4 ? (
              <button
                type="button"
                disabled={
                  (step === 1 && !step1Valid) ||
                  (step === 2 && !step2Valid) ||
                  (step === 3 && !step3Valid)
                }
                onClick={() => go((step + 1) as 2 | 3 | 4)}
                className="inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-[13px] font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
                style={{ backgroundColor: BRAND }}
              >
                Continue
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleConfirm}
                className="inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-[13px] font-semibold text-white transition"
                style={{ backgroundColor: BRAND }}
              >
                <Check className="h-4 w-4" />
                Create booking
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}

// ─── Step indicator ────────────────────────────────────────────────────────

const STEPS: ReadonlyArray<{ n: 1 | 2 | 3 | 4; label: string }> = [
  { n: 1, label: "Unit & customer" },
  { n: 2, label: "AC config" },
  { n: 3, label: "Schedule" },
  { n: 4, label: "Review" },
];

function StepIndicator({ step }: { step: 1 | 2 | 3 | 4 }) {
  return (
    <ol className="flex shrink-0 items-center gap-1.5 border-b border-slate-200 bg-slate-50 px-6 py-3">
      {STEPS.map((s, i) => {
        const done = step > s.n;
        const active = step === s.n;
        return (
          <li
            key={s.n}
            className="flex flex-1 items-center gap-1.5"
          >
            <span
              className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                done || active ? "text-white" : "bg-slate-200 text-slate-500"
              }`}
              style={done || active ? { backgroundColor: BRAND } : undefined}
            >
              {done ? <Check className="h-3 w-3" /> : s.n}
            </span>
            <span
              className={`text-[12px] font-medium ${
                active ? "text-slate-900" : "text-slate-500"
              }`}
            >
              {s.label}
            </span>
            {i < STEPS.length - 1 && (
              <span className="ml-1 hidden h-px flex-1 bg-slate-200 md:block" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

// ─── Step 1: Unit + customer ───────────────────────────────────────────────

function Step1UnitCustomer({
  units,
  buildings,
  form,
  setForm,
  onSelectUnit,
}: {
  units: AdminUnit[];
  buildings: AdminBuilding[];
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  onSelectUnit: (id: string) => void;
}) {
  const filteredUnits = units.filter((u) => {
    if (form.buildingFilter !== "all" && u.buildingId !== form.buildingFilter) {
      return false;
    }
    if (form.search.trim().length > 0) {
      const q = form.search.trim().toLowerCase();
      const haystack = `${u.addressLine1} ${u.addressLine2} ${u.id}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="grid gap-5 md:grid-cols-2">
      {/* Left: unit picker */}
      <div className="flex flex-col gap-3">
        <div className="text-[12px] font-semibold uppercase tracking-wider text-slate-500">
          Pick the unit
        </div>
        <div className="flex flex-col gap-2 md:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={form.search}
              onChange={(e) =>
                setForm((s) => ({ ...s, search: e.target.value }))
              }
              placeholder="Search by address or unit id…"
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-[13px] text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
            />
          </div>
          <select
            value={form.buildingFilter}
            onChange={(e) =>
              setForm((s) => ({ ...s, buildingFilter: e.target.value }))
            }
            aria-label="Filter units by building"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-900 focus:border-slate-400 focus:outline-none"
          >
            <option value="all">All buildings</option>
            {buildings.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex max-h-[420px] flex-col gap-1.5 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2">
          {filteredUnits.length === 0 ? (
            <div className="px-3 py-6 text-center text-[12px] text-slate-500">
              No units match these filters.
            </div>
          ) : (
            filteredUnits.map((u) => {
              const building = getBuildingForUnit(u);
              const active = form.unitId === u.id;
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => onSelectUnit(u.id)}
                  className={`flex items-start justify-between gap-3 rounded-lg border bg-white px-3 py-2 text-left transition ${
                    active
                      ? "ring-2"
                      : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                  style={
                    active
                      ? { borderColor: BRAND, boxShadow: `0 0 0 2px ${BRAND_SOFT}` }
                      : undefined
                  }
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-slate-900">
                      {u.addressLine1}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {u.addressLine2}
                    </div>
                    {building && (
                      <div className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-medium text-slate-600">
                        <Building2 className="h-2.5 w-2.5" />
                        {building.name}
                      </div>
                    )}
                  </div>
                  <div className="text-right text-[10px] uppercase tracking-wider text-slate-500">
                    {u.ac.type === "unknown" ? "No AC record" : u.ac.type}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Right: customer details */}
      <div className="flex flex-col gap-3">
        <div className="text-[12px] font-semibold uppercase tracking-wider text-slate-500">
          Customer on the phone
        </div>
        <div className="flex gap-2">
          {(["owner", "agent"] as const).map((role) => {
            const active = form.bookerRole === role;
            return (
              <button
                key={role}
                type="button"
                onClick={() =>
                  setForm((s) => ({
                    ...s,
                    bookerRole: role,
                    agencyId: role === "agent" ? s.agencyId : null,
                    agencyOtherName: role === "agent" ? s.agencyOtherName : "",
                  }))
                }
                className={`flex-1 rounded-lg border px-3 py-2 text-[13px] font-medium capitalize transition ${
                  active
                    ? "text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                }`}
                style={
                  active
                    ? { backgroundColor: BRAND, borderColor: BRAND }
                    : undefined
                }
              >
                {role === "owner" ? "Owner" : "Agent"}
              </button>
            );
          })}
        </div>

        {form.bookerRole === "agent" && (
          <FormField label="Managing agency">
            <select
              value={form.agencyId ?? ""}
              onChange={(e) =>
                setForm((s) => ({ ...s, agencyId: e.target.value || null }))
              }
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-900 focus:border-slate-400 focus:outline-none"
            >
              <option value="">Select an agency…</option>
              {DEMO_MANAGING_AGENCIES.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            {form.agencyId === OTHER_AGENCY_ID && (
              <input
                type="text"
                value={form.agencyOtherName}
                onChange={(e) =>
                  setForm((s) => ({ ...s, agencyOtherName: e.target.value }))
                }
                placeholder="Agency name…"
                className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
              />
            )}
          </FormField>
        )}

        <FormField
          label={
            form.bookerRole === "agent"
              ? "Caller's full name (the individual at the agency)"
              : "Customer's full name"
          }
        >
          <input
            type="text"
            value={form.customerName}
            onChange={(e) =>
              setForm((s) => ({ ...s, customerName: e.target.value }))
            }
            placeholder="e.g. Sam Patel"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
          />
        </FormField>
        <FormField label="Email">
          <input
            type="email"
            value={form.customerEmail}
            onChange={(e) =>
              setForm((s) => ({ ...s, customerEmail: e.target.value }))
            }
            placeholder="name@example.com"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
          />
        </FormField>
        <FormField label="Phone">
          <input
            type="tel"
            value={form.customerPhone}
            onChange={(e) =>
              setForm((s) => ({ ...s, customerPhone: e.target.value }))
            }
            placeholder="0411 222 333"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
          />
        </FormField>
      </div>
    </div>
  );
}

// ─── Step 2: AC config ─────────────────────────────────────────────────────

function Step2Ac({
  unit,
  form,
  setForm,
}: {
  unit: AdminUnit;
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
}) {
  const recordedKnown = unit.ac.type === "split" || unit.ac.type === "ducted";
  const discrepancy = computeAdminAcDiscrepancy(unit.ac, {
    type: form.acType,
    systems: form.acSystems,
    additional: form.acAdditional,
  });
  const jobMin = derivedJobMinutes(form);

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <div className="flex flex-col gap-3">
        <div className="text-[12px] font-semibold uppercase tracking-wider text-slate-500">
          Unit's AC on file
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="text-[13px] font-medium text-slate-900">
            {unit.addressLine1}
          </div>
          <div className="text-[11px] text-slate-500">{unit.addressLine2}</div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-[12px]">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500">
                Type
              </div>
              <div className="font-semibold capitalize text-slate-900">
                {recordedKnown ? unit.ac.type : "No record"}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500">
                Systems
              </div>
              <div className="font-semibold text-slate-900">
                {recordedKnown ? unit.ac.systems : "—"}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500">
                Extras
              </div>
              <div className="font-semibold text-slate-900">
                {recordedKnown ? unit.ac.additional : "—"}
              </div>
            </div>
          </div>
          {!recordedKnown && (
            <div className="mt-2 text-[11px] text-slate-500">
              No AC record on file — capture what the customer reports.
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="text-[12px] font-semibold uppercase tracking-wider text-slate-500">
          What did the customer say?
        </div>
        <FormField label="AC type">
          <div className="flex gap-2">
            {(["split", "ducted", "unsure"] as const).map((t) => {
              const active = form.acType === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm((s) => ({ ...s, acType: t }))}
                  className={`flex-1 rounded-lg border px-3 py-2 text-[13px] font-medium capitalize transition ${
                    active
                      ? "text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                  }`}
                  style={
                    active
                      ? { backgroundColor: BRAND, borderColor: BRAND }
                      : undefined
                  }
                >
                  {t === "unsure" ? "Not sure" : t}
                </button>
              );
            })}
          </div>
        </FormField>

        {form.acType !== "unsure" && (
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Number of systems">
              <NumberStepper
                value={form.acSystems}
                min={1}
                max={10}
                onChange={(n) => setForm((s) => ({ ...s, acSystems: n }))}
              />
            </FormField>
            <FormField label="Additional indoor units">
              <NumberStepper
                value={form.acAdditional}
                min={0}
                max={10}
                onChange={(n) => setForm((s) => ({ ...s, acAdditional: n }))}
              />
            </FormField>
          </div>
        )}

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[12px] text-slate-700">
          Estimated job duration:{" "}
          <strong className="text-slate-900">
            {formatDurationMinutes(jobMin)}
          </strong>
          {form.acType === "unsure" && (
            <span className="text-slate-500">
              {" "}
              (placeholder — tech to confirm on arrival)
            </span>
          )}
        </div>

        {discrepancy && (
          <div
            className="flex items-start gap-2 rounded-lg p-3"
            style={{ backgroundColor: BRAND_SOFT, color: BRAND_DEEP }}
          >
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="text-[12px]">
              <div className="font-semibold">
                Doesn't match the unit's record
              </div>
              <div className="mt-0.5">
                On file:{" "}
                <strong>
                  {discrepancy.recorded.type} · {discrepancy.recorded.systems}{" "}
                  system{discrepancy.recorded.systems === 1 ? "" : "s"}
                  {discrepancy.recorded.additional > 0
                    ? ` + ${discrepancy.recorded.additional} extra`
                    : ""}
                </strong>
                . The booking will be flagged so the tech can confirm
                on arrival.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function NumberStepper({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="rounded-l-lg px-3 py-1.5 text-[13px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
      >
        −
      </button>
      <div className="min-w-[2.5rem] px-2 text-center text-[13px] font-semibold text-slate-900">
        {value}
      </div>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="rounded-r-lg px-3 py-1.5 text-[13px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
      >
        +
      </button>
    </div>
  );
}

// ─── Step 3: Schedule ──────────────────────────────────────────────────────

function Step3Schedule({
  calendar,
  jobMinutes,
  form,
  setForm,
}: {
  calendar: AdminCalendarDay[];
  jobMinutes: number;
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
}) {
  return (
    <div className="flex flex-col gap-4">
      {/* Mode toggle */}
      <div className="grid gap-2 md:grid-cols-2">
        <ModeChoiceCard
          active={form.scheduleMode === "pick_slot"}
          onClick={() =>
            setForm((s) => ({ ...s, scheduleMode: "pick_slot" }))
          }
          title="Pick a service window"
          subtitle="Find a morning or afternoon slot in the next two weeks."
        />
        <ModeChoiceCard
          active={form.scheduleMode === "to_be_coordinated"}
          onClick={() =>
            setForm((s) => ({
              ...s,
              scheduleMode: "to_be_coordinated",
              pickedDate: null,
              pickedWindow: null,
            }))
          }
          title="Mark as to be coordinated"
          subtitle="No date yet — the booking will appear in coordination follow-ups."
        />
      </div>

      {form.scheduleMode === "pick_slot" ? (
        <>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-700">
            Showing windows that fit a{" "}
            <strong className="text-slate-900">
              {formatDurationMinutes(jobMinutes)}
            </strong>{" "}
            job. Full or undersized windows are disabled with a reason.
          </div>
          <div className="grid grid-cols-7 gap-2">
            {calendar.map((day) => (
              <DayPicker
                key={day.isoDate}
                day={day}
                jobMinutes={jobMinutes}
                pickedDate={form.pickedDate}
                pickedWindow={form.pickedWindow}
                onPick={(date, window) =>
                  setForm((s) => ({
                    ...s,
                    pickedDate: date,
                    pickedWindow: window,
                  }))
                }
              />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
            <div className="inline-flex items-center gap-1.5">
              <Clock className="h-3 w-3" style={{ color: BRAND }} />
              Time-based
            </div>
            <div className="inline-flex items-center gap-1.5">
              <Hash className="h-3 w-3" style={{ color: "#3B82F6" }} />
              Count-based
            </div>
          </div>
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-[13px] text-slate-700">
          This booking will land in the bookings list with{" "}
          <strong>“To coordinate”</strong> — no date or slot is taken on
          the calendar. You can come back later and reschedule once the
          customer confirms.
        </div>
      )}
    </div>
  );
}

function ModeChoiceCard({
  active,
  onClick,
  title,
  subtitle,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition ${
        active
          ? "ring-2"
          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
      }`}
      style={
        active
          ? {
              borderColor: BRAND,
              backgroundColor: "white",
              boxShadow: `0 0 0 2px ${BRAND_SOFT}`,
            }
          : undefined
      }
    >
      <div
        className="text-[13px] font-semibold"
        style={{ color: active ? BRAND_DEEP : "#0F172A" }}
      >
        {title}
      </div>
      <div className="text-[11px] text-slate-500">{subtitle}</div>
    </button>
  );
}

function DayPicker({
  day,
  jobMinutes,
  pickedDate,
  pickedWindow,
  onPick,
}: {
  day: AdminCalendarDay;
  jobMinutes: number;
  pickedDate: string | null;
  pickedWindow: "morning" | "afternoon" | null;
  onPick: (date: string, window: "morning" | "afternoon") => void;
}) {
  return (
    <div
      className={`flex flex-col gap-1.5 rounded-lg border p-2 ${
        day.open
          ? "border-slate-200 bg-white"
          : "border-slate-200 bg-slate-50 opacity-70"
      }`}
    >
      <div className="flex items-baseline justify-between">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          {day.weekdayLabel}
        </div>
        <div className="text-[14px] font-semibold leading-none text-slate-900">
          {day.dayLabel}
        </div>
      </div>
      {day.open ? (
        <>
          <SlotChoice
            label="Morning"
            slot={day.morning}
            jobMinutes={jobMinutes}
            picked={pickedDate === day.isoDate && pickedWindow === "morning"}
            onPick={() => onPick(day.isoDate, "morning")}
          />
          <SlotChoice
            label="Afternoon"
            slot={day.afternoon}
            jobMinutes={jobMinutes}
            picked={pickedDate === day.isoDate && pickedWindow === "afternoon"}
            onPick={() => onPick(day.isoDate, "afternoon")}
          />
        </>
      ) : (
        <div className="rounded bg-slate-100 px-1.5 py-1 text-center text-[10px] font-medium text-slate-500">
          Closed
        </div>
      )}
    </div>
  );
}

function SlotChoice({
  label,
  slot,
  jobMinutes,
  picked,
  onPick,
}: {
  label: string;
  slot: AdminSlot;
  jobMinutes: number;
  picked: boolean;
  onPick: () => void;
}) {
  const available = slotIsAvailable(slot, jobMinutes);
  const accent = modeColor(slot.mode);
  const ModeIcon = slot.mode === "count_based" ? Hash : Clock;

  // Reason text for unbookable windows.
  let reason = "";
  if (!available) {
    if (slot.mode === "count_based") {
      reason =
        slot.bookedCount >= slot.slotCount
          ? `${label} is full (${slot.slotCount}/${slot.slotCount})`
          : "Not bookable";
    } else {
      const remaining = Math.max(0, slot.windowMinutes - slot.bookedMinutes);
      reason =
        remaining <= 0
          ? `${label} is full`
          : `Only ${formatDurationMinutes(remaining)} left — needs ${formatDurationMinutes(jobMinutes)}`;
    }
  }

  // Capacity hint shown alongside available windows so the admin can
  // see how tight things are at a glance.
  const capacityHint =
    slot.mode === "count_based"
      ? `${slot.bookedCount} / ${slot.slotCount}`
      : `${formatDurationMinutes(
          Math.max(0, slot.windowMinutes - slot.bookedMinutes),
        )} left`;

  return (
    <button
      type="button"
      onClick={onPick}
      disabled={!available}
      title={!available ? reason : capacityHint}
      className={`flex w-full flex-col gap-0.5 rounded border px-1.5 py-1 text-left transition ${
        picked
          ? "ring-2"
          : available
            ? "hover:bg-slate-50"
            : "cursor-not-allowed opacity-60"
      }`}
      style={
        picked
          ? {
              borderColor: BRAND,
              backgroundColor: BRAND_SOFT,
              boxShadow: `0 0 0 2px ${BRAND_SOFT}`,
            }
          : { borderColor: "#E2E8F0" }
      }
    >
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1 text-[10px] font-semibold text-slate-700">
          <ModeIcon className="h-2.5 w-2.5" style={{ color: accent }} />
          {label}
        </div>
        {picked && (
          <Check className="h-3 w-3" style={{ color: BRAND_DEEP }} />
        )}
      </div>
      <div className="text-[10px] text-slate-500">
        {available ? capacityHint : reason}
      </div>
    </button>
  );
}

// ─── Step 4: Review ────────────────────────────────────────────────────────

function Step4Review({
  unit,
  buildings,
  form,
}: {
  unit: AdminUnit;
  buildings: AdminBuilding[];
  form: FormState;
}) {
  const building = buildings.find((b) => b.id === unit.buildingId);
  const totalAud =
    form.acType === "unsure"
      ? PRICE_PER_SYSTEM_AUD
      : form.acSystems * PRICE_PER_SYSTEM_AUD +
        form.acAdditional * PRICE_PER_ADDITIONAL_INDOOR_AUD;
  const discrepancy = computeAdminAcDiscrepancy(unit.ac, {
    type: form.acType,
    systems: form.acSystems,
    additional: form.acAdditional,
  });
  // Fake a synthetic AdminBooking just to format the duration via the
  // shared helper so the review screen and the bookings list always
  // agree on labelling.
  const jobMin = bookingDurationMinutes({
    id: "preview",
    unitId: unit.id,
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    bookerRole: form.bookerRole,
    bookerAgencyId: null,
    bookerAgencyOtherName: "",
    accessMethod: null,
    tenants: [],
    systems: form.acSystems,
    additional: form.acAdditional,
    acType: form.acType,
    discrepancy,
    serviceDate: null,
    serviceSlot: null,
    paymentStatus: "pending",
    serviceStatus: "scheduled",
    totalAud,
    paymentTimeline: [],
    serviceTimeline: [],
    notes: "",
  });

  const agencyLabel =
    form.bookerRole === "agent"
      ? form.agencyId === OTHER_AGENCY_ID
        ? form.agencyOtherName
        : (DEMO_MANAGING_AGENCIES.find((a) => a.id === form.agencyId)?.name ??
          "—")
      : null;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <ReviewCard title="Unit">
        <div className="text-[13px] font-medium text-slate-900">
          {unit.addressLine1}
        </div>
        <div className="text-[11px] text-slate-500">{unit.addressLine2}</div>
        {building && (
          <div className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-slate-600">
            <Building2 className="h-3 w-3" />
            {building.name}
          </div>
        )}
      </ReviewCard>

      <ReviewCard title="Customer">
        <div className="text-[13px] font-medium text-slate-900">
          {form.customerName || "—"}
        </div>
        <div className="text-[11px] text-slate-500">
          {form.customerEmail} · {form.customerPhone}
        </div>
        <div className="mt-1 text-[11px] uppercase tracking-wider text-slate-500">
          {form.bookerRole === "agent"
            ? `Agent · ${agencyLabel ?? "—"}`
            : "Owner"}
        </div>
      </ReviewCard>

      <ReviewCard title="AC config">
        <div className="text-[13px] font-medium capitalize text-slate-900">
          {form.acType === "unsure" ? "Not sure" : form.acType}
          {form.acType !== "unsure" && (
            <span className="ml-2 text-[12px] font-normal text-slate-600">
              {form.acSystems} system{form.acSystems === 1 ? "" : "s"}
              {form.acAdditional > 0 ? ` + ${form.acAdditional} extra` : ""}
            </span>
          )}
        </div>
        <div className="text-[11px] text-slate-500">
          Job duration: {formatDurationMinutes(jobMin)}
        </div>
        {discrepancy && (
          <div
            className="mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
            style={{ backgroundColor: BRAND_SOFT, color: BRAND_DEEP }}
          >
            <TriangleAlert className="h-2.5 w-2.5" />
            Mismatch with record
          </div>
        )}
      </ReviewCard>

      <ReviewCard title="Schedule">
        {form.scheduleMode === "to_be_coordinated" ? (
          <div className="text-[13px] font-medium text-slate-900">
            To be coordinated
          </div>
        ) : (
          <>
            <div className="text-[13px] font-medium text-slate-900">
              {form.pickedDate} · {form.pickedWindow}
            </div>
            <div className="text-[11px] text-slate-500">
              Window will be marked busy on the global calendar.
            </div>
          </>
        )}
      </ReviewCard>

      <ReviewCard title="Total" wide>
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <div className="text-[18px] font-semibold text-slate-900">
              ${totalAud.toFixed(2)}
            </div>
            <div className="text-[11px] text-slate-500">
              Payment status will be{" "}
              <strong className="text-slate-700">pending</strong> — admin
              will invoice separately. The booking is created immediately
              and tagged{" "}
              <strong className="text-slate-700">
                created by admin (phone)
              </strong>
              .
            </div>
          </div>
        </div>
      </ReviewCard>
    </div>
  );
}

function ReviewCard({
  title,
  wide,
  children,
}: {
  title: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white p-3 ${
        wide ? "md:col-span-2" : ""
      }`}
    >
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {title}
      </div>
      {children}
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function derivedJobMinutes(form: FormState): number {
  if (form.acType === "unsure") return 45;
  return form.acSystems * 45 + form.acAdditional * 15;
}
