import React, { useState } from "react";
import { ArrowRight, Briefcase, ChevronDown } from "lucide-react";
import { bookingActions, useBookingSelector } from "../../../state/bookingSession";
import { DEMO_MANAGING_AGENCIES } from "../../../state/accessMethodCatalog";

const BRAND = "#ED017F";

export function BookerDesktop() {
  const role = useBookingSelector((s) => s.role);
  const agencyId = useBookingSelector((s) => s.agency_id);
  const isAgent = role === "agent";

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");

  const isValid =
    firstName && lastName && email && mobile && (!isAgent || !!agencyId);

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-['Inter'] flex justify-center overflow-y-auto">
      <div className="w-full max-w-xl">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-8 md:p-10 flex flex-col">

          <div className="mb-8">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-2">Step 3 of 7</div>
            <h1 className="text-2xl font-semibold text-slate-900">
              {isAgent ? "Your agency & contact details" : "Your contact details"}
            </h1>
            <p className="text-sm text-slate-500 mt-2">
              {isAgent
                ? "Tell us which agency you're booking on behalf of, plus how we can reach you."
                : "We'll use these details to send your booking confirmation and receipt."}
            </p>
          </div>

          <div className="flex-1 space-y-8">

            {isAgent && (
              <div>
                <label
                  htmlFor="booker-agency-desktop"
                  className="block text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3"
                >
                  Your agency
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-slate-500">
                    <Briefcase className="h-4 w-4" />
                  </div>
                  <select
                    id="booker-agency-desktop"
                    value={agencyId || ""}
                    onChange={(e) => bookingActions.setAgency(e.target.value || null)}
                    data-testid="select-agency"
                    className={`w-full appearance-none rounded-xl border border-slate-300 bg-white py-3.5 pl-14 pr-10 text-sm font-medium outline-none transition focus:border-pink-500 focus:ring-1 focus:ring-pink-500 ${
                      agencyId ? "text-slate-900" : "text-slate-400"
                    }`}
                  >
                    <option value="" disabled>Select your agency…</option>
                    {DEMO_MANAGING_AGENCIES.map((a) => (
                      <option key={a.id} value={a.id} className="text-slate-900">{a.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                </div>
              </div>
            )}

            <div>
              {isAgent && (
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3">
                  Your contact details
                </h2>
              )}
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">First name</label>
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:border-pink-500 focus:ring-1 focus:ring-pink-500 outline-none transition"
                      data-testid="input-firstname"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Last name</label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:border-pink-500 focus:ring-1 focus:ring-pink-500 outline-none transition"
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
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:border-pink-500 focus:ring-1 focus:ring-pink-500 outline-none transition"
                    data-testid="input-email"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Mobile number</label>
                  <input
                    type="tel"
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:border-pink-500 focus:ring-1 focus:ring-pink-500 outline-none transition"
                    data-testid="input-mobile"
                  />
                </div>
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
              disabled={!isValid}
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
