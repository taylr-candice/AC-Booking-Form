import React, { useEffect, useState } from "react";
import {
  AirVent,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CalendarCheck,
  Check,
  Fan,
  Filter,
  Gauge,
  Info,
  MessageSquare,
  Minus,
  Plus,
  User,
} from "lucide-react";
import { useBookingSelector } from "../../../state/bookingSession";
import { getAcType, type AcType } from "../../../state/bookingHelpers";

const BRAND = "#ED017F";
const ERROR_PURPLE = "#9747FF";
const SYSTEM_PRICE = 179;
const ADDON_PRICE = 39;

type Copy = {
  heading: string;
  intro: string;
  systemsLabel: string;
  systemsHelper: string;
  systemsUnitSingular: string;
  systemsUnitPlural: string;
  addonLabel: string;
  addonHelper: string;
  addonNote: string;
  addonUnitSingular: string;
  addonUnitPlural: string;
  prefilledRest: string;
};

const COPY: Record<AcType, Copy> = {
  ducted: {
    heading: "Confirm your ducted AC setup",
    intro:
      "Most apartments have 1 ducted AC system. Please confirm the number of systems and any additional filters so we can price your service correctly.",
    systemsLabel: "Number of ducted systems",
    systemsHelper:
      "Count 1 system for each separate ducted AC setup. A system usually has its own outdoor unit and large return air grille.",
    systemsUnitSingular: "ducted system",
    systemsUnitPlural: "ducted systems",
    addonLabel: "Additional filters",
    addonHelper:
      "Your first filter is included with each ducted system. Add any extra filters beyond the first filter included with each system.",
    addonNote:
      "Filters are usually located behind large return air grilles. Do not count small ceiling vents or air outlets.",
    addonUnitSingular: "additional filter",
    addonUnitPlural: "additional filters",
    prefilledRest:
      "Our records show 1 ducted system with 1 additional filter — adjust if anything has changed.",
  },
  split: {
    heading: "Confirm your split AC setup",
    intro:
      "Please confirm the number of outdoor units and any additional indoor units so we can price your service correctly.",
    systemsLabel: "Number of split systems",
    systemsHelper:
      "Count 1 system for each outdoor condenser unit, usually located on a balcony, courtyard or external wall.",
    systemsUnitSingular: "split system",
    systemsUnitPlural: "split systems",
    addonLabel: "Additional indoor units",
    addonHelper:
      "Your first indoor unit is included with each split system. Add any extra wall-mounted indoor units connected to the same outdoor unit.",
    addonNote: "Do not count ceiling vents or ducted air outlets as indoor units.",
    addonUnitSingular: "additional indoor unit",
    addonUnitPlural: "additional indoor units",
    prefilledRest:
      "Our records show 2 split systems with 1 additional indoor unit — adjust if anything has changed.",
  },
};

const PREFILL_DEFAULTS: Record<AcType, { systems: number; additional: number }> = {
  ducted: { systems: 1, additional: 1 },
  split: { systems: 2, additional: 1 },
};

const ACK_ERROR =
  "Please confirm you understand the final price may be adjusted after the technician checks the AC setup on-site.";

export function AcMobile() {
  const unitId = useBookingSelector((s) => s.unit_id);
  const acType = getAcType(unitId);
  const copy = COPY[acType];
  const defaults = PREFILL_DEFAULTS[acType];

  const [systems, setSystems] = useState(defaults.systems);
  const [additional, setAdditional] = useState(defaults.additional);
  const [confirmed, setConfirmed] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    setSystems(defaults.systems);
    setAdditional(defaults.additional);
    setConfirmed(false);
    setTouched(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acType]);

  const total = systems * SYSTEM_PRICE + additional * ADDON_PRICE;
  const showAckError = touched && !confirmed;
  const AddonIcon = acType === "ducted" ? Filter : AirVent;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-white font-['Inter']">
      <div className="border-b border-slate-100 bg-slate-50/70 px-5 pb-1 pt-2 text-[11px] text-slate-400">
        Booking
      </div>

      <div className="flex items-start justify-between px-5 pb-3 pt-5">
        <div className="pr-3">
          <h1 className="text-[22px] font-semibold leading-tight text-slate-900">
            {copy.heading}
          </h1>
          <div className="mt-0.5 text-[11px] font-semibold tracking-wide uppercase text-slate-500">
            Step 4 of 7
          </div>
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

      <div className="flex-1 overflow-y-auto px-5 pb-6">
        <p className="mb-4 text-sm text-slate-500">{copy.intro}</p>

        <div className="mb-6 rounded-lg border border-pink-200 bg-pink-50 p-3 text-sm text-pink-900 flex gap-2.5 items-start">
          <Info className="h-4 w-4 mt-0.5 shrink-0 text-pink-600" />
          <p>
            <strong>Pre-filled from your last service.</strong> {copy.prefilledRest}
          </p>
        </div>

        <div className="space-y-6">
          {/* Number of systems */}
          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <div>
                <h3 className="font-semibold text-slate-900">{copy.systemsLabel}</h3>
                <p className="text-xs font-medium" style={{ color: BRAND }}>
                  ${SYSTEM_PRICE} per system
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-2">
              <button
                type="button"
                onClick={() => setSystems(Math.max(1, systems - 1))}
                className="grid h-10 w-10 place-items-center rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50"
                disabled={systems <= 1}
                data-testid="btn-systems-minus"
                aria-label="Decrease systems"
              >
                <Minus className="h-4 w-4" />
              </button>
              <div className="text-lg font-bold text-slate-900 w-12 text-center">{systems}</div>
              <button
                type="button"
                onClick={() => setSystems(systems + 1)}
                className="grid h-10 w-10 place-items-center rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200"
                data-testid="btn-systems-plus"
                aria-label="Increase systems"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-2 text-[12px] text-slate-500">{copy.systemsHelper}</p>

            {acType === "split" ? (
              <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5">
                <div className="flex items-center justify-center gap-2 text-[11px] flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <div className="grid h-7 w-7 place-items-center rounded-md border border-slate-200 bg-white text-slate-600">
                      <AirVent className="h-3.5 w-3.5" />
                    </div>
                    <span className="font-medium text-slate-700">1 indoor</span>
                  </div>
                  <span className="text-slate-400 font-semibold">+</span>
                  <div className="flex items-center gap-1.5">
                    <div className="grid h-7 w-7 place-items-center rounded-md border border-slate-200 bg-white text-slate-600">
                      <Fan className="h-3.5 w-3.5" />
                    </div>
                    <span className="font-medium text-slate-700">1 outdoor</span>
                  </div>
                  <span className="text-slate-400 font-semibold">=</span>
                  <span className="font-semibold text-slate-900">1 system</span>
                </div>
              </div>
            ) : (
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
                  How to check
                </div>
                <ul className="space-y-1 text-[12px] text-slate-600 list-disc pl-4 marker:text-slate-400">
                  <li>Look outside for outdoor AC units — more than one may mean more than one system</li>
                  <li>Look inside for large return air grilles, usually in the ceiling or hallway</li>
                  <li>Do not count small ceiling vents or air outlets — these are not systems</li>
                  <li>If you're unsure, select 1 and our technician will confirm on-site</li>
                </ul>
              </div>
            )}
          </div>

          {/* Additional units / filters */}
          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <div className="flex items-center gap-2">
                <div className="grid h-7 w-7 place-items-center rounded-md border border-slate-200 bg-slate-50 text-slate-600">
                  <AddonIcon className="h-3.5 w-3.5" />
                </div>
                <h3 className="font-semibold text-slate-900">{copy.addonLabel}</h3>
              </div>
              <p className="text-xs font-medium" style={{ color: BRAND }}>
                ${ADDON_PRICE} ea.
              </p>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-2">
              <button
                type="button"
                onClick={() => setAdditional(Math.max(0, additional - 1))}
                className="grid h-10 w-10 place-items-center rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50"
                disabled={additional <= 0}
                data-testid="btn-additional-minus"
                aria-label={`Decrease ${copy.addonLabel.toLowerCase()}`}
              >
                <Minus className="h-4 w-4" />
              </button>
              <div className="text-lg font-bold text-slate-900 w-12 text-center">{additional}</div>
              <button
                type="button"
                onClick={() => setAdditional(additional + 1)}
                className="grid h-10 w-10 place-items-center rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200"
                data-testid="btn-additional-plus"
                aria-label={`Increase ${copy.addonLabel.toLowerCase()}`}
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-2 text-[12px] text-slate-500">{copy.addonHelper}</p>
            <p className="mt-1 text-[11px] text-slate-400">{copy.addonNote}</p>
          </div>
        </div>

        {/* Live Service Estimate */}
        <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 border-b border-slate-200 pb-3">
            <h2 className="text-[13px] font-semibold tracking-wide uppercase text-slate-500">
              Service estimate
            </h2>
          </div>
          <div className="space-y-2 text-sm text-slate-600">
            <div className="flex justify-between">
              <span>
                {systems} ×{" "}
                {systems === 1 ? copy.systemsUnitSingular : copy.systemsUnitPlural}
              </span>
              <span className="tabular-nums text-slate-900 font-medium">
                ${systems * SYSTEM_PRICE}
              </span>
            </div>
            {additional > 0 && (
              <div className="flex justify-between">
                <span>
                  {additional} ×{" "}
                  {additional === 1 ? copy.addonUnitSingular : copy.addonUnitPlural}
                </span>
                <span className="tabular-nums text-slate-900 font-medium">
                  ${additional * ADDON_PRICE}
                </span>
              </div>
            )}
          </div>
          <div className="mt-4 flex items-end justify-between border-t border-slate-200 pt-4">
            <span className="font-medium text-slate-900">Total (incl. GST)</span>
            <span className="text-xl font-bold tabular-nums" style={{ color: BRAND }}>
              ${total}
            </span>
          </div>
        </div>

        {/* Required acknowledgement */}
        <div
          className={`mt-4 rounded-xl border p-4 transition ${
            showAckError ? "" : "border-slate-200 bg-white"
          }`}
          style={
            showAckError
              ? { borderColor: ERROR_PURPLE, backgroundColor: "rgba(151,71,255,0.04)" }
              : undefined
          }
        >
          <label className="flex items-start gap-3 cursor-pointer">
            <span className="relative mt-0.5">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => {
                  setConfirmed(e.target.checked);
                  setTouched(true);
                }}
                onBlur={() => setTouched(true)}
                data-testid="checkbox-ac-ack"
                aria-invalid={showAckError}
                aria-describedby={
                  showAckError ? "ac-ack-error-mobile" : "ac-ack-helper-mobile"
                }
                className="sr-only"
              />
              <span
                className="grid h-5 w-5 place-items-center rounded-md border-2 transition"
                style={
                  confirmed
                    ? { backgroundColor: BRAND, borderColor: BRAND }
                    : showAckError
                    ? { borderColor: ERROR_PURPLE, backgroundColor: "#fff" }
                    : { borderColor: "#cbd5e1", backgroundColor: "#fff" }
                }
              >
                {confirmed && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
              </span>
            </span>
            <div className="flex-1">
              <p className="text-[13px] font-medium text-slate-900 leading-snug">
                I understand the final price may be adjusted if the AC setup is different when assessed on-site.
              </p>
              <p
                id="ac-ack-helper-mobile"
                className="mt-2 text-[11px] text-slate-500 leading-relaxed"
              >
                If fewer systems, indoor units or filters are required than booked, Taylr will credit or refund the difference. If additional systems, indoor units or filters are identified during the service, Taylr may invoice the difference after the service is completed.
              </p>
            </div>
          </label>
          {showAckError && (
            <div
              id="ac-ack-error-mobile"
              role="alert"
              className="mt-3 flex items-start gap-2 text-[11px] font-medium"
              style={{ color: ERROR_PURPLE }}
            >
              <AlertCircle className="h-4 w-4 mt-px shrink-0" />
              <span>{ACK_ERROR}</span>
            </div>
          )}
        </div>
      </div>

      {/* Docked CTA */}
      <div className="border-t border-slate-100 bg-white px-5 py-3">
        <span
          onMouseDown={() => {
            if (!confirmed) setTouched(true);
          }}
        >
          <button
            type="button"
            disabled={!confirmed}
            data-testid="button-continue"
            className="flex w-full items-center justify-center gap-2 rounded-full px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition disabled:opacity-50"
            style={{ backgroundColor: BRAND }}
          >
            Continue
            <ArrowRight className="h-4 w-4" />
          </button>
        </span>
      </div>

      {/* Bottom tab nav */}
      <nav className="flex items-center justify-around bg-slate-900 px-4 py-3 text-white">
        <NavIcon icon={<Gauge className="h-5 w-5" />} label="Dash" />
        <NavIcon icon={<CalendarCheck className="h-5 w-5" />} label="Bookings" active />
        <div className="text-base font-bold tracking-tight">
          tay<span style={{ color: "#ff3b6e" }}>lr</span>
          <span className="text-[#ff3b6e]">.</span>
        </div>
        <NavIcon icon={<MessageSquare className="h-5 w-5" />} label="Chat" />
        <NavIcon icon={<User className="h-5 w-5" />} label="Me" />
      </nav>
    </div>
  );
}

function NavIcon({
  icon,
  label,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className={`grid place-items-center rounded-full p-1.5 ${
        active ? "text-white" : "text-slate-300"
      }`}
    >
      {icon}
    </button>
  );
}
