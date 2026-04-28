/**
 * Left-rail nav for the admin mockup. Routes between the five top-level
 * views; the `AdminApp` shell owns the active-view state and tells the
 * sidebar what's selected.
 */

import {
  Building2,
  Calendar,
  CreditCard,
  Home,
  Snowflake,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";

import { BRAND } from "./theme";
import type { ViewId } from "./types";

const NAV_ITEMS: ReadonlyArray<{ id: ViewId; label: string; icon: LucideIcon }> = [
  { id: "bookings", label: "Bookings", icon: Calendar },
  { id: "payments", label: "Payments", icon: CreditCard },
  { id: "calendar", label: "Slot calendar", icon: Sparkles },
  { id: "buildings", label: "Buildings", icon: Building2 },
  { id: "units", label: "Units", icon: Home },
  { id: "agents", label: "Agents", icon: Users },
];

export function Sidebar({
  activeView,
  onNav,
}: {
  activeView: ViewId;
  onNav: (id: ViewId) => void;
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
              style={isActive ? { backgroundColor: BRAND } : undefined}
            >
              <Icon className="h-4 w-4" />
              {item.label}
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
      </div>
    </aside>
  );
}
