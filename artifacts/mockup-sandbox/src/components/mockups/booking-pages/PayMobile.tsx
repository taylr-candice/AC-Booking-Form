import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Pencil,
  CreditCard,
  Apple,
  FileText,
  CheckCircle2,
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
  CANCELLATION_CONTACT_EMAIL,
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

export function PayMobile() {
  const [method, setMethod] = useState<PayMethod | null>(null);
  const session = useBookingSelector((s) => s);

  const total = computeBookingTotal(session);
  const isCoordination = isCoordinationFlow(session);
  const isAgent = session.role === "agent";
  const ack = session.cancellation_acknowledged;
  const schedule = scheduleDisplay(session);
  const unit = unitLabel(session.unit_id);

  const payEnabled = isStep7PayEnabled(session);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50 font-['Inter']">
      {/* Page header */}
      <div className="flex items-start justify-between bg-white px-5 pb-4 pt-5">
        <div>
          <h1 className="text-[26px] font-semibold leading-tight text-slate-900">
            Check out
          </h1>
          <div className="mt-0.5 text-xs font-semibold tracking-wide uppercase text-slate-500">
            Review &amp; pay
          </div>
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
        {/* Coordination explainer (only when Step 6 was skipped) */}
        {isCoordination && (
          <div
            className="mb-4 mt-4 flex items-start gap-3 rounded-xl border p-3.5 text-[12.5px] leading-snug"
            style={{
              borderColor: "rgba(95,187,151,0.45)",
              backgroundColor: "rgba(95,187,151,0.08)",
              color: "#0F172A",
            }}
            data-testid="banner-coordination"
          >
            <Info className="h-4 w-4 shrink-0 mt-0.5" style={{ color: SELECTED_GREEN }} />
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

            <SummaryItem label="Schedule">
              {isCoordination ? (
                <span
                  data-testid="text-summary-schedule"
                  className="inline-flex items-center gap-1.5 font-medium"
                  style={{ color: SELECTED_GREEN }}
                >
                  <Clock className="h-3.5 w-3.5" />
                  To be coordinated
                </span>
              ) : (
                <>
                  <span data-testid="text-summary-schedule" className="font-medium text-slate-900">
                    {schedule.primary}
                  </span>
                  {schedule.secondary && (
                    <span className="block text-xs text-slate-500">
                      {schedule.secondary}
                    </span>
                  )}
                </>
              )}
            </SummaryItem>
          </div>
          <div className="bg-slate-900 px-4 py-3 text-white flex justify-between items-center">
            <span className="font-medium">Total (incl. GST)</span>
            <span data-testid="text-total" className="text-lg font-bold">${total}</span>
          </div>
        </div>

        {/* Billing Details Header */}
        <div className="mb-3 mt-6 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold" style={{ color: BRAND }}>
            Billing details
          </h2>
          <button type="button" aria-label="Edit" className="rounded p-1 text-slate-500 hover:text-slate-900">
            <Pencil className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-8 rounded-xl border border-slate-200 bg-white p-4 text-[13px] leading-relaxed text-slate-600 shadow-sm">
          <div className="font-medium text-slate-900">
            {[session.contact_first_name, session.contact_last_name].filter(Boolean).join(" ") || "—"}
          </div>
          <div>{session.contact_email || "—"}</div>
          <div>{session.contact_phone || "—"}</div>
          <div className="mt-2 text-slate-500">
            Service address: {unit.line1}
            {unit.line2 ? `, ${unit.line2}` : ""}
          </div>
        </div>

        {/* Payment Method */}
        <div className="mb-3 mt-6 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold" style={{ color: BRAND }}>
            Payment details
          </h2>
        </div>

        <div className="space-y-3 mb-6">
          <MethodCard
            selected={method === "card"}
            onClick={() => setMethod("card")}
            icon={<CreditCard className="h-5 w-5" />}
            label="Credit card"
            id="card"
          />
          <MethodCard
            selected={method === "apple"}
            onClick={() => setMethod("apple")}
            icon={<Apple className="h-5 w-5" />}
            label="Apple Pay"
            id="apple"
          />
        </div>

        {method === "card" && (
          <div className="space-y-4 mb-8">
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Card number</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="0000 0000 0000 0000"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-[15px] outline-none focus:border-slate-400"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-1">
                  <div className="h-5 w-8 rounded bg-slate-100 flex items-center justify-center text-[8px] font-bold text-blue-800">VISA</div>
                  <div className="h-5 w-8 rounded bg-slate-100 flex items-center justify-center text-[8px] font-bold text-orange-600">MC</div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Expiration</label>
                <input
                  type="text"
                  placeholder="MM/YY"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-[15px] outline-none focus:border-slate-400"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">CVV</label>
                <input
                  type="text"
                  placeholder="123"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-[15px] outline-none focus:border-slate-400"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Country</label>
                <input
                  type="text"
                  value="Australia"
                  readOnly
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-[15px] text-slate-500 outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Postcode</label>
                <input
                  type="text"
                  placeholder="2900"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-[15px] outline-none focus:border-slate-400"
                />
              </div>
            </div>
          </div>
        )}

        {method === "apple" && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-center mb-8">
            <Apple className="mx-auto mb-3 h-8 w-8 text-slate-900" />
            <p className="text-[13px] text-slate-600">
              You'll be prompted to authenticate with Apple Pay when you tap Pay.
            </p>
          </div>
        )}

        {/* Cancellation policy block */}
        <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-slate-500">
            Cancellation &amp; rescheduling terms
          </h3>
          <div className="space-y-2 text-[12.5px] leading-relaxed text-slate-600">
            {CANCELLATION_POLICY_PARAGRAPHS.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
            <p data-testid="cancellation-contact-mobile">
              To request a change or cancellation, email us at{" "}
              <a
                href={`mailto:${CANCELLATION_CONTACT_EMAIL}`}
                className="font-medium underline underline-offset-2"
                style={{ color: "#A30058" }}
              >
                {CANCELLATION_CONTACT_EMAIL}
              </a>
              .
            </p>
          </div>
        </div>

        {/* Acknowledgement tickbox */}
        <label
          className="mb-4 flex cursor-pointer items-start gap-3 rounded-xl border bg-white p-4 shadow-sm transition"
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
          <span className="text-[13px] leading-snug text-slate-700">
            {CANCELLATION_ACK_LABEL}
          </span>
        </label>

        <div className="flex justify-center mb-2">
          <div className="text-[10px] text-slate-400 font-medium">Ref: TLR-742019</div>
        </div>
      </div>

      {/* Docked CTA */}
      <div className="border-t border-slate-100 bg-white px-5 py-3 space-y-2">
        <button
          type="button"
          data-testid="button-pay"
          disabled={!payEnabled}
          className={`flex w-full items-center justify-center gap-2 rounded-full px-6 py-3.5 text-[15px] font-bold text-white shadow-sm transition ${
            payEnabled ? "hover:opacity-90" : "opacity-50 cursor-not-allowed"
          }`}
          style={{ backgroundColor: BRAND }}
        >
          Pay ${total}
          <ArrowRight className="h-4 w-4" />
        </button>

        {isAgent && (
          <button
            type="button"
            data-testid="button-pay-later"
            disabled
            className="flex w-full items-center justify-center gap-2 rounded-full border-2 border-slate-200 bg-slate-50 px-6 py-3 text-[13px] font-semibold text-slate-400 cursor-not-allowed"
          >
            <FileText className="h-4 w-4" />
            Pay later (invoice) — coming soon
          </button>
        )}
      </div>
    </div>
  );
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
  id,
}: {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  id: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`card-method-${id}`}
      className={`relative flex min-h-[60px] w-full items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition ${
        selected
          ? ""
          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 shadow-sm"
      }`}
      style={
        selected
          ? {
              borderColor: "rgba(95,187,151,0.45)",
              backgroundColor: "rgba(95,187,151,0.08)",
            }
          : undefined
      }
    >
      <span
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
          selected ? "text-white" : "bg-slate-100 text-slate-700"
        }`}
        style={selected ? { backgroundColor: SELECTED_GREEN } : undefined}
      >
        {icon}
      </span>
      <span className="font-semibold flex-1 text-slate-900">{label}</span>
      {selected && (
        <CheckCircle2 className="h-5 w-5" style={{ color: SELECTED_GREEN }} />
      )}
    </button>
  );
}

