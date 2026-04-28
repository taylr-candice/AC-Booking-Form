import { useCallback, useEffect, useRef } from "react";
import { Check } from "lucide-react";
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
const COMPLETE = "#5FBB97";

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
// Sibling affordance to TESTID_EDIT_AC: jumps the customer back to
// Step 4 (Property access) so they can swap to a hands-off access
// option (parcel locker / leave a key / coordinate with tenant) and
// not have to be home for the entire booking window. Lives in the
// slot picker's "Heads up" access banner.
const TESTID_EDIT_ACCESS = "button-edit-access";
// Step ids the wrapper should remember as "where the customer came
// from" when the edit-AC / edit-access affordance fires from that
// step. Used to short-circuit the next "Continue" tap on the
// destination step so the customer is flung straight back instead
// of walked through the steps in between. Today only the slot
// picker (Step 5) uses these affordances.
const NAV_GOTO_RETURN_FROM: ReadonlySet<StepId> = new Set<StepId>([5]);
// Step ids that should consume a `return_to` hint when the customer
// taps Continue. Edit-AC lands the customer on Step 3, edit-access
// lands them on Step 4 — both should fling them straight back to
// the hinted step (Step 5 in practice) on Continue.
const NAV_GOTO_RETURN_TO: ReadonlySet<StepId> = new Set<StepId>([3, 4]);

type Step = {
  id: StepId;
  label: string;
  url: string;
};

const STEPS: readonly Step[] = [
  { id: 1, label: "Pick a unit",     url: "/__mockup/preview/booking-pages/UnitDesktop" },
  { id: 2, label: "Your details",    url: "/__mockup/preview/booking-pages/BookerDesktop" },
  { id: 3, label: "Your AC",         url: "/__mockup/preview/booking-pages/AcDesktop" },
  { id: 4, label: "Property access", url: "/__mockup/preview/booking-pages/AccessDesktop" },
  { id: 5, label: "Pick a slot",     url: "/__mockup/preview/booking-slots/SlotsDesktop" },
  { id: 6, label: "Review & pay",    url: "/__mockup/preview/booking-pages/PayDesktop" },
];

export function BookingFlowDesktop() {
  const active = useBookingSelector((s) => s.current_step);
  const accessMethod = useBookingSelector((s) => s.access_method);
  const submitted = useBookingSelector((s) => s.submitted);
  const paymentCancelled = useBookingSelector((s) => s.payment_cancelled);
  const unitUnavailable = useBookingSelector((s) => s.unit_unavailable);
  const visible = visibleSteps({ access_method: accessMethod });

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
      if (!btn || btn.tagName !== "BUTTON" || btn.disabled) return;
      const id = btn.getAttribute("data-testid") || "";
      if (NAV_FORWARD.has(id)) {
        const fresh = getBookingSession();
        // Short-circuit: if the customer came here via a NAV_GOTO jump
        // (e.g. "Update AC info" from the slot picker) and is now
        // tapping Continue on that hinted-from step's destination,
        // fling them straight back to where they came from instead of
        // walking them through the intermediate steps. `goToStep`
        // clears `return_to` automatically once they land.
        if (fresh.return_to !== null && NAV_GOTO_RETURN_TO.has(fresh.current_step)) {
          // Only honour the hint if the hinted step is still in the
          // customer's visible flow. Otherwise the hint is stale —
          // e.g. they tapped "Change access option" from Step 5
          // (return_to=5), then on Step 4 swapped to a coordination
          // method that hides Step 5. In that case clear the hint
          // and fall through to normal forward navigation, which
          // takes them to the correct next visible step (Step 6).
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
      } else if (id === TESTID_EDIT_ACCESS) {
        const fresh = getBookingSession();
        if (NAV_GOTO_RETURN_FROM.has(fresh.current_step)) {
          bookingActions.setReturnTo(fresh.current_step);
        }
        bookingActions.goToStep(4);
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
  // The stepper bar is suppressed because the user is no longer
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
      {/* Top stepper bar */}
      <div className="flex h-12 shrink-0 items-center justify-center border-b border-slate-200/50 bg-slate-50 px-6">
        <div className="flex items-center">
          {visible.map((stepId, idx) => {
            const isActive = stepId === active;
            const activePos = visible.indexOf(active);
            const isComplete = activePos !== -1 && idx < activePos;
            return (
              <div key={stepId} className="flex items-center">
                <button
                  type="button"
                  onClick={() => bookingActions.goToStep(stepId)}
                  data-testid={`step-pill-${stepId}`}
                  className="grid h-6 w-6 place-items-center rounded-full text-[10px] font-bold transition-colors"
                  style={{
                    backgroundColor: isActive ? BRAND : isComplete ? COMPLETE : "#E2E8F0",
                    color: isActive || isComplete ? "#fff" : "#64748B",
                  }}
                >
                  {isComplete ? <Check className="h-3.5 w-3.5" /> : idx + 1}
                </button>
                {idx < visible.length - 1 && (
                  <div 
                    className="mx-1.5 h-px w-6" 
                    style={{ backgroundColor: isComplete ? "#5FBB97" : "#E2E8F0" }} 
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Step viewport */}
      <div className="relative flex-1 overflow-hidden bg-slate-50">
        <iframe
          key={current.id}
          ref={iframeRef}
          src={current.url}
          title={`Step ${current.id} · ${current.label}`}
          data-testid={`flow-iframe-${current.id}`}
          onLoad={handleIframeLoad}
          className="h-full w-full border-0 bg-slate-50"
        />
      </div>
    </div>
  );
}
