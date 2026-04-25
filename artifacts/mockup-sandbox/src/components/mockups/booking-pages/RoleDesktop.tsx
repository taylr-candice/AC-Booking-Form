import React from "react";
import {
  ArrowLeft,
  ArrowRight,
  Wind,
  CalendarDays,
  Home as HomeIcon,
  CreditCard,
  Pencil,
  CheckCircle2,
  User,
  Briefcase
} from "lucide-react";
import { bookingActions, useBookingSelector } from "../../../state/bookingSession";

const BRAND = "#ED017F";
const SELECTED_GREEN = "#5FBB97";

export function RoleDesktop() {
  const role = useBookingSelector((s) => s.role);

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
              <div className="text-xs uppercase tracking-wide text-slate-500">Step 2 of 7</div>
              <h1 className="text-2xl font-semibold text-slate-900">What's your relationship to the property?</h1>
            </div>
          </div>
        </header>

        {/* Two-column body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Main content */}
          <section className="flex flex-1 flex-col overflow-auto bg-white px-7 py-10">
            <div className="mx-auto w-full max-w-xl">
              <h2 className="text-xl font-semibold mb-6" style={{ color: BRAND }}>Select your role</h2>
              
              <div className="grid grid-cols-2 gap-4">
                {/* Owner Card */}
                <button
                  type="button"
                  onClick={() => bookingActions.setRole("owner")}
                  data-testid="card-role-owner"
                  className={`relative flex h-full flex-col items-center text-center rounded-2xl border p-8 transition-all ${
                    role === "owner"
                      ? "scale-[1.02] shadow-md"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-md"
                  }`}
                  style={
                    role === "owner"
                      ? {
                          borderColor: "rgba(95,187,151,0.45)",
                          backgroundColor: "rgba(95,187,151,0.08)",
                        }
                      : {}
                  }
                >
                  <div
                    className={`mb-4 grid h-16 w-16 place-items-center rounded-2xl ${role === "owner" ? "text-white" : "bg-slate-100 text-slate-700"}`}
                    style={role === "owner" ? { backgroundColor: SELECTED_GREEN } : undefined}
                  >
                    <User className="h-8 w-8" />
                  </div>
                  <h3 className="text-lg font-bold mb-2 text-slate-900">Owner</h3>
                  <p className="text-sm text-slate-500">
                    I own this apartment, whether I live in it or lease it out.
                  </p>
                  {role === "owner" && (
                    <div className="absolute top-4 right-4">
                      <CheckCircle2 className="h-6 w-6" style={{ color: SELECTED_GREEN }} />
                    </div>
                  )}
                </button>

                {/* Agent Card */}
                <button
                  type="button"
                  onClick={() => bookingActions.setRole("agent")}
                  data-testid="card-role-agent"
                  className={`relative flex h-full flex-col items-center text-center rounded-2xl border p-8 transition-all ${
                    role === "agent"
                      ? "scale-[1.02] shadow-md"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-md"
                  }`}
                  style={
                    role === "agent"
                      ? {
                          borderColor: "rgba(95,187,151,0.45)",
                          backgroundColor: "rgba(95,187,151,0.08)",
                        }
                      : {}
                  }
                >
                  <div
                    className={`mb-4 grid h-16 w-16 place-items-center rounded-2xl ${role === "agent" ? "text-white" : "bg-slate-100 text-slate-700"}`}
                    style={role === "agent" ? { backgroundColor: SELECTED_GREEN } : undefined}
                  >
                    <Briefcase className="h-8 w-8" />
                  </div>
                  <h3 className="text-lg font-bold mb-2 text-slate-900">Agent · Property Manager</h3>
                  <p className="text-sm text-slate-500">
                    I manage this apartment on behalf of the owner.
                  </p>
                  {role === "agent" && (
                    <div className="absolute top-4 right-4">
                      <CheckCircle2 className="h-6 w-6" style={{ color: SELECTED_GREEN }} />
                    </div>
                  )}
                </button>
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
                role ? (
                  <span className="capitalize">{role}</span>
                ) : (
                  <span className="text-slate-400">Not selected</span>
                )
              } />
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
                disabled={!role}
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
