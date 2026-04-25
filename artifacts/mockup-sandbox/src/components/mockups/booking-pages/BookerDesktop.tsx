import React, { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Wind,
  CalendarDays,
  Home as HomeIcon,
  CreditCard,
  Pencil,
  Building,
} from "lucide-react";

const BRAND = "#ED017F";

export function BookerDesktop() {
  const [firstName, setFirstName] = useState("Candice");
  const [lastName, setLastName] = useState("Miller");
  const [email, setEmail] = useState("candice@taylr.com.au");
  const [mobile, setMobile] = useState("0410 615 362");

  const isValid = firstName && lastName && email && mobile;

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
              <div className="text-xs uppercase tracking-wide text-slate-500">Step 3 of 7</div>
              <h1 className="text-2xl font-semibold text-slate-900">Your contact details</h1>
            </div>
          </div>
        </header>

        {/* Two-column body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Main content */}
          <section className="flex flex-1 flex-col overflow-auto bg-white px-7 py-10">
            <div className="mx-auto w-full max-w-xl">
              <div className="mb-8">
                <h2 className="text-xl font-semibold mb-2" style={{ color: BRAND }}>Who is making this booking?</h2>
                <p className="text-sm text-slate-500">We'll use these details to send your booking confirmation and receipt.</p>
                <p className="text-xs text-slate-400 mt-2 italic">(If you selected Agent in the previous step, an Agency dropdown would appear here)</p>
              </div>
              
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">First name</label>
                    <input 
                      type="text" 
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-pink-500 focus:ring-1 focus:ring-pink-500 outline-none transition" 
                      data-testid="input-firstname"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Last name</label>
                    <input 
                      type="text" 
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-pink-500 focus:ring-1 focus:ring-pink-500 outline-none transition" 
                      data-testid="input-lastname"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Email address</label>
                  <input 
                    type="email" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-pink-500 focus:ring-1 focus:ring-pink-500 outline-none transition" 
                    data-testid="input-email"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Mobile number</label>
                  <input 
                    type="tel" 
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-pink-500 focus:ring-1 focus:ring-pink-500 outline-none transition" 
                    data-testid="input-mobile"
                  />
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
                  {firstName && <div className="text-xs text-slate-500">{firstName} {lastName}</div>}
                  {email && <div className="text-xs text-slate-500">{email}</div>}
                </>
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
                disabled={!isValid}
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
