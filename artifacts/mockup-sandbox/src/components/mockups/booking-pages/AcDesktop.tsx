import React, { useState } from "react";
import { AirVent, ArrowRight, Fan, Info, Minus, Plus } from "lucide-react";

const BRAND = "#ED017F";
const SYSTEM_PRICE = 179;
const ADDON_PRICE = 39;

export function AcDesktop() {
  const [systems, setSystems] = useState(2);
  const [additional, setAdditional] = useState(1);

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-['Inter'] flex justify-center overflow-y-auto">
      <div className="w-full max-w-xl">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-8 md:p-10 flex flex-col">
          
          <div className="mb-8">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-2">Step 4 of 7</div>
            <h1 className="text-2xl font-semibold text-slate-900">How many AC systems are at the unit?</h1>
          </div>

          <div className="flex-1">
            <div className="mb-6 rounded-xl border border-pink-200 bg-pink-50 p-4 flex gap-3">
              <Info className="h-5 w-5 text-pink-600 shrink-0" />
              <div className="text-sm text-pink-900">
                <span className="font-semibold">Pre-filled from your last service.</span> Our records show 2 systems with 1 additional indoor unit — adjust if anything has changed.
              </div>
            </div>

            <div className="space-y-6">
              {/* Systems Stepper */}
              <div className="rounded-xl border border-slate-200 p-6 bg-white shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="pr-4">
                    <h3 className="font-semibold text-slate-900 text-lg">Number of systems</h3>
                    <p className="text-xs font-medium mt-1" style={{ color: BRAND }}>${SYSTEM_PRICE} per system</p>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <button
                      onClick={() => setSystems(Math.max(1, systems - 1))}
                      disabled={systems <= 1}
                      className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <div className="w-8 text-center text-xl font-bold text-slate-900">{systems}</div>
                    <button
                      onClick={() => setSystems(systems + 1)}
                      className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* What counts as 1 system */}
                <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-3">
                  <div className="flex items-center justify-center gap-3 text-xs sm:text-sm flex-wrap">
                    <div className="flex items-center gap-2">
                      <div className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 bg-white text-slate-600">
                        <AirVent className="h-4 w-4" />
                      </div>
                      <span className="font-medium text-slate-700">1 indoor unit</span>
                    </div>
                    <span className="text-slate-400 font-semibold">+</span>
                    <div className="flex items-center gap-2">
                      <div className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 bg-white text-slate-600">
                        <Fan className="h-4 w-4" />
                      </div>
                      <span className="font-medium text-slate-700">1 outdoor unit</span>
                    </div>
                    <span className="text-slate-400 font-semibold">=</span>
                    <span className="font-semibold text-slate-900">1 system</span>
                  </div>
                </div>
              </div>

              {/* Additional Units Stepper */}
              <div className="rounded-xl border border-slate-200 p-6 bg-white shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="pr-4">
                    <div className="flex items-center gap-2">
                      <div className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 bg-slate-50 text-slate-600">
                        <AirVent className="h-4 w-4" />
                      </div>
                      <h3 className="font-semibold text-slate-900 text-lg">Additional indoor units</h3>
                    </div>
                    <p className="text-xs font-medium mt-2" style={{ color: BRAND }}>${ADDON_PRICE} per extra unit</p>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <button
                      onClick={() => setAdditional(Math.max(0, additional - 1))}
                      disabled={additional <= 0}
                      className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <div className="w-8 text-center text-xl font-bold text-slate-900">{additional}</div>
                    <button
                      onClick={() => setAdditional(additional + 1)}
                      className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <p className="mt-3 text-sm text-slate-500">
                  Indoor units beyond the 1 already included with each system.
                </p>
              </div>

              {/* Tip */}
              <div className="rounded-xl bg-slate-100 p-5 text-sm text-slate-600 flex gap-3 mt-4">
                <span className="font-bold">Tip:</span>
                <span>Not sure how many indoor units you have? Just count the remote controls — there is one for every indoor unit.</span>
              </div>
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
              data-testid="button-continue"
              className="flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90"
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
