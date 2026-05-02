import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  AlertCircle,
  ArrowRight,
  Briefcase,
  Building2,
  CheckCircle2,
  ChevronDown,
  Home,
  HousePlus,
  Search,
  User,
  Users,
} from "lucide-react";
import { bookingActions, useBookingSelector, type PrimaryResidence } from "../../../state/bookingSession";
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
} from "../../../state/adminMockData";
import { UnitAlreadyBookedModal } from "./UnitAlreadyBookedModal";

const BRAND = "#ED017F";
const SELECTED_BG = "#7BC9A8";
const SELECTED_ACCENT = "#7BC9A8";
const ERROR_PURPLE = "#9747FF";

const UNITS = [
  { id: "u1", address: "G01 / 335 Aspen Village", lot: "Lot 3", building: "Aspen Village", suburb: "Greenway ACT 2900" },
  { id: "u2", address: "12 / 88 Marine Parade", lot: "Lot 12", building: "Oceanview", suburb: "Coogee NSW 2034" },
  { id: "u3", address: "3 / 4 Example Street", lot: "Lot 3", building: "The Example", suburb: "Bondi NSW 2026" },
  { id: "u4", address: "705 / 21 Bourke Street", lot: "Lot 705", building: "Bourke Tower", suburb: "Surry Hills NSW 2010" },
  { id: "u5", address: "18 / 142 Anzac Parade", lot: "Lot 18", building: "Anzac Gardens", suburb: "Kensington NSW 2033" },
  { id: "u-lakeside-01", address: "8 / 45 Lakeside Drive", lot: "Lot 8", building: "Lakeside Towers", suburb: "Meadowbank NSW 2114" },
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

export function UnitDesktop() {
  const sessionUnitId = useBookingSelector((s) => s.unit_id);
  const role = useBookingSelector((s) => s.role);
  const residence = useBookingSelector((s) => s.primary_residence);
  const agencyId = useBookingSelector((s) => s.agency_id);
  const agencyOtherName = useBookingSelector((s) => s.agency_other_name);
  const firstName = useBookingSelector((s) => s.contact_first_name);
  const lastName = useBookingSelector((s) => s.contact_last_name);
  const email = useBookingSelector((s) => s.contact_email);
  const mobile = useBookingSelector((s) => s.contact_phone);

  const [selectedId, setSelectedId] = useState<string | null>(sessionUnitId);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [attemptedContinue, setAttemptedContinue] = useState(false);
  const [agencyOpen, setAgencyOpen] = useState(false);
  // When a customer clicks a unit that already has a paid/confirmed
  // service booked, we show a generic "this unit is already booked,
  // contact Taylr" modal instead of selecting the unit. We never show
  // any details about the existing customer/booking — privacy.
  const [alreadyBookedOpen, setAlreadyBookedOpen] = useState(false);
  // Stable target for restoring focus when the already-booked modal
  // closes: the dropdown trigger button (the row that opened the
  // modal is unmounted because we collapse the dropdown in the same
  // action that opens the modal).
  const unitDropdownTriggerRef = useRef<HTMLButtonElement | null>(null);
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
  // so the dropdown can disable each row inline.
  //
  //   - "paid"             → unit is taken; render disabled with a
  //                          "Already booked" reason. Cannot be picked.
  //   - "invoice_pending"  → also treated as already booked from the
  //                          customer's POV (Task #89). Selecting the
  //                          row opens the same generic "already booked"
  //                          modal and does not commit the unit. Ops
  //                          can re-send the existing pending invoice
  //                          if the customer wants to pay it; we don't
  //                          let a fresh booking start on top of it.
  //   - "none"             → bookable as normal.
  //
  // We deliberately ignore the live-demo session row here (it never
  // appears in the live bookings list), so a customer who already
  // picked a unit and walked back doesn't block themselves.
  //
  // Reads via `getLiveBookings()` so cancel/reschedule/supersede
  // mutations done in the admin shell are reflected immediately.
  // The dependency on `bookingsRefreshKey` re-runs the memo whenever
  // the admin shell bumps it after a mutation; in canvas-isolated mode
  // (no admin shell) the key never changes and the source returns
  // `SEEDED_BOOKINGS`, so behaviour is unchanged.
  const liveBookingsVersion = useSyncExternalStore(
    subscribeLiveBookings,
    getLiveBookingsVersion,
    getLiveBookingsVersion,
  );
  const unitStatuses = useMemo(() => {
    // `liveBookingsVersion` is intentionally read so the memo re-runs
    // whenever the admin shell mutates the bookings list.
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
    // Already booked (paid or invoice-pending) → don't commit it;
    // surface a generic explainer modal that points the customer at
    // Taylr support. We deliberately expose nothing about the existing
    // booking (no name, no date, no contact info). Pending-invoice
    // units are treated the same as paid: ops can re-send the existing
    // invoice, the customer doesn't get to start a fresh one on top.
    const kind = unitStatuses.get(id)?.kind;
    if (kind === "paid" || kind === "invoice_pending") {
      setOpen(false);
      setAlreadyBookedOpen(true);
      return;
    }
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
  const markAllTouched = () =>
    setTouched({ agency: true, agencyOther: true, firstName: true, lastName: true, email: true, mobile: true });
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
            <h1 className="text-2xl font-bold text-slate-900">Select the property</h1>
            <p className="text-sm text-slate-500 mt-2">For which the service will take place</p>
          </div>

          <div className="flex-1">
            <div className="relative">
              <button
                ref={unitDropdownTriggerRef}
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

              {attemptedContinue && !selectedId && (
                <div className="mt-2 flex items-start gap-1.5 text-[12px] font-medium" style={{ color: ERROR_PURPLE }}>
                  <AlertCircle className="h-3.5 w-3.5 mt-px shrink-0" aria-hidden="true" />
                  <span>Please select a property to continue</span>
                </div>
              )}

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
                        // We deliberately render every row identically
                        // regardless of whether the unit is already
                        // booked — no strike-through, no lock icon, no
                        // inline "already booked by …" text. If the
                        // customer clicks a booked unit, `selectUnit`
                        // opens a modal pointing them at Taylr support
                        // instead.
                        return (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => selectUnit(u.id)}
                            data-testid={`dropdown-unit-${u.id}`}
                            className={`flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition ${
                              active ? "bg-pink-50" : "hover:bg-slate-50"
                            }`}
                          >
                            <div className="flex min-w-0 flex-1 items-start gap-3">
                              <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100">
                                <Building2 className="h-4 w-4 text-slate-500" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div
                                  className={`truncate text-[14px] font-semibold ${
                                    active ? "text-pink-700" : "text-slate-900"
                                  }`}
                                >
                                  {u.address}
                                </div>
                                <div className="mt-0.5 truncate text-[12px] text-slate-500">
                                  {u.lot} · {u.building} · {u.suburb}
                                </div>
                              </div>
                            </div>
                            <CheckCircle2
                              className="mt-2 h-5 w-5 shrink-0"
                              style={{ color: active ? BRAND : "transparent" }}
                            />
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

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

                {/* Progressive disclosure: residence type appears once Owner is selected */}
                {role === "owner" && (
                  <div className="mt-6">
                    <h2 className="text-[18px] font-semibold leading-tight text-slate-900">
                      The property is
                    </h2>
                    <div className="mt-3 grid grid-cols-3 gap-3">
                      <ResidenceCard
                        selected={residence === "live_in"}
                        onClick={() => bookingActions.setPrimaryResidence("live_in")}
                        icon={<Home className="h-5 w-5" />}
                        title="My place of residence"
                        subtitle="I live here"
                        id="live_in"
                      />
                      <ResidenceCard
                        selected={residence === "leased_out"}
                        onClick={() => bookingActions.setPrimaryResidence("leased_out")}
                        icon={<Users className="h-5 w-5" />}
                        title="Leased out"
                        subtitle="I have tenants in the unit"
                        id="leased_out"
                      />
                      <ResidenceCard
                        selected={residence === "vacant"}
                        onClick={() => bookingActions.setPrimaryResidence("vacant")}
                        icon={<HousePlus className="h-5 w-5" />}
                        title="Vacant"
                        subtitle="Between tenants or holiday home"
                        id="vacant"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Progressive disclosure: contact + agency form appears once a role is picked
                (and, for owners, once residence is also confirmed). */}
            {selected && role && (role !== "owner" || residence) && (
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
                                <CheckCircle2
                                  className="mt-1 h-5 w-5 shrink-0"
                                  style={{ color: active ? BRAND : "transparent" }}
                                />
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

                {/* Contact details: always shown for owners; for agents, only
                    revealed after an agency is picked so the form progresses
                    logically — role → agency → contact. */}
                {(!isAgent || agencyId) && (
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
                )}
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
            <span
              onClickCapture={(e) => {
                if (!canContinue) {
                  e.stopPropagation();
                  e.preventDefault();
                  setAttemptedContinue(true);
                  markAllTouched();
                }
              }}
            >
              <button
                type="button"
                data-testid="button-continue"
                className="flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90"
                style={{ backgroundColor: BRAND }}
              >
                Continue
                <ArrowRight className="h-4 w-4" />
              </button>
            </span>
          </div>

        </div>
      </div>

      <UnitAlreadyBookedModal
        open={alreadyBookedOpen}
        onClose={() => setAlreadyBookedOpen(false)}
        restoreFocusRef={unitDropdownTriggerRef}
      />
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
              borderColor: SELECTED_ACCENT,
              backgroundColor: SELECTED_BG,
            }
          : undefined
      }
    >
      <span
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
          selected ? "bg-white" : "bg-slate-100 text-slate-700"
        }`}
        style={selected ? { color: SELECTED_ACCENT } : undefined}
      >
        {icon}
      </span>
      <span
        className={`text-[14px] font-semibold leading-tight ${
          selected ? "text-white" : "text-slate-900"
        }`}
      >
        {title}
      </span>
      <span
        className={`text-[12px] leading-snug ${
          selected ? "text-white/85" : "text-slate-500"
        }`}
      >
        {description}
      </span>
      {selected && (
        <CheckCircle2
          className="absolute right-3 top-3 h-5 w-5"
          style={{ color: "#ffffff" }}
        />
      )}
    </button>
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
      className={`relative flex w-full items-center gap-3 rounded-xl border p-4 text-left transition ${
        selected ? "" : "border-slate-200 bg-white hover:border-slate-300"
      }`}
      style={
        selected
          ? { borderColor: SELECTED_ACCENT, backgroundColor: SELECTED_BG }
          : undefined
      }
    >
      <span
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
          selected ? "bg-white" : "bg-slate-100 text-slate-700"
        }`}
        style={selected ? { color: SELECTED_ACCENT } : undefined}
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span
          className={`text-[14px] font-semibold leading-tight ${
            selected ? "text-white" : "text-slate-900"
          }`}
        >
          {title}
        </span>
        <span
          className={`mt-0.5 text-[12px] leading-snug ${
            selected ? "text-white/85" : "text-slate-500"
          }`}
        >
          {subtitle}
        </span>
      </span>
      <CheckCircle2 className="h-5 w-5 shrink-0" style={{ color: selected ? "#ffffff" : "transparent" }} />
    </button>
  );
}
