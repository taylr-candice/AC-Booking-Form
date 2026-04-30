/**
 * Service catalogue view (Task #182).
 *
 * Lists every service entry with its base time, add-on rule, and
 * pricing. Ops can edit any field inline (each entry is its own
 * editable card) and add a brand-new entry — the catalogue is the
 * single source of truth for the per-AC-type duration math, the
 * customer pricing card, and the booking detail's duration breakdown.
 *
 * Mockup-only: changes live in the AdminApp's React state for the
 * demo session and reset on reload. "Other" entries
 * (e.g. "bathroom extraction") render in the customer flow's AC step
 * as toggleable cards (Task #186) — selecting one contributes the
 * catalogue's `baseMinutes + addonMinutes` to the slot picker's
 * duration math and `priceAud + addonPriceAud` to the customer
 * pricing card and Pay step total.
 */

import { Pencil, Plus, Trash2, Wrench, X } from "lucide-react";
import { useMemo, useState } from "react";

import type { AdminService } from "@/state/adminMockData";

import { Card } from "./atoms";
import { BRAND, BRAND_DEEP, BRAND_SOFT } from "./theme";

export function ServicesView({
  services,
  setServices,
}: {
  services: AdminService[];
  setServices: (next: AdminService[]) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  function saveService(next: AdminService) {
    setServices(services.map((s) => (s.id === next.id ? next : s)));
    setEditingId(null);
  }
  function createService(next: AdminService) {
    setServices([...services, next]);
    setCreating(false);
  }
  function removeService(id: string) {
    setServices(services.filter((s) => s.id !== id));
  }

  const acEntries = useMemo(
    () => services.filter((s) => s.acTypeKey !== null),
    [services],
  );
  const otherEntries = useMemo(
    () => services.filter((s) => s.acTypeKey === null),
    [services],
  );

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[18px] font-semibold leading-tight text-slate-900">
              Service catalogue
            </div>
            <div className="mt-1 text-[13px] text-slate-600">
              Author the per-service base time, add-on rule, and pricing.
              These values drive the customer's pricing card on Step 5,
              the slot picker's time-budget math, and the booking
              detail's duration breakdown.
            </div>
          </div>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white transition hover:brightness-110"
            style={{ backgroundColor: BRAND }}
          >
            <Plus className="h-3.5 w-3.5" />
            Add service
          </button>
        </div>
        <div
          className="mt-4 rounded-lg border px-3 py-2 text-[12px]"
          style={{ borderColor: BRAND_SOFT, backgroundColor: BRAND_SOFT, color: BRAND_DEEP }}
        >
          <div className="font-semibold">How this is used</div>
          <div className="mt-0.5">
            Booking duration is computed as
            {" "}
            <span className="font-mono text-[11px]">base × systems</span> +
            {" "}
            <span className="font-mono text-[11px]">add-on × extras</span>.
            For rooftop buildings we add the building's per-system
            rooftop overhead (configured on each Building's detail page)
            on top.
          </div>
        </div>
      </Card>

      <Card title="AC services" subtitle="One entry per AC type — the duration helper picks the right rule from a booking's recorded AC type">
        <div className="flex flex-col gap-3">
          {acEntries.map((s) => (
            <ServiceCard
              key={s.id}
              service={s}
              onEdit={() => setEditingId(s.id)}
              onRemove={() => removeService(s.id)}
              canRemove={false}
            />
          ))}
        </div>
      </Card>

      <Card title="Other services" subtitle='Generic add-ons offered alongside the AC service (e.g. "bathroom extraction"). Each appears in the customer&rsquo;s AC step as a toggleable card.'>
        {otherEntries.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-[13px] text-slate-500">
            No additional services yet. Use <span className="font-semibold">Add service</span> above to create one — it&rsquo;ll appear in the customer&rsquo;s AC step right away.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {otherEntries.map((s) => (
              <ServiceCard
                key={s.id}
                service={s}
                onEdit={() => setEditingId(s.id)}
                onRemove={() => removeService(s.id)}
                canRemove={true}
              />
            ))}
          </div>
        )}
      </Card>

      {(editingId || creating) && (
        <ServiceEditor
          service={
            editingId
              ? services.find((s) => s.id === editingId)!
              : {
                  id: `svc-${Date.now()}`,
                  name: "",
                  acTypeKey: null,
                  baseMinutes: 45,
                  addonLabel: "additional unit",
                  addonMinutes: 15,
                  priceAud: 179,
                  addonPriceAud: 39,
                  maxQty: 5,
                  appliesToNote: "",
                  defaultJobMinutes: 45,
                }
          }
          onSave={editingId ? saveService : createService}
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

function ServiceCard({
  service,
  onEdit,
  onRemove,
  canRemove,
}: {
  service: AdminService;
  onEdit: () => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const acBadge =
    service.acTypeKey === "split"
      ? "Split"
      : service.acTypeKey === "ducted"
        ? "Ducted"
        : "Other";
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Wrench className="h-3.5 w-3.5 shrink-0" style={{ color: BRAND }} />
            <div className="truncate text-[14px] font-semibold text-slate-900">
              {service.name || "Untitled service"}
            </div>
            <span
              className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
              style={{ backgroundColor: BRAND_SOFT, color: BRAND_DEEP }}
            >
              {acBadge}
            </span>
          </div>
          {service.appliesToNote && service.appliesToNote.trim().length > 0 && (
            <div className="mt-1 text-[11px] italic text-slate-500">
              Applies to: {service.appliesToNote}
            </div>
          )}
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <RuleStat label="Base time" value={`${service.baseMinutes} min / system`} />
            <RuleStat
              label="Add-on time"
              value={`${service.addonMinutes} min / ${service.addonLabel}`}
            />
            <RuleStat label="Base price" value={`$${service.priceAud} / system`} />
            <RuleStat
              label="Add-on price"
              value={`$${service.addonPriceAud} / ${service.addonLabel}`}
            />
          </div>
          {service.acTypeKey === null && (
            <div className="mt-2 text-[11px] text-slate-500">
              Customer stepper caps at{" "}
              <span className="font-semibold text-slate-700">
                {service.maxQty}
              </span>
              .
            </div>
          )}
          {(service.acTypeKey === "split" ||
            service.acTypeKey === "ducted") &&
            service.additionalIndoorMaxQty != null && (
              <div className="mt-2 text-[11px] text-slate-500">
                Indoor-unit stepper caps at{" "}
                <span className="font-semibold text-slate-700">
                  {service.additionalIndoorMaxQty}
                </span>
                .
              </div>
            )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Pencil className="h-3 w-3" />
            Edit
          </button>
          {canRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50"
            >
              <Trash2 className="h-3 w-3" />
              Remove
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function RuleStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className="text-[13px] font-medium text-slate-800">{value}</div>
    </div>
  );
}

function ServiceEditor({
  service,
  onSave,
  onCancel,
  isCreate,
}: {
  service: AdminService;
  onSave: (next: AdminService) => void;
  onCancel: () => void;
  isCreate: boolean;
}) {
  const [draft, setDraft] = useState<AdminService>(service);

  function patch(p: Partial<AdminService>) {
    setDraft((d) => ({ ...d, ...p }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-500">
              {isCreate ? "New service" : "Edit service"}
            </div>
            <div className="text-[16px] font-semibold text-slate-900">
              Catalogue entry
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
          <Field label="Display name">
            <input
              type="text"
              value={draft.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="e.g. Split system service"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] focus:border-slate-400 focus:outline-none"
            />
          </Field>
          <Field label="Applies to AC type">
            <select
              value={draft.acTypeKey ?? "other"}
              onChange={(e) => {
                const v = e.target.value;
                patch({
                  acTypeKey:
                    v === "split" || v === "ducted" ? v : null,
                });
              }}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] focus:border-slate-400 focus:outline-none"
            >
              <option value="split">Split</option>
              <option value="ducted">Ducted</option>
              <option value="other">Other (toggleable add-on in AC step)</option>
            </select>
          </Field>
          {draft.acTypeKey === null && (
            <>
              <Field label='Applies to (free text)'>
                <input
                  type="text"
                  value={draft.appliesToNote ?? ""}
                  onChange={(e) => patch({ appliesToNote: e.target.value })}
                  placeholder="e.g. bathroom extraction"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] focus:border-slate-400 focus:outline-none"
                />
              </Field>
              <Field label="Max quantity (customer stepper)">
                <input
                  type="number"
                  min={1}
                  max={99}
                  step={1}
                  value={draft.maxQty}
                  onChange={(e) =>
                    patch({
                      maxQty: Math.min(
                        99,
                        Math.max(1, Math.floor(Number(e.target.value) || 1)),
                      ),
                    })
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] focus:border-slate-400 focus:outline-none"
                />
                <span className="mt-1 text-[11px] text-slate-500">
                  Caps the Step 2 stepper. Bigger jobs need to call in.
                </span>
              </Field>
            </>
          )}
          {(draft.acTypeKey === "split" || draft.acTypeKey === "ducted") && (
            <Field
              label={
                draft.acTypeKey === "ducted"
                  ? "Max return-air grilles (customer stepper)"
                  : "Max indoor heads (customer stepper)"
              }
            >
              <input
                type="number"
                min={1}
                max={29}
                step={1}
                value={draft.additionalIndoorMaxQty ?? ""}
                placeholder={draft.acTypeKey === "ducted" ? "8" : "6"}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "") {
                    patch({ additionalIndoorMaxQty: undefined });
                    return;
                  }
                  patch({
                    additionalIndoorMaxQty: Math.min(
                      29,
                      Math.max(1, Math.floor(Number(raw) || 1)),
                    ),
                  });
                }}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] focus:border-slate-400 focus:outline-none"
              />
              <span className="mt-1 text-[11px] text-slate-500">
                Caps the Step 2 indoor-unit stepper. Bigger jobs need to call
                in.
              </span>
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Base time (min / system)">
              <input
                type="number"
                min={0}
                max={600}
                value={draft.baseMinutes}
                onChange={(e) =>
                  patch({
                    baseMinutes: Math.max(0, Number(e.target.value) || 0),
                    defaultJobMinutes: Math.max(0, Number(e.target.value) || 0),
                  })
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] focus:border-slate-400 focus:outline-none"
              />
            </Field>
            <Field label="Base price (AUD)">
              <input
                type="number"
                min={0}
                value={draft.priceAud}
                onChange={(e) =>
                  patch({ priceAud: Math.max(0, Number(e.target.value) || 0) })
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] focus:border-slate-400 focus:outline-none"
              />
            </Field>
          </div>
          <Field label="Add-on label">
            <input
              type="text"
              value={draft.addonLabel}
              onChange={(e) => patch({ addonLabel: e.target.value })}
              placeholder="e.g. additional indoor head"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] focus:border-slate-400 focus:outline-none"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Add-on time (min)">
              <input
                type="number"
                min={0}
                max={600}
                value={draft.addonMinutes}
                onChange={(e) =>
                  patch({
                    addonMinutes: Math.max(0, Number(e.target.value) || 0),
                  })
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] focus:border-slate-400 focus:outline-none"
              />
            </Field>
            <Field label="Add-on price (AUD)">
              <input
                type="number"
                min={0}
                value={draft.addonPriceAud}
                onChange={(e) =>
                  patch({
                    addonPriceAud: Math.max(0, Number(e.target.value) || 0),
                  })
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] focus:border-slate-400 focus:outline-none"
              />
            </Field>
          </div>
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
              draft.name.trim().length === 0 ||
              draft.addonLabel.trim().length === 0
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

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}
