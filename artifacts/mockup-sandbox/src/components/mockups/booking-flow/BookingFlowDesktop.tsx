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
// Direct jumps to a specific step. Each entry maps a data-testid the
// inner iframe might emit to the StepId we should jump to. Today only
// the slot picker uses this — its "Update/Edit AC info" affordances
// take the customer straight back to the AC step (id 3) instead of
// making them tap "Back" twice.
const NAV_GOTO: Record<string, StepId> = {
  "button-edit-ac": 3,
};
// Step ids the wrapper should remember as "where the customer came
// from" when a NAV_GOTO jump fires from that step. Used to short-circuit
// the next "Continue" tap on the destination step so the customer is
// flung straight back instead of walked through the steps in between.
// Today only the slot picker (Step 5) uses this affordance.
const NAV_GOTO_RETURN_FROM: ReadonlySet<StepId> = new Set<StepId>([5]);

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
        if (fresh.return_to !== null && fresh.current_step === 3) {
          bookingActions.goToStep(fresh.return_to);
          return;
        }
        const next = nextStepId({ access_method: fresh.access_method }, fresh.current_step);
        bookingActions.goToStep(next);
      } else if (NAV_BACK.has(id)) {
        const fresh = getBookingSession();
        const prev = prevStepId({ access_method: fresh.access_method }, fresh.current_step);
        bookingActions.goToStep(prev);
      } else if (id in NAV_GOTO) {
        const target = NAV_GOTO[id];
        const fresh = getBookingSession();
        if (NAV_GOTO_RETURN_FROM.has(fresh.current_step)) {
          bookingActions.setReturnTo(fresh.current_step);
        }
        bookingActions.goToStep(target);
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

  // Submitted bookings get a dedicated confirmation that owns the full
  // viewport — same UX as the legacy BookingForm `Terminal` screen.
  // The stepper bar is suppressed because the user is no longer
  // navigating between steps.
  if (submitted) {
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
