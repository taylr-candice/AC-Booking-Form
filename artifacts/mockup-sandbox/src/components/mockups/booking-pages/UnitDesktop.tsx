import React, { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Briefcase,
  Building2,
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
  SEEDED_BOOKINGS,
  type ActiveBookingForUnit,
} from "../../../state/adminMockData";

const BRAND = "#ED017F";
const SELECTED_GREEN = "#5FBB97";
const ERROR_PURPLE = "#9747FF";

const UNITS = [
  { id: "u1", address: "G01 / 335 Aspen Village", lot: "Lot 3", building: "Aspen Village", suburb: "Greenway ACT 2900" },
  { id: "u2", address: "12 / 88 Marine Parade", lot: "Lot 12", building: "Oceanview", suburb: "Coogee NSW 2034" },
  { id: "u3", address: "3 / 4 Example Street", lot: "Lot 3", building: "The Example", suburb: "Bondi NSW 2026" },
  { id: "u4", address: "705 / 21 Bourke Street", lot: "Lot 705", building: "Bourke Tower", suburb: "Surry Hills NSW 2010" },
  { id: "u5", address: "18 / 142 Anzac Parade", lot: "Lot 18", building: "Anzac Gardens", suburb: "Kensington NSW 2033" },
];

function FieldError({ id, message }: { id: string; message: string | null }) {
  if (!message) return null;
  return (
    <div
      id={id}
      role="alert"
      aria-live="polite"
      className="mt-1.5 flex items-start gap-1.5 text-xs font-medium"
      style={{ color: ERROR_PURPLE }}
    >
      <AlertCircle className="h-3.5 w-3.5 mt-px shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

const baseInputClass =
  "w-full rounded-xl border px-4 py-3 text-sm outline-none transition";

function inputClassFor(hasError: boolean) {
  return `${baseInputClass} ${
    hasError
      ? ""
      : "border-slate-300 focus:border-pink-500 focus:ring-1 focus:ring-pink-500"
  }`;
}

function errorStyle(hasError: boolean): React.CSSProperties | undefined {
  return hasError
    ? { borderColor: ERROR_PURPLE, boxShadow: `0 0 0 1px ${ERROR_PURPLE}` }
    : undefined;
}

/**
 * Build the customer-facing "Already booked" reason for a paid unit.
 * Falls back to a generic phrasing when the booking is missing a date
 * or window (coordination-only bookings rarely block a unit, but we
 * still render something useful).
 */
function formatPaidReason(b: import("../../../state/adminMockData").AdminBooking): string {
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

export function UnitDesktop() {
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

  // Keep local state in sync if session changes elsewhere (e.g. on Back).
  useEffect(() => {
    if (sessionUnitId !== selectedId) setSelectedId(sessionUnitId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionUnitId]);

  // Reset search when dropdown closes so it opens fresh next time.
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  // Reset agency-related transient UI state when role flips off "agent".
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

  // Per-unit "is this unit already taken?" lookup.
  //
  // Spec: enforce "one confirmed booking per unit per service rollout"
  // across the customer flow. We compute the verdict for every unit
  // up-front (cheap — one rollout lookup + one bookings scan per unit)
  // so the dropdown can disable/warn each row inline.
  //
  //   - "paid"             → unit is taken; render disabled with a
  //                          "Already booked" reason. Cannot be picked.
  //   - "invoice_pending"  → soft block; the row stays selectable but
  //                          a warning panel appears under the picker
  //                          telling the customer their booking will
  //                          supersede the existing invoice at submit.
  //   - "none"             → bookable as normal.
  //
  // We deliberately ignore the live-demo session row here (it never
  // appears in `SEEDED_BOOKINGS`), so a customer who already picked
  // a unit and walked back doesn't block themselves.
  const unitStatuses = useMemo(() => {
    const out = new Map<string, ActiveBookingForUnit>();
    for (const u of UNITS) {
      const rollout = findRolloutForBooking("svc-ac", u.id);
      out.set(
        u.id,
        getActiveBookingForUnit(u.id, SEEDED_BOOKINGS, rollout?.id ?? null),
      );
    }
    return out;
  }, []);
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
      `${u.address} ${u.lot} ${u.building} ${u.suburb}`.toLowerCase().includes(q),
    );
  }, [query]);

  const selectUnit = (id: string) => {
    // Defensive guard — the dropdown button is already disabled for
    // "paid" rows, but if anything ever bypasses that we still refuse
    // to commit a paid-blocked unit to the session.
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
    agency: "step1-agency-desktop-error",
    agencyOther: "step1-agency-other-desktop-error",
    firstName: "step1-first-desktop-error",
    lastName: "step1-last-desktop-error",
    email: "step1-email-desktop-error",
    mobile: "step1-mobile-desktop-error",
  } as const;

  const selectedAgency = DEMO_MANAGING_AGENCIES.find((a) => a.id === agencyId);

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-['Inter'] flex justify-center overflow-y-auto">
      <div className="w-full max-w-xl">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-8 md:p-10 flex flex-col">

          <div className="mb-8">
            <h1 className="text-2xl font-semibold text-slate-900">Select the property</h1>
            <p className="text-sm text-slate-500 mt-2">For which the service will take place</p>
          </div>

          <div className="flex-1">
            <div className="relative">
              <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                data-testid="dropdown-unit-trigger"
                aria-expanded={open}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-300 bg-white px-4 py-3.5 text-left shadow-sm transition hover:border-slate-400"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100">
                    <Building2 className="h-5 w-5 text-slate-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    {selected ? (
                      <>
                        <div className="truncate text-[15px] font-semibold text-slate-900">
                          {selected.address}
                        </div>
                        <div className="mt-0.5 truncate text-[12px] text-slate-500">
                          {selected.lot} · {selected.building} · {selected.suburb}
                        </div>
                      </>
                    ) : (
                      <span className="text-[15px] text-slate-400">Select a property…</span>
                    )}
                  </div>
                </div>
                <ChevronDown
                  className={`h-5 w-5 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
                />
              </button>

              {open && (
                <div className="absolute inset-x-0 top-full z-20 mt-2 flex max-h-[360px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
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
                            title={blocked ? `Already booked — ${reason}` : ""}
                            className={`flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition ${
                              blocked
                                ? "cursor-not-allowed bg-slate-50 opacity-70"
                                : active
                                  ? "bg-pink-50"
                                  : "hover:bg-slate-50"
                            }`}
                          >
                            <div className="flex min-w-0 flex-1 items-start gap-3">
                              <div
                                className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full ${
                                  blocked ? "bg-slate-200" : "bg-slate-100"
                                }`}
                              >
                                {blocked ? (
                                  <Lock className="h-4 w-4 text-slate-500" />
                                ) : (
                                  <Building2 className="h-4 w-4 text-slate-500" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div
                                  className={`truncate text-[14px] font-semibold ${
                                    blocked
                                      ? "text-slate-500 line-through"
                                      : active
                                        ? "text-pink-700"
                                        : "text-slate-900"
                                  }`}
                                >
                                  {u.address}
                                </div>
                                <div className="mt-0.5 truncate text-[12px] text-slate-500">
                                  {u.lot} · {u.building} · {u.suburb}
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
                            </div>
                            {active && !blocked && (
                              <CheckCircle2
                                className="mt-2 h-5 w-5 shrink-0"
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

            {/* Invoice-pending soft warning. The unit is selectable but
                the customer needs to know an existing pending invoice
                will be cancelled and superseded by their booking when
                they pay. */}
            {selected && selectedStatus?.kind === "invoice_pending" && (
              <div
                className="mt-3 flex items-start gap-2.5 rounded-xl border px-4 py-3 text-[13px] leading-relaxed"
                style={{
                  borderColor: "#FCD34D",
                  backgroundColor: "#FFFBEB",
                  color: "#92400E",
                }}
                data-testid="warning-unit-invoice-pending"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <span className="font-semibold">
                    There's a pending invoice for this unit.
                  </span>{" "}
                  Continuing and paying will supersede the existing
                  invoice — it'll be cancelled automatically when your
                  payment goes through.
                </div>
              </div>
            )}

            {/* Progressive disclosure: role chooser appears once a property is picked. */}
            {selected && (
              <div className="mt-8">
                <h2 className="text-[18px] font-semibold leading-tight text-slate-900">
                  Your role
                </h2>
                <p className="mb-3 mt-1 text-[13px] text-slate-500">
                  In relation to the selected property
                </p>
                <div className="grid grid-cols-2 gap-3">
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
              <div className="mt-10 space-y-8">
                {isAgent && (
                  <div>
                    <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
                      Your agency
                    </h2>
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
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100">
                            <Briefcase className="h-5 w-5 text-slate-500" />
                          </div>
                          <div className="min-w-0 flex-1">
                            {selectedAgency ? (
                              <div className="truncate text-[15px] font-semibold text-slate-900">
                                {selectedAgency.name}
                              </div>
                            ) : (
                              <span className="text-[15px] text-slate-400">Select your agency…</span>
                            )}
                          </div>
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
                                <div className="flex min-w-0 flex-1 items-start gap-3">
                                  <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100">
                                    <Briefcase className="h-4 w-4 text-slate-500" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div
                                      className={`truncate text-[14px] font-semibold ${
                                        active ? "text-pink-700" : "text-slate-900"
                                      }`}
                                    >
                                      {a.name}
                                    </div>
                                  </div>
                                </div>
                                {active && (
                                  <CheckCircle2
                                    className="mt-1 h-5 w-5 shrink-0"
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
                      <div className="mt-4 space-y-2">
                        <label
                          htmlFor="step1-agency-other-desktop"
                          className="text-sm font-medium text-slate-700"
                        >
                          Your agency / company name
                        </label>
                        <input
                          id="step1-agency-other-desktop"
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
                  <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
                    Your contact details
                  </h2>
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label htmlFor="step1-first-desktop" className="text-sm font-medium text-slate-700">First name</label>
                        <input
                          id="step1-first-desktop"
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
                      <div className="space-y-2">
                        <label htmlFor="step1-last-desktop" className="text-sm font-medium text-slate-700">Last name</label>
                        <input
                          id="step1-last-desktop"
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

                    <div className="space-y-2">
                      <label htmlFor="step1-email-desktop" className="text-sm font-medium text-slate-700">Email address</label>
                      <input
                        id="step1-email-desktop"
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

                    <div className="space-y-2">
                      <label htmlFor="step1-mobile-desktop" className="text-sm font-medium text-slate-700">Mobile number</label>
                      <input
                        id="step1-mobile-desktop"
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

          <div className="mt-12 pt-6 border-t border-slate-100 flex items-center justify-between">
            <button
              type="button"
              className="text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors"
              data-testid="button-back-desktop"
            >
              ← Back
            </button>
            <button
              type="button"
              disabled={!canContinue}
              data-testid="button-continue"
              className="flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white transition disabled:opacity-50 hover:opacity-90"
              style={{ backgroundColor: BRAND }}
            >
              Continue
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>

        </div>
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
      aria-pressed={selected}
      className={`relative flex h-full flex-col items-start gap-2 rounded-xl border p-4 text-left transition ${
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
      <span className="text-[15px] font-semibold leading-tight text-slate-900">
        {title}
      </span>
      <span className="text-[12.5px] leading-snug text-slate-500">
        {description}
      </span>
      {selected && (
        <CheckCircle2
          className="absolute right-3 top-3 h-5 w-5"
          style={{ color: SELECTED_GREEN }}
        />
      )}
    </button>
  );
}
