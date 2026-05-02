/**
 * TenantSchedulingMobile
 *
 * Canvas view — what a tenant sees when they follow a "schedule your
 * service" link sent by their property manager.
 *
 * Four-screen journey:
 *   1. Intro    — confirms unit, service, and what to expect
 *   2. Access   — full owner-equivalent access page (TENANT_OPTIONS):
 *                   · I'll be there
 *                   · I'll leave a key  (with sub-options + signature)
 *                   · Trade key via managing agent  (signature)
 *   3. Schedule — slot picker with the same pink SlotsAccessBanner as
 *                 the owner booking flow; copy driven by bookingSession
 *                 access method + leave-key sub-method
 *   4. Thank you — confirmation with access-specific reminder copy
 *
 * Access state is stored in the shared `bookingSession` store (same
 * singleton used by the owner booking flow — each canvas iframe gets its
 * own sessionStorage, so there is no cross-contamination).
 *
 * Seeded from the bk-1038 scenario:
 *   Booker: Marcus Holloway (City Edge Property Group)
 *   Unit:   6 / 21 Bourke Street, Surry Hills NSW 2010
 *   Tenant: Liam Carter
 *   Service: AC service · 1 × split system (45 min)
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ConciergeBell,
  FileText,
  Hand,
  HardHat,
  Info,
  KeyRound,
  LockOpen,
  UserCheck,
  Users,
  Wind,
  X,
} from "lucide-react";

import {
  bookingActions,
  useBookingSelector,
  useBookingSession,
  type AccessMethod,
  type LeaveKeySubMethod,
} from "../../../state/bookingSession";
import {
  TENANT_OPTIONS,
  isTenantAccessValid,
  isLeaveKeyMethod,
  isAgentTradeMethod,
  isParcelLockerMethod,
  isUnattendedLeaveKeySub,
  infoNoteFor,
  infoNoteForLeaveKeySub,
  signatureVariantFor,
  getLeaveKeySubOptions,
  useBuildingFeatures,
  type LeaveKeySubOption,
} from "../../../state/accessMethodCatalog";
import { LockerIcon } from "../booking-pages/LockerIcon";
import { PinkAckCheckbox } from "../booking-pages/PinkAckCheckbox";
import { CancellationTermsModal } from "../booking-pages/CancellationTermsModal";
import {
  getRolloutsVersion,
  subscribeRollouts,
} from "../../../state/adminMockData";
import {
  findNextAvailable,
  getVisibleServiceDays,
  getVisibleWindowsForDay,
  hasUpcomingUnreleasedDays,
  resolveCustomerSlotData,
  windowDisplayLabel,
  type CustomerDay,
  type CustomerSlot,
} from "./customerSlotData";
import { AfternoonIcon, EveningIcon, MorningIcon } from "./TimeOfDayIcon";
import { CustomerAvailableDays } from "./CustomerAvailableDays";
import { NextAvailableCard } from "./NextAvailableCard";
import { SlotsAccessBanner } from "./SlotsAccessBanner";
import { WhyWindowsModal } from "./WhyWindowsModal";

// ─── Constants ───────────────────────────────────────────────────────────────

const BRAND = "#ED017F";
const SELECTED_GREEN_BG = "#7BC9A8";
const SELECTED_GREEN_TEXT = "#ffffff";
const SELECTED_GREEN_BORDER = "#7BC9A8";
const ERROR_PURPLE = "#9747FF";

const REBOOK_UNIT_ID = "u6";
const JOB_MINUTES = 45;

const BOOKING_CONTEXT = {
  ref: "TLR-1038",
  unitAddress: "6 / 21 Bourke Street",
  suburb: "Surry Hills NSW 2010",
  state: "NSW",
  service: "AC service",
  detail: "1 × split system",
  bookerName: "Marcus Holloway",
  bookerCompany: "City Edge Property Group",
  /**
   * In production, both name fields arrive via a one-time signed URL
   * (magic link) that encodes the booking ID and tenant identity —
   * no login required. The name is captured by the agent when they
   * create the booking. The mockup hardcodes "Liam Carter" as a
   * stand-in for the real data that would be decoded from the token.
   */
  tenantName: "Liam",
  tenantFullName: "Liam Carter",
  /** Simulated notice date — in production this is the date the agent issued the notice. */
  noticeDateStr: "2 May 2026",
};

/**
 * Tenant-specific authorisation text for the "trade key via managing agent"
 * option. The catalog's SIG_ACCESS_AUTH is written from an agent's perspective
 * ("our agency trade key", "return the key to my office") — tenants need
 * different copy since it is their property manager's key, not theirs.
 */
const SIG_TENANT_TRADE_KEY =
  "By ticking this box I confirm I am authorising Taylr to request temporary use of my property manager's trade key for the purpose of this pre-arranged AC service. I understand that Taylr will collect the key from the managing agent's office, complete the service unattended, and return the key to the office afterwards. A chain-of-custody record will be provided on completion.";

// ─── Types ───────────────────────────────────────────────────────────────────

type Step = "intro" | "access" | "schedule" | "thankyou";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function windowIcon(w: CustomerSlot["window"]) {
  if (w === "morning") return <MorningIcon className="h-4 w-4" />;
  if (w === "afternoon") return <AfternoonIcon className="h-4 w-4" />;
  return <EveningIcon className="h-4 w-4" />;
}

function longWeekday(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map((s) => parseInt(s, 10));
  const local = new Date(y, (m ?? 1) - 1, d ?? 1);
  return local.toLocaleDateString("en-AU", { weekday: "long" });
}

/** Reminder copy shown on the Thank You screen. */
function accessReminder(
  method: AccessMethod | null,
  leaveKeySub: LeaveKeySubMethod | null,
): React.ReactNode {
  if (method === "owner_live_at_unit") {
    return (
      <p className="mt-2 text-[12px] font-medium text-amber-700">
        Remember — you'll need to be present during this window.
      </p>
    );
  }
  if (isLeaveKeyMethod(method)) {
    if (leaveKeySub === "with_someone") {
      return (
        <p className="mt-2 text-[12px] font-medium text-amber-700">
          Make sure your key holder is available for the full service window.
        </p>
      );
    }
    return (
      <p className="mt-2 text-[12px] font-medium text-emerald-700">
        Make sure the key is in place before the service window.
      </p>
    );
  }
  if (isAgentTradeMethod(method)) {
    return (
      <p className="mt-2 text-[12px] font-medium text-emerald-700">
        Taylr will arrange key collection with your managing agent.
      </p>
    );
  }
  return null;
}

/** Dynamic terms checkbox label for the schedule screen. */
function termsLabelFor(
  method: AccessMethod | null,
  leaveKeySub: LeaveKeySubMethod | null,
): string {
  if (isAgentTradeMethod(method)) {
    return "I confirm my property manager's trade key arrangement will be in place and authorise Taylr to coordinate access on the service day.";
  }
  if (isLeaveKeyMethod(method)) {
    if (leaveKeySub === "with_someone") {
      return "I confirm my nominated key holder will be available for the full selected service window.";
    }
    return "I confirm the key access arrangement will be in place before the selected service window.";
  }
  return "I understand this is a window, not a set time, and I can ensure access is available for the full selected service window.";
}

// ─── Root component ──────────────────────────────────────────────────────────

export function TenantSchedulingMobile() {
  const [step, setStep] = useState<Step>("intro");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [termsAck, setTermsAck] = useState(false);
  const [attemptedConfirm, setAttemptedConfirm] = useState(false);
  const [whyWindowsOpen, setWhyWindowsOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);

  const session = useBookingSession();

  // Live rollout sync — same pattern as OwnerReturnScheduleMobile.
  const rolloutsVersion = useSyncExternalStore(
    subscribeRollouts,
    getRolloutsVersion,
    getRolloutsVersion,
  );

  const { rollout, days } = useMemo(
    () => resolveCustomerSlotData(REBOOK_UNIT_ID, JOB_MINUTES),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rolloutsVersion],
  );
  const visibleDays = useMemo(() => getVisibleServiceDays(days), [days]);
  const nextAvailable = useMemo(() => findNextAvailable(visibleDays), [visibleDays]);
  const activeDay = useMemo(
    () => visibleDays.find((d) => d.date === selectedDate) ?? null,
    [visibleDays, selectedDate],
  );
  const confirmedDetails = useMemo(() => {
    if (!selectedDate || !selectedSlotId) return null;
    const day = visibleDays.find((d) => d.date === selectedDate);
    if (!day) return null;
    const windows = [day.morning, day.afternoon, ...(day.evening ? [day.evening] : [])];
    const slot = windows.find((s) => s.id === selectedSlotId);
    return slot ? { day, slot } : null;
  }, [visibleDays, selectedDate, selectedSlotId]);

  const pickSlotOneTap = (iso: string, slotId: string) => {
    setSelectedDate(iso);
    setSelectedSlotId(slotId);
  };

  const handleDone = () => {
    setStep("intro");
    setSelectedDate(null);
    setSelectedSlotId(null);
    setTermsAck(false);
    setAttemptedConfirm(false);
  };

  // ── Screen routing ──────────────────────────────────────────────────

  if (step === "thankyou" && confirmedDetails) {
    return (
      <ThankYouScreen
        day={confirmedDetails.day}
        slot={confirmedDetails.slot}
        bookingRef={BOOKING_CONTEXT.ref}
        accessMethod={session.access_method}
        leaveKeySub={session.leave_key_sub_method}
        onDone={handleDone}
      />
    );
  }

  if (step === "intro") {
    return <IntroScreen onContinue={() => setStep("access")} />;
  }

  if (step === "access") {
    return (
      <AccessScreen
        onBack={() => setStep("intro")}
        onContinue={() => {
          setSelectedDate(null);
          setSelectedSlotId(null);
          setTermsAck(false);
          setAttemptedConfirm(false);
          setStep("schedule");
        }}
      />
    );
  }

  // ── Schedule screen ─────────────────────────────────────────────────

  const accessMethod = session.access_method;
  const leaveKeySub = session.leave_key_sub_method;
  const hasDates = rollout !== null && visibleDays.length > 0;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-white font-['Inter']">
      {/* Header */}
      <div className="flex-none flex items-start justify-between border-b border-slate-100 px-5 pb-4 pt-5">
        <div>
          <h1 className="text-[22px] font-bold leading-tight text-slate-900">
            Choose a window
          </h1>
          <p className="mt-0.5 text-[12px] text-slate-500">
            {BOOKING_CONTEXT.unitAddress} · {BOOKING_CONTEXT.suburb}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setStep("access")}
          aria-label="Back"
          className="grid h-9 w-9 place-items-center rounded-full border-2 transition hover:bg-pink-50"
          style={{ borderColor: BRAND, color: BRAND }}
          data-testid="button-back-schedule-tenant"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="no-scrollbar flex-1 overflow-y-auto px-5 pb-6">
        {/* Access banner — same component as the owner booking flow. Copy
            is driven by the tenant's chosen access method + leave-key sub. */}
        {hasDates && (
          <div className="mt-4">
            <SlotsAccessBanner
              accessMethod={accessMethod}
              leaveKeySub={leaveKeySub}
              size="compact"
              testIdSuffix="mobile"
              onWhyWindows={() => setWhyWindowsOpen(true)}
            />
          </div>
        )}

        {/* Date / window picker */}
        {rollout === null || visibleDays.length === 0 ? (
          <div
            className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900"
            data-testid="empty-no-slots-tenant"
          >
            <div className="text-[14px] font-semibold">No windows available yet</div>
            <div className="mt-1 text-[12px] text-amber-800">
              Check back soon, or call{" "}
              <span className="font-medium" style={{ color: BRAND }}>
                1300 TAYLR
              </span>{" "}
              if you need to arrange access urgently.
            </div>
          </div>
        ) : (
          <>
            {nextAvailable && (
              <NextAvailableCard
                day={nextAvailable.day}
                slot={nextAvailable.slot}
                onPick={pickSlotOneTap}
                size="compact"
                ctaLabel="Pick this"
                testIdSuffix="tenant"
              />
            )}

            {/* ── Step 1: Select Day ───────────────────────────────── */}
            <div className={`flex items-center gap-2 mb-2 ${nextAvailable ? "mt-4" : ""}`}>
              <span
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                style={{ backgroundColor: BRAND }}
              >
                1
              </span>
              <span className="text-[15px] font-bold text-slate-900">Select Day</span>
            </div>

            <CustomerAvailableDays
              days={visibleDays}
              selectedDate={selectedDate}
              onSelect={(iso) => {
                setSelectedDate(iso);
                setSelectedSlotId(null);
              }}
              size="compact"
              testIdSuffix="tenant"
            />

            {attemptedConfirm && !selectedDate && (
              <div
                className="mt-2 flex items-center gap-2 rounded-xl border p-3 text-[12px] font-medium"
                style={{
                  color: ERROR_PURPLE,
                  borderColor: ERROR_PURPLE,
                  backgroundColor: "rgba(151,71,255,0.04)",
                }}
                data-testid="error-no-date-tenant"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>Please select a day to continue.</span>
              </div>
            )}

            {/* ── Step 2: Select Window — revealed once a day is chosen */}
            {activeDay && (
              <div className="mt-5">
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                    style={{ backgroundColor: BRAND }}
                  >
                    2
                  </span>
                  <span className="text-[15px] font-bold text-slate-900">Select Window</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {getVisibleWindowsForDay(activeDay).map((slot) => (
                    <TenantSlotCard
                      key={slot.id}
                      slot={slot}
                      icon={windowIcon(slot.window)}
                      label={windowDisplayLabel(slot.window)}
                      hint={slot.timeLabel}
                      selected={selectedSlotId === slot.id}
                      onClick={() => setSelectedSlotId(slot.id)}
                    />
                  ))}
                </div>
                {attemptedConfirm && !selectedSlotId && (
                  <div
                    className="mt-2 flex items-center gap-2 rounded-xl border p-3 text-[12px] font-medium"
                    style={{
                      color: ERROR_PURPLE,
                      borderColor: ERROR_PURPLE,
                      backgroundColor: "rgba(151,71,255,0.04)",
                    }}
                    data-testid="error-no-slot-tenant"
                  >
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>Please select a service window to continue.</span>
                  </div>
                )}
              </div>
            )}

            {/* Terms ack */}
            <div className="mt-5">
              <PinkAckCheckbox
                checked={termsAck}
                onChange={setTermsAck}
                invalid={attemptedConfirm && !termsAck}
                errorText="Please tick to confirm before continuing."
                testId="ack-tenant-terms"
                label={termsLabelFor(accessMethod, leaveKeySub)}
                helper={
                  <button
                    type="button"
                    onClick={() => setTermsOpen(true)}
                    className="font-medium underline underline-offset-2 hover:opacity-80"
                    style={{ color: BRAND }}
                    data-testid="button-view-terms-tenant"
                  >
                    View terms
                  </button>
                }
              />
            </div>
          </>
        )}
      </div>

      {/* Docked CTA */}
      <div className="flex-none border-t border-slate-100 bg-white px-5 py-4">
        <button
          type="button"
          disabled={!selectedSlotId}
          data-testid="button-confirm-tenant"
          className="flex w-full items-center justify-center gap-2 rounded-full px-5 py-3.5 text-[14px] font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-40"
          style={{ backgroundColor: BRAND }}
          onClick={() => {
            if (!selectedSlotId) return;
            if (!termsAck) {
              setAttemptedConfirm(true);
              return;
            }
            setStep("thankyou");
          }}
        >
          Confirm this window
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      {whyWindowsOpen && (
        <WhyWindowsModal onClose={() => setWhyWindowsOpen(false)} />
      )}
      {termsOpen && (
        <CancellationTermsModal
          mode="post_order"
          onClose={() => setTermsOpen(false)}
        />
      )}
    </div>
  );
}

// ─── Screen: Intro ────────────────────────────────────────────────────────────
//
// Framed as a formal notice, not a cooperative request. The tenant is
// required to provide access under the Residential Tenancies Act; the
// agent has already signed the authorisation. A "View notice letter"
// link surfaces the full signed letter in a bottom-sheet modal.

function IntroScreen({ onContinue }: { onContinue: () => void }) {
  const [letterOpen, setLetterOpen] = useState(false);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-white font-['Inter']">
      {/* Header */}
      <div className="flex-none border-b border-slate-100 px-5 pb-4 pt-5">
        <div className="flex items-start gap-3">
          <div
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: "rgba(237,1,127,0.08)" }}
          >
            <FileText className="h-4 w-4" style={{ color: BRAND }} />
          </div>
          <div>
            <h1 className="text-[18px] font-bold leading-tight text-slate-900">
              Access notice
            </h1>
            <p className="mt-0.5 text-[12px] text-slate-500">
              {BOOKING_CONTEXT.unitAddress} · {BOOKING_CONTEXT.suburb}
            </p>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="no-scrollbar flex-1 overflow-y-auto px-5 pb-6">
        {/* Formal salutation */}
        <p className="mt-5 text-[15px] font-semibold text-slate-900">
          Dear {BOOKING_CONTEXT.tenantFullName},
        </p>

        {/* Legal obligation notice + authorisation — one unified card */}
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5">
          <p className="text-[13px] leading-relaxed text-amber-900">
            Under the{" "}
            <span className="font-semibold">
              Residential Tenancies Act 2010 ({BOOKING_CONTEXT.state})
            </span>
            , you are required to provide reasonable access to your rental
            property for the purpose of carrying out necessary repairs and
            maintenance.
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-amber-900">
            Your managing agent has arranged an essential air conditioning
            service for your property. You are required to ensure access is
            available for the duration of the service window.
          </p>

          <div className="mt-3.5 border-t border-amber-200" />

          <div className="mt-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-700/70">
                Authorisation
              </div>
              <div className="mt-1.5 text-[13px] font-semibold text-amber-950">
                {BOOKING_CONTEXT.bookerName}
              </div>
              <div className="mt-0.5 text-[12px] text-amber-800/70">
                {BOOKING_CONTEXT.bookerCompany}
              </div>
              <div className="mt-1 text-[11px] text-amber-700/60">
                Issued {BOOKING_CONTEXT.noticeDateStr} · Ref {BOOKING_CONTEXT.ref}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setLetterOpen(true)}
              data-testid="button-view-notice-letter"
              className="shrink-0 rounded-lg border border-amber-300 bg-white/60 px-3 py-1.5 text-[12px] font-semibold transition hover:bg-white"
              style={{ color: BRAND }}
            >
              View letter
            </button>
          </div>
        </div>

        {/* Service details */}
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Service details
          </div>
          <div className="mt-2 text-[15px] font-bold text-slate-900">
            {BOOKING_CONTEXT.service}
          </div>
          <div className="mt-0.5 text-[13px] text-slate-500">
            {BOOKING_CONTEXT.detail}
          </div>
        </div>

        {/* Obligations list */}
        <div className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3.5">
          <div className="text-[13px] font-semibold text-slate-800">
            What you need to do
          </div>
          <ol className="mt-3 space-y-3">
            {[
              "Confirm how the technician will access the property",
              "Select a service window from the available dates",
              "Ensure access is available for the full duration of that window",
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-3">
                <span
                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                  style={{ backgroundColor: BRAND }}
                >
                  {i + 1}
                </span>
                <span className="text-[12px] leading-snug text-slate-600">
                  {item}
                </span>
              </li>
            ))}
          </ol>
        </div>

        <p className="mt-4 text-[11px] leading-relaxed text-slate-400">
          If you have concerns about the proposed service, please
          contact {BOOKING_CONTEXT.bookerCompany} directly before proceeding.
        </p>
      </div>

      {/* Docked CTA */}
      <div className="flex-none border-t border-slate-100 bg-white px-5 py-4">
        <button
          type="button"
          data-testid="button-intro-continue-tenant"
          className="flex w-full items-center justify-center gap-2 rounded-full px-5 py-3.5 text-[14px] font-semibold text-white shadow-sm transition hover:opacity-90"
          style={{ backgroundColor: BRAND }}
          onClick={onContinue}
        >
          Confirm access &amp; pick a window
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      {letterOpen && (
        <NoticeLetterModal onClose={() => setLetterOpen(false)} />
      )}
    </div>
  );
}

// ─── Modal: Notice letter ─────────────────────────────────────────────────────
//
// Full-screen bottom-sheet showing the signed notice letter that underpins
// the access requirement. In production this would be a PDF or HTML
// document generated from the booking record and signed by the agent.

function NoticeLetterModal({ onClose }: { onClose: () => void }) {
  const today = BOOKING_CONTEXT.noticeDateStr;
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/40"
      onClick={onClose}
    >
      <div
        className="mt-auto flex max-h-[92vh] flex-col rounded-t-2xl bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sheet handle + header */}
        <div className="flex-none px-5 pb-3 pt-4">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" />
          <div className="flex items-center justify-between">
            <h2 className="text-[16px] font-bold text-slate-900">
              Notice letter
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid h-8 w-8 place-items-center rounded-full text-slate-400 hover:bg-slate-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Letter body */}
        <div className="no-scrollbar flex-1 overflow-y-auto px-5 pb-8">
          {/* Letterhead */}
          <div className="mb-4 border-b border-slate-100 pb-4">
            <div className="text-[13px] font-bold text-slate-900">
              {BOOKING_CONTEXT.bookerCompany}
            </div>
            <div className="mt-0.5 text-[12px] text-slate-500">
              On behalf of the property owner
            </div>
          </div>

          <div className="space-y-1 text-[12px] text-slate-500">
            <p>Date: {today}</p>
            <p>Ref: {BOOKING_CONTEXT.ref}</p>
          </div>

          <p className="mt-4 text-[13px] font-semibold text-slate-900">
            {BOOKING_CONTEXT.tenantFullName}
          </p>
          <p className="text-[13px] text-slate-700">
            {BOOKING_CONTEXT.unitAddress}
            <br />
            {BOOKING_CONTEXT.suburb}
          </p>

          <div className="mt-5 space-y-3 text-[13px] leading-relaxed text-slate-700">
            <p className="font-semibold uppercase tracking-wide text-[11px] text-slate-400">
              Notice of required access for maintenance
            </p>

            <p>Dear {BOOKING_CONTEXT.tenantFullName},</p>

            <p>
              We write to provide formal notice that an essential air
              conditioning maintenance service has been arranged for the
              above property.
            </p>

            <p>
              Under the{" "}
              <span className="font-semibold text-slate-900">
                Residential Tenancies Act 2010 ({BOOKING_CONTEXT.state}),
                Section 49
              </span>
              , a landlord or their authorised agent may enter the premises
              to carry out necessary repairs and maintenance, provided the
              tenant is given reasonable notice. This service constitutes
              essential maintenance of the property's air conditioning
              system.
            </p>

            <p>
              You are required to ensure that access to the property is
              available during the service window you select using the link
              accompanying this notice. Failure to provide access may
              constitute a breach of your tenancy obligations and may result
              in further action being taken by the managing agent.
            </p>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[12px]">
              <p className="font-semibold text-slate-800">Service details</p>
              <p className="mt-1 text-slate-600">
                Type: {BOOKING_CONTEXT.service} ({BOOKING_CONTEXT.detail})
              </p>
              <p className="text-slate-600">
                Provider: Taylr Pty Ltd (licensed HVAC technicians)
              </p>
              <p className="text-slate-600">
                Authorised by: {BOOKING_CONTEXT.bookerName},{" "}
                {BOOKING_CONTEXT.bookerCompany}
              </p>
            </div>

            <p>
              If you have any concerns regarding this notice or the proposed
              service, please contact our office directly before the service
              date.
            </p>

            <div className="border-t border-slate-100 pt-4">
              <p className="font-semibold text-slate-900">
                {BOOKING_CONTEXT.bookerName}
              </p>
              <p className="text-slate-500">{BOOKING_CONTEXT.bookerCompany}</p>
              <p className="mt-1 text-[11px] italic text-slate-400">
                Electronically authorised — no physical signature required.
                A copy of this notice has been retained on file.
              </p>
            </div>
          </div>
        </div>

        {/* Close button */}
        <div className="flex-none border-t border-slate-100 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-full border border-slate-200 py-3 text-[14px] font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Screen: Access ───────────────────────────────────────────────────────────
//
// This is a full replica of the owner AccessMobile step, driven by
// TENANT_OPTIONS (owner live-in set + trade key via managing agent).
// All sub-sections — leave-key sub-options, info banners, signature
// blocks — work identically to the owner flow.

function AccessScreen({
  onBack,
  onContinue,
}: {
  onBack: () => void;
  onContinue: () => void;
}) {
  const session = useBookingSession();
  const access = session.access_method;
  const leaveKeySub = session.leave_key_sub_method;
  const valid = isTenantAccessValid(session);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);

  // Resolve the signature variant; override for agent_trade_key so the
  // copy is written from the tenant's perspective, not the agent's.
  const signatureVariant = (() => {
    if (access === "agent_trade_key") {
      return { title: "Access authorisation", body: SIG_TENANT_TRADE_KEY };
    }
    return signatureVariantFor(access, leaveKeySub);
  })();

  // Resolve the contextual info note; override for agent_trade_key with
  // tenant-appropriate copy.
  const infoNote = (() => {
    if (access === "agent_trade_key") {
      return {
        title: "About the trade key option",
        body: "Taylr will contact your property manager to arrange temporary use of their trade key. No one needs to be home during the service window.",
      };
    }
    return infoNoteFor(access);
  })();

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-white font-['Inter']">
      {/* Header */}
      <div className="flex-none flex items-start justify-between px-5 pb-4 pt-5">
        <div>
          <h1 className="text-[26px] font-bold leading-tight text-slate-900">
            Access
          </h1>
          <p className="mt-1 text-[14px] leading-snug text-slate-500">
            How will the technician access the property?
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="grid h-9 w-9 place-items-center rounded-full border-2 transition hover:bg-pink-50"
          style={{ borderColor: BRAND, color: BRAND }}
          data-testid="button-back-access-tenant"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      <div className="no-scrollbar flex-1 overflow-y-auto px-5 pb-6">
        <AccessNoticeBox />
        <AccessTypeKey />

        <div className="space-y-3 mb-6">
          {TENANT_OPTIONS.map((o) => (
            <AccessCard
              key={o.key}
              option={o}
              selected={access === o.key}
              onClick={() => bookingActions.setAccessMethod(o.key)}
            />
          ))}
        </div>

        {infoNote && (
          <InfoBanner title={infoNote.title} body={infoNote.body} />
        )}

        {isLeaveKeyMethod(access) && (
          <LeaveKeySubMethodSection unitId={session.unit_id} />
        )}

        {signatureVariant && (
          <SignatureSection
            title={signatureVariant.title}
            body={signatureVariant.body}
            attemptedSubmit={attemptedSubmit}
          />
        )}

        {attemptedSubmit && !access && (
          <div
            className="mt-4 flex items-start gap-2 rounded-xl border p-3 text-[12px] font-medium"
            style={{
              color: ERROR_PURPLE,
              borderColor: ERROR_PURPLE,
              backgroundColor: "rgba(151,71,255,0.04)",
            }}
          >
            <AlertCircle className="mt-px h-4 w-4 shrink-0" />
            <span>Please select an access method to continue.</span>
          </div>
        )}
      </div>

      {/* Docked CTA */}
      <div className="flex-none border-t border-slate-100 bg-white px-5 py-3">
        {attemptedSubmit && !access && (
          <div
            className="mb-3 flex items-start gap-2 rounded-xl border p-3 text-[12px] font-medium"
            style={{
              color: ERROR_PURPLE,
              borderColor: ERROR_PURPLE,
              backgroundColor: "rgba(151,71,255,0.04)",
            }}
          >
            <AlertCircle className="h-4 w-4 mt-px shrink-0" />
            <span>Please select an access method to continue.</span>
          </div>
        )}
        <button
          type="button"
          data-testid="button-continue-access-tenant"
          className="flex w-full items-center justify-center gap-2 rounded-full px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
          style={{ backgroundColor: BRAND }}
          onClick={() => {
            if (!valid) {
              setAttemptedSubmit(true);
              return;
            }
            onContinue();
          }}
        >
          Continue
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ─── Screen: Thank you ────────────────────────────────────────────────────────

function ThankYouScreen({
  day,
  slot,
  bookingRef,
  accessMethod,
  leaveKeySub,
  onDone,
}: {
  day: CustomerDay;
  slot: CustomerSlot;
  bookingRef: string;
  accessMethod: AccessMethod | null;
  leaveKeySub: LeaveKeySubMethod | null;
  onDone: () => void;
}) {
  const windowLabel = windowDisplayLabel(slot.window);
  const monthTitle = day.month.charAt(0) + day.month.slice(1).toLowerCase();
  const weekdayLong = longWeekday(day.date);

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center bg-white px-6 font-['Inter']">
      <div
        className="mb-5 flex h-16 w-16 items-center justify-center rounded-full"
        style={{ backgroundColor: "rgba(123,201,168,0.12)" }}
      >
        <CheckCircle2 className="h-8 w-8" style={{ color: "#7BC9A8" }} />
      </div>

      <h2 className="text-[24px] font-bold text-slate-900">You're confirmed</h2>
      <p className="mt-2 max-w-xs text-center text-[14px] text-slate-500">
        We've passed your preferred window back to your property manager.
      </p>

      <div className="mt-6 w-full max-w-xs rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Your window
        </div>
        <div className="mt-1 text-[16px] font-bold text-slate-900">
          {windowLabel} · {weekdayLong} {day.day} {monthTitle}
        </div>
        <div className="mt-0.5 text-[13px] text-slate-500">{slot.timeLabel}</div>
        {accessReminder(accessMethod, leaveKeySub)}
        <div className="mt-2 text-[11px] text-slate-400">Ref {bookingRef}</div>
      </div>

      <p className="mt-4 max-w-xs text-center text-[12px] text-slate-400">
        You'll receive confirmation from {BOOKING_CONTEXT.bookerCompany} shortly.
      </p>

      <button
        type="button"
        onClick={onDone}
        className="mt-8 rounded-full px-6 py-3 text-[14px] font-semibold text-white transition hover:opacity-90"
        style={{ backgroundColor: BRAND }}
        data-testid="button-done-tenant"
      >
        Done
      </button>
    </div>
  );
}

// ─── Access sub-components ────────────────────────────────────────────────────
//
// These are intentionally scoped to this file — they mirror the equivalent
// components in AccessMobile.tsx so the tenant access screen is pixel-level
// identical to the owner flow.

function accessFlexibility(key: AccessMethod): true | false | null {
  if (isLeaveKeyMethod(key) || isParcelLockerMethod(key) || key === "agent_trade_key") return true;
  if (key === "owner_live_at_unit") return false;
  return null;
}

function AccessNoticeBox() {
  return (
    <div className="mb-4 rounded-2xl bg-slate-50 px-4 py-4">
      <p className="text-[14px] font-semibold leading-snug text-slate-900">
        Access is required
      </p>
      <p className="mt-2 text-[13px] leading-relaxed text-slate-500">
        If you can't be at the property to let the technician in, we have a range of flexible access options which Taylr can coordinate for you.
      </p>
    </div>
  );
}

function AccessTypeKey() {
  return (
    <div className="mb-4 flex items-center gap-5 text-[11px] text-slate-500">
      <span className="flex items-center gap-1.5">
        <LockOpen className="h-3 w-3 text-emerald-500" />
        No one needs to be home
      </span>
    </div>
  );
}

function InfoBanner({ title, body }: { title: string; body: string }) {
  return (
    <div className="mb-6 flex gap-3 rounded-xl border border-pink-200 bg-pink-50/50 p-4">
      <Info className="mt-0.5 h-5 w-5 shrink-0" style={{ color: BRAND }} />
      <div className="text-sm text-slate-700">
        <div className="font-semibold mb-1" style={{ color: BRAND }}>
          {title}
        </div>
        {body}
      </div>
    </div>
  );
}

function AccessCard({
  option,
  selected,
  onClick,
}: {
  option: { key: AccessMethod; label: string; subtitle: string };
  selected: boolean;
  onClick: () => void;
}) {
  const icon = iconForMethod(option.key);
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`card-access-${option.key}`}
      aria-pressed={selected}
      className={`relative flex min-h-[76px] w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition ${
        selected ? "" : "border-slate-200 bg-white hover:border-slate-300"
      }`}
      style={
        selected
          ? { borderColor: SELECTED_GREEN_BORDER, backgroundColor: SELECTED_GREEN_BG }
          : undefined
      }
    >
      {accessFlexibility(option.key) === true && (
        <LockOpen
          className="absolute right-2.5 top-2 h-3 w-3"
          style={{ color: selected ? "rgba(255,255,255,0.4)" : "#10b981" }}
        />
      )}
      <span
        className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${
          selected ? "bg-white" : "bg-slate-100 text-slate-700"
        }`}
        style={selected ? { color: SELECTED_GREEN_BORDER } : undefined}
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span
          className={`truncate text-[14px] font-semibold leading-tight ${
            selected ? "text-white" : "text-slate-900"
          }`}
        >
          {option.label}
        </span>
        <span
          className={`mt-0.5 text-[12px] leading-snug ${
            selected ? "text-white/85" : "text-slate-500"
          }`}
        >
          {option.subtitle}
        </span>
      </span>
      <CheckCircle2
        className="h-5 w-5 shrink-0"
        style={{ color: selected ? SELECTED_GREEN_TEXT : "transparent" }}
      />
    </button>
  );
}

function LeaveKeySubMethodSection({ unitId }: { unitId?: string | null }) {
  const features = useBuildingFeatures(unitId);
  const subOptions = getLeaveKeySubOptions(features);
  const sub = useBookingSelector((s) => s.leave_key_sub_method);
  const keyHolderName = useBookingSelector((s) => s.key_holder_name);
  const keyHolderPhone = useBookingSelector((s) => s.key_holder_phone);
  const note = infoNoteForLeaveKeySub(sub);

  return (
    <div className="mb-6 space-y-4">
      <h2 className="text-[17px] font-bold text-slate-900">
        How will you leave a key?
      </h2>

      <div className="space-y-2">
        {subOptions.map((opt: LeaveKeySubOption) => {
          const selected = sub === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => bookingActions.setLeaveKeySubMethod(opt.key)}
              data-testid={`card-leave-key-sub-${opt.key}`}
              aria-pressed={selected}
              className={`relative flex min-h-[76px] w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition ${
                selected ? "" : "border-slate-200 bg-white hover:border-slate-300"
              }`}
              style={
                selected
                  ? { borderColor: SELECTED_GREEN_BORDER, backgroundColor: SELECTED_GREEN_BG }
                  : undefined
              }
            >
              {isUnattendedLeaveKeySub(opt.key) && (
                <LockOpen
                  className="absolute right-2.5 top-2 h-3 w-3"
                  style={{ color: selected ? "rgba(255,255,255,0.4)" : "#10b981" }}
                />
              )}
              <span
                className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${
                  selected ? "bg-white" : "bg-slate-100 text-slate-700"
                }`}
                style={selected ? { color: SELECTED_GREEN_BORDER } : undefined}
              >
                {iconForSubMethod(opt.key)}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span
                  className={`truncate text-[14px] font-semibold leading-tight ${
                    selected ? "text-white" : "text-slate-900"
                  }`}
                >
                  {opt.label}
                </span>
                <span
                  className={`mt-0.5 text-[12px] leading-snug ${
                    selected ? "text-white/85" : "text-slate-500"
                  }`}
                >
                  for Taylr to access
                </span>
              </span>
              <CheckCircle2
                className="h-5 w-5 shrink-0"
                style={{ color: selected ? SELECTED_GREEN_TEXT : "transparent" }}
              />
            </button>
          );
        })}
      </div>

      {note && <InfoBanner title={note.title} body={note.body} />}

      {sub === "with_someone" && (
        <div className="space-y-3">
          <p className="text-[13px] font-medium text-slate-700">
            Key holder contact
          </p>
          <input
            type="text"
            value={keyHolderName}
            onChange={(e) =>
              bookingActions.setKeyHolder({ key_holder_name: e.target.value })
            }
            placeholder="Key holder full name"
            data-testid="input-key-holder-name"
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[15px] outline-none focus:border-slate-400"
          />
          <input
            type="tel"
            value={keyHolderPhone}
            onChange={(e) =>
              bookingActions.setKeyHolder({ key_holder_phone: e.target.value })
            }
            placeholder="Key holder mobile"
            data-testid="input-key-holder-phone"
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[15px] outline-none focus:border-slate-400"
          />
        </div>
      )}
    </div>
  );
}

function SignatureSection({
  title,
  body,
  attemptedSubmit = false,
}: {
  title: string;
  body: string;
  attemptedSubmit?: boolean;
}) {
  const agreed = useBookingSelector((s) => s.signature_acknowledged);
  const name = useBookingSelector((s) => s.signature_name);
  const contactFirst = useBookingSelector((s) => s.contact_first_name);
  const contactLast = useBookingSelector((s) => s.contact_last_name);
  const displayName =
    name || [contactFirst, contactLast].filter(Boolean).join(" ");

  return (
    <div className="mb-6">
      <h2 className="text-[17px] font-bold text-slate-900 mb-3">{title}</h2>
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="bg-slate-50 px-4 py-4 text-[12px] leading-relaxed text-slate-600 border-b border-slate-200">
          {body}
        </div>
        <div className="px-4 py-4 space-y-4">
          <PinkAckCheckbox
            checked={agreed}
            onChange={(next) =>
              bookingActions.setSignature({ signature_acknowledged: next })
            }
            invalid={attemptedSubmit && !agreed}
            errorText="Please confirm you have read and agree to continue."
            testId="checkbox-signature"
            label="I have read and agree to the above"
          />
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
              Your full name (typed signature)
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) =>
                bookingActions.setSignature({ signature_name: e.target.value })
              }
              placeholder="e.g. Liam Carter"
              data-testid="input-signature-name"
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[15px] outline-none focus:border-slate-400"
            />
          </div>
          <div className="text-[11px] text-slate-400">
            Date signed:{" "}
            {new Date().toLocaleDateString("en-AU", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Icon helpers ─────────────────────────────────────────────────────────────

function iconForMethod(m: AccessMethod) {
  if (m === "owner_live_at_unit") return <DoorWithPersonIcon className="h-5 w-5" />;
  if (m === "owner_live_leave_key") return <KeyRound className="h-5 w-5" />;
  if (m === "agent_trade_key") return <Hand className="h-5 w-5" />;
  return <KeyRound className="h-5 w-5" />;
}

function iconForSubMethod(key: LeaveKeySubMethod) {
  if (key === "with_someone") return <Users className="h-5 w-5" />;
  if (key === "with_parcel_locker") return <LockerIcon className="h-5 w-5" />;
  if (key === "with_taylr") return <Hand className="h-5 w-5" />;
  if (key === "with_building_manager") return <HardHat className="h-5 w-5" />;
  if (key === "with_concierge") return <ConciergeBell className="h-5 w-5" />;
  return <KeyRound className="h-5 w-5" />;
}

// ─── Slot card ────────────────────────────────────────────────────────────────

function TenantSlotCard({
  slot,
  icon,
  label,
  hint,
  selected,
  onClick,
}: {
  slot: CustomerSlot;
  icon: React.ReactNode;
  label: string;
  hint: string;
  selected: boolean;
  onClick: () => void;
}) {
  const fits = slot.status === "available";
  const disabled = !fits;
  const isSelected = selected && fits;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      data-testid={`tenant-slot-${slot.id}`}
      aria-pressed={isSelected}
      className={`flex flex-col items-start gap-1 rounded-xl border px-3 py-2.5 text-left transition ${
        disabled
          ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
          : isSelected
            ? "shadow-sm"
            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
      }`}
      style={
        isSelected
          ? {
              borderColor: SELECTED_GREEN_BORDER,
              backgroundColor: SELECTED_GREEN_BG,
              color: SELECTED_GREEN_TEXT,
            }
          : undefined
      }
    >
      <div className="flex w-full items-center justify-between">
        <div
          className={disabled ? "text-slate-400" : ""}
          style={
            disabled
              ? undefined
              : { color: isSelected ? "#ffffff" : BRAND }
          }
        >
          {icon}
        </div>
        {isSelected && (
          <CheckCircle2
            className="h-3.5 w-3.5"
            style={{ color: "#ffffff" }}
          />
        )}
      </div>
      <div className="text-[13px] font-semibold">{label}</div>
      <div
        className={`text-[10px] ${disabled ? "text-slate-400" : isSelected ? "" : "text-slate-500"}`}
        style={
          isSelected
            ? { color: SELECTED_GREEN_TEXT, opacity: 0.85 }
            : undefined
        }
      >
        {hint}
      </div>
    </button>
  );
}

// ─── SVG Icons ────────────────────────────────────────────────────────────────

function DoorWithPersonIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16" />
      <line x1="3" y1="21" x2="21" y2="21" />
      <circle cx="12" cy="9.5" r="1.6" />
      <path d="M9 16v-1.2a3 3 0 0 1 6 0V16" />
    </svg>
  );
}
