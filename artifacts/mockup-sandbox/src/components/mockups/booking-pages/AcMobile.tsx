import { useState } from "react";
import {
  AirVent,
  ArrowLeft,
  ArrowRight,
  Gauge,
  CalendarCheck,
  Fan,
  MessageSquare,
  User,
  Minus,
  Plus,
  Info,
} from "lucide-react";

const BRAND = "#ED017F";
const SYSTEM_PRICE = 179;
const ADDON_PRICE = 39;

export function AcMobile() {
  const [systems, setSystems] = useState(2);
  const [additional, setAdditional] = useState(1);

  const total = systems * SYSTEM_PRICE + additional * ADDON_PRICE;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-white font-['Inter']">
      {/* Top hint strip */}
      <div className="border-b border-slate-100 bg-slate-50/70 px-5 pb-1 pt-2 text-[11px] text-slate-400">
        Booking
      </div>

      {/* Page header */}
      <div className="flex items-start justify-between px-5 pb-4 pt-5">
        <div>
          <h1 className="text-[26px] font-semibold leading-tight text-slate-900">
            Your AC
          </h1>
          <div className="mt-0.5 text-xs font-semibold tracking-wide uppercase text-slate-500">
            Step 4 of 7
          </div>
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

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 pb-6">
        <div className="mb-6 rounded-lg border border-sky-100 bg-sky-50 p-3 text-sm text-sky-800 flex gap-2.5 items-start">
          <Info className="h-4 w-4 mt-0.5 shrink-0 text-sky-500" />
          <p>
            <strong>Pre-filled from your last service.</strong> Our records show 2 systems with 1 additional indoor unit. Adjust below if anything has changed.
          </p>
        </div>

        <div className="space-y-6">
          {/* Number of systems */}
          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <div>
                <h3 className="font-semibold text-slate-900">Number of systems</h3>
                <p className="text-xs font-medium" style={{ color: BRAND }}>${SYSTEM_PRICE} per system</p>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-2">
              <button
                type="button"
                onClick={() => setSystems(Math.max(1, systems - 1))}
                className="grid h-10 w-10 place-items-center rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50"
                disabled={systems <= 1}
                data-testid="btn-systems-minus"
              >
                <Minus className="h-4 w-4" />
              </button>
              <div className="text-lg font-bold text-slate-900 w-12 text-center">{systems}</div>
              <button
                type="button"
                onClick={() => setSystems(systems + 1)}
                className="grid h-10 w-10 place-items-center rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200"
                data-testid="btn-systems-plus"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            {/* What counts as 1 system */}
            <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5">
              <div className="flex items-center justify-center gap-2 text-[11px] flex-wrap">
                <div className="flex items-center gap-1.5">
                  <div className="grid h-7 w-7 place-items-center rounded-md border border-slate-200 bg-white text-slate-600">
                    <AirVent className="h-3.5 w-3.5" />
                  </div>
                  <span className="font-medium text-slate-700">1 indoor</span>
                </div>
                <span className="text-slate-400 font-semibold">+</span>
                <div className="flex items-center gap-1.5">
                  <div className="grid h-7 w-7 place-items-center rounded-md border border-slate-200 bg-white text-slate-600">
                    <Fan className="h-3.5 w-3.5" />
                  </div>
                  <span className="font-medium text-slate-700">1 outdoor</span>
                </div>
                <span className="text-slate-400 font-semibold">=</span>
                <span className="font-semibold text-slate-900">1 system</span>
              </div>
            </div>
          </div>

          {/* Additional units */}
          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <div className="flex items-center gap-2">
                <div className="grid h-7 w-7 place-items-center rounded-md border border-slate-200 bg-slate-50 text-slate-600">
                  <AirVent className="h-3.5 w-3.5" />
                </div>
                <h3 className="font-semibold text-slate-900">Additional indoor units</h3>
              </div>
              <p className="text-xs font-medium" style={{ color: BRAND }}>${ADDON_PRICE} ea.</p>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-2">
              <button
                type="button"
                onClick={() => setAdditional(Math.max(0, additional - 1))}
                className="grid h-10 w-10 place-items-center rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50"
                disabled={additional <= 0}
                data-testid="btn-additional-minus"
              >
                <Minus className="h-4 w-4" />
              </button>
              <div className="text-lg font-bold text-slate-900 w-12 text-center">{additional}</div>
              <button
                type="button"
                onClick={() => setAdditional(additional + 1)}
                className="grid h-10 w-10 place-items-center rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200"
                data-testid="btn-additional-plus"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-2 text-[12px] text-slate-500">
              Indoor units beyond the 1 already included with each system.
            </p>
            <p className="mt-1 text-[11px] text-slate-400">
              Tip: Unsure? Just count the number of remote controls you have.
            </p>
          </div>
        </div>

        {/* Live Price Card */}
        <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 border-b border-slate-200 pb-3">
            <h2 className="text-[13px] font-semibold tracking-wide uppercase text-slate-500">
              Service Estimate
            </h2>
          </div>
          <div className="space-y-2 text-sm text-slate-600">
            <div className="flex justify-between">
              <span>{systems} × standard system</span>
              <span>${systems * SYSTEM_PRICE}</span>
            </div>
            {additional > 0 && (
              <div className="flex justify-between">
                <span>{additional} × additional indoor unit</span>
                <span>${additional * ADDON_PRICE}</span>
              </div>
            )}
          </div>
          <div className="mt-4 flex items-end justify-between border-t border-slate-200 pt-4">
            <span className="font-medium text-slate-900">Total (incl. GST)</span>
            <span className="text-xl font-bold" style={{ color: BRAND }}>
              ${total}
            </span>
          </div>
        </div>
      </div>

      {/* Docked CTA */}
      <div className="border-t border-slate-100 bg-white px-5 py-3">
        <button
          type="button"
          data-testid="button-continue"
          className="flex w-full items-center justify-center gap-2 rounded-full px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition"
          style={{ backgroundColor: BRAND }}
        >
          Continue
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      {/* Bottom tab nav */}
      <nav className="flex items-center justify-around bg-slate-900 px-4 py-3 text-white">
        <NavIcon icon={<Gauge className="h-5 w-5" />} label="Dash" />
        <NavIcon icon={<CalendarCheck className="h-5 w-5" />} label="Bookings" active />
        <div className="text-base font-bold tracking-tight">
          tay<span style={{ color: "#ff3b6e" }}>lr</span>
          <span className="text-[#ff3b6e]">.</span>
        </div>
        <NavIcon icon={<MessageSquare className="h-5 w-5" />} label="Chat" />
        <NavIcon icon={<User className="h-5 w-5" />} label="Me" />
      </nav>
    </div>
  );
}

function NavIcon({ icon, label, active }: { icon: React.ReactNode; label: string; active?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={`grid place-items-center rounded-full p-1.5 ${active ? "text-white" : "text-slate-300"}`}
    >
      {icon}
    </button>
  );
}
