import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Gauge,
  CalendarCheck,
  MessageSquare,
  User,
  CheckCircle2,
  MapPin,
  Building2,
  ChevronDown,
  Plus,
} from "lucide-react";

const BRAND = "#ED017F";
const SELECTED_GREEN = "#5FBB97";

type Unit = {
  id: string;
  address: string;
  lot: string;
  building: string;
};

const UNITS: Unit[] = [
  {
    id: "u1",
    address: "G01 / 335 Aspen Village",
    lot: "Lot 3",
    building: "Aspen Village · Anketell St, Greenway ACT",
  },
  {
    id: "u2",
    address: "402 / 121 Marcus Clarke Street",
    lot: "Lot 44",
    building: "The ApARTments · Canberra ACT",
  },
  {
    id: "u3",
    address: "14 / 88 Marine Parade",
    lot: "Lot 14",
    building: "Ocean View · Coogee NSW",
  },
  {
    id: "u4",
    address: "3 / 4 Example Street",
    lot: "Lot 3",
    building: "Bondi Breakers · Bondi NSW",
  },
  {
    id: "u5",
    address: "705 / 21 Bourke Street",
    lot: "Lot 705",
    building: "Surry Central · Surry Hills NSW",
  },
];

export function UnitMobile() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const selected = UNITS.find((u) => u.id === selectedId);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-white font-['Inter']">
      <div className="border-b border-slate-100 bg-slate-50/70 px-5 pb-1 pt-2 text-[11px] text-slate-400">
        Booking
      </div>

      <div className="flex items-start justify-between px-5 pb-4 pt-5">
        <div>
          <h1 className="text-[26px] font-semibold leading-tight text-slate-900">
            Pick a unit
          </h1>
          <div className="mt-0.5 text-xs font-semibold tracking-wide uppercase text-slate-500">
            Step 1 of 7
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

      <div className="flex-1 overflow-y-auto px-5 pb-6">
        <p className="mb-4 text-[14px] leading-relaxed text-slate-500">
          Choose the apartment you'd like to book this service for.
        </p>

        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
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
                <span className="text-[15px] text-slate-400">Select a unit…</span>
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
                    onClick={() => {
                      setSelectedId(u.id);
                      setOpen(false);
                    }}
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
            className="mt-5 rounded-xl border p-4"
            style={{
              borderColor: "rgba(95,187,151,0.45)",
              backgroundColor: "rgba(95,187,151,0.08)",
            }}
          >
            <div className="flex items-start gap-3">
              <div
                className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full"
                style={{ backgroundColor: SELECTED_GREEN }}
              >
                <Building2 className="h-4 w-4 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <div
                  className="text-[11px] font-semibold uppercase tracking-wide"
                  style={{ color: SELECTED_GREEN }}
                >
                  Booking for
                </div>
                <div className="mt-0.5 text-[15px] font-semibold text-slate-900">
                  {selected.address}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-slate-600">
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {selected.lot}
                  </span>
                  <span className="flex items-center gap-1">
                    <Building2 className="h-3 w-3" /> {selected.building}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-[11px] text-slate-500">
          Don't see your unit? Choose <span className="font-medium" style={{ color: BRAND }}>Add a different unit</span> in the list above and we'll set it up.
        </div>
      </div>

      <div className="border-t border-slate-100 bg-white px-5 py-3">
        <button
          type="button"
          disabled={!selectedId}
          data-testid="button-continue"
          className="flex w-full items-center justify-center gap-2 rounded-full px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition disabled:opacity-50"
          style={{ backgroundColor: BRAND }}
        >
          Continue
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>

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
