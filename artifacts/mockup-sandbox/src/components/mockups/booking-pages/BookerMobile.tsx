import React, { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Briefcase,
  CheckCircle2,
  ChevronDown,
} from "lucide-react";
import { bookingActions, useBookingSelector } from "../../../state/bookingSession";
import { DEMO_MANAGING_AGENCIES } from "../../../state/accessMethodCatalog";

const BRAND = "#ED017F";
const ERROR_PURPLE = "#9747FF";

function validateEmail(v: string): string | null {
  const t = v.trim();
  if (!t) return "Email is required";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return "Please enter a valid email";
  return null;
}

function validatePhone(v: string): string | null {
  const digits = v.replace(/\D/g, "");
  if (!digits) return "Mobile is required";
  if (digits.length < 10) return "Mobile must be at least 10 digits";
  return null;
}

function validateRequired(v: string, label: string): string | null {
  if (!v.trim()) return `${label} is required`;
  return null;
}

function FieldError({ id, message }: { id: string; message: string | null }) {
  if (!message) return null;
  return (
    <div
      id={id}
      role="alert"
      aria-live="polite"
      className="mt-1.5 flex items-start gap-1.5 text-[12px] font-medium"
      style={{ color: ERROR_PURPLE }}
    >
      <AlertCircle className="h-3.5 w-3.5 mt-px shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

const baseInputClass =
  "w-full rounded-xl border bg-white px-3 py-2.5 text-[15px] text-slate-900 outline-none";

function inputClassFor(hasError: boolean) {
  return `${baseInputClass} ${
    hasError ? "" : "border-slate-200 focus:border-slate-400"
  }`;
}

function errorStyle(hasError: boolean): React.CSSProperties | undefined {
  return hasError
    ? { borderColor: ERROR_PURPLE, boxShadow: `0 0 0 1px ${ERROR_PURPLE}` }
    : undefined;
}

export function BookerMobile() {
  const role = useBookingSelector((s) => s.role);
  const agencyId = useBookingSelector((s) => s.agency_id);
  const isAgent = role === "agent";

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");

  const [touched, setTouched] = useState({
    agency: false,
    firstName: false,
    lastName: false,
    email: false,
    mobile: false,
  });

  const [agencyOpen, setAgencyOpen] = useState(false);
  const selectedAgency = DEMO_MANAGING_AGENCIES.find((a) => a.id === agencyId);

  // Reset agency-related transient UI state when role flips off "agent" so
  // re-entering agent mode doesn't show a leftover error or auto-open the
  // dropdown before the user has interacted.
  useEffect(() => {
    if (!isAgent) {
      setTouched((t) => (t.agency ? { ...t, agency: false } : t));
      setAgencyOpen(false);
    }
  }, [isAgent]);

  const errors = {
    agency: isAgent && !agencyId ? "Please select your agency" : null,
    firstName: validateRequired(firstName, "First name"),
    lastName: validateRequired(lastName, "Last name"),
    email: validateEmail(email),
    mobile: validatePhone(mobile),
  };

  const showErr = (field: keyof typeof touched) =>
    touched[field] && !!errors[field];

  const isValid = Object.values(errors).every((e) => !e);

  const markTouched = (field: keyof typeof touched) =>
    setTouched((t) => ({ ...t, [field]: true }));

  const errorIds = {
    agency: "booker-agency-mobile-error",
    firstName: "booker-first-mobile-error",
    lastName: "booker-last-mobile-error",
    email: "booker-email-mobile-error",
    mobile: "booker-mobile-mobile-error",
  } as const;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-white font-['Inter']">
      {/* Page header */}
      <div className="flex items-start justify-between px-5 pb-4 pt-5">
        <div>
          <h1 className="text-[26px] font-semibold leading-tight text-slate-900">
            Your details
          </h1>
          <div className="mt-0.5 text-xs font-semibold tracking-wide uppercase text-slate-500">
            Step 3 of 7
          </div>
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

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 pb-6">
        <p className="mb-6 text-[15px] leading-relaxed text-slate-600">
          {isAgent
            ? "Pick your agency, then enter your contact details so we can reach you."
            : "We'll use these details to send your booking confirmation and tax invoice."}
        </p>

        {isAgent && (
          <div className="mb-6">
            <label
              id="booker-agency-mobile-label"
              className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500"
            >
              Your agency
            </label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setAgencyOpen((o) => !o)}
                onBlur={() => markTouched("agency")}
                data-testid="select-agency"
                aria-labelledby="booker-agency-mobile-label"
                aria-haspopup="listbox"
                aria-expanded={agencyOpen}
                aria-invalid={showErr("agency")}
                aria-describedby={showErr("agency") ? errorIds.agency : undefined}
                className={`flex w-full items-center justify-between gap-3 rounded-xl border bg-white px-4 py-3.5 text-left shadow-sm transition ${
                  showErr("agency") ? "" : "border-slate-300 hover:border-slate-400"
                }`}
                style={errorStyle(showErr("agency"))}
              >
                <div className="min-w-0 flex-1">
                  {selectedAgency ? (
                    <div className="truncate text-[15px] font-semibold text-slate-900">
                      {selectedAgency.name}
                    </div>
                  ) : (
                    <span className="text-[15px] text-slate-400">Select your agency…</span>
                  )}
                </div>
                <ChevronDown
                  className={`h-5 w-5 shrink-0 text-slate-400 transition-transform ${
                    agencyOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {agencyOpen && (
                <div className="absolute inset-x-0 top-full z-20 mt-2 max-h-[360px] overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
                  {DEMO_MANAGING_AGENCIES.map((a) => {
                    const active = a.id === agencyId;
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          bookingActions.setAgency(a.id);
                          setAgencyOpen(false);
                          markTouched("agency");
                        }}
                        data-testid={`dropdown-agency-${a.id}`}
                        className={`flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition ${
                          active ? "bg-pink-50" : "hover:bg-slate-50"
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div
                            className={`truncate text-[14px] font-semibold ${
                              active ? "text-pink-700" : "text-slate-900"
                            }`}
                          >
                            {a.name}
                          </div>
                        </div>
                        {active && (
                          <CheckCircle2
                            className="mt-0.5 h-5 w-5 shrink-0"
                            style={{ color: BRAND }}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {showErr("agency") && <FieldError id={errorIds.agency} message={errors.agency} />}
          </div>
        )}

        {isAgent && (
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Your contact details
          </div>
        )}

        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="booker-first-mobile" className="text-sm font-medium text-slate-700">First name</label>
              <input
                id="booker-first-mobile"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                onBlur={() => markTouched("firstName")}
                aria-invalid={showErr("firstName")}
                aria-describedby={showErr("firstName") ? errorIds.firstName : undefined}
                className={inputClassFor(showErr("firstName"))}
                style={errorStyle(showErr("firstName"))}
                data-testid="input-firstname"
              />
              {showErr("firstName") && <FieldError id={errorIds.firstName} message={errors.firstName} />}
            </div>
            <div className="space-y-1.5">
              <label htmlFor="booker-last-mobile" className="text-sm font-medium text-slate-700">Last name</label>
              <input
                id="booker-last-mobile"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                onBlur={() => markTouched("lastName")}
                aria-invalid={showErr("lastName")}
                aria-describedby={showErr("lastName") ? errorIds.lastName : undefined}
                className={inputClassFor(showErr("lastName"))}
                style={errorStyle(showErr("lastName"))}
                data-testid="input-lastname"
              />
              {showErr("lastName") && <FieldError id={errorIds.lastName} message={errors.lastName} />}
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="booker-email-mobile" className="text-sm font-medium text-slate-700">Email</label>
            <input
              id="booker-email-mobile"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => markTouched("email")}
              aria-invalid={showErr("email")}
              aria-describedby={showErr("email") ? errorIds.email : undefined}
              className={inputClassFor(showErr("email"))}
              style={errorStyle(showErr("email"))}
              data-testid="input-email"
            />
            {showErr("email") && <FieldError id={errorIds.email} message={errors.email} />}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="booker-mobile-mobile" className="text-sm font-medium text-slate-700">Mobile</label>
            <input
              id="booker-mobile-mobile"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              onBlur={() => markTouched("mobile")}
              aria-invalid={showErr("mobile")}
              aria-describedby={showErr("mobile") ? errorIds.mobile : undefined}
              className={inputClassFor(showErr("mobile"))}
              style={errorStyle(showErr("mobile"))}
              data-testid="input-mobile"
            />
            {showErr("mobile") && <FieldError id={errorIds.mobile} message={errors.mobile} />}
          </div>
        </div>
      </div>

      {/* Docked CTA */}
      <div className="border-t border-slate-100 bg-white px-5 py-3">
        <button
          type="button"
          disabled={!isValid}
          data-testid="button-continue"
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

