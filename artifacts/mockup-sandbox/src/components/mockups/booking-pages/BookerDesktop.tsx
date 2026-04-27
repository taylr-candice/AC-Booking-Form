import React, { useState } from "react";
import { ArrowRight } from "lucide-react";

const BRAND = "#ED017F";

export function BookerDesktop() {
  const [firstName, setFirstName] = useState("Candice");
  const [lastName, setLastName] = useState("Miller");
  const [email, setEmail] = useState("candice@taylr.com.au");
  const [mobile, setMobile] = useState("0410 615 362");

  const isValid = firstName && lastName && email && mobile;

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-['Inter'] flex justify-center overflow-y-auto">
      <div className="w-full max-w-xl">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-8 md:p-10 flex flex-col">
          
          <div className="mb-8">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-2">Step 3 of 7</div>
            <h1 className="text-2xl font-semibold text-slate-900">Your contact details</h1>
            <p className="text-sm text-slate-500 mt-2">We'll use these details to send your booking confirmation and receipt.</p>
          </div>

          <div className="flex-1 space-y-6">
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
