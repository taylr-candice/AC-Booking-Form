/**
 * Agents view + add/edit modal — leasing contacts and the units they
 * manage. Agents show up in the customer booking flow when the booker
 * says they're an agent.
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
}: {
  agents: AdminAgent[];
  setAgents: (next: AdminAgent[]) => void;
  units: AdminUnit[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  function saveAgent(next: AdminAgent) {
    setAgents(agents.map((a) => (a.id === next.id ? next : a)));
    setEditingId(null);
  }

  function createAgent(next: AdminAgent) {
    setAgents([...agents, next]);
    setCreating(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-[12px] text-slate-600">
          Agents are the leasing contacts on file. They show up on the
          customer-side dropdown when a booker says they're an agent. Each
          agent can be associated with one or more units they manage.
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold text-white"
          style={{ backgroundColor: BRAND }}
        >
          <Plus className="h-4 w-4" />
          Add agent
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-[13px]">
          <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Agent</th>
              <th className="px-4 py-3 font-semibold">Company</th>
              <th className="px-4 py-3 font-semibold">Contact</th>
              <th className="px-4 py-3 font-semibold">Units managed</th>
              <th className="px-4 py-3 font-semibold"></th>
            </tr>
          </thead>
          <tbody>
            {agents.map((a) => (
              <tr key={a.id} className="border-b border-slate-100 last:border-b-0">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-700">
                      {a.firstName[0]}
                      {a.lastName[0]}
                    </div>
                    <div className="font-medium text-slate-900">
                      {a.firstName} {a.lastName}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">{a.company}</td>
                <td className="px-4 py-3">
                  <div className="text-[12px] text-slate-700">{a.email}</div>
                  <div className="text-[11px] text-slate-500">{a.phone}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {a.unitIds.length === 0 ? (
                      <span className="text-slate-500">—</span>
                    ) : (
                      a.unitIds.map((uid) => {
                        const u = units.find((x) => x.id === uid) ?? null;
                        return (
                          <span
                            key={uid}
                            className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-700"
                          >
                            {u?.addressLine1 ?? uid}
                          </span>
                        );
                      })
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
            ))}
          </tbody>
        </table>
      </div>

      {(editingId || creating) && (
        <AgentEditor
          agent={
            editingId
              ? agents.find((a) => a.id === editingId)!
              : {
                  id: `ag-${Date.now()}`,
                  firstName: "",
                  lastName: "",
                  company: "",
                  email: "",
                  phone: "",
                  unitIds: [],
                }
          }
          units={units}
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
  onSave,
  onCancel,
  isCreate,
}: {
  agent: AdminAgent;
  units: AdminUnit[];
  onSave: (next: AdminAgent) => void;
  onCancel: () => void;
  isCreate: boolean;
}) {
  const [draft, setDraft] = useState<AdminAgent>(agent);

  function toggleUnit(uid: string) {
    setDraft((d) =>
      d.unitIds.includes(uid)
        ? { ...d, unitIds: d.unitIds.filter((x) => x !== uid) }
        : { ...d, unitIds: [...d.unitIds, uid] },
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-500">
              {isCreate ? "New agent" : "Edit agent"}
            </div>
            <div className="text-[16px] font-semibold text-slate-900">
              Agent contact + assigned units
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
          <div className="grid grid-cols-2 gap-3">
            <FormField label="First name">
              <input
                type="text"
                value={draft.firstName}
                onChange={(e) => setDraft({ ...draft, firstName: e.target.value })}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] focus:border-slate-400 focus:outline-none"
              />
            </FormField>
            <FormField label="Last name">
              <input
                type="text"
                value={draft.lastName}
                onChange={(e) => setDraft({ ...draft, lastName: e.target.value })}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] focus:border-slate-400 focus:outline-none"
              />
            </FormField>
          </div>
          <FormField label="Company">
            <input
              type="text"
              value={draft.company}
              onChange={(e) => setDraft({ ...draft, company: e.target.value })}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] focus:border-slate-400 focus:outline-none"
            />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Email">
              <input
                type="email"
                value={draft.email}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] focus:border-slate-400 focus:outline-none"
              />
            </FormField>
            <FormField label="Phone">
              <input
                type="tel"
                value={draft.phone}
                onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] focus:border-slate-400 focus:outline-none"
              />
            </FormField>
          </div>
          <FormField label="Units managed">
            <div className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-white p-2 max-h-40 overflow-y-auto">
              {units.map((u) => {
                const checked = draft.unitIds.includes(u.id);
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
                      <div className="text-[11px] text-slate-500">{u.addressLine2}</div>
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
            onClick={() => onSave(draft)}
            disabled={
              !draft.firstName.trim() || !draft.lastName.trim() || !draft.company.trim()
            }
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
