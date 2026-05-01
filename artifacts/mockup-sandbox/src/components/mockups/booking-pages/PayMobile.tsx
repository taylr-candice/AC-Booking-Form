import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  MapPin,
  CreditCard,
  FileText,
  CheckCircle2,
  Info,
  Lock,
  Clock,
  X,
} from "lucide-react";
import {
  AfternoonIcon,
  EveningIcon,
  MorningIcon,
} from "../booking-slots/TimeOfDayIcon";
import {
  bookingActions,
  useBookingSelector,
} from "../../../state/bookingSession";
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
  INVOICE_DESTINATION_LABEL,
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

export function PayMobile() {
  const [method, setMethod] = useState<PayMethod | null>(null);
  const [showPrepayInfo, setShowPrepayInfo] = useState(false);
  const [sendToAnother, setSendToAnother] = useState(false);
  const [anotherEmail, setAnotherEmail] = useState("");
  const session = useBookingSelector((s) => s);

  const total = computeBookingTotal(session);
  const isCoordination = isCoordinationFlow(session);
  const isAgent = session.role === "agent";
  const unit = unitLabel(session.unit_id);
  const otherServices = resolveOtherServiceQuantities(
    session.other_service_quantities ?? {},
  );

  // If role changes away from agent while invoice is selected, clear the selection.
  useEffect(() => {
    if (!isAgent && method === "invoice") setMethod(null);
  }, [isAgent, method]);

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
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50 font-['Inter']">
      {/* Page header */}
      <div className="flex items-start justify-between bg-white px-5 pb-4 pt-5">
        <div>
          <h1 className="text-[26px] font-bold leading-tight text-slate-900">
            Check out
          </h1>
          <div className="mt-0.5 text-xs font-semibold tracking-wide uppercase text-slate-500">
            Review &amp; pay
          </div>
          <p className="mt-1.5 text-[12.5px] text-slate-500 leading-snug">
            Check everything looks right before payment
          </p>
        </div>
        <button
          type="button"
          aria-label="Back"
          className="grid h-9 w-9 place-items-center rounded-full border-2 bg-white transition hover:bg-pink-50"
          style={{ borderColor: BRAND, color: BRAND }}
          data-testid="button-back-mobile"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 pb-6">
        {/* Coordination explainer (only when Step 4 — Slots — was skipped) */}
        {isCoordination && (
          <div
            className="mb-4 mt-4 flex items-start gap-3 rounded-xl border p-3.5 text-[12.5px] leading-snug"
            style={{
              borderColor: "#ED017F",
              backgroundColor: "#FCE7F3",
              color: "#0F172A",
            }}
            data-testid="banner-coordination"
          >
            <Info className="h-4 w-4 shrink-0 mt-0.5" style={{ color: BRAND }} />
            <span>{COORDINATION_NOTE}</span>
          </div>
        )}

        {/* Booking Summary — driven by session */}
        <div className={`mb-6 ${isCoordination ? "" : "mt-4"} overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm`}>
          <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Booking Summary
            </h3>
          </div>
          <div className="p-4 space-y-4 text-sm text-slate-700">
            <SummaryItem label="Unit">
              <span data-testid="text-summary-unit" className="font-medium text-slate-900">
                {unit.line1}
              </span>
              {unit.line2 && (
                <span className="block text-xs text-slate-500">{unit.line2}</span>
              )}
            </SummaryItem>

            <div className="grid grid-cols-2 gap-4">
              <SummaryItem label="Role">
                <span data-testid="text-summary-role">{labelForRole(session.role)}</span>
              </SummaryItem>
              <SummaryItem label="AC Count">
                <span data-testid="text-summary-ac">{acSummary(session)}</span>
              </SummaryItem>
            </div>

            <SummaryItem label="Access">
              <span data-testid="text-summary-access">
                {labelForAccessMethod(session.access_method)}
              </span>
            </SummaryItem>

            <SummaryItem label="Service window">
              {isCoordination ? (
                <span
                  data-testid="text-summary-schedule"
                  className="inline-flex items-center gap-1.5 font-medium"
                  style={{ color: BRAND }}
                >
                  <Clock className="h-3.5 w-3.5" />
                  To be coordinated
                </span>
              ) : session.service_date && session.service_slot && session.service_slot !== "to_be_coordinated" ? (
                <span
                  data-testid="text-summary-schedule"
                  className="inline-flex items-center gap-1.5 font-medium text-slate-900"
                >
                  {session.service_slot === "morning" && <MorningIcon className="h-3.5 w-3.5 shrink-0" style={{ color: BRAND }} />}
                  {session.service_slot === "afternoon" && <AfternoonIcon className="h-3.5 w-3.5 shrink-0" style={{ color: BRAND }} />}
                  {session.service_slot === "evening" && <EveningIcon className="h-3.5 w-3.5 shrink-0" style={{ color: BRAND }} />}
                  {formatServiceDate(session.service_date)}
                  <span className="text-slate-500">·</span>
                  <span className="capitalize">{session.service_slot}</span>
                </span>
              ) : (
                <span
                  data-testid="text-summary-schedule"
                  className="inline-flex items-center gap-1.5 text-slate-400"
                >
                  <Clock className="h-3.5 w-3.5" />
                  Pending schedule
                </span>
              )}
            </SummaryItem>
            {otherServices.length > 0 && (
              <div className="space-y-3 border-t border-slate-100 pt-3">
                {otherServices.map(({ rule, qty }) => (
                  <PayOtherServiceRow
                    key={rule.id}
                    rule={rule}
                    qty={qty}
                    variant="mobile"
                  />
                ))}
              </div>
            )}
          </div>
          <div className="border-t border-pink-200 bg-pink-50/40 px-4 py-3 flex items-center justify-between">
            <div>
              <div className="text-[13px] font-semibold text-slate-900">Total amount</div>
              <div className="text-[11px] text-slate-500">Includes GST</div>
            </div>
            <div data-testid="text-total" className="text-2xl font-bold text-slate-900">${total}</div>
          </div>
        </div>

        {/* Payment Method */}
        <div className="mb-3 mt-6 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-slate-900">
            Payment details
          </h2>
        </div>

        {/* Agents pick between Pay now and Invoice. Owners have
            only one option, so we skip the choice cards entirely
            and render the Stripe explainer below. */}
        {isAgent && (
          <div className="space-y-3 mb-6">
            <MethodCard
              selected={method === "pay_now"}
              onClick={() => setMethod("pay_now")}
              icon={<CreditCard className="h-5 w-5" />}
              label={PAY_NOW_LABEL}
              sublabel={PAY_NOW_SUBLABEL}
              id="pay-now"
            />
            <MethodCard
              selected={method === "invoice"}
              onClick={() => setMethod("invoice")}
              icon={<FileText className="h-5 w-5" />}
              label={INVOICE_LABEL}
              sublabel={INVOICE_SUBLABEL}
              id="invoice"
            />
          </div>
        )}

        {effectiveMethod === "pay_now" && (
          <div
            className="mb-8 flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
            data-testid="block-pay-now-mobile"
          >
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white border border-slate-200 text-slate-700">
              <Lock className="h-4 w-4" />
            </div>
            <p className="text-[13px] leading-relaxed text-slate-600">
              {STRIPE_REDIRECT_NOTE}
            </p>
          </div>
        )}

        {method === "invoice" && isAgent && (
          <div
            className="mb-8 rounded-xl border border-slate-200 bg-slate-50 p-4"
            data-testid="block-invoice-mobile"
          >
            <div
              className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5"
              data-testid="block-prepay-notice-mobile"
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
                className="rounded-xl border border-slate-200 bg-white p-3"
                data-testid="block-invoice-destination-mobile"
              >
                <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500 mb-2">
                  Bill to
                </div>
                {session.unit_id ? (
                  <div className="flex items-start gap-2.5">
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100">
                      <MapPin className="h-4 w-4 text-slate-600" />
                    </div>
                    <div>
                      <div
                        className="text-[13px] font-semibold text-slate-900 leading-tight"
                        data-testid="text-bill-to-address-line1-mobile"
                      >
                        {unit.line1}
                      </div>
                      {unit.line2 && (
                        <div
                          className="mt-0.5 text-[12px] text-slate-500"
                          data-testid="text-bill-to-address-line2-mobile"
                        >
                          {unit.line2}
                        </div>
                      )}
                      <div
                        className="mt-1.5 text-[11.5px] text-slate-500"
                        data-testid="text-bill-to-attn-mobile"
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
                  <div className="text-[13px] text-slate-400">—</div>
                )}
              </div>

              {/* Send to another party toggle */}
              <div
                className="overflow-hidden rounded-xl border border-slate-200 bg-white"
                data-testid="block-send-to-another-mobile"
              >
                <button
                  type="button"
                  onClick={() => {
                    if (!sendToAnother) {
                      setAnotherEmail(session.contact_email.trim());
                    }
                    setSendToAnother((v) => !v);
                  }}
                  className="flex w-full items-center justify-between px-3 py-3"
                  data-testid="toggle-send-to-another-mobile"
                >
                  <span className="text-[13px] font-medium text-slate-900">
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
                  <div className="border-t border-slate-100 px-3 pb-3 pt-2">
                    <label
                      htmlFor="send-to-another-email-mobile"
                      className="mb-1 block text-[11px] font-medium text-slate-500"
                    >
                      Recipient email
                    </label>
                    <input
                      id="send-to-another-email-mobile"
                      type="email"
                      inputMode="email"
                      value={anotherEmail}
                      onChange={(e) => setAnotherEmail(e.target.value)}
                      placeholder="e.g. billing@example.com"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] outline-none focus:border-slate-400 focus:bg-white"
                      data-testid="input-send-to-another-email-mobile"
                    />
                  </div>
                )}
              </div>
            </div>
            <div
              className="mt-3 flex items-start gap-2 rounded-lg border border-pink-200 bg-pink-50/60 p-3"
              data-testid="note-invoice-reference-mobile"
            >
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: BRAND }} />
              <p className="text-[11.5px] leading-relaxed text-slate-700">
                {INVOICE_REFERENCE_NOTE}
              </p>
            </div>
          </div>
        )}

        <div className="flex justify-center mb-2">
          <div className="text-[10px] text-slate-400 font-medium">Ref: TLR-742019</div>
        </div>
      </div>

      {/* Docked CTA */}
      <div className="border-t border-slate-100 bg-white px-5 py-3">
        <button
          type="button"
          data-testid="button-pay"
          disabled={!payEnabled}
          onClick={() => bookingActions.submitBooking()}
          className={`flex w-full items-center justify-center gap-2 rounded-full px-6 py-3.5 text-[15px] font-bold text-white shadow-sm transition ${
            payEnabled ? "hover:opacity-90" : "opacity-50 cursor-not-allowed"
          }`}
          style={{ backgroundColor: BRAND }}
        >
          {ctaLabel}
          <ArrowRight className="h-4 w-4" />
        </button>
        {/* Mockup-only affordance for the cancelled-checkout terminal state
            (spec §9). Real Stripe integration would fire `cancelPayment()`
            on the redirect callback; this button stands in for that path
            so designers and testers can reach the screen. */}
        <button
          type="button"
          onClick={() => bookingActions.cancelPayment()}
          data-testid="button-cancel-payment"
          className="mt-2 w-full text-center text-[11px] text-slate-400 underline-offset-2 hover:underline"
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
          className="mt-1 w-full text-center text-[11px] text-slate-400 underline-offset-2 hover:underline"
        >
          Simulate unit unavailable (mockup only)
        </button>
      </div>

      {showPrepayInfo && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 pb-8"
          onClick={() => setShowPrepayInfo(false)}
          data-testid="modal-prepay-info-mobile"
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-2">
              <h3 className="text-[15px] font-semibold text-slate-900">
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
            <p className="text-[13px] leading-relaxed text-slate-600">
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
              className="mt-4 w-full rounded-full py-2.5 text-[14px] font-semibold text-white"
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

function SummaryItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="block text-[11px] font-medium uppercase tracking-wide text-slate-400 mb-0.5">
        {label}
      </span>
      <span className="block">{children}</span>
    </div>
  );
}

function MethodCard({
  selected,
  onClick,
  icon,
  label,
  sublabel,
  id,
}: {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  sublabel?: string;
  id: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`card-method-${id}`}
      aria-pressed={selected}
      className={`relative flex min-h-[60px] w-full items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition ${
        selected
          ? ""
          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 shadow-sm"
      }`}
      style={
        selected
          ? {
              borderColor: SELECTED_ACCENT,
              backgroundColor: SELECTED_BG,
            }
          : undefined
      }
    >
      <span
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
          selected ? "text-white" : "bg-slate-100 text-slate-700"
        }`}
        style={selected ? { backgroundColor: SELECTED_ACCENT } : undefined}
      >
        {icon}
      </span>
      <span className="flex-1">
        <span
          className={`block font-semibold ${
            selected ? "text-white" : "text-slate-900"
          }`}
        >
          {label}
        </span>
        {sublabel && (
          <span
            className={`block text-[11.5px] font-medium ${
              selected ? "text-white/85" : "text-slate-500"
            }`}
          >
            {sublabel}
          </span>
        )}
      </span>
      {selected && (
        <CheckCircle2 className="h-5 w-5 shrink-0" style={{ color: "#ffffff" }} />
      )}
    </button>
  );
}

