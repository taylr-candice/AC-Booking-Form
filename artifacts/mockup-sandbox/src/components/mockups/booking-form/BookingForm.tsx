import { useMemo, useState } from "react";
import {
  Search,
  Check,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Info,
  Calendar as CalendarIcon,
  Sun,
  Moon,
  Wind,
  Home,
  Building2,
  KeyRound,
  Mail,
  Phone,
  User as UserIcon,
  CreditCard,
  CheckCircle2,
  XCircle,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const BRAND = "#ED017F";
const SYSTEM_PRICE = 179;
const ADDON_PRICE = 39;

type Unit = {
  id: string;
  address: string;
  lot: string;
  savedSystems?: number;
  savedAdditional?: number;
};

type Agency = {
  id: string;
  name: string;
  contact: string;
  email: string;
  phone: string;
};

type Slot = {
  id: string;
  date: string; // ISO yyyy-mm-dd
  label: string; // e.g. "Mon 5 May"
  window: "morning" | "afternoon";
  remaining: number;
};

const UNITS: Unit[] = [
  { id: "u1", address: "12 / 88 Marine Parade, Coogee NSW 2034", lot: "12", savedSystems: 2, savedAdditional: 1 },
  { id: "u2", address: "3 / 4 Example Street, Bondi NSW 2026", lot: "3" },
  { id: "u3", address: "705 / 21 Bourke Street, Surry Hills NSW 2010", lot: "705", savedSystems: 1, savedAdditional: 0 },
  { id: "u4", address: "18 / 142 Anzac Parade, Kensington NSW 2033", lot: "18" },
  { id: "u5", address: "9B / 200 George Street, Sydney NSW 2000", lot: "9B", savedSystems: 3, savedAdditional: 2 },
  { id: "u6", address: "604 / 55 Pyrmont Street, Pyrmont NSW 2009", lot: "604" },
];

const AGENCIES: Agency[] = [
  { id: "a1", name: "Harcourts Eastern Suburbs", contact: "Jane Lim", email: "leasing@harcourts-east.com.au", phone: "(02) 9000 1100" },
  { id: "a2", name: "Ray White City Living", contact: "Tom Reid", email: "pm@raywhitecity.com.au", phone: "(02) 9000 2200" },
  { id: "a3", name: "LJ Hooker Bondi", contact: "Priya Patel", email: "rentals@ljhbondi.com.au", phone: "(02) 9000 3300" },
  { id: "a4", name: "Belle Property Inner West", contact: "Marcus Chen", email: "manage@belleinnerwest.com.au", phone: "(02) 9000 4400" },
];

const SLOTS: Slot[] = (() => {
  const out: Slot[] = [];
  const start = new Date(2026, 4, 4); // May 4 2026 — fictitious; mockup only
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  let i = 0;
  while (out.length < 16) {
    const d = new Date(start.getTime() + i * 86400000);
    const dow = d.getDay();
    if (dow !== 0) {
      const iso = d.toISOString().slice(0, 10);
      const label = `${days[dow]} ${d.getDate()} ${months[d.getMonth()]}`;
      const morningCap = (i + 1) % 4 === 0 ? 0 : Math.max(1, 4 - (i % 5));
      const afternoonCap = (i + 2) % 5 === 0 ? 0 : Math.max(1, 3 - (i % 4));
      out.push({ id: `${iso}-am`, date: iso, label, window: "morning", remaining: morningCap });
      out.push({ id: `${iso}-pm`, date: iso, label, window: "afternoon", remaining: afternoonCap });
    }
    i++;
  }
  return out;
})();

const SIG_COLLECT = `By signing below I authorise Taylr to access the unit at the nominated address using the key I am providing, on the agreed service date and within the agreed window. I confirm that all residents of the unit are aware that access may occur unattended and consent to that access for the purpose of essential air-conditioning maintenance. I confirm I am the legal owner or authorised representative of the property and have the right to grant this access.`;

const SIG_AGENT_TRADE = `By signing below I authorise Taylr to access the unit at the nominated address using the agency trade key. I confirm that I am authorised by my agency to grant this access and that all parties (owner and any current tenant) have been notified that access may occur unattended for the purpose of essential air-conditioning maintenance.`;

const SIG_TENANT = `By signing below I authorise Taylr to contact the tenant(s) listed in this booking under the terms of the Residential Tenancies Act for the purpose of arranging essential maintenance access to the unit. I confirm I have authority (as owner or managing agent) to authorise this contact and that an authorisation letter will be sent to the tenant(s) prior to the technician's visit.`;

type Role = "owner" | "agent";
type OwnerType = "live_in" | "leased_out";
type AccessMethod =
  | "owner_present"
  | "leave_key"
  | "collect_return"
  | "owner_present_leased"
  | "arrange_tenant_owner"
  | "arrange_agent_owner"
  | "leave_key_leased"
  | "agent_present"
  | "arrange_tenant_agent"
  | "collect_agent_trade_key";

type Tenant = { firstName: string; lastName: string; email: string; phone: string };

type State = {
  step: number;
  unitId: string | null;
  role: Role | null;
  agencyId: string | null;
  booker: { firstName: string; lastName: string; email: string; mobile: string };
  ac: { systems: number; additional: number };
  ownerType: OwnerType | null;
  accessMethod: AccessMethod | null;
  keyHolderName: string;
  keyHolderPhone: string;
  keyLocation: string;
  returnMethod: "locker" | "hand_delivery" | "";
  tenants: Tenant[];
  arrangeAgencyId: string | null;
  notes: string;
  sigAgreed: boolean;
  sigName: string;
  scheduleSlotId: string | null;
  terminal: "confirmed" | "coordination" | "cancelled" | null;
  reference: string | null;
};

const initialState: State = {
  step: 1,
  unitId: null,
  role: null,
  agencyId: null,
  booker: { firstName: "", lastName: "", email: "", mobile: "" },
  ac: { systems: 1, additional: 0 },
  ownerType: null,
  accessMethod: null,
  keyHolderName: "",
  keyHolderPhone: "",
  keyLocation: "",
  returnMethod: "",
  tenants: [{ firstName: "", lastName: "", email: "", phone: "" }],
  arrangeAgencyId: null,
  notes: "",
  sigAgreed: false,
  sigName: "",
  scheduleSlotId: null,
  terminal: null,
  reference: null,
};

const COORDINATION_METHODS: AccessMethod[] = [
  "arrange_tenant_owner",
  "arrange_agent_owner",
  "arrange_tenant_agent",
];

const REQUIRES_SIGNATURE: AccessMethod[] = [
  "collect_return",
  "arrange_tenant_owner",
  "arrange_tenant_agent",
  "collect_agent_trade_key",
];

function isEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

function genReference() {
  const alpha = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const num = "23456789";
  const r = (s: string, n: number) => Array.from({ length: n }, () => s[Math.floor(Math.random() * s.length)]).join("");
  return `TLR-${r(alpha, 2)}${r(num, 2)}${r(alpha, 2)}`;
}

export function BookingForm() {
  const [s, setS] = useState<State>(initialState);

  const unit = useMemo(() => UNITS.find((u) => u.id === s.unitId) ?? null, [s.unitId]);
  const agency = useMemo(() => AGENCIES.find((a) => a.id === s.agencyId) ?? null, [s.agencyId]);
  const arrangeAgency = useMemo(
    () => AGENCIES.find((a) => a.id === s.arrangeAgencyId) ?? null,
    [s.arrangeAgencyId],
  );
  const slot = useMemo(() => SLOTS.find((x) => x.id === s.scheduleSlotId) ?? null, [s.scheduleSlotId]);

  const isCoordination = !!s.accessMethod && COORDINATION_METHODS.includes(s.accessMethod);
  // Steps:
  //   1 Unit & role · 2 Your details · 3 Systems · 4 Access · 5 Schedule · 6 Review & pay
  // For coordination flows, step 5 (Schedule) is skipped, so display becomes 5 of 5
  // when the user reaches Review & pay.
  const totalSteps = isCoordination ? 5 : 6;
  const displayStep = (() => {
    if (s.step <= 4) return s.step;
    if (s.step === 5) return 5; // Schedule (only reachable when not coordination)
    return isCoordination ? 5 : 6; // s.step === 6 → Review & pay
  })();

  const stepTitles = isCoordination
    ? ["Unit & role", "Your details", "Systems", "Access", "Review & pay"]
    : ["Unit & role", "Your details", "Systems", "Access", "Schedule", "Review & pay"];

  const update = (patch: Partial<State>) => setS((prev) => ({ ...prev, ...patch }));

  // Cascade clears
  const setRole = (role: Role) => {
    if (s.role === role) return;
    setS((prev) => ({
      ...prev,
      role,
      agencyId: null,
      ownerType: null,
      accessMethod: null,
      keyHolderName: "",
      keyHolderPhone: "",
      keyLocation: "",
      returnMethod: "",
      tenants: [{ firstName: "", lastName: "", email: "", phone: "" }],
      arrangeAgencyId: null,
      sigAgreed: false,
      sigName: "",
      notes: "",
    }));
  };

  const setOwnerType = (ot: OwnerType) => {
    if (s.ownerType === ot) return;
    setS((prev) => ({
      ...prev,
      ownerType: ot,
      accessMethod: null,
      keyHolderName: "",
      keyHolderPhone: "",
      keyLocation: "",
      returnMethod: "",
      tenants: [{ firstName: "", lastName: "", email: "", phone: "" }],
      arrangeAgencyId: null,
      sigAgreed: false,
      sigName: "",
    }));
  };

  const setAccessMethod = (m: AccessMethod) => {
    if (s.accessMethod === m) return;
    setS((prev) => ({
      ...prev,
      accessMethod: m,
      keyHolderName: "",
      keyHolderPhone: "",
      keyLocation: "",
      returnMethod: "",
      tenants: [{ firstName: "", lastName: "", email: "", phone: "" }],
      arrangeAgencyId: null,
      sigAgreed: false,
      sigName: "",
    }));
  };

  const selectUnit = (id: string) => {
    if (s.unitId === id) return;
    const u = UNITS.find((x) => x.id === id);
    setS((prev) => ({
      ...prev,
      unitId: id,
      ac: {
        systems: u?.savedSystems ?? 1,
        additional: u?.savedAdditional ?? 0,
      },
    }));
  };

  // Validation per step
  const stepValid = (() => {
    switch (s.step) {
      case 1:
        return !!s.unitId && !!s.role;
      case 2: {
        const { firstName, lastName, email, mobile } = s.booker;
        const baseOk = firstName.trim() && lastName.trim() && isEmail(email) && mobile.trim().length >= 6;
        if (s.role === "agent") return !!baseOk && !!s.agencyId;
        return !!baseOk;
      }
      case 3:
        return s.ac.systems >= 1 && s.ac.systems <= 10 && s.ac.additional >= 0 && s.ac.additional <= 29;
      case 4: {
        if (s.role === "owner" && !s.ownerType) return false;
        if (!s.accessMethod) return false;
        const m = s.accessMethod;
        const sigOk = !REQUIRES_SIGNATURE.includes(m) || (s.sigAgreed && s.sigName.trim().length > 0);
        if (m === "owner_present" || m === "owner_present_leased" || m === "agent_present") return sigOk;
        if (m === "leave_key" || m === "leave_key_leased") return !!s.keyHolderName.trim() && !!s.keyHolderPhone.trim() && sigOk;
        if (m === "collect_return") return !!s.keyLocation.trim() && !!s.returnMethod && sigOk;
        if (m === "arrange_tenant_owner" || m === "arrange_tenant_agent") {
          const tenantsOk = s.tenants.length > 0 && s.tenants.every((t) =>
            t.firstName.trim() && t.lastName.trim() && isEmail(t.email) && t.phone.trim().length >= 6,
          );
          return tenantsOk && sigOk;
        }
        if (m === "arrange_agent_owner") return !!s.arrangeAgencyId;
        if (m === "collect_agent_trade_key") return sigOk;
        return false;
      }
      case 5:
        if (isCoordination) return true; // skipped logically
        return !!s.scheduleSlotId;
      case 6:
        return true;
      default:
        return false;
    }
  })();

  const goNext = () => {
    if (!stepValid) return;
    // If on access step and coordination, skip schedule (step 5) → jump to review (6)
    if (s.step === 4 && isCoordination) {
      setS((p) => ({ ...p, step: 6 }));
      return;
    }
    setS((p) => ({ ...p, step: Math.min(6, p.step + 1) }));
  };

  const goBack = () => {
    if (s.step === 6 && isCoordination) {
      setS((p) => ({ ...p, step: 4 }));
      return;
    }
    setS((p) => ({ ...p, step: Math.max(1, p.step - 1) }));
  };

  const jumpTo = (target: number) => {
    // Allow jumping back to any step <= current
    if (target > s.step) return;
    setS((p) => ({ ...p, step: target }));
  };

  const total = s.ac.systems * SYSTEM_PRICE + s.ac.additional * ADDON_PRICE;

  const submitPayment = (success: boolean) => {
    if (!success) {
      setS((p) => ({ ...p, terminal: "cancelled" }));
      return;
    }
    setS((p) => ({
      ...p,
      terminal: isCoordination ? "coordination" : "confirmed",
      reference: genReference(),
    }));
  };

  const reset = () => setS({ ...initialState });

  // Terminal screens take over the whole page
  if (s.terminal) {
    return <Terminal state={s} onRetry={() => setS((p) => ({ ...p, terminal: null }))} onReset={reset} unit={unit} slot={slot} />;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2">
            <div
              className="grid h-9 w-9 place-items-center rounded-lg text-white"
              style={{ backgroundColor: BRAND }}
            >
              <Wind className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold text-slate-900">Taylr</div>
              <div className="text-xs text-slate-500">AC service booking</div>
            </div>
          </div>
          <div className="text-xs text-slate-500">Need help? <a className="underline" href="#" style={{ color: BRAND }}>1300 TAYLR</a></div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <Stepper
          titles={stepTitles}
          currentDisplay={displayStep}
          totalSteps={totalSteps}
          jumpTo={jumpTo}
          internalStep={s.step}
          isCoordination={isCoordination}
        />

        <div className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="px-5 py-5 sm:px-7 sm:py-7">
            {s.step === 1 && <Step1 unit={unit} onSelect={selectUnit} role={s.role} setRole={setRole} />}
            {s.step === 2 && <Step2 s={s} update={update} />}
            {s.step === 3 && <Step3 s={s} update={update} unit={unit} total={total} />}
            {s.step === 4 && <Step4 s={s} update={update} setOwnerType={setOwnerType} setAccessMethod={setAccessMethod} />}
            {s.step === 5 && !isCoordination && <Step5 s={s} update={update} />}
            {s.step === 6 && <Step6 s={s} unit={unit} agency={agency} arrangeAgency={arrangeAgency} slot={slot} total={total} isCoordination={isCoordination} onPay={submitPayment} />}
          </div>

          {s.step !== 6 && (
            <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/60 px-5 py-4 sm:px-7">
              <Button
                variant="ghost"
                onClick={goBack}
                disabled={s.step === 1}
                data-testid="button-back"
                className="text-slate-700"
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Back
              </Button>
              <Button
                onClick={goNext}
                disabled={!stepValid}
                data-testid="button-next"
                className="text-white hover:opacity-90"
                style={{ backgroundColor: stepValid ? BRAND : undefined }}
              >
                Next
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          )}
          {s.step === 6 && (
            <div className="flex items-center justify-start border-t border-slate-200 bg-slate-50/60 px-5 py-4 sm:px-7">
              <Button variant="ghost" onClick={goBack} data-testid="button-back-review" className="text-slate-700">
                <ChevronLeft className="mr-1 h-4 w-4" />
                Back
              </Button>
            </div>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-slate-400">
          This is a UI mockup · Taylr · Prices in AUD incl. GST
        </p>
      </main>
    </div>
  );
}

function Stepper({
  titles,
  currentDisplay,
  totalSteps,
  jumpTo,
  internalStep,
  isCoordination,
}: {
  titles: string[];
  currentDisplay: number;
  totalSteps: number;
  jumpTo: (n: number) => void;
  internalStep: number;
  isCoordination: boolean;
}) {
  return (
    <div data-testid="stepper">
      {/* Desktop / tablet: full stepper */}
      <ol className="hidden items-center gap-2 sm:flex">
        {titles.map((title, idx) => {
          const num = idx + 1;
          const completed = num < currentDisplay;
          const current = num === currentDisplay;
          // Map display num → internal step (compensate for skipped step 5 in coordination)
          const target = isCoordination && num === 5 ? 6 : num;
          const canJump = target <= internalStep;
          return (
            <li key={title} className="flex flex-1 items-center gap-2">
              <button
                type="button"
                onClick={() => canJump && jumpTo(target)}
                disabled={!canJump}
                data-testid={`stepper-step-${num}`}
                className={`flex flex-1 items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition ${
                  current
                    ? "border-pink-200 bg-pink-50"
                    : completed
                      ? "border-slate-200 bg-white hover:bg-slate-50"
                      : "border-slate-200 bg-white opacity-60"
                } ${canJump ? "cursor-pointer" : "cursor-default"}`}
              >
                <span
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${
                    completed
                      ? "text-white"
                      : current
                        ? "text-white"
                        : "bg-slate-100 text-slate-500"
                  }`}
                  style={{
                    backgroundColor: completed || current ? BRAND : undefined,
                  }}
                >
                  {completed ? <Check className="h-3.5 w-3.5" /> : num}
                </span>
                <span className={`truncate text-xs font-medium ${current ? "text-slate-900" : "text-slate-600"}`}>
                  {title}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {/* Mobile: condensed */}
      <div className="sm:hidden">
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="font-medium text-slate-900">
            Step {currentDisplay} of {totalSteps}
          </span>
          <span className="text-slate-500">{titles[currentDisplay - 1]}</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full transition-all"
            style={{
              width: `${(currentDisplay / totalSteps) * 100}%`,
              backgroundColor: BRAND,
            }}
          />
        </div>
      </div>
    </div>
  );
}

/* ---------- Step 1: Unit & role ---------- */
function Step1({
  unit, onSelect, role, setRole,
}: {
  unit: Unit | null;
  onSelect: (id: string) => void;
  role: Role | null;
  setRole: (r: Role) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <StepShell
      icon={<Home className="h-5 w-5" />}
      title="Which unit is this booking for?"
      subtitle="Choose the apartment we'll be servicing, then tell us your role for this property."
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            data-testid="button-select-unit"
            className="flex w-full items-center justify-between rounded-lg border border-slate-300 bg-white px-4 py-3 text-left hover:border-slate-400"
          >
            <div className="flex items-center gap-3">
              <Search className="h-4 w-4 text-slate-400" />
              {unit ? (
                <div>
                  <div className="text-sm font-medium text-slate-900" data-testid="text-selected-unit-address">
                    {unit.address}
                  </div>
                  <div className="text-xs text-slate-500">Lot {unit.lot}</div>
                </div>
              ) : (
                <span className="text-sm text-slate-500">Search units…</span>
              )}
            </div>
            <ChevronRight className="h-4 w-4 text-slate-400" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search address or lot…" data-testid="input-search-unit" />
            <CommandList>
              <CommandEmpty>No units match.</CommandEmpty>
              <CommandGroup>
                {UNITS.map((u) => (
                  <CommandItem
                    key={u.id}
                    value={`${u.address} ${u.lot}`}
                    onSelect={() => {
                      onSelect(u.id);
                      setOpen(false);
                    }}
                    data-testid={`option-unit-${u.id}`}
                  >
                    <div className="flex w-full items-center justify-between">
                      <div>
                        <div className="text-sm">{u.address}</div>
                        <div className="text-xs text-slate-500">Lot {u.lot}{u.savedSystems != null ? ` · ${u.savedSystems} systems on file` : ""}</div>
                      </div>
                      {unit?.id === u.id && <Check className="h-4 w-4" style={{ color: BRAND }} />}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Note>
        Don't see your unit? Your strata committee may not have onboarded with Taylr yet — call us on 1300 TAYLR and we'll sort it out.
      </Note>

      {/* Role chooser — appears once a unit is selected (mirrors the live booking flow). */}
      {unit && (
        <div className="mt-6 border-t border-slate-100 pt-5">
          <div className="mb-1 flex items-center gap-2">
            <UserIcon className="h-4 w-4 text-slate-500" />
            <h3 className="text-sm font-semibold text-slate-900">Your role for this property</h3>
          </div>
          <p className="mb-3 text-xs text-slate-500">Are you the owner, or a managing agent?</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <RoleCard
              active={role === "owner"}
              onClick={() => setRole("owner")}
              icon={<Home className="h-5 w-5" />}
              title="Owner"
              desc="I own the unit (whether I live there or it's leased out)."
              testId="role-owner"
            />
            <RoleCard
              active={role === "agent"}
              onClick={() => setRole("agent")}
              icon={<Building2 className="h-5 w-5" />}
              title="Agent / Property Manager"
              desc="I manage this unit for the owner."
              testId="role-agent"
            />
          </div>
        </div>
      )}
    </StepShell>
  );
}

function RoleCard({
  active, onClick, icon, title, desc, testId,
}: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; desc: string; testId: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`button-${testId}`}
      className={`flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition ${
        active ? "border-pink-300 bg-pink-50 ring-2 ring-pink-200" : "border-slate-200 bg-white hover:border-slate-300"
      }`}
    >
      <div
        className={`grid h-9 w-9 place-items-center rounded-lg ${active ? "text-white" : "bg-slate-100 text-slate-700"}`}
        style={{ backgroundColor: active ? BRAND : undefined }}
      >
        {icon}
      </div>
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <div className="text-xs text-slate-500">{desc}</div>
    </button>
  );
}

/* ---------- Step 2: Booker details ---------- */
function Step2({ s, update }: { s: State; update: (p: Partial<State>) => void }) {
  return (
    <StepShell
      icon={<Mail className="h-5 w-5" />}
      title="Your contact details"
      subtitle="We'll use these to confirm your booking and reach you about the service."
    >
      {s.role === "agent" && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
          <Label className="mb-2 block text-xs font-medium text-slate-700">Agency</Label>
          <Select
            value={s.agencyId ?? undefined}
            onValueChange={(v) => update({ agencyId: v })}
          >
            <SelectTrigger data-testid="select-agency"><SelectValue placeholder="Choose your agency…" /></SelectTrigger>
            <SelectContent>
              {AGENCIES.map((a) => (
                <SelectItem key={a.id} value={a.id} data-testid={`option-agency-${a.id}`}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-2 text-xs text-slate-500">Agencies are pre-loaded by Taylr staff. If yours is missing, call 1300 TAYLR.</p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="firstName" className="mb-1.5 block text-xs font-medium text-slate-700">First name</Label>
          <Input
            id="firstName"
            value={s.booker.firstName}
            onChange={(e) => update({ booker: { ...s.booker, firstName: e.target.value } })}
            data-testid="input-first-name"
          />
        </div>
        <div>
          <Label htmlFor="lastName" className="mb-1.5 block text-xs font-medium text-slate-700">Last name</Label>
          <Input
            id="lastName"
            value={s.booker.lastName}
            onChange={(e) => update({ booker: { ...s.booker, lastName: e.target.value } })}
            data-testid="input-last-name"
          />
        </div>
        <div>
          <Label htmlFor="email" className="mb-1.5 block text-xs font-medium text-slate-700">Email</Label>
          <Input
            id="email"
            type="email"
            value={s.booker.email}
            onChange={(e) => update({ booker: { ...s.booker, email: e.target.value } })}
            data-testid="input-email"
          />
          {s.booker.email && !isEmail(s.booker.email) && (
            <p className="mt-1 text-xs text-rose-600">Please enter a valid email address.</p>
          )}
        </div>
        <div>
          <Label htmlFor="mobile" className="mb-1.5 block text-xs font-medium text-slate-700">Mobile</Label>
          <Input
            id="mobile"
            type="tel"
            placeholder="04xx xxx xxx"
            value={s.booker.mobile}
            onChange={(e) => update({ booker: { ...s.booker, mobile: e.target.value } })}
            data-testid="input-mobile"
          />
        </div>
      </div>
    </StepShell>
  );
}

/* ---------- Step 3: AC details ---------- */
function Step3({ s, update, unit, total }: { s: State; update: (p: Partial<State>) => void; unit: Unit | null; total: number }) {
  const hasSaved = unit && (unit.savedSystems != null || unit.savedAdditional != null);
  return (
    <StepShell
      icon={<Wind className="h-5 w-5" />}
      title="How many AC systems are at the unit?"
      subtitle={
        <>
          A <strong>system</strong> = one outdoor unit + one indoor unit. Some setups have extra indoor units running off a single
          outdoor unit ("multi-split") — count those separately as additional indoor units.
        </>
      }
    >
      {hasSaved && (
        <Note>
          Our records show <strong>{unit.savedSystems ?? 0} systems</strong> with <strong>{unit.savedAdditional ?? 0} additional indoor units</strong> from your last service. Adjust below if anything has changed.
        </Note>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Counter
          label="Number of systems"
          value={s.ac.systems}
          min={1}
          max={10}
          onChange={(v) => update({ ac: { ...s.ac, systems: v } })}
          subLabel={`× $${SYSTEM_PRICE}`}
          testId="systems"
        />
        <Counter
          label="Additional indoor units"
          value={s.ac.additional}
          min={0}
          max={29}
          onChange={(v) => update({ ac: { ...s.ac, additional: v } })}
          subLabel={`× $${ADDON_PRICE}`}
          testId="additional"
        />
      </div>

      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/60 p-4 text-xs text-slate-600">
        <div className="flex items-start gap-2">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
          <div>
            <strong className="text-slate-900">Tip:</strong> not sure how many indoor units you have? Count your remote controls — there's typically one per indoor unit.
          </div>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Total (incl. GST)</div>
          <div className="text-xs text-slate-500">
            {s.ac.systems} × ${SYSTEM_PRICE} {s.ac.additional > 0 ? `+ ${s.ac.additional} × $${ADDON_PRICE}` : ""}
          </div>
        </div>
        <div className="text-2xl font-bold text-slate-900" data-testid="text-total-step3">${total.toFixed(0)}</div>
      </div>
    </StepShell>
  );
}

function Counter({
  label, value, min, max, onChange, subLabel, testId,
}: { label: string; value: number; min: number; max: number; onChange: (v: number) => void; subLabel: string; testId: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <Label className="text-xs font-medium text-slate-700">{label}</Label>
        <span className="text-xs text-slate-500">{subLabel}</span>
      </div>
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          data-testid={`button-${testId}-dec`}
          className="h-9 w-9"
        >
          –
        </Button>
        <div className="text-2xl font-semibold text-slate-900" data-testid={`text-${testId}-value`}>{value}</div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          data-testid={`button-${testId}-inc`}
          className="h-9 w-9"
        >
          +
        </Button>
      </div>
    </div>
  );
}

/* ---------- Step 4: Property access ---------- */
function Step4({
  s, update, setOwnerType, setAccessMethod,
}: {
  s: State;
  update: (p: Partial<State>) => void;
  setOwnerType: (o: OwnerType) => void;
  setAccessMethod: (m: AccessMethod) => void;
}) {
  // Build the access options list
  let methods: { value: AccessMethod; label: string; desc: string }[] = [];
  if (s.role === "owner" && s.ownerType === "live_in") {
    methods = [
      { value: "owner_present", label: "I'll be at the unit", desc: "You'll be home during the service window." },
      { value: "leave_key", label: "I'll leave a key with someone", desc: "Hand your key to a neighbour, friend, or building manager." },
      { value: "collect_return", label: "Please collect and return my key", desc: "We pick up the key from a nearby location and return it after." },
    ];
  } else if (s.role === "owner" && s.ownerType === "leased_out") {
    methods = [
      { value: "owner_present_leased", label: "I'll be there to provide access", desc: "You'll meet the technician at the unit." },
      { value: "arrange_tenant_owner", label: "Arrange with tenant", desc: "We'll contact the tenant directly to find a suitable time." },
      { value: "arrange_agent_owner", label: "Arrange with agent", desc: "We'll coordinate with the managing agent." },
      { value: "leave_key_leased", label: "I'll leave a key with someone", desc: "Hand your key to a neighbour, friend, or building manager." },
    ];
  } else if (s.role === "agent") {
    methods = [
      { value: "agent_present", label: "I'll be there to provide access", desc: "You'll meet the technician at the unit." },
      { value: "arrange_tenant_agent", label: "Please arrange with tenant", desc: "We'll contact the tenant directly to find a suitable time." },
      { value: "collect_agent_trade_key", label: "Please collect & return agent trade key", desc: "We pick up your agency trade key and return it after the service." },
    ];
  }

  return (
    <StepShell
      icon={<KeyRound className="h-5 w-5" />}
      title="How will the technician get into the unit?"
      subtitle="Pick the option that works best — you'll fill in any extra details below."
    >
      {/* Layer A: Owner only */}
      {s.role === "owner" && (
        <div className="mb-5">
          <Label className="mb-2 block text-xs font-medium text-slate-700">Do you live in this unit?</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            <SmallChoice
              active={s.ownerType === "live_in"}
              onClick={() => setOwnerType("live_in")}
              testId="owner-live-in"
              label="I live in the property"
            />
            <SmallChoice
              active={s.ownerType === "leased_out"}
              onClick={() => setOwnerType("leased_out")}
              testId="owner-leased-out"
              label="The property is leased out"
            />
          </div>
        </div>
      )}

      {/* Access method options */}
      {(s.role === "agent" || (s.role === "owner" && s.ownerType)) && (
        <div className="mb-5">
          <Label className="mb-2 block text-xs font-medium text-slate-700">Access method</Label>
          <RadioGroup
            value={s.accessMethod ?? ""}
            onValueChange={(v) => setAccessMethod(v as AccessMethod)}
            className="grid gap-2"
          >
            {methods.map((m) => (
              <label
                key={m.value}
                htmlFor={`am-${m.value}`}
                data-testid={`radio-${m.value}`}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${
                  s.accessMethod === m.value ? "border-pink-300 bg-pink-50" : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <RadioGroupItem id={`am-${m.value}`} value={m.value} className="mt-0.5" />
                <div>
                  <div className="text-sm font-medium text-slate-900">{m.label}</div>
                  <div className="text-xs text-slate-500">{m.desc}</div>
                </div>
              </label>
            ))}
          </RadioGroup>
        </div>
      )}

      {/* Layer C: per-method follow-ups */}
      {s.accessMethod && (
        <AccessFollowups s={s} update={update} />
      )}

      {/* Optional notes */}
      {s.accessMethod && (
        <div className="mt-5">
          <Label htmlFor="access-notes" className="mb-1.5 block text-xs font-medium text-slate-700">
            Additional access notes (optional)
          </Label>
          <Textarea
            id="access-notes"
            placeholder="e.g. visitor parking is on Level B2, intercom code 4421, beware of the cat…"
            value={s.notes}
            onChange={(e) => update({ notes: e.target.value })}
            data-testid="input-access-notes"
            rows={3}
          />
        </div>
      )}
    </StepShell>
  );
}

function SmallChoice({ active, onClick, testId, label }: { active: boolean; onClick: () => void; testId: string; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`button-${testId}`}
      className={`rounded-lg border px-3 py-2.5 text-left text-sm transition ${
        active ? "border-pink-300 bg-pink-50 text-slate-900" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
      }`}
    >
      {label}
    </button>
  );
}

function AccessFollowups({ s, update }: { s: State; update: (p: Partial<State>) => void }) {
  const m = s.accessMethod!;
  if (m === "owner_present" || m === "owner_present_leased" || m === "agent_present") {
    return (
      <Note>
        Great — no extra details needed. Make sure someone is at the unit when the technician arrives.
      </Note>
    );
  }

  if (m === "leave_key" || m === "leave_key_leased") {
    return (
      <>
        <Note>
          If someone is unable to be present during the available service windows, you may leave a key with someone (e.g. a neighbour or friend) before the scheduled service.
        </Note>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="mb-1.5 block text-xs font-medium text-slate-700">Key holder's name</Label>
            <Input
              value={s.keyHolderName}
              onChange={(e) => update({ keyHolderName: e.target.value })}
              data-testid="input-keyholder-name"
            />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs font-medium text-slate-700">Key holder's phone</Label>
            <Input
              type="tel"
              value={s.keyHolderPhone}
              onChange={(e) => update({ keyHolderPhone: e.target.value })}
              data-testid="input-keyholder-phone"
            />
          </div>
        </div>
      </>
    );
  }

  if (m === "collect_return") {
    return (
      <>
        <Note>
          We offer a key collection service for unit owners within roughly 5 km of the building. Tell us where to pick the key up from, and how you'd like it returned.
        </Note>
        <div className="mt-3 space-y-3">
          <div>
            <Label className="mb-1.5 block text-xs font-medium text-slate-700">Key collection location</Label>
            <Input
              placeholder="e.g. concierge at 12 Sample St, or 'leave with neighbour Anna at 5/12'"
              value={s.keyLocation}
              onChange={(e) => update({ keyLocation: e.target.value })}
              data-testid="input-key-location"
            />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs font-medium text-slate-700">Return method</Label>
            <RadioGroup
              value={s.returnMethod}
              onValueChange={(v) => update({ returnMethod: v as State["returnMethod"] })}
              className="grid gap-2 sm:grid-cols-2"
            >
              <label
                htmlFor="rm-locker"
                className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 ${
                  s.returnMethod === "locker" ? "border-pink-300 bg-pink-50" : "border-slate-200 bg-white"
                }`}
              >
                <RadioGroupItem id="rm-locker" value="locker" className="mt-0.5" />
                <div className="text-sm">Secure onsite locker</div>
              </label>
              <label
                htmlFor="rm-hand"
                className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 ${
                  s.returnMethod === "hand_delivery" ? "border-pink-300 bg-pink-50" : "border-slate-200 bg-white"
                }`}
              >
                <RadioGroupItem id="rm-hand" value="hand_delivery" className="mt-0.5" />
                <div className="text-sm">Hand delivery next business day</div>
              </label>
            </RadioGroup>
          </div>
        </div>
        <SignatureBlock s={s} update={update} text={SIG_COLLECT} />
      </>
    );
  }

  if (m === "arrange_tenant_owner" || m === "arrange_tenant_agent") {
    return (
      <>
        <Note>
          We'll contact the tenant(s) below to arrange the service time. An authorisation letter will also be sent so they know the request is legitimate. After payment we'll work directly with them and email you when the date is confirmed.
        </Note>
        <div className="mt-3 space-y-3">
          {s.tenants.map((t, i) => (
            <div key={i} className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-xs font-semibold text-slate-700">Tenant {i + 1}</div>
                {s.tenants.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => update({ tenants: s.tenants.filter((_, j) => j !== i) })}
                    data-testid={`button-remove-tenant-${i}`}
                    className="h-7 px-2 text-xs text-slate-500 hover:text-rose-600"
                  >
                    <Trash2 className="mr-1 h-3 w-3" /> Remove
                  </Button>
                )}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  placeholder="First name"
                  value={t.firstName}
                  onChange={(e) => {
                    const next = [...s.tenants];
                    next[i] = { ...t, firstName: e.target.value };
                    update({ tenants: next });
                  }}
                  data-testid={`input-tenant-firstname-${i}`}
                />
                <Input
                  placeholder="Last name"
                  value={t.lastName}
                  onChange={(e) => {
                    const next = [...s.tenants];
                    next[i] = { ...t, lastName: e.target.value };
                    update({ tenants: next });
                  }}
                  data-testid={`input-tenant-lastname-${i}`}
                />
                <Input
                  type="email"
                  placeholder="Email"
                  value={t.email}
                  onChange={(e) => {
                    const next = [...s.tenants];
                    next[i] = { ...t, email: e.target.value };
                    update({ tenants: next });
                  }}
                  data-testid={`input-tenant-email-${i}`}
                />
                <Input
                  type="tel"
                  placeholder="Phone"
                  value={t.phone}
                  onChange={(e) => {
                    const next = [...s.tenants];
                    next[i] = { ...t, phone: e.target.value };
                    update({ tenants: next });
                  }}
                  data-testid={`input-tenant-phone-${i}`}
                />
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() => update({ tenants: [...s.tenants, { firstName: "", lastName: "", email: "", phone: "" }] })}
            data-testid="button-add-tenant"
            className="w-full border-dashed"
          >
            <Plus className="mr-1.5 h-4 w-4" /> Add another tenant
          </Button>
        </div>
        <SignatureBlock s={s} update={update} text={SIG_TENANT} />
      </>
    );
  }

  if (m === "arrange_agent_owner") {
    return (
      <>
        <Note>
          Pick the agency that manages this unit. We'll contact them directly after payment to arrange the service time.
        </Note>
        <div className="mt-3">
          <Label className="mb-1.5 block text-xs font-medium text-slate-700">Managing agency</Label>
          <Select
            value={s.arrangeAgencyId ?? undefined}
            onValueChange={(v) => update({ arrangeAgencyId: v })}
          >
            <SelectTrigger data-testid="select-arrange-agency"><SelectValue placeholder="Choose agency…" /></SelectTrigger>
            <SelectContent>
              {AGENCIES.map((a) => (
                <SelectItem key={a.id} value={a.id} data-testid={`option-arrange-agency-${a.id}`}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </>
    );
  }

  if (m === "collect_agent_trade_key") {
    return (
      <>
        <Note>
          We'll collect your agency trade key from your office, perform the service, and return it the next business day. Your agency only needs to authorise the access below.
        </Note>
        <SignatureBlock s={s} update={update} text={SIG_AGENT_TRADE} />
      </>
    );
  }

  return null;
}

function SignatureBlock({ s, update, text }: { s: State; update: (p: Partial<State>) => void; text: string }) {
  const today = new Date().toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-700">
        <CheckCircle2 className="h-4 w-4" style={{ color: BRAND }} /> Authorisation
      </div>
      <div
        className="mb-3 max-h-40 overflow-y-auto whitespace-pre-line rounded-md border border-slate-200 bg-white p-3 text-xs leading-relaxed text-slate-700"
        data-testid="text-signature-terms"
      >
        {text}
      </div>
      <label className="mb-3 flex cursor-pointer items-start gap-2 text-sm">
        <Checkbox
          checked={s.sigAgreed}
          onCheckedChange={(v) => update({ sigAgreed: v === true })}
          data-testid="checkbox-sig-agree"
          className="mt-0.5"
        />
        <span className="text-slate-700">I have read and agree to the above</span>
      </label>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <div>
          <Label className="mb-1.5 block text-xs font-medium text-slate-700">Your full name (typed signature)</Label>
          <Input
            value={s.sigName}
            onChange={(e) => update({ sigName: e.target.value })}
            data-testid="input-sig-name"
          />
        </div>
        <div className="sm:self-end">
          <Label className="mb-1.5 block text-xs font-medium text-slate-700">Date</Label>
          <Input value={today} readOnly className="w-44 bg-slate-100 text-slate-600" data-testid="input-sig-date" />
        </div>
      </div>
    </div>
  );
}

/* ---------- Step 5: Schedule ---------- */
function Step5({ s, update }: { s: State; update: (p: Partial<State>) => void }) {
  // group slots by date
  const grouped = useMemo(() => {
    const map = new Map<string, { date: string; label: string; morning?: Slot; afternoon?: Slot }>();
    for (const slot of SLOTS) {
      const entry = map.get(slot.date) ?? { date: slot.date, label: slot.label };
      if (slot.window === "morning") entry.morning = slot;
      else entry.afternoon = slot;
      map.set(slot.date, entry);
    }
    return Array.from(map.values());
  }, []);

  return (
    <StepShell
      icon={<CalendarIcon className="h-5 w-5" />}
      title="When should we come out?"
      subtitle="Pick a date and a window. The technician will arrive within the chosen window."
    >
      <div className="space-y-2">
        {grouped.map((g) => (
          <div key={g.date} className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="mb-2 text-sm font-semibold text-slate-900">{g.label}</div>
            <div className="grid gap-2 sm:grid-cols-2">
              <SlotChip
                slot={g.morning}
                selected={s.scheduleSlotId === g.morning?.id}
                onSelect={() => g.morning && update({ scheduleSlotId: g.morning.id })}
                icon={<Sun className="h-4 w-4" />}
                title="Morning"
                hint="8am – 12pm"
              />
              <SlotChip
                slot={g.afternoon}
                selected={s.scheduleSlotId === g.afternoon?.id}
                onSelect={() => g.afternoon && update({ scheduleSlotId: g.afternoon.id })}
                icon={<Moon className="h-4 w-4" />}
                title="Afternoon"
                hint="12pm – 5pm"
              />
            </div>
          </div>
        ))}
      </div>
    </StepShell>
  );
}

function SlotChip({
  slot, selected, onSelect, icon, title, hint,
}: { slot?: Slot; selected: boolean; onSelect: () => void; icon: React.ReactNode; title: string; hint: string }) {
  if (!slot) return null;
  const full = slot.remaining <= 0;
  return (
    <button
      type="button"
      disabled={full}
      onClick={onSelect}
      data-testid={`slot-${slot.id}`}
      className={`flex items-center justify-between rounded-lg border px-3 py-2.5 text-left transition ${
        full
          ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
          : selected
            ? "border-pink-300 bg-pink-50 text-slate-900"
            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`grid h-7 w-7 place-items-center rounded-full ${selected ? "text-white" : "bg-slate-100 text-slate-600"}`} style={{ backgroundColor: selected ? BRAND : undefined }}>
          {icon}
        </span>
        <div>
          <div className="text-sm font-medium">{title}</div>
          <div className="text-xs text-slate-500">{hint}</div>
        </div>
      </div>
      <span className={`text-xs ${full ? "text-slate-400" : "text-slate-500"}`}>
        {full ? "Full" : `${slot.remaining} left`}
      </span>
    </button>
  );
}

/* ---------- Step 6: Review & pay ---------- */
function Step6({
  s, unit, agency, arrangeAgency, slot, total, isCoordination, onPay,
}: {
  s: State;
  unit: Unit | null;
  agency: Agency | null;
  arrangeAgency: Agency | null;
  slot: Slot | null;
  total: number;
  isCoordination: boolean;
  onPay: (success: boolean) => void;
}) {
  const accessLabel = (() => {
    switch (s.accessMethod) {
      case "owner_present": return "I'll be at the unit";
      case "leave_key": return "I'll leave a key with someone";
      case "collect_return": return "Please collect and return my key";
      case "owner_present_leased": return "I'll be there to provide access";
      case "arrange_tenant_owner":
      case "arrange_tenant_agent":
        return "Arrange with tenant";
      case "arrange_agent_owner": return "Arrange with agent";
      case "leave_key_leased": return "I'll leave a key with someone";
      case "agent_present": return "I'll be there to provide access";
      case "collect_agent_trade_key": return "Collect & return agent trade key";
      default: return "—";
    }
  })();

  return (
    <StepShell
      icon={<CreditCard className="h-5 w-5" />}
      title="Review and pay"
      subtitle="Have one last look. Once payment goes through, we'll lock in your booking."
    >
      <div className="space-y-2">
        <ReviewRow label="Unit" value={unit ? <span><div>{unit.address}</div><div className="text-xs text-slate-500">Lot {unit.lot}</div></span> : "—"} />
        <ReviewRow label="Role" value={
          s.role === "agent"
            ? <>Agent / Property Manager{agency && <div className="text-xs text-slate-500">{agency.name}</div>}</>
            : "Owner"
        } />
        <ReviewRow label="Booker" value={
          <>
            <div>{s.booker.firstName} {s.booker.lastName}</div>
            <div className="text-xs text-slate-500">{s.booker.email} · {s.booker.mobile}</div>
          </>
        } />
        <ReviewRow label="AC systems" value={`${s.ac.systems} system${s.ac.systems > 1 ? "s" : ""}${s.ac.additional > 0 ? ` + ${s.ac.additional} additional indoor unit${s.ac.additional > 1 ? "s" : ""}` : ""}`} />
        <ReviewRow label="Access method" value={
          <>
            <div>{accessLabel}</div>
            {s.accessMethod === "arrange_agent_owner" && arrangeAgency && (
              <div className="text-xs text-slate-500">via {arrangeAgency.name}</div>
            )}
            {(s.accessMethod === "arrange_tenant_owner" || s.accessMethod === "arrange_tenant_agent") && (
              <div className="text-xs text-slate-500">{s.tenants.length} tenant{s.tenants.length > 1 ? "s" : ""} on file</div>
            )}
            {(s.accessMethod === "leave_key" || s.accessMethod === "leave_key_leased") && s.keyHolderName && (
              <div className="text-xs text-slate-500">Key with {s.keyHolderName}</div>
            )}
            {s.notes && <div className="mt-1 text-xs text-slate-500">Notes: {s.notes}</div>}
          </>
        } />
        <ReviewRow
          label="Service time"
          value={
            isCoordination
              ? <span className="text-slate-600 italic">We'll contact your {s.accessMethod === "arrange_agent_owner" ? "agent" : "tenant(s)"} after payment to arrange a service time. You'll be emailed once the date is confirmed.</span>
              : slot
                ? <>
                    <div>{slot.label}</div>
                    <div className="text-xs text-slate-500 capitalize">{slot.window} window</div>
                  </>
                : "—"
          }
        />
      </div>

      <div className="mt-5 flex items-center justify-between rounded-xl border-2 p-4" style={{ borderColor: BRAND }}>
        <div>
          <div className="text-xs uppercase tracking-wide" style={{ color: BRAND }}>Total to pay</div>
          <div className="text-xs text-slate-500">incl. GST</div>
        </div>
        <div className="text-3xl font-bold text-slate-900" data-testid="text-total-final">${total.toFixed(0)}</div>
      </div>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <Button
          onClick={() => onPay(true)}
          data-testid="button-pay"
          className="flex-1 text-white hover:opacity-90"
          style={{ backgroundColor: BRAND }}
        >
          <CreditCard className="mr-2 h-4 w-4" /> Pay now ${total.toFixed(0)}
        </Button>
        {s.role === "agent" && (
          <Button
            disabled
            variant="outline"
            data-testid="button-pay-later"
            className="flex-1 cursor-not-allowed"
          >
            Pay later (invoice) — coming soon
          </Button>
        )}
      </div>

      <button
        type="button"
        onClick={() => onPay(false)}
        data-testid="button-cancel-payment"
        className="mt-3 w-full text-center text-xs text-slate-400 underline-offset-2 hover:underline"
      >
        Simulate cancelled payment (mockup only)
      </button>
    </StepShell>
  );
}

function ReviewRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-2.5 last:border-b-0">
      <div className="w-32 shrink-0 text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="flex-1 text-right text-sm text-slate-900">{value}</div>
    </div>
  );
}

/* ---------- Terminal screens ---------- */
function Terminal({
  state, onRetry, onReset, unit, slot,
}: { state: State; onRetry: () => void; onReset: () => void; unit: Unit | null; slot: Slot | null }) {
  if (state.terminal === "cancelled") {
    return (
      <TerminalShell
        icon={<XCircle className="h-7 w-7 text-rose-500" />}
        title="Payment cancelled"
        body="Your booking hasn't been confirmed. No payment has been taken. You can try again whenever you're ready."
        primary={<Button onClick={onRetry} className="text-white" style={{ backgroundColor: BRAND }} data-testid="button-try-again">Try again</Button>}
      />
    );
  }
  if (state.terminal === "confirmed") {
    return (
      <TerminalShell
        icon={<CheckCircle2 className="h-7 w-7 text-emerald-500" />}
        title="Booking confirmed"
        body={
          <>
            Thanks! Your AC service is scheduled for <strong>{slot?.label}</strong> in the <strong>{slot?.window}</strong> window.
            Our technician will arrive within that window. We've sent a confirmation email to <strong>{state.booker.email}</strong>.
            <div className="mt-3 text-xs text-slate-500">{unit?.address}</div>
          </>
        }
        reference={state.reference}
        primary={<Button variant="outline" onClick={onReset} data-testid="button-new-booking">Make another booking</Button>}
      />
    );
  }
  // coordination
  return (
    <TerminalShell
      icon={<CheckCircle2 className="h-7 w-7 text-emerald-500" />}
      title="Payment received"
      body={
        <>
          Thanks! We'll now contact{" "}
          {state.accessMethod === "arrange_agent_owner" ? "the managing agent" : "your tenant(s)"}{" "}
          to arrange a service time. You'll be emailed at <strong>{state.booker.email}</strong> once a date is confirmed.
          <div className="mt-3 text-xs text-slate-500">{unit?.address}</div>
        </>
      }
      reference={state.reference}
      primary={<Button variant="outline" onClick={onReset} data-testid="button-new-booking-coord">Make another booking</Button>}
    />
  );
}

function TerminalShell({
  icon, title, body, reference, primary,
}: { icon: React.ReactNode; title: string; body: React.ReactNode; reference?: string | null; primary: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-lg text-white" style={{ backgroundColor: BRAND }}>
              <Wind className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold text-slate-900">Taylr</div>
              <div className="text-xs text-slate-500">AC service booking</div>
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-xl px-5 py-12">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-slate-50">
            {icon}
          </div>
          <h1 className="mt-4 text-xl font-semibold text-slate-900" data-testid="text-terminal-title">{title}</h1>
          <div className="mt-2 text-sm text-slate-600" data-testid="text-terminal-body">{body}</div>
          {reference && (
            <div className="mt-5 inline-flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <span>Reference</span>
              <span className="font-mono font-semibold text-slate-900" data-testid="text-reference">{reference}</span>
            </div>
          )}
          <div className="mt-6 flex justify-center">{primary}</div>
        </div>
      </main>
    </div>
  );
}

/* ---------- Generic helpers ---------- */
function StepShell({
  icon, title, subtitle, children,
}: { icon: React.ReactNode; title: string; subtitle?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-4 flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-pink-50" style={{ color: BRAND }}>
          {icon}
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-900 sm:text-lg">{title}</h2>
          {subtitle && <p className="mt-1 text-xs text-slate-600 sm:text-sm">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50/60 p-3 text-xs text-slate-700">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
      <div>{children}</div>
    </div>
  );
}
