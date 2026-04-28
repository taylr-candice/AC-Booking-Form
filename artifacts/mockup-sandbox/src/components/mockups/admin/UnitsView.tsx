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
                    {u.ac.type === "unknown" ? (
                      <span className="text-slate-500">No record</span>
                    ) : (
                      u.ac.type
                    )}
                  </td>
                  <td className="px-4 py-3">{u.ac.systems || "—"}</td>
                  <td className="px-4 py-3">{u.ac.additional || "—"}</td>
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
                  ac: { type: "split", systems: 1, additional: 0 },
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
          <div className="grid grid-cols-3 gap-3">
            <FormField label="AC type">
              <select
                value={draft.ac.type}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    ac: {
                      ...draft.ac,
                      type: e.target.value as AdminUnit["ac"]["type"],
                    },
                  })
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] focus:border-slate-400 focus:outline-none"
              >
                <option value="split">Split</option>
                <option value="ducted">Ducted</option>
                <option value="unknown">No record</option>
              </select>
            </FormField>
            <FormField label="Systems">
              <input
                type="number"
                min={0}
                max={10}
                value={draft.ac.systems}
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
                value={draft.ac.additional}
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
