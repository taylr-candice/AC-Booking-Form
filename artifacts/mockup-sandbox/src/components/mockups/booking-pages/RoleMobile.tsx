import {
  ArrowLeft,
  ArrowRight,
  Gauge,
  CalendarCheck,
  MessageSquare,
  User,
  CheckCircle2,
  Home,
  Briefcase,
} from "lucide-react";
import { bookingActions, useBookingSelector } from "../../../state/bookingSession";

const BRAND = "#ED017F";
const SELECTED_GREEN = "#5FBB97";

export function RoleMobile() {
  const role = useBookingSelector((s) => s.role);

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
            Your role
          </h1>
          <div className="mt-0.5 text-xs font-semibold tracking-wide uppercase text-slate-500">
            Step 2 of 7
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
          Are you the owner of this property, or a managing agent?
        </p>

        <div className="space-y-4">
          <RoleCard
            selected={role === "owner"}
            onClick={() => bookingActions.setRole("owner")}
            icon={<Home className="h-6 w-6" />}
            title="Owner"
            description="I own this unit (whether I live in it or lease it out)"
            id="owner"
          />
          <RoleCard
            selected={role === "agent"}
            onClick={() => bookingActions.setRole("agent")}
            icon={<Briefcase className="h-6 w-6" />}
            title="Agent · Property Manager"
            description="I manage this unit on behalf of the owner"
            id="agent"
          />
        </div>
      </div>

      {/* Docked CTA */}
      <div className="border-t border-slate-100 bg-white px-5 py-3">
        <button
          type="button"
          data-testid="button-continue"
          disabled={!role}
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

function RoleCard({
  selected,
  onClick,
  icon,
  title,
  description,
  id,
}: {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
  id: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`card-role-${id}`}
      className={`relative flex min-h-[112px] w-full items-start gap-4 rounded-xl border p-5 text-left transition ${
        selected ? "" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
      }`}
      style={
        selected
          ? {
              borderColor: "rgba(95,187,151,0.45)",
              backgroundColor: "rgba(95,187,151,0.08)",
            }
          : undefined
      }
    >
      <span
        className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${
          selected ? "text-white" : "bg-slate-100 text-slate-700"
        }`}
        style={selected ? { backgroundColor: SELECTED_GREEN } : undefined}
      >
        {icon}
      </span>
      <div className="flex-1">
        <div className="text-[17px] font-semibold text-slate-900">{title}</div>
        <div className="mt-1 text-[13px] leading-snug text-slate-500">{description}</div>
      </div>
      {selected && (
        <div className="absolute right-4 top-4">
          <CheckCircle2 className="h-6 w-6" style={{ color: SELECTED_GREEN }} />
        </div>
      )}
    </button>
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
