import React, { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Wind,
  CalendarDays,
  Home as HomeIcon,
  CreditCard,
  Pencil,
  Plus,
  Minus,
  Info
} from "lucide-react";

const BRAND = "#ED017F";
const SYSTEM_PRICE = 179;
const ADDON_PRICE = 39;

export function AcDesktop() {
  const [systems, setSystems] = useState(2);
  const [additional, setAdditional] = useState(1);

  const total = (systems * SYSTEM_PRICE) + (additional * ADDON_PRICE);

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
              <div className="text-xs uppercase tracking-wide text-slate-500">Step 4 of 7</div>
              <h1 className="text-2xl font-semibold text-slate-900">How many AC systems are at the unit?</h1>
            </div>
          </div>
        </header>

        {/* Two-column body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Main content */}
          <section className="flex flex-1 flex-col overflow-auto bg-white px-7 py-10">
            <div className="mx-auto w-full max-w-xl">
              
              <div className="mb-6 rounded-xl border border-pink-200 bg-pink-50 p-4 flex gap-3">
                <Info className="h-5 w-5 text-pink-600 shrink-0" />
                <div className="text-sm text-pink-900">
                  <span className="font-semibold">Pre-filled from your last service.</span> Our records show 2 systems with 1 additional indoor unit — adjust if anything has changed.
                </div>
              </div>

              <div className="space-y-8">
                {/* Systems Stepper */}
                <div className="flex items-center justify-between rounded-xl border border-slate-200 p-5 bg-white shadow-sm">
                  <div className="pr-4">
                    <h3 className="font-semibold text-slate-900 text-lg">Number of systems</h3>
                    <p className="text-sm text-slate-500 mt-1">One system = one outdoor unit + one indoor unit.</p>
                    <p className="text-xs font-medium mt-2" style={{ color: BRAND }}>${SYSTEM_PRICE} per system</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={() => setSystems(Math.max(1, systems - 1))}
                      disabled={systems <= 1}
                      className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <div className="w-8 text-center text-xl font-bold text-slate-900">{systems}</div>
                    <button 
                      onClick={() => setSystems(systems + 1)}
                      className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Additional Units Stepper */}
                <div className="flex items-center justify-between rounded-xl border border-slate-200 p-5 bg-white shadow-sm">
                  <div className="pr-4">
                    <h3 className="font-semibold text-slate-900 text-lg">Additional indoor units</h3>
                    <p className="text-sm text-slate-500 mt-1">Extra indoor units running off the same outdoor unit (multi-split).</p>
                    <p className="text-xs font-medium mt-2" style={{ color: BRAND }}>${ADDON_PRICE} per extra unit</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={() => setAdditional(Math.max(0, additional - 1))}
                      disabled={additional <= 0}
                      className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <div className="w-8 text-center text-xl font-bold text-slate-900">{additional}</div>
                    <button 
                      onClick={() => setAdditional(additional + 1)}
                      className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Tip */}
                <div className="rounded-xl bg-slate-100 p-4 text-sm text-slate-600 flex gap-3">
                  <span className="font-bold">💡 Tip:</span> 
                  <span>Not sure how many indoor units you have? Just count the remote controls — there is one for every indoor unit.</span>
                </div>

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
                <>
                  G01 / 335 Aspen Village
                  <div className="text-xs text-slate-500">Lot 3 · Anketell Street</div>
                </>
              } />
              <SummaryRow label="Booker" value={
                <>
                  Owner
                  <div className="text-xs text-slate-500">Candice Miller</div>
                </>
              } />
              <SummaryRow label="AC" value={`${systems} system${systems !== 1 ? 's' : ''}${additional > 0 ? ` + ${additional} add-on${additional !== 1 ? 's' : ''}` : ''}`} />
              <SummaryRow label="Access" value={<span className="text-slate-400">Pending</span>} />

              <div className="rounded-xl border border-slate-200 bg-white p-3 opacity-50 grayscale">
                <div className="text-[11px] uppercase tracking-wide text-slate-500">Selected slot</div>
                <div className="mt-1.5 text-xs text-slate-400">No slot picked yet</div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3 border-pink-200 bg-pink-50/30">
                <div className="flex items-baseline justify-between">
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-500" style={{ color: BRAND }}>Total</div>
                    <div className="text-[11px] text-slate-500">incl. GST</div>
                  </div>
                  <div className="text-2xl font-bold text-slate-900">${total}</div>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200 bg-white px-5 py-4">
              <button
                type="button"
                data-testid="button-continue"
                className="flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
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
