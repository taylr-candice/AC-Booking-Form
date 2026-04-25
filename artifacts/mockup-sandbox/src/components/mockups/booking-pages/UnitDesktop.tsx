import React, { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Wind,
  CalendarDays,
  Home as HomeIcon,
  CreditCard,
  Pencil,
  CheckCircle2,
  Building2,
  MapPin,
  ChevronDown,
  Plus,
} from "lucide-react";

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
  const [selectedId, setSelectedId] = useState<string>("u1");
  const [open, setOpen] = useState(false);

  const selected = UNITS.find((u) => u.id === selectedId);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 font-['Inter']">
      {/* Brand sidebar */}
      <aside className="hidden w-[68px] shrink-0 flex-col items-center gap-2 bg-slate-900 py-5 text-white lg:flex">
        <div className="grid h-10 w-10 place-items-center rounded-lg" style={{ backgroundColor: BRAND }}>
          <Wind className="h-5 w-5" />
        </div>
        <div className="text-[11px] font-bold tracking-tight">
          tay<span style={{ color: "#ff3b6e" }}>lr</span>
          <span className="text-[#ff3b6e]">.</span>
        </div>
        <div className="mt-4 flex flex-col items-center gap-1.5 text-slate-400">
          <button className="rounded-md p-2 hover:bg-slate-800"><HomeIcon className="h-4 w-4" /></button>
          <button className="rounded-md bg-slate-800 p-2 text-white"><CalendarDays className="h-4 w-4" /></button>
          <button className="rounded-md p-2 hover:bg-slate-800"><CreditCard className="h-4 w-4" /></button>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-7 py-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Back"
              className="grid h-9 w-9 place-items-center rounded-full border-2 transition hover:bg-pink-50"
              style={{ borderColor: BRAND, color: BRAND }}
              data-testid="button-back-desktop"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500">Step 1 of 7</div>
              <h1 className="text-2xl font-semibold text-slate-900">Pick the unit you're booking for</h1>
            </div>
          </div>
        </header>

        {/* Two-column body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Main content */}
          <section className="flex flex-1 flex-col overflow-auto bg-white px-7 py-7">
            <div className="mx-auto w-full max-w-2xl">
              <h2 className="text-xl font-semibold mb-1" style={{ color: BRAND }}>Find your unit</h2>
              <p className="text-sm text-slate-500 mb-6">Select the apartment where the air-conditioning service will take place.</p>

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
                  <div className="absolute inset-x-0 top-full z-20 mt-2 max-h-[420px] overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
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

              {selected && !open && (
                <div
                  className="mt-6 rounded-2xl border p-5"
                  style={{
                    borderColor: "rgba(95,187,151,0.45)",
                    backgroundColor: "rgba(95,187,151,0.08)",
                  }}
                >
                  <div className="flex items-start gap-4">
                    <div
                      className="mt-0.5 grid h-12 w-12 shrink-0 place-items-center rounded-full"
                      style={{ backgroundColor: SELECTED_GREEN }}
                    >
                      <Building2 className="h-6 w-6 text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div
                        className="text-[11px] font-semibold uppercase tracking-wide"
                        style={{ color: SELECTED_GREEN }}
                      >
                        Booking for
                      </div>
                      <div className="mt-0.5 text-lg font-semibold text-slate-900">
                        {selected.address}
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-slate-600">
                        <span className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5" /> {selected.lot}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Building2 className="h-3.5 w-3.5" /> {selected.building}
                        </span>
                        <span className="text-slate-500">{selected.suburb}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-[12px] text-slate-500">
                Don't see your unit? Choose <span className="font-medium" style={{ color: BRAND }}>Add a different unit</span> in the list above and we'll set it up.
              </div>
            </div>
          </section>

          {/* Booking summary rail */}
          <aside className="flex w-[340px] shrink-0 flex-col border-l border-slate-200 bg-slate-50">
            <div className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
              <h3 className="text-sm font-semibold" style={{ color: BRAND }}>Booking summary</h3>
              <button type="button" aria-label="Edit" className="rounded p-1 text-slate-500 hover:text-slate-900">
                <Pencil className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto px-5 py-5 text-sm">
              <SummaryRow label="Unit" value={
                selected ? (
                  <>
                    {selected.address}
                    <div className="text-xs text-slate-500">{selected.lot} · {selected.building}</div>
                  </>
                ) : (
                  <span className="text-slate-400">Not selected</span>
                )
              } />
              <SummaryRow label="Booker" value={<span className="text-slate-400">Pending</span>} />
              <SummaryRow label="AC" value={<span className="text-slate-400">Pending</span>} />
              <SummaryRow label="Access" value={<span className="text-slate-400">Pending</span>} />

              <div className="rounded-xl border border-slate-200 bg-white p-3 opacity-50 grayscale">
                <div className="text-[11px] uppercase tracking-wide text-slate-500">Selected slot</div>
                <div className="mt-1.5 text-xs text-slate-400">No slot picked yet</div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3 opacity-50 grayscale">
                <div className="flex items-baseline justify-between">
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">Total</div>
                    <div className="text-[11px] text-slate-500">incl. GST</div>
                  </div>
                  <div className="text-2xl font-bold text-slate-900">$0</div>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200 bg-white px-5 py-4">
              <button
                type="button"
                disabled={!selectedId}
                data-testid="button-continue"
                className="flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-white shadow-sm transition disabled:opacity-50 hover:opacity-90"
                style={{ backgroundColor: BRAND }}
              >
                Continue
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-2.5 last:border-b-0 last:pb-0">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="flex-1 text-right text-sm text-slate-900">{value}</div>
    </div>
  );
}
