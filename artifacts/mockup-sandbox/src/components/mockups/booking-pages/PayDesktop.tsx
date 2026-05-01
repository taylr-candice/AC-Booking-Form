import React, { useEffect, useState } from "react";
import { ArrowRight, Lock, CreditCard as CreditCardIcon, Info, CheckCircle2, FileText } from "lucide-react";
import { bookingActions, useBookingSelector } from "../../../state/bookingSession";
import {
  isCoordinationFlow,
  resolveOtherServiceQuantities,
} from "../../../state/bookingDerived";
import { PayOtherServiceRow } from "./payOtherServiceRow";
import {
  acSummary,
  BILL_TO_HELPER,
  BILL_TO_LABEL,
  computeBookingTotal,
  COORDINATION_NOTE,
  COPY_INVOICE_TO_HELPER,
  COPY_INVOICE_TO_LABEL,
  defaultBillToLine,
  INVOICE_DESTINATION_LABEL,
  invoiceDestinationEmail,
  invoiceDestinationNote,
  INVOICE_LABEL,
  INVOICE_PREPAYMENT_BODY,
  INVOICE_PREPAYMENT_TITLE,
  INVOICE_REFERENCE_NOTE,
  INVOICE_SUBLABEL,
  isPayStepEnabled,
  labelForAccessMethod,
  labelForRole,
  PAY_NOW_LABEL,
  PAY_NOW_SUBLABEL,
  scheduleDisplay,
  STRIPE_REDIRECT_NOTE,
  unitLabel,
} from "../../../state/bookingHelpers";

const BRAND = "#ED017F";

type PayMethod = "pay_now" | "invoice";

export function PayDesktop() {
  const [method, setMethod] = useState<PayMethod | null>(null);
  const session = useBookingSelector((s) => s);
  const isAgent = session.role === "agent";

  // If role changes away from agent while invoice is selected, clear the selection.
  useEffect(() => {
    if (!isAgent && method === "invoice") setMethod(null);
  }, [isAgent, method]);

  const total = computeBookingTotal(session);
  const isCoordination = isCoordinationFlow(session);
  const schedule = scheduleDisplay(session);
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
            <h1 className="text-2xl font-semibold text-slate-900">Review & pay</h1>
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
                <SummaryRow label="Slot" value={
                  isCoordination ? "To be coordinated" : (
                    <span className="flex items-center justify-end gap-1.5">
                      <CheckCircle2 className="h-4 w-4" style={{ color: BRAND }} />
                      {schedule.primary} <span className="text-slate-500 text-xs ml-1 capitalize">{schedule.secondary}</span>
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
                <h2 className="text-lg font-semibold" style={{ color: BRAND }}>Payment details</h2>
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
                            borderColor: "#ED017F",
                            backgroundColor: "#FCE7F3",
                          }
                        : { borderColor: "#E2E8F0", backgroundColor: "#FFFFFF" }
                    }
                  >
                    <CreditCardIcon className="h-6 w-6 text-slate-700" />
                    <span className="text-sm font-semibold text-slate-900">{PAY_NOW_LABEL}</span>
                    <span className="text-[11px] font-medium text-slate-500">{PAY_NOW_SUBLABEL}</span>
                    {method === "pay_now" && (
                      <CheckCircle2 className="absolute right-2 top-2 h-4 w-4" style={{ color: BRAND }} />
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
                            borderColor: "#ED017F",
                            backgroundColor: "#FCE7F3",
                          }
                        : { borderColor: "#E2E8F0", backgroundColor: "#FFFFFF" }
                    }
                  >
                    <FileText className="h-6 w-6 text-slate-700" />
                    <span className="text-sm font-semibold text-slate-900">{INVOICE_LABEL}</span>
                    <span className="text-[11px] font-medium text-slate-500">{INVOICE_SUBLABEL}</span>
                    {method === "invoice" && (
                      <CheckCircle2 className="absolute right-2 top-2 h-4 w-4" style={{ color: BRAND }} />
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
                  <div className="flex items-start gap-3 mb-4">
                    <div className="grid h-10 w-10 place-items-center rounded-xl bg-white border border-slate-200 text-slate-700">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div>
                      <div
                        className="text-sm font-semibold mb-1"
                        style={{ color: "#9D174D" }}
                        data-testid="text-invoice-prepayment-title-desktop"
                      >
                        {INVOICE_PREPAYMENT_TITLE}
                      </div>
                      <p
                        className="text-sm text-slate-600 leading-relaxed"
                        data-testid="text-invoice-prepayment-body-desktop"
                      >
                        {INVOICE_PREPAYMENT_BODY}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {/* Invoice destination (read-only) */}
                    <div
                      className="rounded-xl border border-slate-200 bg-white p-4"
                      data-testid="block-invoice-destination-desktop"
                    >
                      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                        {INVOICE_DESTINATION_LABEL}
                      </div>
                      <div
                        className="mt-1 text-sm font-semibold text-slate-900"
                        data-testid="text-invoice-destination-desktop"
                      >
                        {invoiceDestinationEmail(session) ?? "—"}
                      </div>
                      {invoiceDestinationNote(session) && (
                        <p
                          className="mt-1 text-xs leading-relaxed text-slate-500"
                          data-testid="text-invoice-destination-note-desktop"
                        >
                          {invoiceDestinationNote(session)}
                        </p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <label
                        htmlFor="copy-invoice-desktop"
                        className="text-sm font-medium text-slate-700"
                      >
                        {COPY_INVOICE_TO_LABEL}
                      </label>
                      <input
                        id="copy-invoice-desktop"
                        type="email"
                        placeholder="finance@example.com"
                        className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:border-pink-500 focus:ring-1 focus:ring-pink-500 outline-none transition"
                        data-testid="input-copy-invoice-desktop"
                      />
                      <p className="text-xs text-slate-500">
                        {COPY_INVOICE_TO_HELPER}
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <label
                        htmlFor="bill-to-desktop"
                        className="text-sm font-medium text-slate-700"
                      >
                        {BILL_TO_LABEL}
                      </label>
                      <input
                        id="bill-to-desktop"
                        type="text"
                        placeholder="e.g. Owner's name"
                        className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:border-pink-500 focus:ring-1 focus:ring-pink-500 outline-none transition"
                        data-testid="input-bill-to-desktop"
                      />
                      <p
                        className="text-xs leading-relaxed text-slate-500"
                        data-testid="text-bill-to-default-desktop"
                      >
                        {BILL_TO_HELPER}
                        <span className="mt-0.5 block text-slate-400">
                          Default: {defaultBillToLine(session)}
                        </span>
                      </p>
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
    </div>
  );
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
