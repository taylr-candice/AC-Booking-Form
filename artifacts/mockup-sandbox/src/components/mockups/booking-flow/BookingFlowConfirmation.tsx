/**
 * Confirmation screen rendered by the BookingFlow wrapper after a
 * successful submission (spec §9). Replaces the step iframe whenever
 * `submitted === true` in the booking session.
 *
 * Two variants, mirroring the older standalone `BookingForm` terminal
 * screens:
 *   - Scheduled: "Booking confirmed" — shows the chosen slot.
 *   - Coordination: "Payment received" — explains who Taylr will
 *     contact next (tenant / managing agent) instead of a slot.
 *
 * Both variants surface the booking reference and a single "Book
 * another" button that calls `bookingActions.bookAnother()`. The store
 * action wipes the per-booking fields, keeps the booker's identity,
 * and resets `current_step` to 1 — so the wrapper re-mounts the unit
 * step iframe automatically once `submitted` flips back to false.
 *
 * Shared between BookingFlowDesktop and BookingFlowMobile because the
 * design is intentionally device-agnostic (centred card on slate
 * background) — same as the legacy `TerminalShell` in `BookingForm`.
 */

import { CheckCircle2, Wind } from "lucide-react";
import { Button } from "../../ui/button";
import {
  bookingActions,
  useBookingSelector,
} from "../../../state/bookingSession";
import { isCoordinationFlow } from "../../../state/bookingDerived";
import { scheduleDisplay, unitLabel } from "../../../state/bookingHelpers";

const BRAND = "#ED017F";

export function BookingFlowConfirmation() {
  const session = useBookingSelector((s) => s);
  const isCoordination = isCoordinationFlow(session);
  const unit = unitLabel(session.unit_id);
  const schedule = scheduleDisplay(session);
  const email = session.contact_email || "your email";

  return (
    <div className="h-full w-full overflow-y-auto bg-slate-50 font-['Inter']">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2">
            <div
              className="grid h-9 w-9 place-items-center rounded-lg text-white"
              style={{ backgroundColor: BRAND }}
            >
              <Wind className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold text-slate-900">Taylr</div>
              <div className="text-xs text-slate-500">AC service booking</div>
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-xl px-5 py-12">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-slate-50">
            <CheckCircle2 className="h-7 w-7 text-emerald-500" />
          </div>
          <h1
            className="mt-4 text-xl font-semibold text-slate-900"
            data-testid="text-terminal-title"
          >
            {isCoordination ? "Payment received" : "Booking confirmed"}
          </h1>
          <div
            className="mt-2 text-sm text-slate-600"
            data-testid="text-terminal-body"
          >
            {isCoordination ? (
              <>
                Thanks! We&apos;ll now contact{" "}
                {session.access_method === "owner_leased_agent"
                  ? "the managing agent"
                  : "your tenant(s)"}{" "}
                to arrange a service time. You&apos;ll be emailed at{" "}
                <strong>{email}</strong> once a date is confirmed.
                <div className="mt-3 text-xs text-slate-500">
                  {[unit.line1, unit.line2].filter(Boolean).join(", ")}
                </div>
              </>
            ) : (
              <>
                Thanks! Your AC service is scheduled for{" "}
                <strong>{schedule.primary}</strong>
                {schedule.secondary ? (
                  <>
                    {" "}
                    in the <strong>{schedule.secondary}</strong>
                  </>
                ) : null}
                . Our technician will arrive within that window. We&apos;ve
                sent a confirmation email to <strong>{email}</strong>.
                <div className="mt-3 text-xs text-slate-500">
                  {[unit.line1, unit.line2].filter(Boolean).join(", ")}
                </div>
              </>
            )}
          </div>
          {session.reference && (
            <div className="mt-5 inline-flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <span>Reference</span>
              <span
                className="font-mono font-semibold text-slate-900"
                data-testid="text-reference"
              >
                {session.reference}
              </span>
            </div>
          )}
          <div className="mt-6 flex justify-center">
            <Button
              variant="outline"
              onClick={() => bookingActions.bookAnother()}
              data-testid={
                isCoordination
                  ? "button-book-another-coord"
                  : "button-book-another"
              }
            >
              Book another
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
