import {
  ArrowLeft,
  ArrowRight,
  Users,
  Briefcase,
  KeyRound,
  Info,
  Trash2,
  Plus,
  Home,
  Package,
  PackageOpen,
  Hand,
  HousePlus,
  CheckCircle2,
} from "lucide-react";
import {
  bookingActions,
  useBookingSelector,
  type AccessMethod,
  type PrimaryResidence,
} from "../../../state/bookingSession";
import {
  DEMO_MANAGING_AGENCIES,
  getAccessOptions,
  infoNoteFor,
  isAgentTenantOption,
  isCollectReturnMethod,
  isLeaveKeyMethod,
  isManagingAgentMethod,
  isStep5Valid,
  isTenantMethod,
  signatureVariantFor,
  useTenants,
  type AccessOption,
} from "../../../state/accessMethodCatalog";

const BRAND = "#ED017F";
const SELECTED_GREEN = "#5FBB97";

export function AccessMobile() {
  const session = useBookingSelector((s) => s);
  const role = session.role;
  const residence = session.primary_residence;
  const access = session.access_method;
  const opts = getAccessOptions(role, residence);

  // Tenants are sourced from the store so cascade clears (role/residence/
  // access_method changes) properly empty the list. The hook auto-seeds when
  // entering a tenant flow with an empty store and provides stable React keys.
  const tenantsApi = useTenants(isTenantMethod(access));

  const valid = isStep5Valid(session);
  const note = infoNoteFor(access);
  const sig = signatureVariantFor(access);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-white font-['Inter']">
      {/* Page header */}
      <div className="flex items-start justify-between px-5 pb-4 pt-5">
        <div>
          <h1 className="text-[26px] font-semibold leading-tight text-slate-900">
            Property access
          </h1>
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
        {!role && <RoleMissingBanner />}

        {role === "owner" && (
          <PrimaryResidenceSection
            residence={residence}
            onPick={(r) => bookingActions.setPrimaryResidence(r)}
          />
        )}

        {(role === "agent" || (role === "owner" && residence)) && (
          <>
            <p className="mb-3 text-[15px] leading-relaxed text-slate-600">
              How will the technician access the property to perform the
              service?
            </p>
            <div className="space-y-3 mb-6">
              {opts.map((o) => {
                // The agent's "Tenants will provide access" card represents
                // any of agent_tenant_pending / _self / _taylr — keep it
                // visually selected for any coordination state.
                const isAgentTenantCard =
                  role === "agent" && o.key === "agent_tenant_pending";
                const selected = isAgentTenantCard
                  ? isAgentTenantOption(access)
                  : access === o.key;
                return (
                  <AccessCard
                    key={o.key}
                    option={o}
                    selected={selected}
                    onClick={() => {
                      // Clicking the agent tenant card sets the transient
                      // `_pending` state — the sub-question below requires
                      // the user to explicitly choose who coordinates.
                      if (isAgentTenantCard && isAgentTenantOption(access)) {
                        return; // already in the pair — sub-question handles the rest
                      }
                      bookingActions.setAccessMethod(o.key);
                    }}
                  />
                );
              })}
            </div>

            {role === "agent" && isAgentTenantOption(access) && (
              <AgentTenantCoordinationSection access={access} />
            )}

            {note && <InfoBanner title={note.title} body={note.body} />}

            {isLeaveKeyMethod(access) && <KeyHolderSection />}
            {isCollectReturnMethod(access) && <CollectReturnSection />}
            {isManagingAgentMethod(access) && <ManagingAgencySection />}
            {isTenantMethod(access) && <TenantsSection api={tenantsApi} />}
            {sig && <SignatureSection title={sig.title} body={sig.body} />}

            <NotesSection />
          </>
        )}
      </div>

      {/* Docked CTA */}
      <div className="border-t border-slate-100 bg-white px-5 py-3">
        <button
          type="button"
          data-testid="button-continue"
          disabled={!valid}
          className="flex w-full items-center justify-center gap-2 rounded-full px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50"
          style={{ backgroundColor: BRAND }}
        >
          Continue
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ─── Sub-sections ───────────────────────────────────────────────────────────

function RoleMissingBanner() {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
      Please complete Step 1 (Property &amp; role) first — the access options depend on
      whether you're the owner or a managing agent.
    </div>
  );
}

function PrimaryResidenceSection({
  residence,
  onPick,
}: {
  residence: PrimaryResidence | null;
  onPick: (r: PrimaryResidence) => void;
}) {
  return (
    <div className="mb-6">
      <p className="mb-3 text-[15px] leading-relaxed text-slate-600">
        Is this property your primary residence?
      </p>
      <div className="space-y-3">
        <ResidenceCard
          selected={residence === "live_in"}
          onClick={() => onPick("live_in")}
          icon={<Home className="h-5 w-5" />}
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

function ResidenceCard({
  selected,
  onClick,
  icon,
  title,
  subtitle,
  id,
}: {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  id: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`card-residence-${id}`}
      className={`relative flex min-h-[72px] w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition ${
        selected ? "" : "border-slate-200 bg-white hover:border-slate-300"
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
        className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${
          selected ? "text-white" : "bg-slate-100 text-slate-700"
        }`}
        style={selected ? { backgroundColor: SELECTED_GREEN } : undefined}
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[15px] font-semibold leading-tight text-slate-900">{title}</span>
        <span className="mt-0.5 text-[12.5px] leading-snug text-slate-500">{subtitle}</span>
      </span>
      {selected && (
        <CheckCircle2 className="h-5 w-5" style={{ color: SELECTED_GREEN }} />
      )}
    </button>
  );
}

function AccessCard({
  selected,
  onClick,
  option,
}: {
  selected: boolean;
  onClick: () => void;
  option: AccessOption;
}) {
  const icon = iconForMethod(option.key);
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`card-access-${option.key}`}
      className={`flex min-h-[76px] w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition ${
        selected ? "" : "border-slate-200 bg-white hover:border-slate-300"
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
        className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${
          selected ? "text-white" : "bg-slate-100 text-slate-700"
        }`}
        style={selected ? { backgroundColor: SELECTED_GREEN } : undefined}
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[15px] font-semibold leading-tight text-slate-900">{option.label}</span>
        <span className="mt-0.5 text-[12.5px] leading-snug text-slate-500">{option.subtitle}</span>
      </span>
      {selected && (
        <CheckCircle2 className="h-5 w-5 shrink-0" style={{ color: SELECTED_GREEN }} />
      )}
    </button>
  );
}

function iconForMethod(m: AccessMethod) {
  if (
    m === "owner_live_at_unit" ||
    m === "owner_leased_be_there" ||
    m === "owner_vacant_be_there" ||
    m === "agent_be_there"
  ) {
    return <DoorWithPersonIcon className="h-5 w-5" />;
  }
  if (
    m === "owner_live_leave_key" ||
    m === "owner_leased_leave_key" ||
    m === "owner_vacant_leave_key"
  ) {
    return <KeyRound className="h-5 w-5" />;
  }
  if (
    m === "owner_live_parcel_locker" ||
    m === "owner_leased_parcel_locker" ||
    m === "owner_vacant_parcel_locker"
  ) {
    return <Package className="h-5 w-5" />;
  }
  if (
    m === "owner_live_collect" ||
    m === "owner_vacant_collect" ||
    m === "agent_trade_key"
  ) {
    return <Hand className="h-5 w-5" />;
  }
  if (
    m === "owner_leased_tenant" ||
    m === "agent_tenant_self" ||
    m === "agent_tenant_taylr" ||
    m === "agent_tenant_pending"
  ) {
    return <Users className="h-5 w-5" />;
  }
  return <Briefcase className="h-5 w-5" />;
}

function AgentTenantCoordinationSection({
  access,
}: {
  access: AccessMethod | null;
}) {
  return (
    <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
      <h2 className="text-[15px] font-semibold mb-1" style={{ color: BRAND }}>
        Who will arrange the appointment with the tenant?
      </h2>
      <p className="text-xs text-slate-500 mb-3">
        Choose who contacts the tenant to confirm the service window.
      </p>
      <div className="space-y-2.5">
        <CoordinationChoiceCard
          selected={access === "agent_tenant_self"}
          onClick={() =>
            bookingActions.setAccessMethod("agent_tenant_self")
          }
          title="I'll arrange directly with the tenant"
          subtitle="You pick a slot and let the tenant know"
          id="self"
        />
        <CoordinationChoiceCard
          selected={access === "agent_tenant_taylr"}
          onClick={() =>
            bookingActions.setAccessMethod("agent_tenant_taylr")
          }
          title="Please arrange for me"
          subtitle="Taylr will contact the tenant on your behalf"
          id="taylr"
        />
      </div>
    </div>
  );
}

function CoordinationChoiceCard({
  selected,
  onClick,
  title,
  subtitle,
  id,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
  id: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`card-tenant-coord-${id}`}
      className={`flex min-h-[88px] w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition ${
        selected ? "" : "border-slate-200 bg-white hover:border-slate-300"
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
        className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2"
        style={{ borderColor: selected ? SELECTED_GREEN : "#CBD5E1" }}
      >
        {selected && (
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: SELECTED_GREEN }}
          />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[14px] font-semibold leading-tight text-slate-900">
          {title}
        </span>
        <span className="mt-0.5 text-[12px] leading-snug text-slate-500">
          {subtitle}
        </span>
      </span>
    </button>
  );
}

function InfoBanner({ title, body }: { title: string; body: string }) {
  return (
    <div className="mb-6 flex gap-3 rounded-xl border border-pink-200 bg-pink-50/50 p-4">
      <Info className="mt-0.5 h-5 w-5 shrink-0" style={{ color: BRAND }} />
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
    <div className="mb-6">
      <h2 className="text-[15px] font-semibold mb-3" style={{ color: BRAND }}>Key holder details</h2>
      <div className="space-y-3">
        <input
          type="text"
          value={name}
          onChange={(e) => bookingActions.setKeyHolder({ key_holder_name: e.target.value })}
          placeholder="Key holder full name"
          data-testid="input-key-holder-name"
          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[15px] outline-none focus:border-slate-400"
        />
        <input
          type="tel"
          value={phone}
          onChange={(e) => bookingActions.setKeyHolder({ key_holder_phone: e.target.value })}
          placeholder="Key holder mobile"
          data-testid="input-key-holder-phone"
          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[15px] outline-none focus:border-slate-400"
        />
      </div>
    </div>
  );
}

function CollectReturnSection() {
  const location = useBookingSelector((s) => s.key_collection_location);
  const returnMethod = useBookingSelector((s) => s.return_method);
  return (
    <div className="mb-6 space-y-5">
      <div>
        <h2 className="text-[15px] font-semibold mb-3" style={{ color: BRAND }}>Where do we collect the key?</h2>
        <textarea
          value={location}
          onChange={(e) => bookingActions.setKeyCollectionLocation(e.target.value)}
          placeholder="e.g. Concierge desk at 335 Aspen Village, ask for Sam"
          data-testid="input-collection-location"
          className="w-full min-h-[88px] rounded-xl border border-slate-200 px-3 py-2.5 text-[15px] outline-none focus:border-slate-400 resize-none"
        />
      </div>
      <div>
        <h2 className="text-[15px] font-semibold mb-3" style={{ color: BRAND }}>How would you like the key returned?</h2>
        <div className="space-y-3">
          <ReturnMethodCard
            selected={returnMethod === "locker"}
            onClick={() => bookingActions.setReturnMethod("locker")}
            icon={<PackageOpen className="h-5 w-5" />}
            title="Drop in onsite parcel locker"
            subtitle="24/7 collection with a unique drop code"
            id="locker"
          />
          <ReturnMethodCard
            selected={returnMethod === "hand_delivery"}
            onClick={() => bookingActions.setReturnMethod("hand_delivery")}
            icon={<Hand className="h-5 w-5" />}
            title="Hand delivery"
            subtitle="Returned by 3:30pm Mon-Fri"
            id="hand_delivery"
          />
        </div>
      </div>
    </div>
  );
}

function ReturnMethodCard({
  selected,
  onClick,
  icon,
  title,
  subtitle,
  id,
}: {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  id: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`card-return-${id}`}
      className={`flex min-h-[76px] w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${
        selected ? "" : "border-slate-200 bg-white hover:border-slate-300"
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
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
          selected ? "text-white" : "bg-slate-100 text-slate-700"
        }`}
        style={selected ? { backgroundColor: SELECTED_GREEN } : undefined}
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[14px] font-semibold leading-tight text-slate-900">{title}</span>
        <span className="mt-0.5 text-[12px] leading-snug text-slate-500">{subtitle}</span>
      </span>
      {selected && (
        <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: SELECTED_GREEN }} />
      )}
    </button>
  );
}

function ManagingAgencySection() {
  const value = useBookingSelector((s) => s.managing_agency_id);
  return (
    <div className="mb-6">
      <h2 className="text-[15px] font-semibold mb-3" style={{ color: BRAND }}>Managing agency</h2>
      <select
        value={value ?? ""}
        onChange={(e) => bookingActions.setManagingAgency(e.target.value || null)}
        data-testid="select-managing-agency"
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[15px] outline-none focus:border-slate-400"
      >
        <option value="">Select an agency…</option>
        {DEMO_MANAGING_AGENCIES.map((a) => (
          <option key={a.id} value={a.id}>{a.name}</option>
        ))}
      </select>
    </div>
  );
}

function TenantsSection({
  api,
}: {
  api: ReturnType<typeof useTenants>;
}) {
  const { tenants, update, remove, add } = api;
  return (
    <div className="mb-6 space-y-4">
      <div>
        <h2 className="text-[15px] font-semibold" style={{ color: BRAND }}>Tenant details</h2>
        <p className="text-xs text-slate-500 mt-1">We'll contact each tenant to arrange a suitable window.</p>
      </div>
      {tenants.map((t, idx) => (
        <div key={t.id} className="relative rounded-xl border border-slate-200 bg-slate-50 p-4">
          {tenants.length > 1 && (
            <button
              type="button"
              aria-label={`Remove tenant ${idx + 1}`}
              onClick={() => remove(idx)}
              className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
              data-testid={`button-remove-tenant-${idx}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <div className="mb-3 text-sm font-medium text-slate-700">Tenant {idx + 1}</div>
          <div className="grid grid-cols-2 gap-3">
            <input
              placeholder="First name"
              value={t.first}
              onChange={(e) => update(idx, { first: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
              data-testid={`input-tenant-first-${idx}`}
            />
            <input
              placeholder="Last name"
              value={t.last}
              onChange={(e) => update(idx, { last: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
              data-testid={`input-tenant-last-${idx}`}
            />
          </div>
          <input
            placeholder="Email"
            value={t.email}
            onChange={(e) => update(idx, { email: e.target.value })}
            className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
            data-testid={`input-tenant-email-${idx}`}
          />
          <input
            placeholder="Mobile"
            value={t.phone}
            onChange={(e) => update(idx, { phone: e.target.value })}
            className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
            data-testid={`input-tenant-phone-${idx}`}
          />
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
        data-testid="button-add-tenant"
      >
        <Plus className="h-4 w-4" /> Add another tenant
      </button>
    </div>
  );
}

function SignatureSection({ title, body }: { title: string; body: string }) {
  const agreed = useBookingSelector((s) => s.signature_acknowledged);
  const name = useBookingSelector((s) => s.signature_name);
  return (
    <div className="mb-6 space-y-3">
      <h2 className="text-[15px] font-semibold" style={{ color: BRAND }}>{title}</h2>
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-[12px] leading-relaxed text-slate-600">
        {body}
      </div>
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => bookingActions.setSignature({ signature_acknowledged: e.target.checked })}
          className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-[#ED017F] focus:ring-pink-600"
          data-testid="checkbox-signature"
        />
        <span className="text-sm text-slate-700">I have read and agree to the above</span>
      </label>
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-slate-700">Your full name (typed signature)</label>
        <input
          type="text"
          value={name}
          onChange={(e) => bookingActions.setSignature({ signature_name: e.target.value })}
          placeholder="e.g. Candice Miller"
          data-testid="input-signature-name"
          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[15px] outline-none focus:border-slate-400"
        />
      </div>
      <div className="text-xs text-slate-500">
        Date: {new Date().toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
      </div>
    </div>
  );
}

function NotesSection() {
  const value = useBookingSelector((s) => s.access_notes);
  return (
    <div className="mt-6 space-y-2">
      <label className="text-sm font-medium text-slate-700">Additional access notes (optional)</label>
      <textarea
        value={value}
        onChange={(e) => bookingActions.setAccessNotes(e.target.value)}
        placeholder="Any extra instructions for the technician…"
        data-testid="input-access-notes"
        className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-slate-400 min-h-[100px] resize-none"
      />
    </div>
  );
}


function DoorWithPersonIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16" />
      <line x1="3" y1="21" x2="21" y2="21" />
      <circle cx="12" cy="9.5" r="1.6" />
      <path d="M9 16v-1.2a3 3 0 0 1 6 0V16" />
    </svg>
  );
}
