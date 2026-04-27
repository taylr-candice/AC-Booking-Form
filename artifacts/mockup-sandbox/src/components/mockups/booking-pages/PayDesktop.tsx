import React, { useState } from "react";
import { ArrowRight, Lock, CreditCard as CreditCardIcon, Apple, Info, Clock, CheckCircle2 } from "lucide-react";
import { bookingActions, useBookingSelector } from "../../../state/bookingSession";
import { isCoordinationFlow } from "../../../state/bookingDerived";
import {
  acSummary,
  CANCELLATION_ACK_LABEL,
  CANCELLATION_POLICY_PARAGRAPHS,
  computeBookingTotal,
  COORDINATION_NOTE,
  isStep7PayEnabled,
  labelForAccessMethod,
  labelForRole,
  scheduleDisplay,
  unitLabel,
} from "../../../state/bookingHelpers";

const BRAND = "#ED017F";
const SELECTED_GREEN = "#1F7A57";

type PayMethod = "card" | "apple";

export function PayDesktop() {
  const [method, setMethod] = useState<PayMethod>("card");
  const session = useBookingSelector((s) => s);

  const total = computeBookingTotal(session);
  const isCoordination = isCoordinationFlow(session);
  const ack = session.cancellation_acknowledged;
  const schedule = scheduleDisplay(session);
  const unit = unitLabel(session.unit_id);

  const payEnabled = isStep7PayEnabled(session);

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-['Inter'] flex justify-center overflow-y-auto">
      <div className="w-full max-w-2xl">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-8 md:p-10 flex flex-col">
          
          <div className="mb-8">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-2">Step 7 of 7</div>
            <h1 className="text-2xl font-semibold text-slate-900">Review & pay</h1>
          </div>

          <div className="flex-1 space-y-10">

            {isCoordination && (
              <div
                className="flex items-start gap-3 rounded-xl p-5 text-sm leading-relaxed text-white"
                style={{ backgroundColor: "#1F7A57" }}
                data-testid="banner-coordination"
              >
                <Info className="h-5 w-5 shrink-0 mt-0.5 text-white" />
                <span>{COORDINATION_NOTE}</span>
              </div>
            )}

            {/* Compact Summary */}
            <div>
              <h2 className="text-lg font-semibold mb-4" style={{ color: BRAND }}>Booking summary</h2>
              <div className="rounded-xl border border-slate-200 p-5 divide-y divide-slate-100">
                <SummaryRow label="Unit" value={<>{unit.line1}{unit.line2 && <span className="block text-xs text-slate-500 mt-0.5">{unit.line2}</span>}</>} />
                <SummaryRow label="Booker" value={<>{labelForRole(session.role)}<span className="block text-xs text-slate-500 mt-0.5">{[session.contact_first_name, session.contact_last_name].filter(Boolean).join(" ") || "—"}</span></>} />
                <SummaryRow label="AC" value={acSummary(session)} />
                <SummaryRow label="Access" value={<>{labelForAccessMethod(session.access_method)}{session.tenants.length > 0 && <span className="block text-xs text-slate-500 mt-0.5">{session.tenants.length} tenant(s)</span>}</>} />
                <SummaryRow label="Slot" value={
                  isCoordination ? "To be coordinated" : (
                    <span className="flex items-center justify-end gap-1.5">
                      <CheckCircle2 className="h-4 w-4" style={{ color: SELECTED_GREEN }} />
                      {schedule.primary} <span className="text-slate-500 text-xs ml-1 capitalize">{schedule.secondary}</span>
                    </span>
                  )
                } />
              </div>
            </div>

            {/* Price breakdown */}
            <div className="rounded-xl border border-pink-200 bg-pink-50/30 p-5 shadow-sm flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-900">Total amount</div>
                <div className="text-xs text-slate-500 mt-1">Includes GST</div>
              </div>
              <div className="text-3xl font-bold text-slate-900" data-testid="text-total">${total}</div>
            </div>

            {/* Payment Method */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold" style={{ color: BRAND }}>Payment details</h2>
                <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                  <Lock className="h-3.5 w-3.5" /> Secure
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-6">
                <button
                  type="button"
                  onClick={() => setMethod("card")}
                  data-testid="card-method-card"
                  className={`flex h-full flex-col items-center justify-center gap-2 rounded-xl border p-4 transition ${
                    method === "card" ? "" : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                  style={method === "card" ? { borderColor: "#1F7A57", backgroundColor: "#1F7A57" } : {}}
                >
                  <CreditCardIcon className={`h-6 w-6 ${method === "card" ? "text-white" : "text-slate-600"}`} />
                  <span className={`text-sm font-semibold ${method === "card" ? "text-white" : "text-slate-900"}`}>Credit Card</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMethod("apple")}
                  data-testid="card-method-apple"
                  className={`flex h-full flex-col items-center justify-center gap-2 rounded-xl border p-4 transition ${
                    method === "apple" ? "" : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                  style={method === "apple" ? { borderColor: "#1F7A57", backgroundColor: "#1F7A57" } : {}}
                >
                  <Apple className={`h-6 w-6 ${method === "apple" ? "text-white" : "text-slate-600"}`} />
                  <span className={`text-sm font-semibold ${method === "apple" ? "text-white" : "text-slate-900"}`}>Apple Pay</span>
                </button>
              </div>

              {method === "card" && (
                <div className="space-y-4 animate-in fade-in duration-300">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Card number</label>
                    <div className="relative">
                      <input type="text" placeholder="0000 0000 0000 0000" className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:border-pink-500 focus:ring-1 focus:ring-pink-500 outline-none transition" />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        <div className="h-5 w-8 rounded bg-slate-200"></div>
                        <div className="h-5 w-8 rounded bg-slate-200"></div>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Expiry date</label>
                      <input type="text" placeholder="MM/YY" className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:border-pink-500 focus:ring-1 focus:ring-pink-500 outline-none transition" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">CVC</label>
                      <input type="text" placeholder="123" className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:border-pink-500 focus:ring-1 focus:ring-pink-500 outline-none transition" />
                    </div>
                  </div>
                </div>
              )}
              {method === "apple" && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center animate-in fade-in duration-300">
                  <Apple className="h-10 w-10 text-slate-900 mx-auto mb-4" />
                  <p className="text-sm text-slate-600 mb-4">You will be prompted to authenticate with Apple Pay when you click Pay.</p>
                </div>
              )}
            </div>

            {/* Cancellation policy */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-6">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Cancellation terms</h3>
              <div className="space-y-3 text-sm leading-relaxed text-slate-600 mb-6">
                {CANCELLATION_POLICY_PARAGRAPHS.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border bg-white p-4 transition" style={ack ? { borderColor: "#1F7A57", backgroundColor: "#1F7A57" } : { borderColor: "#E2E8F0" }}>
                <input
                  type="checkbox"
                  checked={ack}
                  onChange={(e) => bookingActions.setCancellationAcknowledged(e.target.checked)}
                  data-testid="checkbox-cancellation-ack"
                  className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300"
                  style={ack ? { accentColor: "#FFFFFF" } : undefined}
                />
                <span className={`text-sm font-medium ${ack ? "text-white" : "text-slate-700"}`}>{CANCELLATION_ACK_LABEL}</span>
              </label>
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
              data-testid="button-pay"
              disabled={!payEnabled}
              className={`flex items-center gap-2 rounded-full px-8 py-3.5 text-base font-bold text-white shadow-md transition ${
                payEnabled ? "hover:opacity-90 hover:shadow-lg" : "opacity-50 cursor-not-allowed"
              }`}
              style={{ backgroundColor: BRAND }}
            >
              Pay ${total}
              <ArrowRight className="h-5 w-5" />
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <div className="text-[12px] font-medium text-slate-500 mt-0.5">{label}</div>
      <div className="flex-1 text-right text-sm font-medium text-slate-900">{value}</div>
    </div>
  );
}
