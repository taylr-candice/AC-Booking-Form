import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  CalendarCheck,
  ChevronDown,
  Gauge,
  MessageSquare,
  User,
} from "lucide-react";
import { bookingActions, useBookingSelector } from "../../../state/bookingSession";
import { DEMO_MANAGING_AGENCIES } from "../../../state/accessMethodCatalog";

const BRAND = "#ED017F";

export function BookerMobile() {
  const role = useBookingSelector((s) => s.role);
  const agencyId = useBookingSelector((s) => s.agency_id);
  const isAgent = role === "agent";

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");

  const isValid =
    firstName && lastName && email && mobile && (!isAgent || !!agencyId);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-white font-['Inter']">
      {/* Top hint strip */}
      <div className="border-b border-slate-100 bg-slate-50/70 px-5 pb-1 pt-2 text-[11px] text-slate-400">
        Booking
      </div>

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
              htmlFor="booker-agency-mobile"
              className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500"
            >
              Your agency
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-slate-500">
                <Briefcase className="h-4 w-4" />
              </div>
              <select
                id="booker-agency-mobile"
                value={agencyId || ""}
                onChange={(e) => bookingActions.setAgency(e.target.value || null)}
                data-testid="select-agency"
                className={`w-full appearance-none rounded-xl border border-slate-200 bg-white py-3 pl-14 pr-10 text-[15px] outline-none focus:border-slate-400 ${
                  agencyId ? "text-slate-900" : "text-slate-400"
                }`}
              >
                <option value="" disabled>Select your agency…</option>
                {DEMO_MANAGING_AGENCIES.map((a) => (
                  <option key={a.id} value={a.id} className="text-slate-900">{a.name}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            </div>
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
              <label className="text-sm font-medium text-slate-700">First name</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[15px] text-slate-900 outline-none focus:border-slate-400"
                data-testid="input-firstname"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Last name</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[15px] text-slate-900 outline-none focus:border-slate-400"
                data-testid="input-lastname"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[15px] text-slate-900 outline-none focus:border-slate-400"
              data-testid="input-email"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Mobile</label>
            <input
              type="tel"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[15px] text-slate-900 outline-none focus:border-slate-400"
              data-testid="input-mobile"
            />
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

      {/* Bottom tab nav */}
      <nav className="flex items-center justify-around bg-slate-900 px-4 py-3 text-white">
        <NavIcon icon={<Gauge className="h-5 w-5" />} label="Dash" />
        <NavIcon icon={<CalendarCheck className="h-5 w-5" />} label="Bookings" active />
        <div className="text-base font-bold tracking-tight">
          tay<span style={{ color: "#ff3b6e" }}>lr</span>
          <span className="text-[#ff3b6e]">.</span>
        </div>
        <NavIcon icon={<MessageSquare className="h-5 w-5" />} label="Chat" />
        <NavIcon icon={<User className="h-5 w-5" />} label="Me" />
      </nav>
    </div>
  );
}

function NavIcon({ icon, label, active }: { icon: React.ReactNode; label: string; active?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={`grid place-items-center rounded-full p-1.5 ${active ? "text-white" : "text-slate-300"}`}
    >
      {icon}
    </button>
  );
}
