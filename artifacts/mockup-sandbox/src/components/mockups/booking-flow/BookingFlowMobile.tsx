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

type Step = {
  id: StepId;
  label: string;
  url: string;
};

const STEPS: readonly Step[] = [
  { id: 1, label: "Pick a unit",     url: "/__mockup/preview/booking-pages/UnitMobile" },
  { id: 2, label: "Your details",    url: "/__mockup/preview/booking-pages/BookerMobile" },
  { id: 3, label: "Your AC",         url: "/__mockup/preview/booking-pages/AcMobile" },
  { id: 4, label: "Property access", url: "/__mockup/preview/booking-pages/AccessMobile" },
  { id: 5, label: "Pick a slot",     url: "/__mockup/preview/booking-slots/SlotsMobile" },
  { id: 6, label: "Review & pay",    url: "/__mockup/preview/booking-pages/PayMobile" },
];

export function BookingFlowMobile() {
  const active = useBookingSelector((s) => s.current_step);
  const accessMethod = useBookingSelector((s) => s.access_method);
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
      // Use tagName instead of instanceof — cross-realm iframe buttons fail instanceof checks.
      if (!btn || btn.tagName !== "BUTTON" || btn.disabled) return;
      const id = btn.getAttribute("data-testid") || "";
      if (NAV_FORWARD.has(id)) {
        // Read latest state — the iframe may have just written to it.
        const fresh = getBookingSession();
        const next = nextStepId({ access_method: fresh.access_method }, fresh.current_step);
        bookingActions.goToStep(next);
      } else if (NAV_BACK.has(id)) {
        const fresh = getBookingSession();
        const prev = prevStepId({ access_method: fresh.access_method }, fresh.current_step);
        bookingActions.goToStep(prev);
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

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50 font-['Inter']">
      {/* Top step bar */}
      <div className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center">
          {visible.map((stepId, idx) => {
            const isActive = stepId === active;
            const activePos = visible.indexOf(active);
            const isComplete = activePos !== -1 && idx < activePos;
            return (
              <div key={stepId} className="contents">
                <button
                  type="button"
                  onClick={() => bookingActions.goToStep(stepId)}
                  aria-label={`Step ${idx + 1}`}
                  data-testid={`step-dot-${stepId}`}
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-semibold transition ${
                    isActive || isComplete ? "text-white" : "bg-slate-200 text-slate-500"
                  }`}
                  style={
                    isActive
                      ? { backgroundColor: BRAND }
                      : isComplete
                        ? { backgroundColor: COMPLETE }
                        : undefined
                  }
                >
                  {isComplete ? <Check className="h-3 w-3" /> : idx + 1}
                </button>
                {idx < visible.length - 1 && (
                  <div
                    className="mx-1 h-0.5 flex-1 rounded-full"
                    style={{
                      backgroundColor: isComplete
                        ? "rgba(95,187,151,0.45)"
                        : "#E2E8F0",
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

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

