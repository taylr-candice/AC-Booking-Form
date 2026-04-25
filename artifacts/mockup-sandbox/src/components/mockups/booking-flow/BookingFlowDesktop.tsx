import { useCallback, useEffect, useRef } from "react";
import {
  Building2,
  UserCircle,
  Mail,
  Wind,
  KeyRound,
  CalendarRange,
  CreditCard,
  Check,
} from "lucide-react";
import {
  bookingActions,
  getBookingSession,
  useBookingSelector,
  type StepId,
} from "../../../state/bookingSession";
import {
  nextStepId,
  prevStepId,
  totalSteps,
  visibleIndex,
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
  short: string;
  icon: React.ComponentType<{ className?: string }>;
  url: string;
};

const STEPS: readonly Step[] = [
  { id: 1, label: "Pick a unit",       short: "Unit",    icon: Building2,     url: "/__mockup/preview/booking-pages/UnitDesktop" },
  { id: 2, label: "Your role",         short: "Role",    icon: UserCircle,    url: "/__mockup/preview/booking-pages/RoleDesktop" },
  { id: 3, label: "Your details",      short: "Booker",  icon: Mail,          url: "/__mockup/preview/booking-pages/BookerDesktop" },
  { id: 4, label: "Your AC",           short: "AC",      icon: Wind,          url: "/__mockup/preview/booking-pages/AcDesktop" },
  { id: 5, label: "Property access",   short: "Access",  icon: KeyRound,      url: "/__mockup/preview/booking-pages/AccessDesktop" },
  { id: 6, label: "Pick a slot",       short: "Slot",    icon: CalendarRange, url: "/__mockup/preview/booking-slots/SlotsDesktop" },
  { id: 7, label: "Review & pay",      short: "Pay",     icon: CreditCard,    url: "/__mockup/preview/booking-pages/PayDesktop" },
];

export function BookingFlowDesktop() {
  const active = useBookingSelector((s) => s.current_step);
  const accessMethod = useBookingSelector((s) => s.access_method);
  const visible = visibleSteps({ access_method: accessMethod });
  const total = totalSteps({ access_method: accessMethod });
  const position = visibleIndex({ access_method: accessMethod }, active);

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
      {/* Top stepper bar */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <div className="flex items-center gap-3">
          <div
            className="grid h-9 w-9 place-items-center rounded-lg"
            style={{ backgroundColor: BRAND }}
          >
            <Wind className="h-5 w-5 text-white" />
          </div>
          <div className="leading-tight">
            <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
              Demo flow
            </div>
            <div className="text-sm font-semibold text-slate-900">
              Book a service · use the in-page Continue button
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {visible.map((stepId, idx) => {
            const step = STEPS.find((s) => s.id === stepId)!;
            const isActive = stepId === active;
            const activePos = visible.indexOf(active);
            const isComplete = activePos !== -1 && idx < activePos;
            const Icon = step.icon;
            return (
              <div key={stepId} className="flex items-center">
                <button
                  type="button"
                  onClick={() => bookingActions.goToStep(stepId)}
                  data-testid={`step-pill-${stepId}`}
                  className={`group flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-medium transition ${
                    isActive
                      ? "text-white shadow-sm"
                      : isComplete
                        ? "text-emerald-700 hover:bg-emerald-50"
                        : "text-slate-500 hover:bg-slate-100"
                  }`}
                  style={
                    isActive
                      ? { backgroundColor: BRAND }
                      : isComplete
                        ? { backgroundColor: "#ECFDF5" }
                        : undefined
                  }
                >
                  <span
                    className={`grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold ${
                      isActive
                        ? "bg-white/25 text-white"
                        : isComplete
                          ? "text-white"
                          : "bg-slate-200 text-slate-600 group-hover:bg-slate-300"
                    }`}
                    style={isComplete ? { backgroundColor: COMPLETE } : undefined}
                  >
                    {isComplete ? <Check className="h-3 w-3" /> : idx + 1}
                  </span>
                  <span className="hidden md:inline">{step.short}</span>
                  <Icon className="h-3.5 w-3.5 md:hidden" />
                </button>
                {idx < visible.length - 1 && (
                  <span className="mx-0.5 h-px w-3 bg-slate-200" />
                )}
              </div>
            );
          })}
        </div>

        <div className="text-[11px] text-slate-500">
          Step <span className="font-semibold text-slate-900">{position}</span> of {total}
        </div>
      </div>

      {/* Step viewport */}
      <div className="relative flex-1 overflow-hidden bg-slate-100">
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
