import React, { useState } from "react";
import { ArrowRight, Building2, MapPin, ChevronDown, Plus, CheckCircle2 } from "lucide-react";

const BRAND = "#ED017F";
const SELECTED_GREEN = "#5FBB97";

const UNITS = [
  { id: "u1", address: "G01 / 335 Aspen Village", lot: "Lot 3", building: "Aspen Village", suburb: "Greenway ACT 2900" },
  { id: "u2", address: "12 / 88 Marine Parade", lot: "Lot 12", building: "Oceanview", suburb: "Coogee NSW 2034" },
  { id: "u3", address: "3 / 4 Example Street", lot: "Lot 3", building: "The Example", suburb: "Bondi NSW 2026" },
  { id: "u4", address: "705 / 21 Bourke Street", lot: "Lot 705", building: "Bourke Tower", suburb: "Surry Hills NSW 2010" },
  { id: "u5", address: "18 / 142 Anzac Parade", lot: "Lot 18", building: "Anzac Gardens", suburb: "Kensington NSW 2033" },
];

export function UnitDesktop() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const selected = UNITS.find((u) => u.id === selectedId);

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-['Inter'] flex justify-center overflow-y-auto">
      <div className="w-full max-w-xl">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-8 md:p-10 flex flex-col">
          
          <div className="mb-8">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-2">Step 1 of 7</div>
            <h1 className="text-2xl font-semibold text-slate-900">Find your unit</h1>
            <p className="text-sm text-slate-500 mt-2">Select the apartment where the air-conditioning service will take place.</p>
          </div>

          <div className="flex-1">
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Your units
            </label>

            <div className="relative">
              <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                data-testid="dropdown-unit-trigger"
                aria-expanded={open}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-300 bg-white px-4 py-3.5 text-left shadow-sm transition hover:border-slate-400"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100">
                    <Building2 className="h-5 w-5 text-slate-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    {selected ? (
                      <>
                        <div className="truncate text-[15px] font-semibold text-slate-900">
                          {selected.address}
                        </div>
                        <div className="mt-0.5 truncate text-[12px] text-slate-500">
                          {selected.lot} · {selected.building} · {selected.suburb}
                        </div>
                      </>
                    ) : (
                      <span className="text-[15px] text-slate-400">Select a unit…</span>
                    )}
                  </div>
                </div>
                <ChevronDown
                  className={`h-5 w-5 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
                />
              </button>

              {open && (
                <div className="absolute inset-x-0 top-full z-20 mt-2 max-h-[300px] overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
                  {UNITS.map((u) => {
                    const active = u.id === selectedId;
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => {
                          setSelectedId(u.id);
                          setOpen(false);
                        }}
                        data-testid={`dropdown-unit-${u.id}`}
                        className={`flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition ${
                          active ? "bg-pink-50" : "hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex min-w-0 flex-1 items-start gap-3">
                          <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100">
                            <Building2 className="h-4 w-4 text-slate-500" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div
                              className={`truncate text-[14px] font-semibold ${
                                active ? "text-pink-700" : "text-slate-900"
                              }`}
                            >
                              {u.address}
                            </div>
                            <div className="mt-0.5 truncate text-[12px] text-slate-500">
                              {u.lot} · {u.building} · {u.suburb}
                            </div>
                          </div>
                        </div>
                        {active && (
                          <CheckCircle2
                            className="mt-2 h-5 w-5 shrink-0"
                            style={{ color: BRAND }}
                          />
                        )}
                      </button>
                    );
                  })}
                  <div className="border-t border-slate-100">
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-4 py-3 text-left text-[13px] font-medium hover:bg-slate-50"
                      style={{ color: BRAND }}
                      data-testid="dropdown-unit-add"
                    >
                      <Plus className="h-4 w-4" />
                      Add a different unit
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-8 rounded-xl border border-slate-200/60 bg-slate-50 p-4 text-[13px] text-slate-500 text-center">
              Don't see your unit? Choose <span className="font-medium text-slate-900">Add a different unit</span> in the list above and we'll set it up.
            </div>
          </div>

          <div className="mt-12 pt-6 border-t border-slate-100 flex items-center justify-between">
            <button
              type="button"
              className="text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors"
              data-testid="button-back-desktop"
            >
              ← Back
            </button>
            <button
              type="button"
              disabled={!selectedId}
              data-testid="button-continue"
              className="flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white transition disabled:opacity-50 hover:opacity-90"
              style={{ backgroundColor: BRAND }}
            >
              Continue
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
