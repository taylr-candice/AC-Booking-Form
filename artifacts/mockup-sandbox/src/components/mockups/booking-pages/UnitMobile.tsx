import React, { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Briefcase,
  CheckCircle2,
  ChevronDown,
  Lock,
  Search,
  User,
} from "lucide-react";
import { bookingActions, useBookingSelector } from "../../../state/bookingSession";
import {
  canContinueStep1,
  validateEmail,
  validatePhone,
  validateRequired,
} from "../../../state/bookingDerived";
import {
  DEMO_MANAGING_AGENCIES,
  isOtherAgency,
} from "../../../state/accessMethodCatalog";
import {
  findRolloutForBooking,
  getActiveBookingForUnit,
  getLiveBookings,
  getLiveBookingsVersion,
  subscribeLiveBookings,
  type ActiveBookingForUnit,
  type AdminBooking,
} from "../../../state/adminMockData";

const BRAND = "#ED017F";
const SELECTED_GREEN = "#5FBB97";
const ERROR_PURPLE = "#9747FF";

type Unit = {
  id: string;
  address: string;
  lot: string;
  building: string;
};

// Mirror UnitDesktop so the demo's per-unit AC type assignment
// (u1 → ducted, u2 → split) works consistently on both surfaces.
const UNITS: Unit[] = [
  { id: "u1", address: "G01 / 335 Aspen Village",   lot: "Lot 3",   building: "Aspen Village · Greenway ACT 2900" },
  { id: "u2", address: "12 / 88 Marine Parade",     lot: "Lot 12",  building: "Oceanview · Coogee NSW 2034" },
  { id: "u3", address: "3 / 4 Example Street",      lot: "Lot 3",   building: "The Example · Bondi NSW 2026" },
  { id: "u4", address: "705 / 21 Bourke Street",    lot: "Lot 705", building: "Bourke Tower · Surry Hills NSW 2010" },
  { id: "u5", address: "18 / 142 Anzac Parade",     lot: "Lot 18",  building: "Anzac Gardens · Kensington NSW 2033" },
];

function FieldError({ id, message }: { id: string; message: string | null }) {
  if (!message) return null;
  return (
    <div
      id={id}
      role="alert"
      aria-live="polite"
      className="mt-1.5 flex items-start gap-1.5 text-[12px] font-medium"
      style={{ color: ERROR_PURPLE }}
    >
      <AlertCircle className="h-3.5 w-3.5 mt-px shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

const baseInputClass =
  "w-full rounded-xl border bg-white px-3 py-2.5 text-[15px] text-slate-900 outline-none";

function inputClassFor(hasError: boolean) {
  return `${baseInputClass} ${
    hasError ? "" : "border-slate-200 focus:border-slate-400"
  }`;
}

function errorStyle(hasError: boolean): React.CSSProperties | undefined {
  return hasError
    ? { borderColor: ERROR_PURPLE, boxShadow: `0 0 0 1px ${ERROR_PURPLE}` }
    : undefined;
}

/** See {@link UnitDesktop}'s `formatPaidReason` — same copy, kept in
 *  sync between the two surfaces so the customer sees identical
 *  reasoning on either device. */
function formatPaidReason(b: AdminBooking): string {
  const who = b.customerName || "another customer";
  if (
    b.serviceDate &&
    (b.serviceSlot === "morning" || b.serviceSlot === "afternoon")
  ) {
    const window =
      b.serviceSlot === "morning" ? "morning" : "afternoon";
    return `${who} booked ${b.serviceDate} ${window}`;
  }
  return `${who} has a confirmed booking`;
}

export function UnitMobile() {
  const sessionUnitId = useBookingSelector((s) => s.unit_id);
  const role = useBookingSelector((s) => s.role);
  const agencyId = useBookingSelector((s) => s.agency_id);
  const agencyOtherName = useBookingSelector((s) => s.agency_other_name);
  const firstName = useBookingSelector((s) => s.contact_first_name);
  const lastName = useBookingSelector((s) => s.contact_last_name);
  const email = useBookingSelector((s) => s.contact_email);
  const mobile = useBookingSelector((s) => s.contact_phone);

  const [selectedId, setSelectedId] = useState<string | null>(sessionUnitId);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [agencyOpen, setAgencyOpen] = useState(false);
  const [touched, setTouched] = useState({
    agency: false,
    agencyOther: false,
    firstName: false,
    lastName: false,
    email: false,
    mobile: false,
  });

  const isAgent = role === "agent";
  const showOtherInput = isAgent && isOtherAgency(agencyId);

  useEffect(() => {
    if (sessionUnitId !== selectedId) setSelectedId(sessionUnitId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionUnitId]);

  // Reset search whenever the dropdown closes so it opens fresh next time.
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  useEffect(() => {
    if (!isAgent) {
      setTouched((t) =>
        t.agency || t.agencyOther ? { ...t, agency: false, agencyOther: false } : t,
      );
      setAgencyOpen(false);
    }
  }, [isAgent]);

  useEffect(() => {
    if (!showOtherInput) {
      setTouched((t) => (t.agencyOther ? { ...t, agencyOther: false } : t));
    }
  }, [showOtherInput]);

  // See `UnitDesktop` — per-unit "is this unit already taken?" lookup
  // so each row in the dropdown can be disabled (paid) or warned about
  // (invoice_pending) inline. Same source data and helper used.
  // Read the live bookings list (which the admin shell mutates on
  // cancel / reschedule / supersede) and re-render via
  // `useSyncExternalStore` whenever the version bumps. In
  // canvas-isolated mode the listener never fires and the source
  // returns `SEEDED_BOOKINGS`.
  const liveBookingsVersion = useSyncExternalStore(
    subscribeLiveBookings,
    getLiveBookingsVersion,
    getLiveBookingsVersion,
  );
  const unitStatuses = useMemo(() => {
    void liveBookingsVersion;
    const liveBookings = getLiveBookings();
    const out = new Map<string, ActiveBookingForUnit>();
    for (const u of UNITS) {
      const rollout = findRolloutForBooking("svc-ac", u.id);
      out.set(
        u.id,
        getActiveBookingForUnit(u.id, liveBookings, rollout?.id ?? null),
      );
    }
    return out;
  }, [liveBookingsVersion]);
  const selected = UNITS.find((u) => u.id === selectedId);
  const selectedStatus = selected ? unitStatuses.get(selected.id) : undefined;
  const canContinue = canContinueStep1({
    unit_id: selectedId,
    role,
    agency_id: agencyId,
    agency_other_name: agencyOtherName,
    contact_first_name: firstName,
    contact_last_name: lastName,
    contact_email: email,
    contact_phone: mobile,
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return UNITS;
    return UNITS.filter((u) =>
      `${u.address} ${u.lot} ${u.building}`.toLowerCase().includes(q),
    );
  }, [query]);

  const selectUnit = (id: string) => {
    if (unitStatuses.get(id)?.kind === "paid") return;
    setSelectedId(id);
    bookingActions.setUnit(id);
    setOpen(false);
  };

  const errors = {
    agency: isAgent && !agencyId ? "Please select your agency" : null,
    agencyOther:
      showOtherInput && !agencyOtherName.trim()
        ? "Please tell us your agency name"
        : null,
    firstName: validateRequired(firstName, "First name"),
    lastName: validateRequired(lastName, "Last name"),
    email: validateEmail(email),
    mobile: validatePhone(mobile),
  };
  const showErr = (field: keyof typeof touched) =>
    touched[field] && !!errors[field];
  const markTouched = (field: keyof typeof touched) =>
    setTouched((t) => ({ ...t, [field]: true }));
  const errorIds = {
    agency: "step1-agency-mobile-error",
    agencyOther: "step1-agency-other-mobile-error",
    firstName: "step1-first-mobile-error",
    lastName: "step1-last-mobile-error",
    email: "step1-email-mobile-error",
    mobile: "step1-mobile-mobile-error",
  } as const;

  const selectedAgency = DEMO_MANAGING_AGENCIES.find((a) => a.id === agencyId);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-white font-['Inter']">
      <div className="flex items-start justify-between px-5 pb-2 pt-5">
        <div className="min-w-0 flex-1 pr-3">
          <h1 className="text-[26px] font-semibold leading-tight text-slate-900">
            Select the property
          </h1>
          <p className="mt-1 text-[14px] leading-snug text-slate-500">
            For which the service will take place
          </p>
        </div>
        <button
          type="button"
          aria-label="Back"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 transition hover:bg-pink-50"
          style={{ borderColor: BRAND, color: BRAND }}
          data-testid="button-back-mobile"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-6 pt-4">
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            data-testid="dropdown-unit-trigger"
            aria-expanded={open}
            className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-300 bg-white px-4 py-3.5 text-left shadow-sm transition hover:border-slate-400"
          >
            <div className="min-w-0 flex-1">
              {selected ? (
                <>
                  <div className="truncate text-[15px] font-semibold text-slate-900">
                    {selected.address}
                  </div>
                  <div className="mt-0.5 truncate text-[12px] text-slate-500">
                    {selected.lot} · {selected.building}
                  </div>
                </>
              ) : (
                <span className="text-[15px] text-slate-400">Select a property…</span>
              )}
            </div>
            <ChevronDown
              className={`h-5 w-5 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
            />
          </button>

          {open && (
            <div className="absolute inset-x-0 top-full z-20 mt-2 flex max-h-[420px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
              <div className="border-b border-slate-100 p-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search by lot, street or building…"
                    data-testid="input-unit-search"
                    aria-label="Search properties"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-[13px] text-slate-900 placeholder:text-slate-400 focus:border-slate-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-200"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto py-1">
                {filtered.length === 0 ? (
                  <div
                    className="px-4 py-6 text-center text-[13px] text-slate-500"
                    data-testid="dropdown-unit-empty"
                  >
                    No properties match "{query.trim()}"
                  </div>
                ) : (
                  filtered.map((u) => {
                    const active = u.id === selectedId;
                    const status = unitStatuses.get(u.id);
                    const blocked = status?.kind === "paid";
                    const reason = blocked
                      ? formatPaidReason(status.booking)
                      : null;
                    return (
                      <button
                        key={u.id}
                        type="button"
                        disabled={blocked}
                        onClick={() => selectUnit(u.id)}
                        data-testid={`dropdown-unit-${u.id}`}
                        aria-disabled={blocked}
                        className={`flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition ${
                          blocked
                            ? "cursor-not-allowed bg-slate-50 opacity-70"
                            : active
                              ? "bg-pink-50"
                              : "hover:bg-slate-50"
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div
                            className={`flex items-center gap-1.5 truncate text-[14px] font-semibold ${
                              blocked
                                ? "text-slate-500 line-through"
                                : active
                                  ? "text-pink-700"
                                  : "text-slate-900"
                            }`}
                          >
                            {blocked && (
                              <Lock className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                            )}
                            <span className="truncate">{u.address}</span>
                          </div>
                          <div className="mt-0.5 truncate text-[11px] text-slate-500">
                            {u.lot} · {u.building}
                          </div>
                          {blocked && (
                            <div
                              className="mt-1 truncate text-[11px] font-medium text-slate-600"
                              data-testid={`dropdown-unit-${u.id}-blocked`}
                            >
                              Already booked — {reason}
                            </div>
                          )}
                        </div>
                        {active && !blocked && (
                          <CheckCircle2
                            className="mt-0.5 h-5 w-5 shrink-0"
                            style={{ color: BRAND }}
                          />
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Invoice-pending soft warning. See `UnitDesktop` for spec. */}
        {selected && selectedStatus?.kind === "invoice_pending" && (
          <div
            className="mt-3 flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-[12px] leading-snug"
            style={{
              borderColor: "#FCD34D",
              backgroundColor: "#FFFBEB",
              color: "#92400E",
            }}
            data-testid="warning-unit-invoice-pending"
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div>
              <span className="font-semibold">
                There's a pending invoice for this unit.
              </span>{" "}
              Continuing and paying will supersede it — the existing
              invoice is cancelled automatically when your payment goes
              through.
            </div>
          </div>
        )}

        {/* Progressive disclosure: role chooser appears once a property is picked. */}
        {selected && (
          <div className="mt-7">
            <h2 className="text-[18px] font-semibold leading-tight text-slate-900">
              Your role
            </h2>
            <p className="mb-3 mt-0.5 text-[13px] text-slate-500">
              In relation to the selected property
            </p>
            <div className="space-y-3">
              <RoleCard
                selected={role === "owner"}
                onClick={() => bookingActions.setRole("owner")}
                icon={<User className="h-5 w-5" />}
                title="Owner"
                description="I own this unit"
                id="owner"
              />
              <RoleCard
                selected={role === "agent"}
                onClick={() => bookingActions.setRole("agent")}
                icon={<Briefcase className="h-5 w-5" />}
                title="Agent · Property Manager"
                description="I manage this unit for the owner"
                id="agent"
              />
            </div>
          </div>
        )}

        {/* Progressive disclosure: contact + agency form appears once a role is picked. */}
        {selected && role && (
          <div className="mt-7 space-y-7">
            {isAgent && (
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Your agency
                </div>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setAgencyOpen((o) => !o)}
                    onBlur={() => markTouched("agency")}
                    data-testid="select-agency"
                    aria-haspopup="listbox"
                    aria-expanded={agencyOpen}
                    aria-invalid={showErr("agency")}
                    aria-describedby={showErr("agency") ? errorIds.agency : undefined}
                    className={`flex w-full items-center justify-between gap-3 rounded-xl border bg-white px-4 py-3.5 text-left shadow-sm transition ${
                      showErr("agency") ? "" : "border-slate-300 hover:border-slate-400"
                    }`}
                    style={errorStyle(showErr("agency"))}
                  >
                    <div className="min-w-0 flex-1">
                      {selectedAgency ? (
                        <div className="truncate text-[15px] font-semibold text-slate-900">
                          {selectedAgency.name}
                        </div>
                      ) : (
                        <span className="text-[15px] text-slate-400">Select your agency…</span>
                      )}
                    </div>
                    <ChevronDown
                      className={`h-5 w-5 shrink-0 text-slate-400 transition-transform ${
                        agencyOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  {agencyOpen && (
                    <div className="absolute inset-x-0 top-full z-20 mt-2 max-h-[300px] overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
                      {DEMO_MANAGING_AGENCIES.map((a) => {
                        const active = a.id === agencyId;
                        return (
                          <button
                            key={a.id}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              bookingActions.setAgency(a.id);
                              setAgencyOpen(false);
                              markTouched("agency");
                            }}
                            data-testid={`dropdown-agency-${a.id}`}
                            className={`flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition ${
                              active ? "bg-pink-50" : "hover:bg-slate-50"
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div
                                className={`truncate text-[14px] font-semibold ${
                                  active ? "text-pink-700" : "text-slate-900"
                                }`}
                              >
                                {a.name}
                              </div>
                            </div>
                            {active && (
                              <CheckCircle2
                                className="mt-0.5 h-5 w-5 shrink-0"
                                style={{ color: BRAND }}
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                {showErr("agency") && <FieldError id={errorIds.agency} message={errors.agency} />}

                {showOtherInput && (
                  <div className="mt-4 space-y-1.5">
                    <label htmlFor="step1-agency-other-mobile" className="text-sm font-medium text-slate-700">
                      Your agency / company name
                    </label>
                    <input
                      id="step1-agency-other-mobile"
                      type="text"
                      value={agencyOtherName}
                      onChange={(e) => bookingActions.setAgencyOtherName(e.target.value)}
                      onBlur={() => markTouched("agencyOther")}
                      placeholder="e.g. Westside Property Co."
                      aria-invalid={showErr("agencyOther")}
                      aria-describedby={
                        showErr("agencyOther") ? errorIds.agencyOther : undefined
                      }
                      className={inputClassFor(showErr("agencyOther"))}
                      style={errorStyle(showErr("agencyOther"))}
                      data-testid="input-agency-other"
                    />
                    {showErr("agencyOther") && (
                      <FieldError id={errorIds.agencyOther} message={errors.agencyOther} />
                    )}
                  </div>
                )}
              </div>
            )}

            <div>
              <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Your contact details
              </div>
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label htmlFor="step1-first-mobile" className="text-sm font-medium text-slate-700">First name</label>
                    <input
                      id="step1-first-mobile"
                      type="text"
                      value={firstName}
                      onChange={(e) => bookingActions.setContact({ contact_first_name: e.target.value })}
                      onBlur={() => markTouched("firstName")}
                      aria-invalid={showErr("firstName")}
                      aria-describedby={showErr("firstName") ? errorIds.firstName : undefined}
                      className={inputClassFor(showErr("firstName"))}
                      style={errorStyle(showErr("firstName"))}
                      data-testid="input-firstname"
                    />
                    {showErr("firstName") && <FieldError id={errorIds.firstName} message={errors.firstName} />}
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="step1-last-mobile" className="text-sm font-medium text-slate-700">Last name</label>
                    <input
                      id="step1-last-mobile"
                      type="text"
                      value={lastName}
                      onChange={(e) => bookingActions.setContact({ contact_last_name: e.target.value })}
                      onBlur={() => markTouched("lastName")}
                      aria-invalid={showErr("lastName")}
                      aria-describedby={showErr("lastName") ? errorIds.lastName : undefined}
                      className={inputClassFor(showErr("lastName"))}
                      style={errorStyle(showErr("lastName"))}
                      data-testid="input-lastname"
                    />
                    {showErr("lastName") && <FieldError id={errorIds.lastName} message={errors.lastName} />}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="step1-email-mobile" className="text-sm font-medium text-slate-700">Email</label>
                  <input
                    id="step1-email-mobile"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => bookingActions.setContact({ contact_email: e.target.value })}
                    onBlur={() => markTouched("email")}
                    aria-invalid={showErr("email")}
                    aria-describedby={showErr("email") ? errorIds.email : undefined}
                    className={inputClassFor(showErr("email"))}
                    style={errorStyle(showErr("email"))}
                    data-testid="input-email"
                  />
                  {showErr("email") && <FieldError id={errorIds.email} message={errors.email} />}
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="step1-mobile-mobile" className="text-sm font-medium text-slate-700">Mobile</label>
                  <input
                    id="step1-mobile-mobile"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={mobile}
                    onChange={(e) => bookingActions.setContact({ contact_phone: e.target.value })}
                    onBlur={() => markTouched("mobile")}
                    aria-invalid={showErr("mobile")}
                    aria-describedby={showErr("mobile") ? errorIds.mobile : undefined}
                    className={inputClassFor(showErr("mobile"))}
                    style={errorStyle(showErr("mobile"))}
                    data-testid="input-mobile"
                  />
                  {showErr("mobile") && <FieldError id={errorIds.mobile} message={errors.mobile} />}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-slate-100 bg-white px-5 py-3">
        <button
          type="button"
          disabled={!canContinue}
          data-testid="button-continue"
          className="flex w-full items-center justify-center gap-2 rounded-full px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition disabled:opacity-50"
          style={{ backgroundColor: BRAND }}
        >
          Continue
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function RoleCard({
  selected,
  onClick,
  icon,
  title,
  description,
  id,
}: {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
  id: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`card-role-${id}`}
      className={`relative flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${
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
        <span className="text-[15px] font-semibold leading-tight text-slate-900">{title}</span>
        <span className="mt-0.5 text-[12.5px] leading-snug text-slate-500">{description}</span>
      </span>
      {selected && (
        <CheckCircle2 className="h-5 w-5 shrink-0" style={{ color: SELECTED_GREEN }} />
      )}
    </button>
  );
}
