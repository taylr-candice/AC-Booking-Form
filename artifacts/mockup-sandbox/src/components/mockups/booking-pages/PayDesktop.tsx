import React, { useEffect, useState } from "react";
import { ArrowRight, MapPin, Lock, CreditCard as CreditCardIcon, Info, CheckCircle2, Clock, FileText, X } from "lucide-react";
import { AfternoonIcon, EveningIcon, MorningIcon } from "../booking-slots/TimeOfDayIcon";
import { bookingActions, useBookingSelector } from "../../../state/bookingSession";
import {
  isCoordinationFlow,
  resolveOtherServiceQuantities,
} from "../../../state/bookingDerived";
import { PayOtherServiceRow } from "./payOtherServiceRow";
import {
  acSummary,
  agencyDisplayName,
  computeBookingTotal,
  COORDINATION_NOTE,
  INVOICE_LABEL,
  INVOICE_REFERENCE_NOTE,
  INVOICE_SUBLABEL,
  isPayStepEnabled,
  labelForAccessMethod,
  labelForRole,
  PAY_NOW_LABEL,
  PAY_NOW_SUBLABEL,
  STRIPE_REDIRECT_NOTE,
  unitLabel,
} from "../../../state/bookingHelpers";

const BRAND = "#ED017F";
const SELECTED_BG = "#7BC9A8";
const SELECTED_ACCENT = "#7BC9A8";

type PayMethod = "pay_now" | "invoice";

export function PayDesktop() {
  const [method, setMethod] = useState<PayMethod | null>(null);
  const [showPrepayInfo, setShowPrepayInfo] = useState(false);
  const [sendToAnother, setSendToAnother] = useState(false);
  const [anotherEmail, setAnotherEmail] = useState("");
  const session = useBookingSelector((s) => s);
  const isAgent = session.role === "agent";

  // If role changes away from agent while invoice is selected, clear the selection.
  useEffect(() => {
    if (!isAgent && method === "invoice") setMethod(null);
  }, [isAgent, method]);

  const total = computeBookingTotal(session);
  const isCoordination = isCoordinationFlow(session);
  const unit = unitLabel(session.unit_id);
  const otherServices = resolveOtherServiceQuantities(
    session.other_service_quantities ?? {},
  );

  // Owners (non-agents) only have one option, so we auto-treat
  // pay_now as selected and don't render the choice cards. Agents
  // still pick between pay_now and invoice.
  const effectiveMethod: PayMethod | null = isAgent ? method : "pay_now";
  const payEnabled =
    isPayStepEnabled(session) && effectiveMethod !== null;
  const ctaLabel =
    effectiveMethod === "invoice"
      ? "Submit booking"
      : effectiveMethod === "pay_now"
        ? "Continue to payment"
        : `Pay $${total}`;

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-['Inter'] flex justify-center overflow-y-auto">
      <div className="w-full max-w-2xl">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-8 md:p-10 flex flex-col">
          
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-slate-900">Review & pay</h1>
            <p className="mt-1.5 text-sm text-slate-500">
              Check everything looks right before payment
            </p>
          </div>

          <div className="flex-1 space-y-10">

            {isCoordination && (
              <div
                className="flex items-start gap-3 rounded-xl border p-5 text-sm leading-relaxed text-slate-700"
                style={{
                  borderColor: "#ED017F",
                  backgroundColor: "#FCE7F3",
                }}
                data-testid="banner-coordination"
              >
                <Info className="h-5 w-5 shrink-0 mt-0.5" style={{ color: BRAND }} />
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
                <SummaryRow label="Service window" value={
                  isCoordination ? (
                    <span className="inline-flex items-center justify-end gap-1.5 font-medium" style={{ color: BRAND }}>
                      <Clock className="h-4 w-4" />
                      To be coordinated
                    </span>
                  ) : session.service_date && session.service_slot && session.service_slot !== "to_be_coordinated" ? (
                    <span className="inline-flex items-center justify-end gap-1.5">
                      {session.service_slot === "morning" && <MorningIcon className="h-4 w-4 shrink-0" style={{ color: BRAND }} />}
                      {session.service_slot === "afternoon" && <AfternoonIcon className="h-4 w-4 shrink-0" style={{ color: BRAND }} />}
                      {session.service_slot === "evening" && <EveningIcon className="h-4 w-4 shrink-0" style={{ color: BRAND }} />}
                      {formatServiceDate(session.service_date)}
                      <span className="text-slate-400">·</span>
                      <span className="capitalize">{session.service_slot}</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center justify-end gap-1.5 text-slate-400">
                      <Clock className="h-4 w-4" />
                      Pending schedule
                    </span>
                  )
                } />
                {otherServices.map(({ rule, qty }) => (
                  <PayOtherServiceRow
                    key={rule.id}
                    rule={rule}
                    qty={qty}
                    variant="desktop"
                  />
                ))}
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
                <h2 className="text-lg font-semibold text-slate-900">Payment details</h2>
                <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                  <Lock className="h-3.5 w-3.5" /> Secure
                </div>
              </div>

              {/* Agents pick between Pay now and Invoice. Owners
                  have only one option, so we skip the choice cards
                  entirely and render the Stripe explainer below. */}
              {isAgent && (
                <div className="grid grid-cols-2 gap-3 mb-6">
                  <button
                    type="button"
                    onClick={() => setMethod("pay_now")}
                    data-testid="card-method-pay-now"
                    aria-pressed={method === "pay_now"}
                    className="relative flex h-full flex-col items-center justify-center gap-2 rounded-xl border p-5 transition"
                    style={
                      method === "pay_now"
                        ? {
                            borderColor: SELECTED_ACCENT,
                            backgroundColor: SELECTED_BG,
                          }
                        : { borderColor: "#E2E8F0", backgroundColor: "#FFFFFF" }
                    }
                  >
                    <CreditCardIcon
                      className={`h-6 w-6 ${
                        method === "pay_now" ? "text-white" : "text-slate-700"
                      }`}
                    />
                    <span
                      className={`text-sm font-semibold ${
                        method === "pay_now" ? "text-white" : "text-slate-900"
                      }`}
                    >
                      {PAY_NOW_LABEL}
                    </span>
                    <span
                      className={`text-[11px] font-medium ${
                        method === "pay_now" ? "text-white/85" : "text-slate-500"
                      }`}
                    >
                      {PAY_NOW_SUBLABEL}
                    </span>
                    {method === "pay_now" && (
                      <CheckCircle2 className="absolute right-2 top-2 h-4 w-4" style={{ color: "#ffffff" }} />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setMethod("invoice")}
                    data-testid="card-method-invoice"
                    aria-pressed={method === "invoice"}
                    className="relative flex h-full flex-col items-center justify-center gap-2 rounded-xl border p-5 transition"
                    style={
                      method === "invoice"
                        ? {
                            borderColor: SELECTED_ACCENT,
                            backgroundColor: SELECTED_BG,
                          }
                        : { borderColor: "#E2E8F0", backgroundColor: "#FFFFFF" }
                    }
                  >
                    <FileText
                      className={`h-6 w-6 ${
                        method === "invoice" ? "text-white" : "text-slate-700"
                      }`}
                    />
                    <span
                      className={`text-sm font-semibold ${
                        method === "invoice" ? "text-white" : "text-slate-900"
                      }`}
                    >
                      {INVOICE_LABEL}
                    </span>
                    <span
                      className={`text-[11px] font-medium ${
                        method === "invoice" ? "text-white/85" : "text-slate-500"
                      }`}
                    >
                      {INVOICE_SUBLABEL}
                    </span>
                    {method === "invoice" && (
                      <CheckCircle2 className="absolute right-2 top-2 h-4 w-4" style={{ color: "#ffffff" }} />
                    )}
                  </button>
                </div>
              )}

              {effectiveMethod === "pay_now" && (
                <div
                  className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-5 animate-in fade-in duration-300"
                  data-testid="block-pay-now-desktop"
                >
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white border border-slate-200 text-slate-700">
                    <Lock className="h-5 w-5" />
                  </div>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    {STRIPE_REDIRECT_NOTE}
                  </p>
                </div>
              )}
              {method === "invoice" && isAgent && (
                <div
                  className="rounded-xl border border-slate-200 bg-slate-50 p-6 animate-in fade-in duration-300"
                  data-testid="block-invoice-desktop"
                >
                  <div
                    className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5"
                    data-testid="block-prepay-notice-desktop"
                  >
                    <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-600" />
                    <p className="text-[12px] leading-relaxed text-slate-700">
                      Orders are cancelled if payment isn't received 48 hours before your service.{" "}
                      <button
                        type="button"
                        onClick={() => setShowPrepayInfo(true)}
                        className="font-semibold underline underline-offset-2"
                        style={{ color: BRAND }}
                      >
                        View more
                      </button>
                    </p>
                  </div>
                  <div className="space-y-2">
                    {/* Bill to — unit address + attention line */}
                    <div
                      className="rounded-xl border border-slate-200 bg-white p-4"
                      data-testid="block-invoice-destination-desktop"
                    >
                      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500 mb-2.5">
                        Bill to
                      </div>
                      {session.unit_id ? (
                        <div className="flex items-start gap-3">
                          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100">
                            <MapPin className="h-4 w-4 text-slate-600" />
                          </div>
                          <div>
                            <div
                              className="text-sm font-semibold text-slate-900 leading-tight"
                              data-testid="text-bill-to-address-line1-desktop"
                            >
                              {unit.line1}
                            </div>
                            {unit.line2 && (
                              <div
                                className="mt-0.5 text-xs text-slate-500"
                                data-testid="text-bill-to-address-line2-desktop"
                              >
                                {unit.line2}
                              </div>
                            )}
                            <div
                              className="mt-1.5 text-xs text-slate-500"
                              data-testid="text-bill-to-attn-desktop"
                            >
                              Attn:{" "}
                              <span className="font-medium text-slate-700">
                                {session.role === "agent"
                                  ? agencyDisplayName(session) || "—"
                                  : [session.contact_first_name, session.contact_last_name]
                                      .filter(Boolean)
                                      .join(" ") || "—"}
                              </span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm text-slate-400">—</div>
                      )}
                    </div>

                    {/* Send to another party toggle */}
                    <div
                      className="overflow-hidden rounded-xl border border-slate-200 bg-white"
                      data-testid="block-send-to-another-desktop"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (!sendToAnother) {
                            setAnotherEmail(session.contact_email.trim());
                          }
                          setSendToAnother((v) => !v);
                        }}
                        className="flex w-full items-center justify-between px-4 py-3"
                        data-testid="toggle-send-to-another-desktop"
                      >
                        <span className="text-sm font-medium text-slate-900">
                          Send invoice to another party
                        </span>
                        <span
                          className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200"
                          style={{ backgroundColor: sendToAnother ? BRAND : "#CBD5E1" }}
                        >
                          <span
                            className="inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-200"
                            style={{ transform: sendToAnother ? "translateX(18px)" : "translateX(2px)" }}
                          />
                        </span>
                      </button>
                      {sendToAnother && (
                        <div className="border-t border-slate-100 px-4 pb-4 pt-3">
                          <label
                            htmlFor="send-to-another-email-desktop"
                            className="mb-1.5 block text-xs font-medium text-slate-500"
                          >
                            Recipient email
                          </label>
                          <input
                            id="send-to-another-email-desktop"
                            type="email"
                            inputMode="email"
                            value={anotherEmail}
                            onChange={(e) => setAnotherEmail(e.target.value)}
                            placeholder="e.g. billing@example.com"
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-slate-400 focus:bg-white"
                            data-testid="input-send-to-another-email-desktop"
                          />
                        </div>
                      )}
                    </div>

                  </div>
                  <div
                    className="mt-4 flex items-start gap-2 rounded-lg border border-pink-200 bg-pink-50/60 p-3"
                    data-testid="note-invoice-reference-desktop"
                  >
                    <Info className="h-4 w-4 mt-0.5 shrink-0" style={{ color: BRAND }} />
                    <p className="text-xs text-slate-700 leading-relaxed">
                      {INVOICE_REFERENCE_NOTE}
                    </p>
                  </div>
                </div>
              )}
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
              onClick={() => bookingActions.submitBooking()}
              className={`flex items-center gap-2 rounded-full px-8 py-3.5 text-base font-bold text-white shadow-md transition ${
                payEnabled ? "hover:opacity-90 hover:shadow-lg" : "opacity-50 cursor-not-allowed"
              }`}
              style={{ backgroundColor: BRAND }}
            >
              {ctaLabel}
              <ArrowRight className="h-5 w-5" />
            </button>
          </div>

          {/* Mockup-only affordance for the cancelled-checkout terminal state
              (spec §9). Real Stripe integration would fire `cancelPayment()`
              on the redirect callback; this button stands in for that path
              so designers and testers can reach the screen. */}
          <button
            type="button"
            onClick={() => bookingActions.cancelPayment()}
            data-testid="button-cancel-payment"
            className="mt-4 w-full text-center text-xs text-slate-400 underline-offset-2 hover:underline"
          >
            Simulate cancelled payment (mockup only)
          </button>

          {/* Mockup-only affordance for the unit-unavailable terminal state
              (spec §9 row "Unit unavailable"). In production, the booking
              service rejects the submission when its uniqueness check finds
              another customer already booked the same unit; this button
              stands in for that path so designers and testers can reach
              the screen. */}
          <button
            type="button"
            onClick={() => bookingActions.markUnitUnavailable()}
            data-testid="button-simulate-unit-unavailable"
            className="mt-2 w-full text-center text-xs text-slate-400 underline-offset-2 hover:underline"
          >
            Simulate unit unavailable (mockup only)
          </button>

        </div>
      </div>

      {showPrepayInfo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6"
          onClick={() => setShowPrepayInfo(false)}
          data-testid="modal-prepay-info-desktop"
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <h3 className="text-base font-semibold text-slate-900">
                Why do we require early payment?
              </h3>
              <button
                type="button"
                onClick={() => setShowPrepayInfo(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm leading-relaxed text-slate-600">
              Due to the nature of our set-date offers, we've pre-negotiated
              heavily discounted rates with our service provider subject to a
              minimum number of services being completed at each building on the
              day. To honour those rates, payment must be received at least 48
              hours before your scheduled service — we're unable to invoice after
              the work is completed.
            </p>
            <button
              type="button"
              onClick={() => setShowPrepayInfo(false)}
              className="mt-5 w-full rounded-full py-2.5 text-sm font-semibold text-white"
              style={{ backgroundColor: BRAND }}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatServiceDate(iso: string): string {
  const [y, m, d] = iso.split("-").map((s) => parseInt(s, 10));
  const local = new Date(y, (m ?? 1) - 1, d ?? 1);
  const weekday = local.toLocaleDateString("en-AU", { weekday: "long" });
  const dayNum = local.getDate();
  const month = local.toLocaleDateString("en-AU", { month: "long" });
  return `${weekday} ${dayNum} ${month}`;
}

function SummaryRow({
  label,
  value,
  testId,
}: {
  label: string;
  value: React.ReactNode;
  testId?: string;
}) {
  return (
    <div
      className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0"
      data-testid={testId}
    >
      <div className="text-[12px] font-medium text-slate-500 mt-0.5">{label}</div>
      <div className="flex-1 text-right text-sm font-medium text-slate-900">{value}</div>
    </div>
  );
}
