import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  ArrowRight,
  Sunrise,
  Sun,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock,
  Info,
  AlertTriangle,
} from "lucide-react";

import { getBookingDurationMinutes } from "../../../state/bookingDerived";
import { useBookingSession } from "../../../state/bookingSession";
import {
  isBeThereMethod,
  isUnattendedAccessMethod,
} from "../../../state/accessMethodCatalog";
import { isPastDate, unitCity } from "../../../state/bookingHelpers";
import {
  getLiveBookingsVersion,
  subscribeLiveBookings,
} from "../../../state/adminMockData";
import {
  alreadyScheduledByOther,
  resolveCustomerSlotData,
  WINDOW_TIME_RANGE,
  type CustomerDay,
  type CustomerSlot,
} from "./customerSlotData";
import { Lock } from "lucide-react";

const BRAND = "#ED017F";
const SELECTED_GREEN = "#5FBB97";

type Slot = CustomerSlot;
type Day = CustomerDay;

export function SlotsDesktop() {
  const [selected, setSelected] = useState<string | null>(null);
  const [weekIdx, setWeekIdx] = useState(0);
  const session = useBookingSession();
  const jobMinutes = getBookingDurationMinutes(session);
  const isUnsure = session.ac_discrepancy?.customer.type === "unsure";
  // Slot-picker banner branches on the customer's access method into
  // three modes — the "Heads up: be available the entire window"
  // warning is reserved for customers who personally committed to
  // meeting the technician, since they're the only ones who'd be
  // surprised by a non-fixed arrival time:
  //   - "unattended"     → parcel locker / collect & return / agency
  //                        trade key. Swap the warning for the lighter
  //                        "you're authorising us" framing — no one
  //                        needs to be there.
  //   - "self-attended"  → be-there options. Keep the "Heads up: please
  //                        make sure you are available for the entire
  //                        window" copy — these customers are the only
  //                        ones the heads-up is aimed at.
  //   - "coordinated"    → leave-key / agent_tenant_self / no method
  //                        set yet. The customer themselves isn't
  //                        attending, so we drop the "Heads up" framing
  //                        and just state the scheduling model: the
  //                        service happens sometime within the window,
  //                        not at a set time.
  const accessMethod = session.access_method;
  const unattended = isUnattendedAccessMethod(accessMethod);
  const selfAttended = isBeThereMethod(accessMethod);
  const accessMode = unattended
    ? "unattended"
    : selfAttended
      ? "self-attended"
      : "coordinated";
  // The "Change access method" nudge is only shown to "I'll be there"
  // customers — the alternative options (parcel locker, collect &
  // return, agency trade key) let them skip waiting around for the
  // entire window. The button reuses the same edit-jump pattern as the
  // AC-step button (handled by the booking-flow wrapper via the
  // `button-change-access` data-testid).
  const showChangeAccess = selfAttended;
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
  // Timezone pill mirrors the city the building is in — a Canberra unit
  // shows "Canberra time", a Melbourne unit shows "Melbourne time", and
  // so on. Falls back to "Sydney" when no unit is known. See
  // `unitCity` in bookingHelpers.ts for the full state→city map.
  const cityLabel = unitCity(session.unit_id);

  // Resolve which rollout this customer is booking against and pull
  // its day rows. After Task #59 capacity lives on the per-rollout
  // schedule, not a global slot calendar — so the picker just renders
  // whatever the admin has opened for this (svc-ac, building) pair.
  // Past dates are filtered out for the same reason as before — the
  // seeds are anchored to fixed 2026 dates, so as the clock moves
  // forward the picker shrinks naturally.
  const slotData = useMemo(
    () => resolveCustomerSlotData(session.unit_id, jobMinutes),
    [session.unit_id, jobMinutes],
  );
  const rollout = slotData.rollout;
  // Uniqueness lock — Task #49. If another party already paid-booked
  // this customer's unit, the picker is read-only. We still surface
  // the booked date/window/booker so they understand *why*. Skip the
  // lock when no unit is selected (canvas-isolated preview keeps the
  // picker fully interactive on its own iframe).
  // Subscribe to admin-side mutations (cancel / reschedule / supersede)
  // so this lock view re-evaluates as soon as the admin changes the
  // bookings list. Canvas-isolated mode never fires this.
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

  const weeks = useMemo(() => {
    const out: Day[][] = [];
    for (let i = 0; i < visibleDays.length; i += 6) {
      out.push(visibleDays.slice(i, i + 6));
    }
    return out;
  }, [visibleDays]);

  const week = weeks[weekIdx] ?? [];
  const selectedDay = visibleDays.find((d) => d.morning.id === selected || d.afternoon.id === selected);
  const selectedSlot = visibleDays.flatMap((d) => [d.morning, d.afternoon]).find((s) => s.id === selected);

  // If the customer's job size grows (e.g. they edit the AC step in
  // another iframe via cross-iframe sessionStorage sync), an already-
  // selected slot might no longer fit. Drop it so the Continue button
  // and the "Selected slot" panel can't carry a stale, now-invalid
  // selection forward. Same `slotFitStatus` source of truth used by
  // the slot tile so the two can never disagree. We also drop a
  // selection if the slot's day has rolled into the past — in that
  // case `selectedSlot` is undefined because past days are filtered
  // out of `visibleDays`.
  const selectedSlotFits =
    selected && !selectedSlot
      ? false
      : selectedSlot
        ? selectedSlot.status === "available"
        : true;
  useEffect(() => {
    if (selected && !selectedSlotFits) setSelected(null);
  }, [selected, selectedSlotFits]);

  const monthLabel = useMemo(() => {
    if (!week.length) return "";
    const first = week[0].month;
    const last = week[week.length - 1].month;
    return first === last ? first : `${first} – ${last}`;
  }, [week]);

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-['Inter'] flex justify-center overflow-y-auto">
      <div className="w-full max-w-2xl">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-8 md:p-10 flex flex-col">
          
          <div className="mb-6 flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Schedule your service</h1>
              <p className="text-sm text-slate-500 mt-2">
                Pick an arrival window that works for you.
              </p>
            </div>
            <div
              className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-200"
              data-testid="pill-timezone-desktop"
            >
              <Clock className="h-3.5 w-3.5" />
              {cityLabel} time
            </div>
          </div>

          {/* Access-window commitment — prominent, always shown.
              Copy and the optional "Change access method" nudge branch
              on the customer's access method (see comments above the
              `unattended` / `showChangeAccess` derivations). */}
          <div
            className="mb-6 rounded-xl border px-4 py-3 text-sm leading-relaxed"
            style={{ borderColor: "#FBCFE2", backgroundColor: "#FFF1F8", color: "#9D174D" }}
            data-testid="banner-access-commitment-desktop"
            data-access-mode={accessMode}
          >
            <div className="flex items-start gap-2.5">
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
                </div>
              ) : (
                <div>
                  The service will be carried out{" "}
                  <span className="font-semibold">sometime within the window</span>{" "}
                  you pick — there's no set arrival time.
                </div>
              )}
            </div>
            <div className="mt-2 flex justify-end gap-3">
              {showChangeAccess && (
                <button
                type="button"
                data-testid="button-change-access"
                className="text-xs font-semibold underline underline-offset-2 hover:opacity-80"
                style={{ color: "#9D174D" }}
              >
                Change access method
              </button>
            )}
            <button
              type="button"
              data-testid="button-edit-ac"
              className="text-xs font-semibold underline underline-offset-2 hover:opacity-80"
              style={{ color: "#9D174D" }}
            >
              Update AC info
            </button>
          </div>
          </div>

          {/* "Not sure" callout — only when AC step was answered "unsure". */}
          {isUnsure && (
            <div
              className="mb-6 rounded-xl border px-4 py-3 text-sm leading-relaxed"
              style={{ borderColor: "#FCD34D", backgroundColor: "#FFFBEB", color: "#92400E" }}
              data-testid="callout-unsure-desktop"
            >
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  You picked <span className="font-semibold">"Not sure"</span> on the AC
                  step, so we've sized your slot for one indoor unit. If we find more
                  on-site, the technician may not finish in one visit and Taylr will
                  book a second slot — which means{" "}
                  <span className="font-semibold" data-testid="nudge-accountability-desktop">
                    {accountabilityNudge}
                  </span>.{" "}
                  <span className="font-semibold">If you can confirm the AC details
                  now, you'll likely avoid that.</span>
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  data-testid="button-edit-ac"
                  className="rounded-full px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:opacity-90"
                  style={{ backgroundColor: "#B45309" }}
                >
                  Update AC info
                </button>
              </div>
            </div>
          )}

          <div className="flex-1">
            {/* Empty state: this customer's building hasn't been opened
                for AC bookings yet (no rollout exists for the building).
                Match the visual weight of the other callouts so it's
                impossible to miss, and give the customer a phone-back
                fallback. */}
            {!rollout && (
              <div
                className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center text-amber-900"
                data-testid="empty-no-rollout-desktop"
              >
                <div className="text-base font-semibold">
                  AC services aren't open for booking at this address yet.
                </div>
                <div className="mt-2 text-sm text-amber-800">
                  We're rolling this service out building by building. Call{" "}
                  <span className="font-medium" style={{ color: BRAND }}>
                    1300 TAYLR
                  </span>{" "}
                  and we'll add you to the waitlist.
                </div>
              </div>
            )}

            {/* Read-only "Already scheduled" panel — Task #49.
                When another party has already booked this customer's
                unit (paid OR invoice-pending), the picker is locked
                and Continue below is disabled.
                We deliberately do not surface ANY details of the
                existing booking here (no customer name, no contact
                details, no booked window/date, no booker role).
                Customer-facing surfaces should never expose another
                customer's data — even the booked date+window pair is
                identifying info about someone else. Anything beyond
                "this address is already scheduled, contact Taylr"
                should go through admin tooling. */}
            {rollout && lockedByOther && (
              <div
                className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-slate-700"
                data-testid="banner-locked-by-other-desktop"
                data-locked-kind={lockedByOther.kind}
              >
                <div className="flex items-start gap-3">
                  <Lock className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" />
                  <div className="flex-1">
                    <div className="text-base font-semibold text-slate-900">
                      Already scheduled for this address
                    </div>
                    <div className="mt-1.5 text-sm text-slate-600">
                      There's already a confirmed service booked at
                      this property, so it can't be booked again right
                      now. Only one confirmed booking is allowed per
                      service run.
                    </div>
                    <div className="mt-3 text-sm text-slate-600">
                      If you have any questions or believe this is a
                      mistake, contact Taylr at{" "}
                      <a
                        href="mailto:support@taylr.com.au"
                        className="font-medium underline"
                        style={{ color: BRAND }}
                        data-testid="link-locked-support-email-desktop"
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
            )}

            {rollout && !lockedByOther && (<>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-900">{monthLabel} 2026</span>
                <span className="text-xs text-slate-400">· Week {weekIdx + 1} of {weeks.length}</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={weekIdx === 0}
                  onClick={() => setWeekIdx(Math.max(0, weekIdx - 1))}
                  className="grid h-8 w-8 place-items-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  disabled={weekIdx >= weeks.length - 1}
                  onClick={() => setWeekIdx(Math.min(weeks.length - 1, weekIdx + 1))}
                  className="grid h-8 w-8 place-items-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-6 gap-3 mb-8">
              {week.map((d) => (
                <div key={d.date} className="flex flex-col items-center gap-2">
                  {/*
                    White background to match the mobile date pill — grey
                    would read as "unavailable" since that's how disabled
                    slot tiles look. No month-boundary highlight either:
                    the month label is already shown beneath the day, and
                    extra colour was distracting customers more than it
                    was helping them.
                  */}
                  <div className="flex h-[68px] w-full flex-col items-center justify-center rounded-xl border border-slate-200 bg-white">
                    <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{d.weekday}</div>
                    <div className="text-xl font-bold leading-tight text-slate-900">{d.day}</div>
                    <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{d.month}</div>
                  </div>
                </div>
              ))}
              {week.map((d) => (
                <DesktopSlotCard
                  key={`${d.date}-am`}
                  slot={d.morning}
                  icon={<Sunrise className="h-4 w-4" />}
                  label="Morning"
                  hint={WINDOW_TIME_RANGE.morning}
                  selected={selected === d.morning.id}
                  onClick={() => setSelected(d.morning.id)}
                />
              ))}
              {week.map((d) => (
                <DesktopSlotCard
                  key={`${d.date}-pm`}
                  slot={d.afternoon}
                  icon={<Sun className="h-4 w-4" />}
                  label="Afternoon"
                  hint={WINDOW_TIME_RANGE.afternoon}
                  selected={selected === d.afternoon.id}
                  onClick={() => setSelected(d.afternoon.id)}
                />
              ))}
            </div>

            {selectedSlot && selectedDay && (
              <div
                className="rounded-xl border p-4 flex items-center justify-between"
                style={{
                  borderColor: "rgba(95,187,151,0.45)",
                  backgroundColor: "rgba(95,187,151,0.08)",
                }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="grid h-10 w-10 place-items-center rounded-full text-white"
                    style={{ backgroundColor: SELECTED_GREEN }}
                  >
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-0.5">Selected window</div>
                    <div className="text-sm font-semibold text-slate-900">
                      {selectedDay.weekday} {selectedDay.day} {selectedDay.month} · <span className="capitalize">{selectedSlot.window} window</span>{" "}
                      <span className="text-slate-600 font-normal">({WINDOW_TIME_RANGE[selectedSlot.window]})</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
            </>)}
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
              disabled={!selected || !!lockedByOther}
              data-testid="button-continue-desktop"
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

function DesktopSlotCard({
  slot, icon, label, hint, selected, onClick,
}: {
  slot: Slot;
  icon: React.ReactNode;
  label: string;
  hint: string;
  selected: boolean;
  onClick: () => void;
}) {
  // Status is pre-computed by the rollout resolver so the picker
  // variants and the admin schedule editor always agree on what's
  // bookable. Customers see slots as plain selectable windows —
  // never minute math.
  const status = slot.status;
  const fits = status === "available";
  const disabled = !fits;
  const isSelected = selected && fits;

  // Customer view is intentionally binary: a window is either selectable
  // or it's greyed out — the customer sees no reason text. Internal admin
  // distinctions ("not yet open", "not enough time left for the job",
  // "fully booked") still drive the availability decision via
  // `slot.status`, but they are not surfaced to the customer (Task #61).

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      data-testid={`desktop-slot-${slot.id}`}
      aria-pressed={isSelected}
      className={`relative flex flex-col items-start gap-1 rounded-xl border px-3 py-3 text-left transition ${
        disabled
          ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
          : isSelected
            ? "text-white shadow-sm"
            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:shadow-sm"
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
        {isSelected && <CheckCircle2 className="h-4 w-4 text-white" />}
      </div>
      <div className="text-[13px] font-semibold">{label}</div>
      <div className={`text-[10px] ${disabled ? "text-slate-400" : isSelected ? "text-white/85" : "text-slate-500"}`}>{hint}</div>
    </button>
  );
}
