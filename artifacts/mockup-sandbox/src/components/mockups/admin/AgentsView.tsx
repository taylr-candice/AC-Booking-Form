/**
 * Agents view + add/edit modal — managing agencies on file. Each row
 * represents a company (e.g. "Vantage Strata Management"), not an
 * individual person. The actual booker's name / email / phone is
 * captured per-booking on `AdminBooking.customerName` etc., so we can
 * always tell who specifically from the agency placed any given
 * booking. Agencies show up in the customer booking flow when the
 * booker says they're an agent.
 *
 * Source-of-truth note: the unit↔agency relationship lives entirely
 * on `AdminUnit.agentId`. This view derives "units managed" by
 * filtering units, and toggling a unit's membership in the editor
 * mutates `unit.agentId` (not a per-agent list). That keeps the
 * agents view and the units view in lockstep — there is no second
 * representation that could drift.
 */

import { Edit3, Plus, X } from "lucide-react";
import { useState } from "react";

import type { AdminAgent, AdminUnit } from "@/state/adminMockData";

import { FormField } from "./atoms";
import { BRAND } from "./theme";

export function AgentsView({
  agents,
  setAgents,
  units,
  setUnits,
}: {
  agents: AdminAgent[];
  setAgents: (next: AdminAgent[]) => void;
  units: AdminUnit[];
  setUnits: (next: AdminUnit[]) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  function saveAgent(next: AdminAgent, nextUnitIds: string[]) {
    setAgents(agents.map((a) => (a.id === next.id ? next : a)));
    applyUnitAssignment(next.id, nextUnitIds);
    setEditingId(null);
  }

  function createAgent(next: AdminAgent, nextUnitIds: string[]) {
    setAgents([...agents, next]);
    applyUnitAssignment(next.id, nextUnitIds);
    setCreating(false);
  }

  /**
   * Reassigns units so exactly the units in `nextUnitIds` are managed
   * by `agentId`. Any unit currently flagged as managed by `agentId`
   * but no longer in the list becomes owner-managed (`agentId: null`).
   * Any unit being added is reassigned away from whatever agency it
   * was previously under (one unit → at most one agency).
   */
  function applyUnitAssignment(agentId: string, nextUnitIds: string[]) {
    const target = new Set(nextUnitIds);
    setUnits(
      units.map((u) => {
        if (target.has(u.id)) {
          return u.agentId === agentId ? u : { ...u, agentId };
        }
        if (u.agentId === agentId) {
          return { ...u, agentId: null };
        }
        return u;
      }),
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-[12px] text-slate-600">
          Agents are the managing agencies on file — tracked at the company
          level only. They show up on the customer-side dropdown when a
          booker says they're an agent. Each agency can be associated with
          one or more units they manage. The individual person who places
          each booking is captured on the booking itself (under the
          Customer card on the booking detail), so you always know who
          specifically from the agency made the request.
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold text-white"
          style={{ backgroundColor: BRAND }}
        >
          <Plus className="h-4 w-4" />
          Add agency
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-[13px]">
          <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Agency</th>
              <th className="px-4 py-3 font-semibold">Units managed</th>
              <th className="px-4 py-3 font-semibold"></th>
            </tr>
          </thead>
          <tbody>
            {agents.map((a) => {
              const managed = units.filter((u) => u.agentId === a.id);
              return (
                <tr
                  key={a.id}
                  className="border-b border-slate-100 last:border-b-0"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{a.company}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {managed.length === 0 ? (
                        <span className="text-slate-500">—</span>
                      ) : (
                        managed.map((u) => (
                          <span
                            key={u.id}
                            className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-700"
                          >
                            {u.addressLine1}
                          </span>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setEditingId(a.id)}
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
        <AgentEditor
          agent={
            editingId
              ? agents.find((a) => a.id === editingId)!
              : { id: `ag-${Date.now()}`, company: "" }
          }
          units={units}
          initialUnitIds={
            editingId
              ? units.filter((u) => u.agentId === editingId).map((u) => u.id)
              : []
          }
          onSave={editingId ? saveAgent : createAgent}
          onCancel={() => {
            setEditingId(null);
            setCreating(false);
          }}
          isCreate={creating}
        />
      )}
    </div>
  );
}

function AgentEditor({
  agent,
  units,
  initialUnitIds,
  onSave,
  onCancel,
  isCreate,
}: {
  agent: AdminAgent;
  units: AdminUnit[];
  initialUnitIds: string[];
  onSave: (next: AdminAgent, nextUnitIds: string[]) => void;
  onCancel: () => void;
  isCreate: boolean;
}) {
  const [draft, setDraft] = useState<AdminAgent>(agent);
  const [draftUnitIds, setDraftUnitIds] = useState<string[]>(initialUnitIds);

  function toggleUnit(uid: string) {
    setDraftUnitIds((ids) =>
      ids.includes(uid) ? ids.filter((x) => x !== uid) : [...ids, uid],
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-500">
              {isCreate ? "New agency" : "Edit agency"}
            </div>
            <div className="text-[16px] font-semibold text-slate-900">
              Agency name + assigned units
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
          <FormField label="Agency name">
            <input
              type="text"
              value={draft.company}
              onChange={(e) => setDraft({ ...draft, company: e.target.value })}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] focus:border-slate-400 focus:outline-none"
            />
          </FormField>
          <FormField label="Units managed">
            <div className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2">
              {units.map((u) => {
                const checked = draftUnitIds.includes(u.id);
                const otherAgentId =
                  u.agentId && u.agentId !== draft.id ? u.agentId : null;
                return (
                  <label
                    key={u.id}
                    className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleUnit(u.id)}
                      className="mt-0.5"
                      style={{ accentColor: BRAND }}
                    />
                    <div className="flex-1 leading-tight">
                      <div className="text-[12px] font-medium text-slate-900">
                        {u.addressLine1}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {u.addressLine2}
                        {otherAgentId && checked ? (
                          <span className="ml-1 text-amber-600">
                            · will reassign from another agency
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
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
            onClick={() => onSave(draft, draftUnitIds)}
            disabled={!draft.company.trim()}
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
