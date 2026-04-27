import React, { useEffect, useState } from "react";
import { AlertCircle, ArrowRight, Briefcase, ChevronDown } from "lucide-react";
import { bookingActions, useBookingSelector } from "../../../state/bookingSession";
import { DEMO_MANAGING_AGENCIES } from "../../../state/accessMethodCatalog";

const BRAND = "#ED017F";
const ERROR_PURPLE = "#9747FF";

function validateEmail(v: string): string | null {
  const t = v.trim();
  if (!t) return "Email address is required";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return "Please enter a valid email address";
  return null;
}

function validatePhone(v: string): string | null {
  const digits = v.replace(/\D/g, "");
  if (!digits) return "Mobile number is required";
  if (digits.length < 10) return "Mobile number must be at least 10 digits";
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
      className="mt-1.5 flex items-start gap-1.5 text-xs font-medium"
      style={{ color: ERROR_PURPLE }}
    >
      <AlertCircle className="h-3.5 w-3.5 mt-px shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

const baseInputClass =
  "w-full rounded-xl border px-4 py-3 text-sm outline-none transition";

function inputClassFor(hasError: boolean) {
  return `${baseInputClass} ${
    hasError
      ? ""
      : "border-slate-300 focus:border-pink-500 focus:ring-1 focus:ring-pink-500"
  }`;
}

function errorStyle(hasError: boolean): React.CSSProperties | undefined {
  return hasError
    ? { borderColor: ERROR_PURPLE, boxShadow: `0 0 0 1px ${ERROR_PURPLE}` }
    : undefined;
}

export function BookerDesktop() {
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

  // Reset agency touched state when role flips off "agent" so re-entering
  // agent mode doesn't show a leftover error before the user has interacted.
  useEffect(() => {
    if (!isAgent) {
      setTouched((t) => (t.agency ? { ...t, agency: false } : t));
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
    agency: "booker-agency-desktop-error",
    firstName: "booker-first-desktop-error",
    lastName: "booker-last-desktop-error",
    email: "booker-email-desktop-error",
    mobile: "booker-mobile-desktop-error",
  } as const;

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-['Inter'] flex justify-center overflow-y-auto">
      <div className="w-full max-w-xl">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-8 md:p-10 flex flex-col">

          <div className="mb-8">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-2">Step 3 of 7</div>
            <h1 className="text-2xl font-semibold text-slate-900">
              {isAgent ? "Your agency & contact details" : "Your contact details"}
            </h1>
            <p className="text-sm text-slate-500 mt-2">
              {isAgent
                ? "Tell us which agency you're booking on behalf of, plus how we can reach you."
                : "We'll use these details to send your booking confirmation and receipt."}
            </p>
          </div>

          <div className="flex-1 space-y-8">

            {isAgent && (
              <div>
                <label
                  htmlFor="booker-agency-desktop"
                  className="block text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3"
                >
                  Your agency
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-slate-500">
                    <Briefcase className="h-4 w-4" />
                  </div>
                  <select
                    id="booker-agency-desktop"
                    value={agencyId || ""}
                    onChange={(e) => bookingActions.setAgency(e.target.value || null)}
                    onBlur={() => markTouched("agency")}
                    data-testid="select-agency"
                    aria-invalid={showErr("agency")}
                    aria-describedby={showErr("agency") ? errorIds.agency : undefined}
                    className={`w-full appearance-none rounded-xl border bg-white py-3.5 pl-14 pr-10 text-sm font-medium outline-none transition ${
                      showErr("agency")
                        ? ""
                        : "border-slate-300 focus:border-pink-500 focus:ring-1 focus:ring-pink-500"
                    } ${agencyId ? "text-slate-900" : "text-slate-400"}`}
                    style={errorStyle(showErr("agency"))}
                  >
                    <option value="" disabled>Select your agency…</option>
                    {DEMO_MANAGING_AGENCIES.map((a) => (
                      <option key={a.id} value={a.id} className="text-slate-900">{a.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                </div>
                {showErr("agency") && <FieldError id={errorIds.agency} message={errors.agency} />}
              </div>
            )}

            <div>
              {isAgent && (
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3">
                  Your contact details
                </h2>
              )}
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label htmlFor="booker-first-desktop" className="text-sm font-medium text-slate-700">First name</label>
                    <input
                      id="booker-first-desktop"
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
                  <div className="space-y-2">
                    <label htmlFor="booker-last-desktop" className="text-sm font-medium text-slate-700">Last name</label>
                    <input
                      id="booker-last-desktop"
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

                <div className="space-y-2">
                  <label htmlFor="booker-email-desktop" className="text-sm font-medium text-slate-700">Email address</label>
                  <input
                    id="booker-email-desktop"
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

                <div className="space-y-2">
                  <label htmlFor="booker-mobile-desktop" className="text-sm font-medium text-slate-700">Mobile number</label>
                  <input
                    id="booker-mobile-desktop"
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
              disabled={!isValid}
              data-testid="button-continue"
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
