import React from "react";
import { ArrowRight, Users, Briefcase, KeyRound, Info, Trash2, Plus, Hand, HousePlus, Package, PackageOpen, CheckCircle2, Home as HomeIcon } from "lucide-react";
import { bookingActions, useBookingSelector, type AccessMethod, type PrimaryResidence } from "../../../state/bookingSession";
import { DEMO_MANAGING_AGENCIES, getAccessOptions, isAgentTenantOption, isLeaveKeyMethod, isCollectReturnMethod, isManagingAgentMethod, isTenantMethod, infoNoteFor, signatureVariantFor, isStep5Valid, useTenants, type AccessOption } from "../../../state/accessMethodCatalog";
import { PinkAckCheckbox } from "./PinkAckCheckbox";

const BRAND = "#ED017F";
const SELECTED_BG = "#7BC9A8";
const SELECTED_ACCENT = "#7BC9A8";

export function AccessDesktop() {
  const session = useBookingSelector((s) => s);
  const role = session.role;
  const residence = session.primary_residence;
  const access = session.access_method;
  const opts = getAccessOptions(role, residence);
  const tenants = useTenants(isTenantMethod(access));
  const valid = isStep5Valid(session);

  const roleLabel = role === "owner" ? "Owner" : role === "agent" ? "Agent" : "—";
  const residenceLabel = residence === "live_in" ? "Live in" : residence === "leased_out" ? "Leased out" : residence === "vacant" ? "Vacant" : "—";

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-['Inter'] flex justify-center overflow-y-auto">
      <div className="w-full max-w-2xl">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-8 md:p-10 flex flex-col">
          
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-slate-900">How will the technician access the property?</h1>
          </div>

          <div className="flex-1">
            {!role && <RoleMissingBanner />}

            {role && (
              <div className="mb-8">
                <p className="text-sm text-slate-500">
                  You are an <span className="font-medium text-slate-700">{roleLabel}</span>
                  {role === "owner" && residence && (
                    <> and the property is <span className="font-medium text-slate-700">{residenceLabel.toLowerCase()}</span></>
                  )}
                  .
                </p>
              </div>
            )}

            {role === "owner" && (
              <PrimaryResidenceSection
                residence={residence}
                onPick={(r) => bookingActions.setPrimaryResidence(r)}
              />
            )}

            {(role === "agent" || (role === "owner" && residence)) && (
              <>
                <div className="space-y-3 mb-8">
                  {opts.map((o) => {
                    const isAgentTenantCard = role === "agent" && o.key === "agent_tenant_pending";
                    const selected = isAgentTenantCard ? isAgentTenantOption(access) : access === o.key;
                    return (
                      <AccessOptionCard
                        key={o.key}
                        option={o}
                        selected={selected}
                        onClick={() => {
                          if (isAgentTenantCard && isAgentTenantOption(access)) return;
                          bookingActions.setAccessMethod(o.key);
                        }}
                      />
                    );
                  })}
                </div>

                {isAgentTenantOption(access) && (
                  <AgentTenantCoordinationSection access={access} />
                )}
                {(() => { const n = infoNoteFor(access); return n ? <InfoBanner title={n.title} body={n.body} /> : null; })()}
                {isLeaveKeyMethod(access) && <KeyHolderSection />}
                {isCollectReturnMethod(access) && <CollectReturnSection />}
                {isManagingAgentMethod(access) && <ManagingAgencySection />}
                {isTenantMethod(access) && <TenantsSection api={tenants} />}
                {(() => { const s = signatureVariantFor(access); return s ? <SignatureSection title={s.title} body={s.body} /> : null; })()}

              </>
            )}
          </div>

          <div className="mt-12 pt-6 border-t border-slate-100 flex items-center justify-between">
            <button
              type="button"
              className="text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors"
              data-testid="button-back-desktop"
            >
              ← Back
            </button>
            <span
              onClickCapture={(e) => {
                if (!valid) {
                  e.stopPropagation();
                  e.preventDefault();
                }
              }}
            >
              <button
                type="button"
                aria-disabled={!valid}
                data-testid="button-continue"
                className={`flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90 ${
                  valid ? "" : "opacity-50"
                }`}
                style={{ backgroundColor: BRAND }}
              >
                Continue
                <ArrowRight className="h-4 w-4" />
              </button>
            </span>
          </div>

        </div>
      </div>
    </div>
  );
}

function RoleMissingBanner() {
  return (
    <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
      Please complete Step 1 (Property &amp; role) first — the access options depend on
      whether you're the owner or a managing agent.
    </div>
  );
}

function PrimaryResidenceSection({ residence, onPick }: { residence: PrimaryResidence | null; onPick: (r: PrimaryResidence) => void; }) {
  return (
    <div className="mb-8">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3">
        Is this property your primary residence?
      </h3>
      <div className="grid grid-cols-3 gap-3">
        <ResidenceCard
          selected={residence === "live_in"}
          onClick={() => onPick("live_in")}
          icon={<HomeIcon className="h-5 w-5" />}
          title="I live in the property"
          subtitle="It's my primary residence"
          id="live_in"
        />
        <ResidenceCard
          selected={residence === "leased_out"}
          onClick={() => onPick("leased_out")}
          icon={<Users className="h-5 w-5" />}
          title="The property is leased out"
          subtitle="I have tenants in the unit"
          id="leased_out"
        />
        <ResidenceCard
          selected={residence === "vacant"}
          onClick={() => onPick("vacant")}
          icon={<HousePlus className="h-5 w-5" />}
          title="The property is vacant"
          subtitle="Between tenants or holiday home"
          id="vacant"
        />
      </div>
    </div>
  );
}

function ResidenceCard({ selected, onClick, icon, title, subtitle, id }: { selected: boolean; onClick: () => void; icon: React.ReactNode; title: string; subtitle: string; id: string; }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`card-residence-${id}`}
      aria-pressed={selected}
      className={`relative flex h-full flex-col items-start gap-2 rounded-2xl border p-5 text-left transition ${
        selected ? "" : "border-slate-200 bg-white hover:border-slate-300"
      }`}
      style={
        selected
          ? { borderColor: SELECTED_ACCENT, backgroundColor: SELECTED_BG }
          : undefined
      }
    >
      <span
        className={`grid h-10 w-10 place-items-center rounded-xl ${selected ? "bg-white" : "bg-slate-100 text-slate-700"}`}
        style={selected ? { color: SELECTED_ACCENT } : undefined}
      >
        {icon}
      </span>
      <div>
        <div
          className={`text-[14px] font-semibold ${
            selected ? "text-white" : "text-slate-900"
          }`}
        >
          {title}
        </div>
        <div
          className={`mt-1 text-[11px] ${
            selected ? "text-white/85" : "text-slate-500"
          }`}
        >
          {subtitle}
        </div>
      </div>
      {selected && <CheckCircle2 className="absolute right-3 top-3 h-5 w-5" style={{ color: "#ffffff" }} />}
    </button>
  );
}

function AccessOptionCard({ selected, onClick, option }: { selected: boolean; onClick: () => void; option: AccessOption; }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`card-access-${option.key}`}
      aria-pressed={selected}
      className={`flex h-full w-full items-center gap-4 rounded-2xl border px-5 py-4 text-left transition ${
        selected ? "" : "border-slate-200 bg-white hover:border-slate-300"
      }`}
      style={
        selected
          ? { borderColor: SELECTED_ACCENT, backgroundColor: SELECTED_BG }
          : undefined
      }
    >
      <span
        className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${selected ? "bg-white" : "bg-slate-100 text-slate-700"}`}
        style={selected ? { color: SELECTED_ACCENT } : undefined}
      >
        {iconForMethod(option.key)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span
          className={`text-[15px] font-semibold ${
            selected ? "text-white" : "text-slate-900"
          }`}
        >
          {option.label}
        </span>
        <span
          className={`mt-0.5 text-[13px] ${
            selected ? "text-white/85" : "text-slate-500"
          }`}
        >
          {option.subtitle}
        </span>
      </span>
      <CheckCircle2 className="h-5 w-5 shrink-0" style={{ color: selected ? "#ffffff" : "transparent" }} />
    </button>
  );
}

function iconForMethod(m: AccessMethod) {
  if (m === "owner_live_at_unit" || m === "owner_leased_be_there" || m === "owner_vacant_be_there" || m === "agent_be_there") return <HomeIcon className="h-5 w-5" />;
  if (m === "owner_live_leave_key" || m === "owner_leased_leave_key" || m === "owner_vacant_leave_key") return <KeyRound className="h-5 w-5" />;
  if (m === "owner_live_parcel_locker" || m === "owner_leased_parcel_locker" || m === "owner_vacant_parcel_locker") return <Package className="h-5 w-5" />;
  if (m === "owner_live_collect" || m === "owner_vacant_collect" || m === "agent_trade_key") return <Hand className="h-5 w-5" />;
  if (m === "owner_leased_tenant" || m === "agent_tenant_self" || m === "agent_tenant_taylr" || m === "agent_tenant_pending") return <Users className="h-5 w-5" />;
  return <Briefcase className="h-5 w-5" />;
}

function AgentTenantCoordinationSection({ access }: { access: AccessMethod | null }) {
  return (
    <div className="mb-8">
      <h2 className="text-[15px] font-semibold mb-1 text-slate-900">Who will coordinate?</h2>
      <p className="text-xs text-slate-500 mb-4">Let us know your preference.</p>
      <div className="grid grid-cols-2 gap-3">
        <CoordinationChoiceCard
          selected={access === "agent_tenant_self"}
          onClick={() => bookingActions.setAccessMethod("agent_tenant_self")}
          title="I'll arrange directly with the tenant"
          subtitle="You pick a slot and let the tenant know"
          id="self"
        />
        <CoordinationChoiceCard
          selected={access === "agent_tenant_taylr"}
          onClick={() => bookingActions.setAccessMethod("agent_tenant_taylr")}
          title="Please arrange for me"
          subtitle="Taylr will contact the tenant on your behalf"
          id="taylr"
        />
      </div>
    </div>
  );
}

function CoordinationChoiceCard({ selected, onClick, title, subtitle, id }: { selected: boolean; onClick: () => void; title: string; subtitle: string; id: string; }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`card-tenant-coord-${id}`}
      aria-pressed={selected}
      className={`flex h-full flex-col items-start gap-2 rounded-xl border p-4 text-left transition ${selected ? "" : "border-slate-200 bg-white hover:border-slate-300"}`}
      style={
        selected
          ? { borderColor: SELECTED_ACCENT, backgroundColor: SELECTED_BG }
          : undefined
      }
    >
      <span className="grid h-5 w-5 place-items-center rounded-full border-2" style={{ borderColor: selected ? "#ffffff" : "#CBD5E1" }}>
        {selected && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "#ffffff" }} />}
      </span>
      <div
        className={`text-[14px] font-semibold ${
          selected ? "text-white" : "text-slate-900"
        }`}
      >
        {title}
      </div>
      <div
        className={`text-[12px] ${
          selected ? "text-white/85" : "text-slate-500"
        }`}
      >
        {subtitle}
      </div>
    </button>
  );
}

function InfoBanner({ title, body }: { title: string; body: string }) {
  return (
    <div className="mb-8 flex gap-4 rounded-xl border border-pink-200 bg-pink-50/50 p-5">
      <Info className="h-5 w-5 shrink-0" style={{ color: BRAND }} />
      <div className="text-sm text-slate-700">
        <div className="font-semibold mb-1" style={{ color: BRAND }}>{title}</div>
        {body}
      </div>
    </div>
  );
}

function KeyHolderSection() {
  const name = useBookingSelector((s) => s.key_holder_name);
  const phone = useBookingSelector((s) => s.key_holder_phone);
  return (
    <div className="mb-8">
      <h2 className="text-base font-semibold mb-4" style={{ color: BRAND }}>Key holder details</h2>
      <div className="grid grid-cols-2 gap-4">
        <input
          type="text"
          value={name}
          onChange={(e) => bookingActions.setKeyHolder({ key_holder_name: e.target.value })}
          placeholder="Key holder full name"
          data-testid="input-key-holder-name"
          className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition"
        />
        <input
          type="tel"
          value={phone}
          onChange={(e) => bookingActions.setKeyHolder({ key_holder_phone: e.target.value })}
          placeholder="Key holder mobile"
          data-testid="input-key-holder-phone"
          className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition"
        />
      </div>
    </div>
  );
}

function CollectReturnSection() {
  const location = useBookingSelector((s) => s.key_collection_location);
  const returnMethod = useBookingSelector((s) => s.return_method);
  return (
    <div className="mb-8 space-y-6">
      <div>
        <h2 className="text-base font-semibold mb-3" style={{ color: BRAND }}>Where do we collect the key?</h2>
        <textarea
          value={location}
          onChange={(e) => bookingActions.setKeyCollectionLocation(e.target.value)}
          placeholder="e.g. Concierge desk at 335 Aspen Village, ask for Sam"
          data-testid="input-collection-location"
          className="w-full min-h-[100px] rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition resize-none"
        />
      </div>
      <div>
        <h2 className="text-base font-semibold mb-3" style={{ color: BRAND }}>How would you like the key returned?</h2>
        <div className="grid grid-cols-2 gap-4">
          <ReturnMethodCard
            selected={returnMethod === "locker"}
            onClick={() => bookingActions.setReturnMethod("locker")}
            icon={<PackageOpen className="h-5 w-5" />}
            title="Onsite parcel locker"
            subtitle="Unique drop code, 24/7"
            id="locker"
          />
          <ReturnMethodCard
            selected={returnMethod === "hand_delivery"}
            onClick={() => bookingActions.setReturnMethod("hand_delivery")}
            icon={<Hand className="h-5 w-5" />}
            title="Hand delivery"
            subtitle="By 3:30pm Mon-Fri"
            id="hand_delivery"
          />
        </div>
      </div>
    </div>
  );
}

function ReturnMethodCard({ selected, onClick, icon, title, subtitle, id }: { selected: boolean; onClick: () => void; icon: React.ReactNode; title: string; subtitle: string; id: string; }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`card-return-${id}`}
      aria-pressed={selected}
      className={`relative flex h-full flex-col items-start gap-2 rounded-2xl border p-4 text-left transition ${selected ? "" : "border-slate-200 bg-white hover:border-slate-300"}`}
      style={
        selected
          ? { borderColor: SELECTED_ACCENT, backgroundColor: SELECTED_BG }
          : undefined
      }
    >
      <span
        className={`grid h-10 w-10 place-items-center rounded-xl ${selected ? "bg-white" : "bg-slate-100 text-slate-700"}`}
        style={selected ? { color: SELECTED_ACCENT } : undefined}
      >
        {icon}
      </span>
      <div>
        <div
          className={`text-[14px] font-semibold ${
            selected ? "text-white" : "text-slate-900"
          }`}
        >
          {title}
        </div>
        <div
          className={`mt-0.5 text-xs ${
            selected ? "text-white/85" : "text-slate-500"
          }`}
        >
          {subtitle}
        </div>
      </div>
      {selected && <CheckCircle2 className="absolute right-3 top-3 h-5 w-5" style={{ color: "#ffffff" }} />}
    </button>
  );
}

function ManagingAgencySection() {
  const agencyId = useBookingSelector((s) => s.managing_agency_id);
  return (
    <div className="mb-8">
      <h2 className="text-base font-semibold mb-3" style={{ color: BRAND }}>Who manages the property?</h2>
      <select
        value={agencyId || ""}
        onChange={(e) => bookingActions.setManagingAgency(e.target.value)}
        data-testid="select-managing-agency"
        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition"
      >
        <option value="" disabled>Select an agency...</option>
        {DEMO_MANAGING_AGENCIES.map((a) => (
          <option key={a.id} value={a.id}>{a.name}</option>
        ))}
      </select>
    </div>
  );
}

function TenantsSection({ api }: { api: ReturnType<typeof useTenants> }) {
  return (
    <div className="mb-8">
      <h2 className="text-base font-semibold mb-4" style={{ color: BRAND }}>Tenant details</h2>
      <div className="space-y-4">
        {api.tenants.map((t, idx) => (
          <div key={t.id} className={idx > 0 ? "pt-4 border-t border-slate-100" : ""}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">Tenant {idx + 1}</h3>
              {api.tenants.length > 1 && (
                <button
                  type="button"
                  onClick={() => api.remove(idx)}
                  className="text-slate-400 hover:text-red-500 transition"
                  aria-label="Remove tenant"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">First Name</label>
                <input type="text" value={t.first} onChange={(e) => api.update(idx, { first: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Last Name</label>
                <input type="text" value={t.last} onChange={(e) => api.update(idx, { last: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Email</label>
                <input type="email" value={t.email} onChange={(e) => api.update(idx, { email: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Mobile</label>
                <input type="tel" value={t.phone} onChange={(e) => api.update(idx, { phone: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition" />
              </div>
            </div>
          </div>
        ))}
        <button type="button" onClick={api.add} className="flex items-center gap-2 text-sm font-medium hover:underline" style={{ color: BRAND }}>
          <Plus className="h-4 w-4" /> Add another tenant
        </button>
      </div>
    </div>
  );
}

function SignatureSection({
  title,
  body,
  attemptedSubmit = false,
}: {
  title: string;
  body: string;
  attemptedSubmit?: boolean;
}) {
  const ack = useBookingSelector((s) => s.signature_acknowledged);
  const name = useBookingSelector((s) => s.signature_name);
  const contactFirst = useBookingSelector((s) => s.contact_first_name);
  const contactLast = useBookingSelector((s) => s.contact_last_name);
  const displayName = name || [contactFirst, contactLast].filter(Boolean).join(" ");
  const today = new Date().toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="mb-8">
      <h2 className="text-base font-semibold mb-3" style={{ color: BRAND }}>{title}</h2>
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 rounded-lg bg-slate-50 p-4 text-[13px] leading-relaxed text-slate-600">
          {body}
        </div>
        <div className="mb-6">
          <PinkAckCheckbox
            checked={ack}
            onChange={(next) =>
              bookingActions.setSignature({ signature_acknowledged: next })
            }
            invalid={attemptedSubmit && !ack}
            errorText="Please confirm you have read and agree to continue."
            testId="checkbox-signature"
            label="I have read and agree to the above."
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Your full name (typed signature)</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => bookingActions.setSignature({ signature_name: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Date Signed</label>
            <div className="flex h-[42px] items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-500">{today}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

