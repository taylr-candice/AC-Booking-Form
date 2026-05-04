/**
 * Left-rail nav for the admin mockup. Routes between the five top-level
 * views; the `AdminApp` shell owns the active-view state and tells the
 * sidebar what's selected.
 */

import {
  Building2,
  Calendar,
  CalendarRange,
  Clock,
  CreditCard,
  Home,
  Mail,
  Phone,
  RotateCcw,
  Snowflake,
  Users,
  Wrench,
  CalendarClock,
  type LucideIcon,
} from "lucide-react";

import { BRAND } from "./theme";
import type { ViewId } from "./types";

const NAV_ITEMS: ReadonlyArray<{ id: ViewId; label: string; icon: LucideIcon }> = [
  { id: "bookings", label: "Bookings", icon: Calendar },
  { id: "payments", label: "Payments", icon: CreditCard },
  { id: "awaiting_coordination", label: "Awaiting coordination", icon: Clock },
  { id: "rollouts", label: "Rollouts", icon: CalendarRange },
  { id: "maintenance_calendar", label: "Maintenance calendar", icon: CalendarClock },
  { id: "buildings", label: "Buildings", icon: Building2 },
  { id: "units", label: "Units", icon: Home },
  { id: "services", label: "Services", icon: Wrench },
  { id: "agents", label: "Agents", icon: Users },
  { id: "email_templates", label: "Email templates", icon: Mail },
  { id: "call_templates", label: "Call templates", icon: Phone },
];

export function Sidebar({
  activeView,
  onNav,
  badges,
  onResetDemo,
}: {
  activeView: ViewId;
  onNav: (id: ViewId) => void;
  /**
   * Optional per-view numeric badge. A `0` (or missing entry) hides
   * the badge — used today by the invoice-void queue so admins notice
   * outstanding voids from any view, not just Bookings/Payments
   * where the dashboard banner lives.
   */
  badges?: Partial<Record<ViewId, number>>;
  /** Called when the "Reset demo" button is pressed. Clears proto-store
   * bookings / rollout overrides and resets AdminApp state. */
  onResetDemo?: () => void;
}) {
  return (
    <aside className="flex w-60 flex-col border-r border-slate-200 bg-white">
      <div className="flex items-center gap-2 px-5 pb-4 pt-5">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-xl text-white"
          style={{ backgroundColor: BRAND }}
        >
          <Snowflake className="h-5 w-5" />
        </div>
        <div>
          <div className="text-[15px] font-semibold leading-tight">Taylr</div>
          <div className="text-[11px] uppercase tracking-wider text-slate-500">
            Admin · Ops
          </div>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 px-3 pt-3">
        {NAV_ITEMS.map((item) => {
          const isActive = activeView === item.id;
          const Icon = item.icon;
          const badgeCount = badges?.[item.id] ?? 0;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNav(item.id)}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition ${
                isActive
                  ? "text-white"
                  : "text-slate-700 hover:bg-slate-100"
              }`}
              style={isActive ? { backgroundColor: "#111827" } : undefined}
            >
              <Icon className="h-4 w-4" />
              <span className="flex-1 text-left">{item.label}</span>
              {badgeCount > 0 && (
                <span
                  className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold leading-none text-white"
                  style={{ backgroundColor: isActive ? "#374151" : BRAND, paddingTop: 3, paddingBottom: 3 }}
                  data-testid="sidebar-badge"
                  data-view={item.id}
                  aria-label={`${badgeCount} ${item.label} alert${badgeCount === 1 ? "" : "s"}`}
                  title={`${badgeCount} invoice${badgeCount === 1 ? "" : "s"} need cancelling in billing`}
                >
                  {badgeCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>
      <div className="border-t border-slate-200 px-5 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-[11px] font-semibold text-slate-700">
            MK
          </div>
          <div className="leading-tight">
            <div className="text-[13px] font-semibold text-slate-900">Mia Khan</div>
            <div className="text-[11px] text-slate-500">Operations lead</div>
          </div>
        </div>
        {onResetDemo && (
          <button
            type="button"
            onClick={onResetDemo}
            className="mt-3 flex w-full items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-[11px] font-medium text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
          >
            <RotateCcw className="h-3 w-3" />
            Reset demo
          </button>
        )}
      </div>
    </aside>
  );
}
