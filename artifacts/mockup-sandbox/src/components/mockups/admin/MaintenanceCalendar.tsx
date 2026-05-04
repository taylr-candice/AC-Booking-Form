/**
 * Maintenance Calendar — shows every building's upcoming service
 * obligations across all maintenance categories for the selected year.
 * Calculated from the last completed rollout or the building's
 * registration date + the service's cycleMonths.
 */

import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  X,
  Plus,
  CalendarRange,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  getCalendarObligations,
  getRollouts,
  SEEDED_CATEGORIES,
  type AdminBuilding,
  type AdminRollout,
  type AdminService,
  type CalendarObligation,
  type CalendarObligationStatus,
} from "@/state/adminMockData";
import { BRAND, BRAND_DEEP, BRAND_SOFT } from "./theme";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

type SelectedCell = CalendarObligation & {
  buildingName: string;
  serviceName: string;
  categoryName: string;
  /** All rollouts for this building × service pair (for the history panel). */
  allRolloutsForPair: AdminRollout[];
};

const STATUS_STYLES: Record<CalendarObligationStatus, {
  cell: string;
  label: string;
  dot: string;
}> = {
  due: {
    cell: "bg-amber-50 border border-amber-200 text-amber-900",
    label: "Due",
    dot: "bg-amber-400",
  },
  overdue: {
    cell: "bg-red-50 border border-red-200 text-red-900",
    label: "Overdue",
    dot: "bg-red-500",
  },
  scheduled: {
    cell: "bg-emerald-50 border border-emerald-200 text-emerald-900",
    label: "Scheduled",
    dot: "bg-emerald-500",
  },
  not_yet_due: {
    cell: "",
    label: "",
    dot: "",
  },
};

export function MaintenanceCalendar({
  buildings,
  services,
  refreshKey,
  onCreateRollout,
}: {
  buildings: AdminBuilding[];
  services: AdminService[];
  refreshKey: number;
  onCreateRollout: (buildingId: string, serviceId: string) => void;
}) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(
    new Set(),
  );
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);

  const rollouts = useMemo(() => getRollouts(), [refreshKey]);

  const obligations = useMemo(
    () => getCalendarObligations(year, buildings, services, rollouts),
    [year, buildings, services, rollouts],
  );

  function toggleCategory(catId: string) {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  }

  function handleCellClick(obl: CalendarObligation) {
    if (obl.status === "not_yet_due") return;
    const building = buildings.find((b) => b.id === obl.buildingId);
    const service = services.find((s) => s.id === obl.serviceId);
    const category = SEEDED_CATEGORIES.find((c) => c.id === obl.categoryId);
    const allRolloutsForPair = rollouts.filter(
      (r) => r.buildingId === obl.buildingId && r.serviceId === obl.serviceId,
    );
    setSelectedCell({
      ...obl,
      buildingName: building?.name ?? obl.buildingId,
      serviceName: service?.name ?? obl.serviceId,
      categoryName: category?.name ?? obl.categoryId,
      allRolloutsForPair,
    });
  }

  // Group services by category
  const categorisedServices = useMemo(() => {
    return SEEDED_CATEGORIES.map((cat) => ({
      category: cat,
      services: services.filter(
        (s) => s.categoryId === cat.id && s.cycleMonths,
      ),
    })).filter((g) => g.services.length > 0);
  }, [services]);

  // Obligation lookup: buildingId + serviceId + month → obligation list
  // (a pair can have >1 obligations in a year for sub-annual cycles)
  const oblMap = useMemo(() => {
    const m = new Map<string, CalendarObligation[]>();
    for (const obl of obligations) {
      const key = `${obl.buildingId}:${obl.serviceId}:${obl.dueMonth}`;
      const existing = m.get(key) ?? [];
      existing.push(obl);
      m.set(key, existing);
    }
    return m;
  }, [obligations]);

  // Per-month, per-category: count of due+overdue buildings (for conflict badge)
  // Stored with building names for tooltip copy.
  const conflictMap = useMemo(() => {
    const m = new Map<string, { count: number; buildingNames: string[] }>();
    for (const obl of obligations) {
      if (obl.status !== "due" && obl.status !== "overdue") continue;
      const key = `${obl.categoryId}:${obl.dueMonth}`;
      const building = buildings.find((b) => b.id === obl.buildingId);
      const existing = m.get(key) ?? { count: 0, buildingNames: [] };
      existing.count += 1;
      if (building && !existing.buildingNames.includes(building.name)) {
        existing.buildingNames.push(building.name);
      }
      m.set(key, existing);
    }
    return m;
  }, [obligations, buildings]);

  // Per-month total due/overdue count across all categories (column header badge)
  const monthDueCounts = useMemo(() => {
    const counts = Array(12).fill(0) as number[];
    for (const obl of obligations) {
      if (obl.status === "due" || obl.status === "overdue") {
        counts[obl.dueMonth]++;
      }
    }
    return counts;
  }, [obligations]);

  const hasAnyConflict = Array.from(conflictMap.values()).some(
    (v) => v.count >= 3,
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-[13px] text-slate-500">
          Service obligation schedule across all buildings and categories
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setYear((y) => y - 1)}
            className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 transition hover:bg-slate-50"
            aria-label="Previous year"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[3.5rem] text-center text-[15px] font-semibold text-slate-900">
            {year}
          </span>
          <button
            type="button"
            onClick={() => setYear((y) => y + 1)}
            className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 transition hover:bg-slate-50"
            aria-label="Next year"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-600">
        {(["due", "overdue", "scheduled"] as CalendarObligationStatus[]).map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${STATUS_STYLES[s].dot}`} />
            {STATUS_STYLES[s].label}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-slate-200" />
          No obligation this year
        </span>
        {hasAnyConflict && (
          <span className="flex items-center gap-1.5 text-amber-700">
            <AlertTriangle className="h-3 w-3" />
            Conflict badge — 3+ buildings due same month in that category
          </span>
        )}
      </div>

      {/* Grid */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full border-collapse text-[12px]">
          <colgroup>
            <col className="w-40" />
            {MONTHS.map((_, i) => (
              <col key={i} className="w-16" />
            ))}
          </colgroup>

          {/* Global month header row */}
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="sticky left-0 z-10 bg-slate-50 px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-slate-500">
                Building
              </th>
              {MONTHS.map((month, i) => (
                <th
                  key={month}
                  className="px-1 py-2.5 text-center text-[11px] font-medium uppercase tracking-wider text-slate-500"
                >
                  <div className="flex flex-col items-center gap-0.5">
                    <span>{month}</span>
                    {monthDueCounts[i] > 0 && (
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
                        style={{ backgroundColor: BRAND_SOFT, color: BRAND_DEEP }}
                        title={`${monthDueCounts[i]} obligation${monthDueCounts[i] === 1 ? "" : "s"} due in ${month}`}
                      >
                        {monthDueCounts[i]}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {categorisedServices.map(({ category, services: catServices }) => {
              const isCollapsed = collapsedCategories.has(category.id);

              // Find which months have a conflict for this category
              const categoryConflictMonths = MONTHS.map((_, monthIdx) => {
                const conflict = conflictMap.get(`${category.id}:${monthIdx}`);
                return conflict && conflict.count >= 3 ? conflict : null;
              });
              const categoryHasConflict = categoryConflictMonths.some(Boolean);

              return [
                // ── Category section header ─────────────────────────────────
                // Spans the label column + individual month cells so we can
                // place per-month conflict badges scoped to this category.
                <tr
                  key={`cat-${category.id}`}
                  className="border-b border-slate-100 bg-slate-50"
                >
                  <td className="sticky left-0 z-10 bg-slate-50 px-4 py-1.5">
                    <button
                      type="button"
                      onClick={() => toggleCategory(category.id)}
                      className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-700"
                    >
                      {isCollapsed ? (
                        <ChevronRight className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )}
                      {category.name}
                      <span className="ml-1 font-normal text-slate-400">
                        ({catServices.length} service{catServices.length === 1 ? "" : "s"})
                      </span>
                    </button>
                  </td>

                  {/* Per-month conflict badge — scoped to this category */}
                  {MONTHS.map((_, monthIdx) => {
                    const conflict = categoryConflictMonths[monthIdx];
                    return (
                      <td
                        key={monthIdx}
                        className="px-1 py-1.5 text-center"
                      >
                        {conflict && (
                          <span
                            className="inline-flex items-center gap-0.5 rounded border border-amber-200 bg-amber-50 px-1 py-0.5 text-[9px] font-semibold text-amber-700"
                            title={`${conflict.count} due: ${conflict.buildingNames.join(", ")}`}
                          >
                            <AlertTriangle className="h-2.5 w-2.5" />
                            {conflict.count}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>,

                // ── Building × service rows ─────────────────────────────────
                ...(!isCollapsed
                  ? catServices.flatMap((service) =>
                      buildings.map((building) => {
                        const cells = MONTHS.map((_, monthIdx) => {
                          const key = `${building.id}:${service.id}:${monthIdx}`;
                          return oblMap.get(key) ?? null;
                        });

                        const hasAny = cells.some((c) => c !== null && c.length > 0);
                        if (!hasAny) return null;

                        return (
                          <tr
                            key={`${building.id}:${service.id}`}
                            className="border-b border-slate-100 hover:bg-slate-50"
                          >
                            <td className="sticky left-0 z-10 bg-white px-4 py-2 group-hover:bg-slate-50">
                              <div
                                className="truncate max-w-[9rem] text-[12px] font-medium text-slate-900"
                                title={building.name}
                              >
                                {building.name}
                              </div>
                              <div className="truncate max-w-[9rem] text-[10px] text-slate-400">
                                {service.name}
                              </div>
                            </td>
                            {cells.map((oblList, monthIdx) => {
                              if (!oblList || oblList.length === 0) {
                                return (
                                  <td key={monthIdx} className="px-1 py-2 text-center">
                                    <span className="inline-block h-1 w-1 rounded-full bg-slate-200" />
                                  </td>
                                );
                              }

                              // Multiple obligations can share a month (sub-annual)
                              return (
                                <td key={monthIdx} className="px-1 py-2 text-center">
                                  <div className="flex flex-col items-center gap-0.5">
                                    {oblList.map((obl, oblIdx) => {
                                      const style = STATUS_STYLES[obl.status];
                                      return (
                                        <button
                                          key={oblIdx}
                                          type="button"
                                          onClick={() => handleCellClick(obl)}
                                          className={`inline-flex min-w-[2.5rem] items-center justify-center rounded px-1.5 py-1 text-[10px] font-semibold transition hover:brightness-95 ${style.cell}`}
                                          title={`${building.name} · ${service.name} · ${style.label} · due ${obl.dueDate.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}`}
                                        >
                                          {style.label || "·"}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      }).filter(Boolean)
                    )
                  : []),
              ];
            })}
          </tbody>
        </table>

        {obligations.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-16 text-center text-slate-400">
            <CalendarRange className="h-8 w-8 opacity-30" />
            <div className="text-[13px]">
              No service obligations fall due in {year}.
            </div>
            <div className="text-[12px]">
              Try the previous or next year, or add more buildings.
            </div>
          </div>
        )}
      </div>

      {/* Cell detail side panel */}
      {selectedCell && (
        <CellDetailPanel
          cell={selectedCell}
          buildings={buildings}
          onClose={() => setSelectedCell(null)}
          onCreateRollout={(buildingId, serviceId) => {
            setSelectedCell(null);
            onCreateRollout(buildingId, serviceId);
          }}
        />
      )}
    </div>
  );
}

function CellDetailPanel({
  cell,
  buildings,
  onClose,
  onCreateRollout,
}: {
  cell: SelectedCell;
  buildings: AdminBuilding[];
  onClose: () => void;
  onCreateRollout: (buildingId: string, serviceId: string) => void;
}) {
  const style = STATUS_STYLES[cell.status];
  const building = buildings.find((b) => b.id === cell.buildingId);
  const dueDateStr = cell.dueDate.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const anchor = cell.lastRollout?.endDate ?? building?.registeredAt ?? "—";

  // Chronological rollout history (newest first)
  const sortedHistory = [...cell.allRolloutsForPair].sort((a, b) =>
    b.endDate.localeCompare(a.endDate),
  );

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-end" onClick={onClose}>
      <div
        className="relative z-50 mt-0 h-full w-80 overflow-y-auto border-l border-slate-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="text-[14px] font-semibold text-slate-900">
            Obligation detail
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:text-slate-700"
            aria-label="Close panel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-5 px-5 py-5">
          {/* Status badge */}
          <div>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold ${style.cell}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
              {style.label}
            </span>
          </div>

          {/* Building + service info */}
          <div className="flex flex-col gap-3">
            <DetailRow label="Building" value={cell.buildingName} />
            <DetailRow label="Category" value={cell.categoryName} />
            <DetailRow label="Service" value={cell.serviceName} />
            <DetailRow
              label="Cycle anchor"
              value={anchor}
              note="Last completed rollout end date, or building registration date"
            />
            <DetailRow label="Due date" value={dueDateStr} />
            {cell.scheduledRollout && (
              <DetailRow
                label="Scheduled rollout"
                value={`${cell.scheduledRollout.name}`}
                note={`Starts ${cell.scheduledRollout.startDate} · ends ${cell.scheduledRollout.endDate}`}
              />
            )}
          </div>

          {/* Service history — all rollouts for this building × service */}
          <div className="border-t border-slate-100 pt-4">
            <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-slate-400">
              Service history
              {sortedHistory.length > 0
                ? ` · ${sortedHistory.length} rollout${sortedHistory.length === 1 ? "" : "s"}`
                : ""}
            </div>
            {sortedHistory.length === 0 ? (
              <p className="text-[11px] text-slate-400">
                No prior rollouts for this building and service.
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {sortedHistory.map((r) => {
                  const isPast = new Date(r.endDate) < new Date();
                  return (
                    <div
                      key={r.id}
                      className={`rounded-md border px-3 py-2 ${
                        isPast
                          ? "border-slate-100 bg-slate-50"
                          : "border-emerald-100 bg-emerald-50"
                      }`}
                    >
                      <div className="text-[11px] font-semibold text-slate-800 truncate">
                        {r.name}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {r.startDate} → {r.endDate}
                        {!isPast && (
                          <span className="ml-1.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700">
                            active / upcoming
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Create rollout CTA — only for due/overdue */}
          {(cell.status === "due" || cell.status === "overdue") && (
            <div className="border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => onCreateRollout(cell.buildingId, cell.serviceId)}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-[12px] font-semibold text-white transition hover:brightness-110"
                style={{ backgroundColor: BRAND }}
              >
                <Plus className="h-3.5 w-3.5" />
                Create rollout for this cycle
              </button>
              <p className="mt-2 text-center text-[10px] text-slate-400">
                Opens the rollout wizard pre-filled with this building and service.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
        {label}
      </div>
      <div className="mt-0.5 text-[12px] font-medium text-slate-800">{value}</div>
      {note && <div className="mt-0.5 text-[10px] text-slate-400">{note}</div>}
    </div>
  );
}
