/**
 * TenantSchedulingMobile
 *
 * Canvas view — what a tenant sees when they follow a "schedule your
 * service" link sent by their property manager.
 *
 * Four-screen journey:
 *   1. Intro    — confirms the unit, service details, and what to expect
 *   2. Access   — tenant chooses how to provide access ("I'll be home"
 *                 vs "Flexible access")
 *   3. Schedule — slot picker with the same pink access-notice banner
 *                 that owners see during booking; terms acknowledgement
 *   4. Thank you — confirmation with access-specific reminder copy
 *
 * Seeded from the bk-1038 scenario:
 *   Owner / booker: Marcus Holloway (City Edge Property Group)
 *   Unit:  6 / 21 Bourke Street, Surry Hills NSW 2010
 *   Tenant: Liam Carter
 *   Service: AC service · 1 × split system (45 min)
 *
 * The slot picker uses the live Bourke rollout (u6) so real Mon/Wed/Fri
 * windows are shown. The rollout version is subscribed via
 * useSyncExternalStore so admin mutations propagate live.
 */

import { useMemo, useState, useSyncExternalStore } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Home,
  Info,
  KeyRound,
  Wind,
} from "lucide-react";

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
import {
  getRolloutsVersion,
  subscribeRollouts,
} from "../../../state/adminMockData";
import { AfternoonIcon, EveningIcon, MorningIcon } from "./TimeOfDayIcon";
import { CustomerAvailableDays } from "./CustomerAvailableDays";
import { NextAvailableCard } from "./NextAvailableCard";
import { SlotsAccessBanner } from "./SlotsAccessBanner";
import { WhyWindowsModal } from "./WhyWindowsModal";
import { PinkAckCheckbox } from "../booking-pages/PinkAckCheckbox";
import { CancellationTermsModal } from "../booking-pages/CancellationTermsModal";
import type { AccessMethod } from "../../../state/bookingSession";

// ─── Constants ──────────────────────────────────────────────────────────────

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
  service: "AC service",
  detail: "1 × split system · approx. 45 min",
  bookerName: "Marcus Holloway",
  bookerCompany: "City Edge Property Group",
  tenantName: "Liam",
};

// ─── Types ───────────────────────────────────────────────────────────────────

/** The two access paths available to a tenant in this flow. */
type TenantAccess = "be_there" | "flexible";

type Step = "intro" | "access" | "schedule" | "thankyou";

/**
 * Maps the tenant's access choice to an AccessMethod recognised by
 * SlotsAccessBanner so it shows the correct copy:
 *   be_there → owner_live_at_unit    → WINDOW_REQUIRED
 *   flexible → owner_live_parcel_locker → FLEXIBLE_TAYLR_MANAGED
 */
function accessMethodFor(choice: TenantAccess | null): AccessMethod | null {
  if (choice === "be_there") return "owner_live_at_unit";
  if (choice === "flexible") return "owner_live_parcel_locker";
  return null;
}

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

// ─── Root component ──────────────────────────────────────────────────────────

export function TenantSchedulingMobile() {
  const [step, setStep] = useState<Step>("intro");
  const [tenantAccess, setTenantAccess] = useState<TenantAccess | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [termsAck, setTermsAck] = useState(false);
  const [attemptedConfirm, setAttemptedConfirm] = useState(false);
  const [whyWindowsOpen, setWhyWindowsOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);

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
    setTenantAccess(null);
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
        tenantAccess={tenantAccess}
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
        tenantAccess={tenantAccess}
        onSelect={setTenantAccess}
        onBack={() => setStep("intro")}
        onContinue={() => {
          // Clear any stale slot selection when access method changes.
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

  const accessMethod = accessMethodFor(tenantAccess);
  const hasDates = rollout !== null && visibleDays.length > 0;

  const termsLabel =
    tenantAccess === "flexible"
      ? "I confirm my flexible access arrangement will be in place on the service day, and understand that the technician cannot wait if access isn't available."
      : "I understand this is a window, not a set time, and I can ensure access is available for the full selected service window.";

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
        {/* Access banner — same pink Info component as the owner booking flow.
            Driven by the tenant's access choice: be_there → WINDOW_REQUIRED,
            flexible → FLEXIBLE_TAYLR_MANAGED. */}
        {hasDates && (
          <div className="mt-4">
            <SlotsAccessBanner
              accessMethod={accessMethod}
              size="compact"
              testIdSuffix="mobile"
              onWhyWindows={() => setWhyWindowsOpen(true)}
            />
          </div>
        )}

        {/* Condensed service context chip */}
        <div className={`rounded-xl border border-slate-200 bg-slate-50 p-3 ${hasDates ? "mb-4" : "mt-4 mb-4"}`}>
          <div className="flex items-center justify-between gap-2">
            <div className="text-[12px] font-semibold text-slate-700">
              {BOOKING_CONTEXT.service} · {BOOKING_CONTEXT.detail}
            </div>
            <div className="shrink-0 text-[11px] text-slate-400">
              Ref {BOOKING_CONTEXT.ref}
            </div>
          </div>
        </div>

        {/* Date / window picker */}
        {rollout === null || visibleDays.length === 0 ? (
          <div
            className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900"
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

            {nextAvailable && (
              <div className="mt-4 mb-2 text-[18px] font-bold text-slate-900">
                Choose a day
              </div>
            )}

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

            {activeDay && (
              <div className="mt-5">
                <div className="mb-2 text-[18px] font-bold text-slate-900">
                  Pick a window
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
              </div>
            )}

            {hasUpcomingUnreleasedDays(rollout, visibleDays) && (
              <div
                className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3.5"
                data-testid="section-more-dates-tenant"
              >
                <div className="text-[13px] font-semibold text-slate-900">
                  Don't see a suitable day?
                </div>
                <div className="mt-0.5 text-[12px] text-slate-600">
                  More windows are being confirmed. Contact your property
                  manager to request a different date.
                </div>
              </div>
            )}

            {/* Terms acknowledgement — shown once dates are available */}
            <div className="mt-5">
              <PinkAckCheckbox
                checked={termsAck}
                onChange={setTermsAck}
                invalid={attemptedConfirm && !termsAck}
                errorText="Please tick to confirm before continuing."
                testId="ack-tenant-terms"
                label={termsLabel}
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

function IntroScreen({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-white font-['Inter']">
      {/* Header */}
      <div className="flex-none border-b border-slate-100 px-5 pb-4 pt-5">
        <div className="flex items-start gap-3">
          <div
            className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
            style={{ backgroundColor: "rgba(237,1,127,0.08)" }}
          >
            <Wind className="h-4 w-4" style={{ color: BRAND }} />
          </div>
          <div>
            <h1 className="text-[20px] font-bold leading-tight text-slate-900">
              Service scheduling
            </h1>
            <p className="mt-0.5 text-[12px] text-slate-500">
              {BOOKING_CONTEXT.unitAddress} · {BOOKING_CONTEXT.suburb}
            </p>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="no-scrollbar flex-1 overflow-y-auto px-5 pb-6">
        <p className="mt-5 text-[14px] leading-relaxed text-slate-600">
          Hi{" "}
          <span className="font-semibold text-slate-800">
            {BOOKING_CONTEXT.tenantName}
          </span>
          ,
        </p>
        <p className="mt-2 text-[14px] leading-relaxed text-slate-600">
          Your property manager has arranged an AC service for your unit and
          needs you to choose a service window that works for you.
        </p>

        {/* Service card */}
        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Service details
          </div>
          <div className="mt-2 text-[16px] font-bold text-slate-900">
            {BOOKING_CONTEXT.service}
          </div>
          <div className="mt-0.5 text-[13px] text-slate-500">
            {BOOKING_CONTEXT.detail}
          </div>
          <div className="mt-3 border-t border-slate-200 pt-3">
            <div className="text-[12px] text-slate-500">
              Arranged by{" "}
              <span className="font-semibold text-slate-700">
                {BOOKING_CONTEXT.bookerName}
              </span>
              {" · "}
              {BOOKING_CONTEXT.bookerCompany}
            </div>
            <div className="mt-0.5 text-[11px] text-slate-400">
              Ref {BOOKING_CONTEXT.ref}
            </div>
          </div>
        </div>

        {/* Steps card */}
        <div className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3.5">
          <div className="text-[13px] font-semibold text-slate-800">
            What happens next
          </div>
          <ol className="mt-3 space-y-3">
            {[
              "Tell us how you'll provide access to your unit",
              "Pick a service window that suits you",
              "We'll let your property manager know your preference",
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
          Get started
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ─── Screen: Access ───────────────────────────────────────────────────────────

function AccessScreen({
  tenantAccess,
  onSelect,
  onBack,
  onContinue,
}: {
  tenantAccess: TenantAccess | null;
  onSelect: (a: TenantAccess) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-white font-['Inter']">
      {/* Header */}
      <div className="flex-none flex items-start justify-between px-5 pb-4 pt-5">
        <div>
          <h1 className="text-[26px] font-bold leading-tight text-slate-900">
            Access
          </h1>
          <p className="mt-1 text-[13px] leading-snug text-slate-500">
            How will the technician access your unit?
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
        {/* Access notice */}
        <div className="mb-5 rounded-2xl bg-slate-50 px-4 py-4">
          <p className="text-[14px] font-semibold leading-snug text-slate-900">
            Access is required on the day
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-slate-500">
            The technician will need to access your unit during the window you
            select. Let us know how you'd like to handle that.
          </p>
        </div>

        {/* Access option cards */}
        <div className="space-y-3">
          <TenantAccessCard
            id="be_there"
            icon={<Home className="h-5 w-5" />}
            title="I'll be home"
            subtitle="I'll be present to let the technician in during the window"
            selected={tenantAccess === "be_there"}
            onClick={() => onSelect("be_there")}
          />
          <TenantAccessCard
            id="flexible"
            icon={<KeyRound className="h-5 w-5" />}
            title="Flexible access"
            subtitle="I'll arrange key access via building management, concierge, or similar"
            selected={tenantAccess === "flexible"}
            onClick={() => onSelect("flexible")}
          />
        </div>

        {/* Contextual note — appears after a selection is made */}
        {tenantAccess === "be_there" && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <p className="text-[12px] leading-relaxed text-amber-900">
              <span className="font-semibold">You'll need to be available</span>{" "}
              for the full service window you choose — we can't guarantee an
              exact arrival time within the window.
            </p>
          </div>
        )}

        {tenantAccess === "flexible" && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3">
            <span className="mt-0.5 text-[15px] leading-none text-emerald-500">
              ✔
            </span>
            <p className="text-[12px] leading-relaxed text-emerald-900">
              <span className="font-semibold">Flexible access selected.</span>{" "}
              You don't need to be home. Please make sure your key or access
              arrangement is in place before the service day.
            </p>
          </div>
        )}

        {attemptedSubmit && !tenantAccess && (
          <div
            className="mt-4 flex items-start gap-2 rounded-xl border p-3 text-[12px] font-medium"
            style={{
              color: ERROR_PURPLE,
              borderColor: ERROR_PURPLE,
              backgroundColor: "rgba(151,71,255,0.04)",
            }}
          >
            <AlertCircle className="mt-px h-4 w-4 shrink-0" />
            <span>Please choose an access option to continue.</span>
          </div>
        )}
      </div>

      {/* Docked CTA */}
      <div className="flex-none border-t border-slate-100 bg-white px-5 py-4">
        <button
          type="button"
          data-testid="button-continue-access-tenant"
          className="flex w-full items-center justify-center gap-2 rounded-full px-5 py-3.5 text-[14px] font-semibold text-white shadow-sm transition hover:opacity-90"
          style={{ backgroundColor: BRAND }}
          onClick={() => {
            if (!tenantAccess) {
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
  tenantAccess,
  onDone,
}: {
  day: CustomerDay;
  slot: CustomerSlot;
  bookingRef: string;
  tenantAccess: TenantAccess | null;
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

        {tenantAccess === "be_there" && (
          <div className="mt-2 text-[12px] font-medium text-amber-700">
            Remember — you'll need to be present during this window.
          </div>
        )}
        {tenantAccess === "flexible" && (
          <div className="mt-2 text-[12px] font-medium text-emerald-700">
            Make sure your key / access arrangement is ready before the service
            day.
          </div>
        )}

        <div className="mt-2 text-[11px] text-slate-400">Ref {bookingRef}</div>
      </div>

      <p className="mt-4 max-w-xs text-center text-[12px] text-slate-400">
        You'll receive confirmation from {BOOKING_CONTEXT.bookerCompany}{" "}
        shortly.
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

// ─── Shared sub-components ────────────────────────────────────────────────────

function TenantAccessCard({
  id,
  icon,
  title,
  subtitle,
  selected,
  onClick,
}: {
  id: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`card-tenant-access-${id}`}
      aria-pressed={selected}
      className={`flex min-h-[76px] w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition ${
        selected ? "" : "border-slate-200 bg-white hover:border-slate-300"
      }`}
      style={
        selected
          ? { borderColor: SELECTED_GREEN_BORDER, backgroundColor: SELECTED_GREEN_BG }
          : undefined
      }
    >
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
          className={`text-[14px] font-semibold leading-tight ${
            selected ? "text-white" : "text-slate-900"
          }`}
        >
          {title}
        </span>
        <span
          className={`mt-0.5 text-[12px] leading-snug ${
            selected ? "text-white/85" : "text-slate-500"
          }`}
        >
          {subtitle}
        </span>
      </span>
      <CheckCircle2
        className="h-5 w-5 shrink-0"
        style={{ color: selected ? SELECTED_GREEN_TEXT : "transparent" }}
      />
    </button>
  );
}

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
            disabled ? undefined : { color: isSelected ? "#ffffff" : BRAND }
          }
        >
          {icon}
        </div>
        {isSelected && (
          <CheckCircle2 className="h-3.5 w-3.5" style={{ color: "#ffffff" }} />
        )}
      </div>
      <div className="text-[13px] font-semibold">{label}</div>
      <div
        className={`text-[10px] ${disabled ? "text-slate-400" : isSelected ? "" : "text-slate-500"}`}
        style={isSelected ? { color: SELECTED_GREEN_TEXT, opacity: 0.85 } : undefined}
      >
        {hint}
      </div>
    </button>
  );
}
