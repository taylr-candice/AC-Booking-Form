import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Sunrise,
  Sun,
  Pencil,
  CheckCircle2,
  Info,
  AlertTriangle,
  Lock,
} from "lucide-react";

import { getBookingDurationMinutes } from "../../../state/bookingDerived";
import { isPastDate } from "../../../state/bookingHelpers";
import { useBookingSession } from "../../../state/bookingSession";
import {
  isBeThereMethod,
  isUnattendedAccessMethod,
} from "../../../state/accessMethodCatalog";
import {
  getLiveBookingsVersion,
  subscribeLiveBookings,
} from "../../../state/adminMockData";
import {
  alreadyScheduledByOther,
  disabledReasonForStatus,
  resolveCustomerSlotData,
  type CustomerDay,
  type CustomerSlot,
  WINDOW_TIME_RANGE,
} from "./customerSlotData";

const BRAND = "#ED017F";
const SELECTED_GREEN = "#5FBB97";

type Slot = CustomerSlot;
type Day = CustomerDay;


export function SlotsMobileLite() {
  const [selected, setSelected] = useState<string | null>(null);
  const session = useBookingSession();
  const jobMinutes = getBookingDurationMinutes(session);
  const isUnsure = session.ac_discrepancy?.customer.type === "unsure";
  // Slot-picker banner branches on the customer's access method into
  // three modes (unattended / self-attended / coordinated). See
  // SlotsDesktop for the full rationale — same logic, lite copy.
  const accessMethod = session.access_method;
  const unattended = isUnattendedAccessMethod(accessMethod);
  const selfAttended = isBeThereMethod(accessMethod);
  const accessMode = unattended
    ? "unattended"
    : selfAttended
      ? "self-attended"
      : "coordinated";
  // Role-conditional accountability nudge inside the "Not sure" callout.
  // Owners and managing agents have very different burdens when a second
  // visit is needed — owners have to physically open up again, agents
  // have to re-coordinate tenant access. The copy below is short on
  // purpose so the distinct keywords ("be home for" / "coordinate with
  // the tenant") double as test anchors. Falls back to the owner
  // phrasing when role is unset (the customer hasn't reached Step 1 yet).
  const accountabilityNudge =
    session.role === "agent"
      ? "you'll need to coordinate a second visit with the tenant"
      : "you'll need to be home for a second visit";

  // Resolve the per-(service, building) rollout (Task #59) and pull
  // its day rows. Past dates are filtered out so customers never see
  // bookable rows that have already rolled by.
  const slotData = useMemo(
    () => resolveCustomerSlotData(session.unit_id, jobMinutes),
    [session.unit_id, jobMinutes],
  );
  const rollout = slotData.rollout;
  const liveBookingsVersion = useSyncExternalStore(
    subscribeLiveBookings,
    getLiveBookingsVersion,
    getLiveBookingsVersion,
  );
  const lockedByOther = useMemo(
    () => {
      void liveBookingsVersion;
      return alreadyScheduledByOther(session.unit_id);
    },
    [session.unit_id, liveBookingsVersion],
  );
  const visibleDays = useMemo(
    () => slotData.days.filter((d) => !isPastDate(d.date)),
    [slotData.days],
  );

  // If the customer's job size grows, an already-selected slot might
  // no longer fit. Drop it so the Continue button can't carry a stale
  // selection forward. The slot's pre-computed status is the same
  // source of truth the tile uses.
  const selectedSlotFits = useMemo(() => {
    if (!selected) return true;
    for (const d of visibleDays) {
      for (const slot of [d.morning, d.afternoon]) {
        if (slot.id === selected) {
          return slot.status === "available";
        }
      }
    }
    return false;
  }, [selected, visibleDays]);
  useEffect(() => {
    if (selected && !selectedSlotFits) setSelected(null);
  }, [selected, selectedSlotFits]);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-white font-['Inter']">
      <div className="flex items-start justify-between px-5 pb-4 pt-5">
        <div>
          <h1 className="text-[26px] font-semibold leading-tight text-slate-900">
            Schedule
          </h1>
          <div className="mt-0.5 text-xs text-slate-500">Pick a service slot</div>
        </div>
        <button
          type="button"
          aria-label="Back"
          className="grid h-9 w-9 place-items-center rounded-full border-2 transition hover:bg-pink-50"
          style={{ borderColor: BRAND, color: BRAND }}
          data-testid="button-back-mobile"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-6">
        <div className="mb-2 mt-1 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold" style={{ color: BRAND }}>
            Available Slots
          </h2>
          <button type="button" aria-label="Edit" className="rounded p-1 text-slate-500 hover:text-slate-900">
            <Pencil className="h-4 w-4" />
          </button>
        </div>

        {/* Access-window commitment — prominent, always shown.
            Copy branches on the customer's access method (see the
            `accessMode` derivation above). */}
        <div
          className="mb-4 rounded-xl border px-3 py-2.5 text-[12px] leading-relaxed"
          style={{ borderColor: "#FBCFE2", backgroundColor: "#FFF1F8", color: "#9D174D" }}
          data-testid="banner-access-commitment-mobile"
          data-access-mode={accessMode}
        >
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            {unattended ? (
              <div>
                <span className="font-semibold">You're authorising us</span>{" "}
                to access the unit during the window you pick to carry out
                the service — no one needs to be there.
              </div>
            ) : selfAttended ? (
              <div>
                <span className="font-semibold">Heads up:</span> we can't
                guarantee an exact arrival or finish time within the window
                you pick, so please make sure{" "}
                <span className="font-semibold">you are</span> available for
                the <span className="font-semibold">entire window</span>.
                {" "}
                <span>
                  Don't want to wait around? Pick an access option that doesn't need you on-site —
                  leave a key, use a parcel locker, or coordinate with a tenant.
                </span>
              </div>
            ) : (
              <div>
                The service will be carried out{" "}
                <span className="font-semibold">sometime within the window</span>{" "}
                you pick — there's no set arrival time.
              </div>
            )}
          </div>
          {/* Quieter, always-available shortcut — opens Step 4 so the
              customer can swap to a different access option. */}
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              data-testid="button-edit-access"
              className="text-[11px] font-semibold underline underline-offset-2 hover:opacity-80"
              style={{ color: "#9D174D" }}
            >
              Change access option
            </button>
          </div>
        </div>

        {/* "Not sure" callout — only when AC step was answered "unsure". */}
        {isUnsure && (
          <div
            className="mb-4 rounded-xl border px-3 py-2.5 text-[12px] leading-relaxed"
            style={{ borderColor: "#FCD34D", backgroundColor: "#FFFBEB", color: "#92400E" }}
            data-testid="callout-unsure-mobile"
          >
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                You picked <span className="font-semibold">"Not sure"</span> on the AC step,
                so we've sized your slot for one indoor unit. If we find more on-site,
                the technician may not finish in one visit and Taylr will book a
                second slot — which means{" "}
                <span className="font-semibold" data-testid="nudge-accountability-mobile">
                  {accountabilityNudge}
                </span>.{" "}
                <span className="font-semibold">If you can confirm the AC details now,
                you'll likely avoid that.</span>
              </div>
            </div>
            <div className="mt-2.5 flex justify-end">
              <button
                type="button"
                data-testid="button-edit-ac"
                className="rounded-full px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm transition hover:opacity-90"
                style={{ backgroundColor: "#B45309" }}
              >
                Update AC info
              </button>
            </div>
          </div>
        )}

        {!rollout ? (
          <div
            className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900"
            data-testid="empty-no-rollout-mobile-lite"
          >
            <div className="text-[14px] font-semibold">
              AC services aren't open for booking at this address yet.
            </div>
            <div className="mt-1.5 text-[12px] text-amber-800">
              We're rolling this out building by building. Call{" "}
              <span className="font-medium" style={{ color: BRAND }}>
                1300 TAYLR
              </span>{" "}
              and we'll add you to the waitlist.
            </div>
          </div>
        ) : lockedByOther ? (
          // Read-only "Already scheduled" — Task #49.
          //
          // We deliberately do not surface ANY details of the existing
          // booking here (no customer name, no contact details, no
          // booked window/date, no booker role). Customer-facing
          // surfaces should never expose another customer's data —
          // even the booked date+window pair is identifying info about
          // someone else. Anything beyond "this address is already
          // scheduled, contact Taylr" should go through admin tooling.
          <div
            className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-slate-700"
            data-testid="banner-locked-by-other-mobile-lite"
            data-locked-kind={lockedByOther.kind}
          >
            <div className="flex items-start gap-2.5">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
              <div className="flex-1">
                <div className="text-[14px] font-semibold text-slate-900">
                  Already scheduled for this address
                </div>
                <div className="mt-1 text-[12px] text-slate-600">
                  There's already a confirmed service booked at this
                  property, so it can't be booked again right now. Only
                  one confirmed booking is allowed per service run.
                </div>
                <div className="mt-2 text-[12px] text-slate-600">
                  If you have any questions or believe this is a
                  mistake, contact Taylr at{" "}
                  <a
                    href="mailto:support@taylr.com.au"
                    className="font-medium underline"
                    style={{ color: BRAND }}
                    data-testid="link-locked-support-email-mobile-lite"
                  >
                    support@taylr.com.au
                  </a>{" "}
                  or call{" "}
                  <span className="font-medium" style={{ color: BRAND }}>
                    1300 TAYLR
                  </span>
                  .
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {visibleDays.map((d) => (
                <DayBlock
                  key={d.date}
                  day={d}
                  selected={selected}
                  onSelect={(id) => setSelected(id)}
                />
              ))}
            </div>

            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-[11px] text-slate-500">
              None of these work? Call us on{" "}
              <span className="font-medium" style={{ color: BRAND }}>
                1300 TAYLR
              </span>{" "}
              and we'll look at options outside your area's regular run.
            </div>
          </>
        )}
      </div>

      <div className="border-t border-slate-100 bg-white px-5 py-3">
        <button
          type="button"
          disabled={!selected || !!lockedByOther}
          data-testid="button-continue-mobile"
          className="flex w-full items-center justify-center gap-2 rounded-full px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition disabled:opacity-50"
          style={{ backgroundColor: BRAND }}
        >
          Continue
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}


function DayBlock({
  day, selected, onSelect,
}: { day: Day; selected: string | null; onSelect: (id: string) => void }) {
  return (
    <div className="flex gap-3">
      <div className="flex w-14 shrink-0 flex-col items-center justify-center rounded-xl border border-slate-200 bg-white py-2">
        <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{day.weekday}</div>
        <div className="text-xl font-bold leading-tight text-slate-900">{day.day}</div>
        <div className="text-[10px] text-slate-500">{day.month}</div>
      </div>

      <div className="grid flex-1 grid-cols-2 gap-2">
        <SlotCard
          slot={day.morning}
          icon={<Sunrise className="h-4 w-4" />}
          label="Morning"
          hint={WINDOW_TIME_RANGE.morning}
          selected={selected === day.morning.id}
          onClick={() => onSelect(day.morning.id)}
        />
        <SlotCard
          slot={day.afternoon}
          icon={<Sun className="h-4 w-4" />}
          label="Afternoon"
          hint={WINDOW_TIME_RANGE.afternoon}
          selected={selected === day.afternoon.id}
          onClick={() => onSelect(day.afternoon.id)}
        />
      </div>
    </div>
  );
}

function SlotCard({
  slot, icon, label, hint, selected, onClick,
}: {
  slot: Slot;
  icon: React.ReactNode;
  label: string;
  hint: string;
  selected: boolean;
  onClick: () => void;
}) {
  // Status comes from the rollout resolver — same source of truth
  // the admin schedule editor uses.
  const status = slot.status;
  const fits = status === "available";
  const disabled = !fits;
  const isSelected = selected && fits;

  // Three distinct disabled reasons (Full / Not enough time / Not yet
  // open). Centralised in `disabledReasonForStatus`.
  const reason = disabledReasonForStatus(status);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      data-testid={`mobile-slot-${slot.id}`}
      aria-pressed={isSelected}
      className={`relative flex flex-col items-start gap-1 rounded-xl border px-3 py-2.5 text-left transition ${
        disabled
          ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
          : isSelected
            ? "text-white shadow-sm"
            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
      }`}
      style={
        isSelected
          ? { borderColor: SELECTED_GREEN, backgroundColor: SELECTED_GREEN }
          : undefined
      }
    >
      <div className="flex w-full items-center justify-between">
        <div className={disabled ? "text-slate-400" : isSelected ? "text-white" : "text-slate-500"}>
          {icon}
        </div>
        {isSelected && <CheckCircle2 className="h-3.5 w-3.5 text-white" />}
      </div>
      <div className="text-[13px] font-semibold">{label}</div>
      <div className={`text-[10px] ${disabled ? "text-slate-400" : isSelected ? "text-white/85" : "text-slate-500"}`}>{hint}</div>
      {disabled && (
        <div className="text-[10px] font-medium text-slate-400">{reason}</div>
      )}
    </button>
  );
}
