import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  CheckCircle2,
  ChevronDown,
  Home,
} from "lucide-react";
import { bookingActions, useBookingSelector } from "../../../state/bookingSession";
import { canContinueStep1, useStepLabel } from "../../../state/bookingDerived";

const BRAND = "#ED017F";
const SELECTED_GREEN = "#5FBB97";

type Unit = {
  id: string;
  address: string;
  lot: string;
  building: string;
};

// Mirror UnitDesktop so the demo's per-unit AC type assignment
// (u1 → ducted, u2 → split) works consistently on both surfaces.
const UNITS: Unit[] = [
  { id: "u1", address: "G01 / 335 Aspen Village",   lot: "Lot 3",   building: "Aspen Village · Greenway ACT 2900" },
  { id: "u2", address: "12 / 88 Marine Parade",     lot: "Lot 12",  building: "Oceanview · Coogee NSW 2034" },
  { id: "u3", address: "3 / 4 Example Street",      lot: "Lot 3",   building: "The Example · Bondi NSW 2026" },
  { id: "u4", address: "705 / 21 Bourke Street",    lot: "Lot 705", building: "Bourke Tower · Surry Hills NSW 2010" },
  { id: "u5", address: "18 / 142 Anzac Parade",     lot: "Lot 18",  building: "Anzac Gardens · Kensington NSW 2033" },
];

export function UnitMobile() {
  const sessionUnitId = useBookingSelector((s) => s.unit_id);
  const role = useBookingSelector((s) => s.role);
  const stepLabel = useStepLabel(1);
  const [selectedId, setSelectedId] = useState<string | null>(sessionUnitId);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (sessionUnitId !== selectedId) setSelectedId(sessionUnitId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionUnitId]);

  const selected = UNITS.find((u) => u.id === selectedId);
  const canContinue = canContinueStep1({ unit_id: selectedId, role });

  const selectUnit = (id: string) => {
    setSelectedId(id);
    bookingActions.setUnit(id);
    setOpen(false);
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-white font-['Inter']">
      <div className="flex items-start justify-between px-5 pb-4 pt-5">
        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
            {stepLabel}
          </div>
          <h1 className="text-[26px] font-semibold leading-tight text-slate-900">
            Select the property
          </h1>
        </div>
        <button
          type="button"
          aria-label="Back"
          className="grid h-9 w-9 place-items-center rounded-full border-2 transition hover:bg-pink-50"
          style={{ borderColor: BRAND, color: BRAND }}
          data-testid="button-back-mobile"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-6">
        <p className="mb-4 text-[14px] leading-relaxed text-slate-500">
          For which the service will take place
        </p>

        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
          Properties
        </label>

        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            data-testid="dropdown-unit-trigger"
            aria-expanded={open}
            className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-300 bg-white px-4 py-3.5 text-left shadow-sm transition hover:border-slate-400"
          >
            <div className="min-w-0 flex-1">
              {selected ? (
                <>
                  <div className="truncate text-[15px] font-semibold text-slate-900">
                    {selected.address}
                  </div>
                  <div className="mt-0.5 truncate text-[12px] text-slate-500">
                    {selected.lot} · {selected.building}
                  </div>
                </>
              ) : (
                <span className="text-[15px] text-slate-400">Select a property…</span>
              )}
            </div>
            <ChevronDown
              className={`h-5 w-5 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
            />
          </button>

          {open && (
            <div className="absolute inset-x-0 top-full z-20 mt-2 max-h-[360px] overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
              {UNITS.map((u) => {
                const active = u.id === selectedId;
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => selectUnit(u.id)}
                    data-testid={`dropdown-unit-${u.id}`}
                    className={`flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition ${
                      active ? "bg-pink-50" : "hover:bg-slate-50"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div
                        className={`truncate text-[14px] font-semibold ${
                          active ? "text-pink-700" : "text-slate-900"
                        }`}
                      >
                        {u.address}
                      </div>
                      <div className="mt-0.5 truncate text-[11px] text-slate-500">
                        {u.lot} · {u.building}
                      </div>
                    </div>
                    {active && (
                      <CheckCircle2
                        className="mt-0.5 h-5 w-5 shrink-0"
                        style={{ color: BRAND }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Progressive disclosure: role chooser appears once a property is picked. */}
        {selected && (
          <div className="mt-7">
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Your role for this property
            </label>
            <p className="mb-3 text-[13px] text-slate-500">
              Are you the owner, or a managing agent?
            </p>
            <div className="space-y-3">
              <RoleCard
                selected={role === "owner"}
                onClick={() => bookingActions.setRole("owner")}
                icon={<Home className="h-5 w-5" />}
                title="Owner"
                description="I own this unit"
                id="owner"
              />
              <RoleCard
                selected={role === "agent"}
                onClick={() => bookingActions.setRole("agent")}
                icon={<Briefcase className="h-5 w-5" />}
                title="Agent · Property Manager"
                description="I manage this unit on behalf of the owner"
                id="agent"
              />
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-slate-100 bg-white px-5 py-3">
        <button
          type="button"
          disabled={!canContinue}
          data-testid="button-continue"
          className="flex w-full items-center justify-center gap-2 rounded-full px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition disabled:opacity-50"
          style={{ backgroundColor: BRAND }}
        >
          Continue
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function RoleCard({
  selected,
  onClick,
  icon,
  title,
  description,
  id,
}: {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
  id: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`card-role-${id}`}
      className={`relative flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${
        selected ? "" : "border-slate-200 bg-white hover:border-slate-300"
      }`}
      style={
        selected
          ? {
              borderColor: "rgba(95,187,151,0.45)",
              backgroundColor: "rgba(95,187,151,0.08)",
            }
          : undefined
      }
    >
      <span
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
          selected ? "text-white" : "bg-slate-100 text-slate-700"
        }`}
        style={selected ? { backgroundColor: SELECTED_GREEN } : undefined}
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[15px] font-semibold leading-tight text-slate-900">{title}</span>
        <span className="mt-0.5 text-[12.5px] leading-snug text-slate-500">{description}</span>
      </span>
      {selected && (
        <CheckCircle2 className="h-5 w-5 shrink-0" style={{ color: SELECTED_GREEN }} />
      )}
    </button>
  );
}
