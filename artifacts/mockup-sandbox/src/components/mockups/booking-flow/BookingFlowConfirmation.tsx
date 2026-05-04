/**
 * Confirmation screen rendered by the BookingFlow wrapper after a
 * terminal state is reached (spec §9). Replaces the step iframe
 * whenever any terminal flag is true on the booking session.
 *
 * Four variants, mirroring the standalone `BookingForm` terminal
 * screens plus the new "Unit unavailable" rejection path:
 *   - Scheduled: "Thank you for your order" — shows the chosen slot
 *     and the auto-generated order number front-and-centre.
 *   - Coordination: "Thank you for your order" — explains who Taylr
 *     will contact next (tenant / managing agent) instead of a slot,
 *     with the same prominent order-number block.
 *   - Cancelled: "Payment cancelled" — confirms no payment was taken
 *     and offers a "Try again" CTA back to Step 5 (spec §9 row
 *     "Payment cancelled").
 *   - Unit unavailable: "Unit unavailable" — explains the unit was
 *     just booked by someone else and offers a "Pick another unit"
 *     CTA that returns the customer to Step 1 with everything else
 *     preserved (spec §9 row "Unit unavailable").
 *
 * The two success variants surface the booking reference and a single
 * "Book another" button that calls `bookingActions.bookAnother()`. The
 * store action wipes the per-booking fields, keeps the booker's
 * identity, and resets `current_step` to 1 — so the wrapper re-mounts
 * the unit step iframe automatically once `submitted` flips back to
 * false.
 *
 * The cancelled variant has no reference (no booking exists yet) and
 * its CTA calls `bookingActions.tryAgainAfterCancel()` which clears
 * the cancelled flag and points the wrapper at Step 5 with all of the
 * customer's answers intact.
 *
 * The unit-unavailable variant similarly has no reference. Its CTA
 * calls `bookingActions.pickAnotherUnit()` which clears the flag,
 * wipes the unit selection, and returns to Step 1 — every other
 * answer (identity, AC, access, slot) is preserved so the customer
 * doesn't have to redo the whole flow.
 *
 * Shared between BookingFlowDesktop and BookingFlowMobile because the
 * design is intentionally device-agnostic (centred card on slate
 * background) — same as the legacy `TerminalShell` in `BookingForm`.
 */

import { type ReactNode, useEffect } from "react";
import { CheckCircle2, Wind, XCircle } from "lucide-react";
import { Button } from "../../ui/button";
import {
  bookingActions,
  useBookingSelector,
} from "../../../state/bookingSession";
import { isCoordinationFlow } from "../../../state/bookingDerived";
import { scheduleDisplay, unitLabel } from "../../../state/bookingHelpers";
import { liveBookingFromSession } from "../../../state/adminMockData";
import { persistProtoBooking } from "../../../state/protoStore";

const BRAND = "#ED017F";

/** Email used by the "Contact us" CTA on the unit-unavailable dead-end
 *  screen (Task #49). Mirrors the support inbox already shown on the
 *  customer-flow help links. */
const SUPPORT_EMAIL = "support@taylr.example";

type Variant = "scheduled" | "coordination" | "cancelled" | "unit_unavailable";

export function BookingFlowConfirmation() {
  const session = useBookingSelector((s) => s);
  const variant: Variant = session.unit_unavailable
    ? "unit_unavailable"
    : session.payment_cancelled
      ? "cancelled"
      : isCoordinationFlow(session)
        ? "coordination"
        : "scheduled";

  // Persist the completed booking to localStorage so the admin queue
  // picks it up live without a page refresh.  Fires once when the
  // booking reference is stamped (i.e. when the confirmation screen
  // first renders for a successful outcome).
  useEffect(() => {
    if (variant !== "scheduled" && variant !== "coordination") return;
    if (!session.reference) return;
    const booking = liveBookingFromSession(session);
    if (booking) persistProtoBooking(booking);
    // Only fire when the reference appears — re-running on every session
    // field change would produce duplicate writes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.reference]);

  const unit = unitLabel(session.unit_id);
  const schedule = scheduleDisplay(session);
  const email = session.contact_email || "your email";
  const showReference =
    (variant === "scheduled" || variant === "coordination") &&
    !!session.reference;

  let icon: ReactNode;
  let title: string;
  let body: ReactNode;
  let cta: ReactNode;

  switch (variant) {
    case "cancelled":
      icon = <XCircle className="h-7 w-7 text-rose-500" />;
      title = "Payment cancelled";
      body = (
        <>
          Your booking hasn&apos;t been confirmed. No payment has been taken.
          You can try again whenever you&apos;re ready.
        </>
      );
      cta = (
        <Button
          onClick={() => bookingActions.tryAgainAfterCancel()}
          className="text-white hover:opacity-90"
          style={{ backgroundColor: BRAND }}
          data-testid="button-try-again"
        >
          Try again
        </Button>
      );
      break;

    case "unit_unavailable": {
      // Task #49 review: surface the booker context the uniqueness
      // guard handed us so the customer knows *who* won the race and
      // when, plus a "Contact us" CTA for help. The "Pick another
      // unit" button is kept as a secondary option.
      const blocker = session.unit_unavailable_blocker;
      const blockerName = blocker?.name?.trim() || null;
      const blockerRoleLabel =
        blocker?.role === "agent" ? "the managing agent" : "the unit owner";
      const slotLabel =
        blocker?.slot === "morning"
          ? "morning"
          : blocker?.slot === "afternoon"
            ? "afternoon"
            : null;
      const subject = encodeURIComponent(
        `Help with unit booking · ${unit.line1 ?? ""}`.trim(),
      );
      const mailtoBody = encodeURIComponent(
        `Hi Taylr,\n\nI tried to book ${[unit.line1, unit.line2]
          .filter(Boolean)
          .join(", ")} but it shows as already booked${
          blockerName ? ` by ${blockerName}` : ""
        }. Can you help?\n\nThanks,`,
      );
      icon = <XCircle className="h-7 w-7 text-rose-500" />;
      title = "Unit already booked";
      body = (
        <>
          Sorry — this unit was just booked by someone else, so we
          couldn&apos;t confirm your booking. No payment has been taken.
          {blockerName && (
            <div
              className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-left text-xs text-slate-700"
              data-testid="panel-blocker-context"
            >
              <div className="font-semibold text-slate-900">
                {blockerName}{" "}
                <span className="text-slate-500">({blockerRoleLabel})</span>
              </div>
              <div className="mt-0.5">
                booked the{" "}
                {slotLabel ? (
                  <>
                    <span className="font-medium text-slate-900">
                      {slotLabel}
                    </span>{" "}
                    window
                  </>
                ) : (
                  "service"
                )}
                {blocker?.date && (
                  <>
                    {" "}
                    on{" "}
                    <span className="font-medium text-slate-900">
                      {blocker.date}
                    </span>
                  </>
                )}
                .
              </div>
            </div>
          )}
          <div className="mt-3 text-xs text-slate-500">
            {[unit.line1, unit.line2].filter(Boolean).join(", ")}
          </div>
          <div className="mt-4 text-sm text-slate-600">
            Think this is a mistake? Get in touch and we&apos;ll sort it
            out for you.
          </div>
        </>
      );
      cta = (
        <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
          <Button
            asChild
            className="text-white hover:opacity-90"
            style={{ backgroundColor: BRAND }}
            data-testid="button-contact-us"
          >
            <a href={`mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${mailtoBody}`}>
              Contact us
            </a>
          </Button>
          <Button
            variant="outline"
            onClick={() => bookingActions.pickAnotherUnit()}
            data-testid="button-pick-another-unit"
          >
            Pick another unit
          </Button>
        </div>
      );
      break;
    }

    case "coordination":
      icon = <CheckCircle2 className="h-7 w-7 text-[#ED017F]" />;
      title = "Thank you for your order";
      body = (
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
      );
      cta = (
        <Button
          variant="outline"
          onClick={() => bookingActions.bookAnother()}
          data-testid="button-book-another-coord"
        >
          Book another
        </Button>
      );
      break;

    case "scheduled":
    default:
      icon = <CheckCircle2 className="h-7 w-7 text-[#ED017F]" />;
      title = "Thank you for your order";
      body = (
        <>
          Thanks! Your AC service is scheduled for{" "}
          <strong>{schedule.primary}</strong>
          {schedule.secondary ? (
            <>
              {" "}
              in the <strong>{schedule.secondary}</strong>
            </>
          ) : null}
          . Our technician will arrive within that window. We&apos;ve sent a
          confirmation email to <strong>{email}</strong>.
          <div className="mt-3 text-xs text-slate-500">
            {[unit.line1, unit.line2].filter(Boolean).join(", ")}
          </div>
        </>
      );
      cta = (
        <Button
          variant="outline"
          onClick={() => bookingActions.bookAnother()}
          data-testid="button-book-another"
        >
          Book another
        </Button>
      );
      break;
  }

  return (
    <div className="h-full w-full overflow-y-auto bg-slate-50 font-['Roboto']">
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
            {icon}
          </div>
          <h1
            className="mt-4 text-2xl font-semibold text-slate-900"
            data-testid="text-terminal-title"
          >
            {title}
          </h1>
          {showReference && (
            <div
              className="mx-auto mt-4 inline-flex flex-col items-center gap-1 rounded-xl border border-pink-200 bg-pink-50/60 px-5 py-3"
              data-testid="block-order-reference"
            >
              <span className="text-[11px] font-semibold uppercase tracking-wider text-pink-600">
                Order number
              </span>
              <span
                className="font-mono text-lg font-bold text-slate-900"
                data-testid="text-reference"
              >
                {session.reference}
              </span>
            </div>
          )}
          <div
            className="mt-4 text-sm text-slate-600"
            data-testid="text-terminal-body"
          >
            {body}
          </div>
          <div className="mt-6 flex justify-center">{cta}</div>
        </div>
      </main>
    </div>
  );
}
