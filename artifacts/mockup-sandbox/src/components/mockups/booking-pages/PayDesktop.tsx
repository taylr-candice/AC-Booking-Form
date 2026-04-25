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
  Lock,
  CreditCard as CreditCardIcon,
  Apple,
  FileText,
  Info,
  Clock,
} from "lucide-react";
import {
  bookingActions,
  useBookingSelector,
} from "../../../state/bookingSession";
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
const SELECTED_GREEN = "#5FBB97";

type PayMethod = "card" | "apple";

export function PayDesktop() {
  const [method, setMethod] = useState<PayMethod>("card");
  const session = useBookingSelector((s) => s);

  const total = computeBookingTotal(session);
  const isCoordination = isCoordinationFlow(session);
  const isAgent = session.role === "agent";
  const ack = session.cancellation_acknowledged;
  const schedule = scheduleDisplay(session);
  const unit = unitLabel(session.unit_id);

  const payEnabled = isStep7PayEnabled(session);

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
              <div className="text-xs uppercase tracking-wide text-slate-500">Review &amp; pay</div>
              <h1 className="text-2xl font-semibold text-slate-900">Check out</h1>
            </div>
          </div>
        </header>

        {/* Two-column body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Main content */}
          <section className="flex flex-1 flex-col overflow-auto bg-white px-7 py-10">
            <div className="mx-auto w-full max-w-2xl">

              {/* Coordination flow banner */}
              {isCoordination && (
                <div
                  className="mb-8 flex items-start gap-3 rounded-xl border p-4 text-sm leading-relaxed"
                  style={{
                    borderColor: "rgba(95,187,151,0.45)",
                    backgroundColor: "rgba(95,187,151,0.08)",
                    color: "#0F172A",
                  }}
                  data-testid="banner-coordination"
                >
                  <Info className="h-5 w-5 shrink-0 mt-0.5" style={{ color: SELECTED_GREEN }} />
                  <span>{COORDINATION_NOTE}</span>
                </div>
              )}

              {/* Payment Method */}
              <div className="mb-10">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold" style={{ color: BRAND }}>Payment details</h2>
                  <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                    <Lock className="h-3.5 w-3.5" /> Secure SSL connection
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
                    style={
                      method === "card"
                        ? {
                            borderColor: "rgba(95,187,151,0.45)",
                            backgroundColor: "rgba(95,187,151,0.08)",
                          }
                        : {}
                    }
                  >
                    <CreditCardIcon
                      className="h-6 w-6"
                      style={{ color: method === "card" ? SELECTED_GREEN : "#475569" }}
                    />
                    <span className="text-sm font-semibold text-slate-900">Credit Card</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMethod("apple")}
                    data-testid="card-method-apple"
                    className={`flex h-full flex-col items-center justify-center gap-2 rounded-xl border p-4 transition ${
                      method === "apple" ? "" : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                    style={
                      method === "apple"
                        ? {
                            borderColor: "rgba(95,187,151,0.45)",
                            backgroundColor: "rgba(95,187,151,0.08)",
                          }
                        : {}
                    }
                  >
                    <Apple
                      className="h-6 w-6"
                      style={{ color: method === "apple" ? SELECTED_GREEN : "#475569" }}
                    />
                    <span className="text-sm font-semibold text-slate-900">Apple Pay</span>
                  </button>
                </div>

                {/* Card Form */}
                {method === "card" && (
                  <div className="space-y-4 animate-in fade-in duration-300">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Card number</label>
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="0000 0000 0000 0000"
                          className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-pink-500 focus:ring-1 focus:ring-pink-500 outline-none transition"
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                          <div className="h-5 w-8 rounded bg-slate-200"></div>
                          <div className="h-5 w-8 rounded bg-slate-200"></div>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">Expiry date</label>
                        <input
                          type="text"
                          placeholder="MM/YY"
                          className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-pink-500 focus:ring-1 focus:ring-pink-500 outline-none transition"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">CVC</label>
                        <input
                          type="text"
                          placeholder="123"
                          className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-pink-500 focus:ring-1 focus:ring-pink-500 outline-none transition"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">Country</label>
                        <select className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-pink-500 focus:ring-1 focus:ring-pink-500 outline-none bg-white">
                          <option>Australia</option>
                          <option>New Zealand</option>
                          <option>United Kingdom</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">Postcode</label>
                        <input
                          type="text"
                          placeholder="2000"
                          className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-pink-500 focus:ring-1 focus:ring-pink-500 outline-none transition"
                        />
                      </div>
                    </div>
                  </div>
                )}
                {method === "apple" && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center animate-in fade-in duration-300">
                    <Apple className="h-10 w-10 text-slate-900 mx-auto mb-4" />
                    <p className="text-slate-600 mb-4">You will be prompted to authenticate with Apple Pay when you click Pay.</p>
                  </div>
                )}
              </div>

              {/* Billing Details */}
              <div className="mb-10">
                <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-2">
                  <h2 className="text-lg font-semibold" style={{ color: BRAND }}>Billing details</h2>
                  <button type="button" className="text-slate-400 hover:text-slate-900 transition"><Pencil className="h-4 w-4" /></button>
                </div>
                <div className="text-sm text-slate-600 space-y-1">
                  <p className="font-medium text-slate-900">
                    {[session.contact_first_name, session.contact_last_name].filter(Boolean).join(" ") || "—"}
                  </p>
                  <p>{session.contact_email || "—"}</p>
                  <p>{session.contact_phone || "—"}</p>
                  <p className="mt-2 text-slate-500">
                    Service address: {unit.line1}
                    {unit.line2 ? `, ${unit.line2}` : ""}
                  </p>
                </div>
              </div>

              {/* Cancellation policy */}
              <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-5">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Cancellation &amp; rescheduling terms
                </h3>
                <div className="space-y-2.5 text-sm leading-relaxed text-slate-600">
                  {CANCELLATION_POLICY_PARAGRAPHS.map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
              </div>

              {/* Cancellation tickbox */}
              <label
                className="flex cursor-pointer items-start gap-3 rounded-xl border bg-white p-4 transition"
                style={
                  ack
                    ? {
                        borderColor: "rgba(95,187,151,0.45)",
                        backgroundColor: "rgba(95,187,151,0.08)",
                      }
                    : { borderColor: "#E2E8F0" }
                }
              >
                <input
                  type="checkbox"
                  checked={ack}
                  onChange={(e) => bookingActions.setCancellationAcknowledged(e.target.checked)}
                  data-testid="checkbox-cancellation-ack"
                  className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300"
                  style={ack ? { accentColor: SELECTED_GREEN } : undefined}
                />
                <span className="text-sm leading-snug text-slate-700">
                  {CANCELLATION_ACK_LABEL}
                </span>
              </label>

            </div>
          </section>

          {/* Booking summary rail */}
          <aside className="flex w-[340px] shrink-0 flex-col border-l border-slate-200 bg-slate-50">
            <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-5">
              <h3 className="text-base font-semibold" style={{ color: BRAND }}>Booking summary</h3>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-6 text-sm">
              <SummaryRow
                label="Unit"
                value={
                  <span data-testid="text-summary-unit">
                    {unit.line1}
                    {unit.line2 && <div className="text-xs text-slate-500">{unit.line2}</div>}
                  </span>
                }
              />
              <SummaryRow
                label="Booker"
                value={
                  <>
                    <span data-testid="text-summary-role">{labelForRole(session.role)}</span>
                    <div className="text-xs text-slate-500">
                      {[session.contact_first_name, session.contact_last_name].filter(Boolean).join(" ") || "—"}
                    </div>
                  </>
                }
              />
              <SummaryRow
                label="AC"
                value={<span data-testid="text-summary-ac">{acSummary(session)}</span>}
              />
              <SummaryRow
                label="Access"
                value={
                  <span data-testid="text-summary-access">
                    {labelForAccessMethod(session.access_method)}
                    {session.tenants.length > 0 && (
                      <div className="text-xs text-slate-500">
                        {session.tenants.length} tenant{session.tenants.length === 1 ? "" : "s"} on file
                      </div>
                    )}
                  </span>
                }
              />

              {/* Schedule card or coordination placeholder */}
              {isCoordination ? (
                <div
                  className="rounded-xl border bg-white p-4"
                  style={{ borderColor: "rgba(95,187,151,0.45)" }}
                  data-testid="text-summary-schedule"
                >
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">
                    Schedule
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <div
                      className="grid h-10 w-10 place-items-center rounded-full text-white"
                      style={{ backgroundColor: SELECTED_GREEN }}
                    >
                      <Clock className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-base font-semibold text-slate-900">
                        To be coordinated
                      </div>
                      <div className="text-xs text-slate-500">
                        We'll email you once a window is agreed
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">Selected slot</div>
                  <div className="mt-2 flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-full text-white" style={{ backgroundColor: SELECTED_GREEN }}>
                      <CheckCircle2 className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-base font-semibold text-slate-900" data-testid="text-summary-schedule">
                        {schedule.primary}
                      </div>
                      {schedule.secondary && (
                        <div className="text-sm capitalize text-slate-500">{schedule.secondary}</div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="rounded-xl border border-pink-200 bg-white p-4 shadow-sm">
                <div className="flex items-baseline justify-between mb-2">
                  <div className="text-sm font-semibold text-slate-900">Total</div>
                  <div className="text-2xl font-bold text-slate-900" data-testid="text-total">${total}</div>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Includes GST</span>
                  <span>Ref: TLR-742019</span>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200 bg-white px-6 py-6 space-y-3">
              <button
                type="button"
                data-testid="button-pay"
                disabled={!payEnabled}
                className={`flex w-full items-center justify-center gap-2 rounded-full px-6 py-4 text-base font-bold text-white shadow-md transition ${
                  payEnabled ? "hover:opacity-90 hover:shadow-lg" : "opacity-50 cursor-not-allowed"
                }`}
                style={{ backgroundColor: BRAND }}
              >
                Pay ${total}
                <ArrowRight className="h-5 w-5" />
              </button>

              {isAgent && (
                <button
                  type="button"
                  data-testid="button-pay-later"
                  disabled
                  className="flex w-full items-center justify-center gap-2 rounded-full border-2 border-slate-200 bg-slate-50 px-6 py-3 text-sm font-semibold text-slate-400 cursor-not-allowed"
                >
                  <FileText className="h-4 w-4" />
                  Pay later (invoice) — coming soon
                </button>
              )}

              <p className="text-center text-[11px] text-slate-400">
                By paying you agree to Taylr's Terms of Service.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-3 last:border-b-0 last:pb-0">
      <div className="text-[11px] uppercase tracking-wide text-slate-500 pt-0.5">{label}</div>
      <div className="flex-1 text-right text-sm font-medium text-slate-900">{value}</div>
    </div>
  );
}
