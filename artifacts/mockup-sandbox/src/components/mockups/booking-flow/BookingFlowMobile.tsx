import { useCallback, useEffect, useRef } from "react";
import {
  bookingActions,
  getBookingSession,
  useBookingSelector,
  type StepId,
} from "../../../state/bookingSession";
import {
  nextStepId,
  prevStepId,
  visibleSteps,
} from "../../../state/bookingDerived";
import { BookingFlowConfirmation } from "./BookingFlowConfirmation";

const BRAND = "#ED017F";

const NAV_FORWARD = new Set([
  "button-continue",
  "button-continue-mobile",
  "button-continue-desktop",
  "button-pay",
]);
const NAV_BACK = new Set([
  "button-back",
  "button-back-mobile",
  "button-back-desktop",
]);
// data-testid emitted by the slot picker's "Update/Edit AC info"
// affordance. Handled separately from NAV_FORWARD/NAV_BACK because
// we need to do two extra things atomically with the navigation:
//   1. Stash a `return_to` hint so the next "Continue" on the AC step
//      flings the customer straight back to where they came from
//      instead of walking them through the intermediate steps.
//   2. Record the origin (so the AC step can render its contextual
//      "you came back to confirm AC details" banner) — the
//      `editAcFromSlotPicker` action does the navigation + origin
//      writes atomically.
const TESTID_EDIT_AC = "button-edit-ac";
// data-testid emitted by the slot picker's "Change access method"
// affordance — only shown when the customer picked an "I'll be
// there" option. Same edit-jump pattern as `TESTID_EDIT_AC`: stash a
// `return_to` hint so confirming the new access method flings them
// straight back to the slot picker, then jump to Step 3.
const TESTID_CHANGE_ACCESS = "button-change-access";
// Step ids the wrapper should remember as "where the customer came
// from" when an edit-jump affordance fires from that step. Used to
// short-circuit the next "Continue" tap on the destination step so
// the customer is flung straight back instead of walked through the
// steps in between. Today only the slot picker (Step 4) uses these
// affordances.
const NAV_GOTO_RETURN_FROM: ReadonlySet<StepId> = new Set<StepId>([4]);
// Destination steps for the edit-jump short-circuit on Continue. When
// the customer hits Continue on one of these steps with `return_to`
// set, the wrapper flings them back to `return_to` instead of taking
// the normal forward path. Step 2 covers the AC edit-jump; Step 3
// covers the access-method edit-jump.
const NAV_GOTO_RETURN_TO_DESTS: ReadonlySet<StepId> = new Set<StepId>([2, 3]);

type Step = {
  id: StepId;
  label: string;
  url: string;
};

const STEPS: readonly Step[] = [
  { id: 1, label: "Pick a unit",     url: "/__mockup/preview/booking-pages/UnitMobile" },
  { id: 2, label: "Your AC",         url: "/__mockup/preview/booking-pages/AcMobile" },
  { id: 3, label: "Property access", url: "/__mockup/preview/booking-pages/AccessMobile" },
  { id: 4, label: "Pick a slot",     url: "/__mockup/preview/booking-slots/SlotsMobile" },
  { id: 5, label: "Review & pay",    url: "/__mockup/preview/booking-pages/PayMobile" },
];

export function BookingFlowMobile() {
  const active = useBookingSelector((s) => s.current_step);
  const accessMethod = useBookingSelector((s) => s.access_method);
  const submitted = useBookingSelector((s) => s.submitted);
  const paymentCancelled = useBookingSelector((s) => s.payment_cancelled);
  const unitUnavailable = useBookingSelector((s) => s.unit_unavailable);
  const current = STEPS.find((s) => s.id === active) ?? STEPS[0];
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const listenerRef = useRef<{ doc: Document; handler: (e: Event) => void } | null>(null);

  const handleIframeLoad = useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    if (listenerRef.current) {
      listenerRef.current.doc.removeEventListener("click", listenerRef.current.handler);
      listenerRef.current = null;
    }
    const handler = (e: Event) => {
      const target = e.target as Element | null;
      const btn = target?.closest("button[data-testid]") as HTMLButtonElement | null;
      // Use tagName instead of instanceof — cross-realm iframe buttons fail instanceof checks.
      if (!btn || btn.tagName !== "BUTTON" || btn.disabled) return;
      const id = btn.getAttribute("data-testid") || "";
      if (NAV_FORWARD.has(id)) {
        // Read latest state — the iframe may have just written to it.
        const fresh = getBookingSession();
        // Short-circuit: if the customer came here via an edit-jump
        // (e.g. "Update AC info" or "Change access method" from the
        // slot picker) and is now tapping Continue on that jump's
        // destination, fling them straight back to where they came
        // from instead of walking them through the intermediate
        // steps. `goToStep` clears `return_to` automatically once
        // they land.
        if (
          fresh.return_to !== null &&
          NAV_GOTO_RETURN_TO_DESTS.has(fresh.current_step)
        ) {
          // Only honour the hint if the hinted step is still in the
          // customer's visible flow. Otherwise the hint is stale —
          // e.g. they tapped "Change access method" from Step 4
          // (return_to=4), then on Step 3 swapped to a coordination
          // method that hides Step 4. In that case clear the hint
          // and fall through to normal forward navigation, which
          // takes them to the correct next visible step (Step 5).
          const visible = visibleSteps({ access_method: fresh.access_method });
          if (visible.includes(fresh.return_to)) {
            bookingActions.goToStep(fresh.return_to);
            return;
          }
        bookingActions.setReturnTo(null);
      }
      const next = nextStepId({ access_method: fresh.access_method }, fresh.current_step);
        bookingActions.goToStep(next);
      } else if (NAV_BACK.has(id)) {
        const fresh = getBookingSession();
        const prev = prevStepId({ access_method: fresh.access_method }, fresh.current_step);
        bookingActions.goToStep(prev);
      } else if (id === TESTID_EDIT_AC) {
        const fresh = getBookingSession();
        if (NAV_GOTO_RETURN_FROM.has(fresh.current_step)) {
          bookingActions.setReturnTo(fresh.current_step);
        }
        bookingActions.editAcFromSlotPicker();
      } else if (
        id === TESTID_CHANGE_ACCESS ||
        id.startsWith(`${TESTID_CHANGE_ACCESS}-`) ||
        id.startsWith("button-edit-access-")
      ) {
        // Slot-picker → access-step edit jump. The `startsWith` branches
        // accept the suffixed testids emitted by `SlotsAccessBanner`
        // (`button-change-access-mobile`, `button-edit-access-mobile`, etc.)
        // so both "Change access method" and "Edit access" links in the
        // banner trigger the same return-to-aware navigation.
        const fresh = getBookingSession();
        if (NAV_GOTO_RETURN_FROM.has(fresh.current_step)) {
          bookingActions.setReturnTo(fresh.current_step);
        }
        bookingActions.goToStep(3);
      }
    };
    doc.addEventListener("click", handler);
    listenerRef.current = { doc, handler };
  }, []);

  useEffect(() => {
    return () => {
      if (listenerRef.current) {
        listenerRef.current.doc.removeEventListener("click", listenerRef.current.handler);
        listenerRef.current = null;
      }
    };
  }, []);

  // Terminal states (submitted OR payment_cancelled OR
  // unit_unavailable) get a dedicated confirmation that owns the full
  // viewport — same UX as the legacy BookingForm `Terminal` screen.
  // The step bar is suppressed because the user is no longer
  // navigating between steps. The confirmation component picks the
  // right variant from the session (confirmed / coordination /
  // cancelled / unit_unavailable).
  if (submitted || paymentCancelled || unitUnavailable) {
    return (
      <div className="h-screen w-screen overflow-hidden bg-slate-50 font-['Inter']">
        <BookingFlowConfirmation />
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50 font-['Inter']">
      {/* Step viewport */}
      <div className="relative flex-1 overflow-hidden bg-white">
        <iframe
          key={current.id}
          ref={iframeRef}
          src={current.url}
          title={`Step ${current.id} · ${current.label}`}
          data-testid={`flow-iframe-${current.id}`}
          onLoad={handleIframeLoad}
          className="h-full w-full border-0 bg-white"
        />
      </div>
    </div>
  );
}

