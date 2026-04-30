/**
 * Units view + add/edit modal — the AC config "on file" that pre-fills
 * the customer booking flow's AC step. Bulk import lives in a separate
 * `UnitsCsvImportModal` component.
 */

import { Download, Edit3, FileUp, Plus, X } from "lucide-react";
import { useState } from "react";

import type {
  AdminAgent,
  AdminBuilding,
  AdminUnit,
  OutdoorPlacement,
} from "@/state/adminMockData";
import { formatUnitsCsv, unitsCsvTemplate } from "@/state/unitsCsv";

import { FormField } from "./atoms";
import { BRAND } from "./theme";
import { UnitsCsvImportModal } from "./UnitsCsvImportModal";

export function UnitsView({
  units,
  setUnits,
  agents,
  buildings,
}: {
  units: AdminUnit[];
  setUnits: (next: AdminUnit[]) => void;
  agents: AdminAgent[];
  buildings: AdminBuilding[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);

  function saveUnit(next: AdminUnit) {
    setUnits(units.map((u) => (u.id === next.id ? next : u)));
    setEditingId(null);
  }

  function createUnit(next: AdminUnit) {
    setUnits([...units, next]);
    setCreating(false);
  }

  function downloadCsv(filename: string, body: string) {
    const blob = new Blob([body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 rounded-xl border border-slate-200 bg-white p-4 text-[12px] text-slate-600">
          Units carry the AC config <strong>on file</strong>. When a customer
          starts a booking, this is what pre-fills their AC step. Keeping
          these accurate reduces customer mismatches.
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() =>
              downloadCsv("taylr-units-template.csv", unitsCsvTemplate())
            }
            data-testid="button-units-template"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-4 w-4" />
            Download template
          </button>
          <button
            type="button"
            onClick={() =>
              downloadCsv(
                `taylr-units-${new Date().toISOString().slice(0, 10)}.csv`,
                formatUnitsCsv(units),
              )
            }
            data-testid="button-units-export"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-4 w-4" />
            Export current units
          </button>
          <button
            type="button"
            onClick={() => setImporting(true)}
            data-testid="button-units-import"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            <FileUp className="h-4 w-4" />
            Import CSV
          </button>
          <button
            type="button"
            onClick={() => setCreating(true)}
            data-testid="button-units-add"
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold text-white"
            style={{ backgroundColor: BRAND }}
          >
            <Plus className="h-4 w-4" />
            Add unit
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-[13px]">
          <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Address</th>
              <th className="px-4 py-3 font-semibold">AC type</th>
              <th className="px-4 py-3 font-semibold">Brand</th>
              <th className="px-4 py-3 font-semibold">Systems</th>
              <th className="px-4 py-3 font-semibold">Extras</th>
              <th className="px-4 py-3 font-semibold">Managing agent</th>
              <th className="px-4 py-3 font-semibold"></th>
            </tr>
          </thead>
          <tbody>
            {units.map((u) => {
              const agent = u.agentId ? agents.find((a) => a.id === u.agentId) ?? null : null;
              const building = buildings.find((b) => b.id === u.buildingId) ?? null;
              // The unit shows its own override if set; otherwise it
              // inherits from the building. Bricks marked "(building)"
              // make the source explicit so the admin doesn't think
              // it's stored on the unit row itself.
              const typeOverridden =
                u.ac.type === "split" || u.ac.type === "ducted";
              const brandOverridden = u.ac.brand.trim().length > 0;
              const displayType = typeOverridden
                ? u.ac.type
                : building?.acType ?? "—";
              const displayBrand = brandOverridden
                ? u.ac.brand
                : building?.acBrand ?? "—";
              return (
                <tr key={u.id} className="border-b border-slate-100 last:border-b-0">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{u.addressLine1}</div>
                    <div className="text-[11px] text-slate-500">{u.addressLine2}</div>
                    {building && (
                      <div className="mt-0.5 text-[11px] font-medium text-slate-600">
                        {building.name}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 capitalize">
                    {displayType}
                    {!typeOverridden && building && (
                      <div className="text-[10px] font-normal text-slate-500">
                        from building
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {displayBrand}
                    {!brandOverridden && building?.acBrand && (
                      <div className="text-[10px] text-slate-500">
                        from building
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {u.ac.systems !== null ? u.ac.systems : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {u.ac.additional !== null ? u.ac.additional : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {agent ? (
                      <div className="font-medium text-slate-900">
                        {agent.company}
                      </div>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setEditingId(u.id)}
                      className="inline-flex items-center gap-1 text-[12px] font-semibold text-slate-600 hover:text-slate-900"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      Edit
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {(editingId || creating) && (
        <UnitEditor
          unit={
            editingId
              ? units.find((u) => u.id === editingId)!
              : {
                  id: `u${Date.now()}`,
                  addressLine1: "",
                  addressLine2: "",
                  // New units inherit the AC type and brand from their
                  // building by default — `unknown` + `""` are the
                  // sentinel values for "use the building's setting"
                  // (Task #110). Counts start blank so the booking flow
                  // prompts the customer for them.
                  ac: {
                    type: "unknown",
                    brand: "",
                    systems: null,
                    additional: null,
                  },
                  agentId: null,
                  buildingId: buildings[0]?.id ?? "",
                }
          }
          agents={agents}
          buildings={buildings}
          onSave={editingId ? saveUnit : createUnit}
          onCancel={() => {
            setEditingId(null);
            setCreating(false);
          }}
          isCreate={creating}
        />
      )}

      {importing && (
        <UnitsCsvImportModal
          units={units}
          agents={agents}
          onApply={(next) => {
            setUnits(next);
            setImporting(false);
          }}
          onClose={() => setImporting(false)}
        />
      )}
    </div>
  );
}

function UnitEditor({
  unit,
  agents,
  buildings,
  onSave,
  onCancel,
  isCreate,
}: {
  unit: AdminUnit;
  agents: AdminAgent[];
  buildings: AdminBuilding[];
  onSave: (next: AdminUnit) => void;
  onCancel: () => void;
  isCreate: boolean;
}) {
  const [draft, setDraft] = useState<AdminUnit>(unit);
  // The unit's AC type can be `unknown` (sentinel for "inherit from
  // building") or one of the two real types. Brand inherits the same
  // way using an empty string.
  const overrideType =
    draft.ac.type === "split" || draft.ac.type === "ducted";
  const overrideBrand = draft.ac.brand.trim().length > 0;
  const overridePlacement = draft.outdoorPlacementOverride !== undefined;
  const countsKnown =
    draft.ac.systems !== null && draft.ac.additional !== null;
  const inheritedBuilding =
    buildings.find((b) => b.id === draft.buildingId) ?? null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-500">
              {isCreate ? "New unit" : "Edit unit"}
            </div>
            <div className="text-[16px] font-semibold text-slate-900">
              AC config on file
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 flex flex-col gap-3">
          <FormField label="Address line 1">
            <input
              type="text"
              value={draft.addressLine1}
              onChange={(e) => setDraft({ ...draft, addressLine1: e.target.value })}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] focus:border-slate-400 focus:outline-none"
            />
          </FormField>
          <FormField label="Address line 2">
            <input
              type="text"
              value={draft.addressLine2}
              onChange={(e) => setDraft({ ...draft, addressLine2: e.target.value })}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] focus:border-slate-400 focus:outline-none"
            />
          </FormField>
          {inheritedBuilding && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
              <div className="font-semibold text-slate-700">
                Inherits from {inheritedBuilding.name}
              </div>
              <div className="mt-0.5 capitalize">
                {inheritedBuilding.acType}
                {inheritedBuilding.acBrand
                  ? ` · ${inheritedBuilding.acBrand}`
                  : ""}
              </div>
            </div>
          )}
          <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
            <div>
              <div className="text-[12px] font-semibold text-slate-700">
                Different AC type for this unit
              </div>
              <div className="text-[11px] text-slate-500">
                Only set this when the unit's system differs from its building.
              </div>
            </div>
            <input
              type="checkbox"
              checked={overrideType}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  ac: {
                    ...draft.ac,
                    type: e.target.checked
                      ? inheritedBuilding?.acType ?? "split"
                      : "unknown",
                  },
                })
              }
              className="h-4 w-4"
            />
          </div>
          {overrideType && (
            <FormField label="AC type override">
              <select
                value={
                  draft.ac.type === "split" || draft.ac.type === "ducted"
                    ? draft.ac.type
                    : "split"
                }
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    ac: {
                      ...draft.ac,
                      type: e.target.value as "split" | "ducted",
                    },
                  })
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] focus:border-slate-400 focus:outline-none"
              >
                <option value="split">Split</option>
                <option value="ducted">Ducted</option>
              </select>
            </FormField>
          )}
          <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
            <div>
              <div className="text-[12px] font-semibold text-slate-700">
                Different brand for this unit
              </div>
              <div className="text-[11px] text-slate-500">
                Only set this when the unit's brand differs from its building.
              </div>
            </div>
            <input
              type="checkbox"
              checked={overrideBrand}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  ac: {
                    ...draft.ac,
                    brand: e.target.checked
                      ? inheritedBuilding?.acBrand ?? ""
                      : "",
                  },
                })
              }
              className="h-4 w-4"
            />
          </div>
          {overrideBrand && (
            <FormField label="Brand override">
              <input
                type="text"
                value={draft.ac.brand}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    ac: { ...draft.ac, brand: e.target.value },
                  })
                }
                placeholder="Daikin, Mitsubishi, Fujitsu, Panasonic…"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] focus:border-slate-400 focus:outline-none"
              />
            </FormField>
          )}
          <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
            <div>
              <div className="text-[12px] font-semibold text-slate-700">
                Different outdoor placement for this unit
              </div>
              <div className="text-[11px] text-slate-500">
                Inherits the building's setting (
                {inheritedBuilding?.outdoorPlacement === "rooftop"
                  ? "rooftop"
                  : "in property"}
                ). Override only when this unit's outdoor unit lives somewhere
                different.
              </div>
            </div>
            <input
              type="checkbox"
              checked={overridePlacement}
              onChange={(e) => {
                if (e.target.checked) {
                  const fallback: OutdoorPlacement =
                    inheritedBuilding?.outdoorPlacement === "rooftop"
                      ? "in_property"
                      : "rooftop";
                  setDraft({
                    ...draft,
                    outdoorPlacementOverride: fallback,
                  });
                } else {
                  const next = { ...draft };
                  delete next.outdoorPlacementOverride;
                  setDraft(next);
                }
              }}
              className="h-4 w-4"
            />
          </div>
          {overridePlacement && (
            <FormField label="Outdoor placement override">
              <select
                value={draft.outdoorPlacementOverride ?? "in_property"}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    outdoorPlacementOverride: e.target
                      .value as OutdoorPlacement,
                  })
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] focus:border-slate-400 focus:outline-none"
              >
                <option value="in_property">In property</option>
                <option value="rooftop">Rooftop</option>
              </select>
            </FormField>
          )}
          <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
            <div>
              <div className="text-[12px] font-semibold text-slate-700">
                Counts on file
              </div>
              <div className="text-[11px] text-slate-500">
                Leave off when you don't yet know how many systems are installed.
              </div>
            </div>
            <input
              type="checkbox"
              checked={countsKnown}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  ac: {
                    ...draft.ac,
                    systems: e.target.checked ? draft.ac.systems ?? 1 : null,
                    additional: e.target.checked
                      ? draft.ac.additional ?? 0
                      : null,
                  },
                })
              }
              className="h-4 w-4"
            />
          </div>
          {countsKnown && (
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Systems">
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={draft.ac.systems ?? 1}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      ac: { ...draft.ac, systems: Number(e.target.value) },
                    })
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] focus:border-slate-400 focus:outline-none"
                />
              </FormField>
              <FormField label="Extras">
                <input
                  type="number"
                  min={0}
                  max={29}
                  value={draft.ac.additional ?? 0}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      ac: { ...draft.ac, additional: Number(e.target.value) },
                    })
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] focus:border-slate-400 focus:outline-none"
                />
              </FormField>
            </div>
          )}
          <FormField label="Building">
            <select
              value={draft.buildingId}
              onChange={(e) =>
                setDraft({ ...draft, buildingId: e.target.value })
              }
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] focus:border-slate-400 focus:outline-none"
            >
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Managing agent">
            <select
              value={draft.agentId ?? ""}
              onChange={(e) =>
                setDraft({ ...draft, agentId: e.target.value || null })
              }
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] focus:border-slate-400 focus:outline-none"
            >
              <option value="">— Owner-managed —</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.company}
                </option>
              ))}
            </select>
          </FormField>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave(draft)}
            disabled={!draft.addressLine1.trim()}
            className="rounded-lg px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: BRAND }}
          >
            {isCreate ? "Create" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
