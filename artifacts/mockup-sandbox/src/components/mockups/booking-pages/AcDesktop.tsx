import React, { useEffect, useState } from "react";
import {
  AirVent,
  AlertCircle,
  ArrowRight,
  Check,
  Fan,
  Filter,
  HelpCircle,
  Info,
  Minus,
  Plus,
  RefreshCw,
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
  addonRemoteNote?: string;
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
      "Please confirm the number of split systems and any additional indoor units so we can price your service correctly.",
    systemsLabel: "Number of split systems",
    systemsHelper:
      "A split system usually has an outdoor condenser unit. Where visible, count 1 system for each outdoor unit. In some strata buildings, outdoor units may be on the rooftop or in plant areas, so if you’re unsure, select 1 and our technician will confirm on-site.",
    systemsUnitSingular: "split system",
    systemsUnitPlural: "split systems",
    addonLabel: "Additional indoor units",
    addonHelper:
      "Your first indoor unit is included with each split system. Add any extra wall-mounted indoor units connected to the same outdoor unit.",
    addonRemoteNote:
      "Each wall-mounted indoor unit usually has its own remote. Count remotes only as a guide to indoor units — not as separate systems.",
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

const ACK_LABEL =
  "I understand the final price may be adjusted after the technician confirms the AC setup on-site.";
const ACK_HELPER =
  "If fewer systems, indoor units or filters are required, Taylr will credit or refund the difference. If additional systems, indoor units or filters are identified during the service, Taylr may invoice the difference after the service is completed.";
const ACK_ERROR =
  "Please confirm you understand the final price may be adjusted after the technician checks the AC setup on-site.";

type Override = null | "ducted" | "unsure";

export function AcDesktop() {
  const unitId = useBookingSelector((s) => s.unit_id);
  const acTypeFromUnit = getAcType(unitId);

  // Type override — when the user tells us the recorded AC type is wrong.
  const [override, setOverride] = useState<Override>(null);
  const [overridePanelOpen, setOverridePanelOpen] = useState(false);
  // Section 6: per-step "Not sure how many systems" shortcut on the split flow.
  const [notSureCount, setNotSureCount] = useState(false);

  const effectiveType: AcType = override === "ducted" ? "ducted" : acTypeFromUnit;
  const isUnsureMode = override === "unsure" || notSureCount;
  const hasOverride = override !== null;

  const copy = COPY[effectiveType];
  const defaults = PREFILL_DEFAULTS[effectiveType];

  const [systems, setSystems] = useState(defaults.systems);
  const [additional, setAdditional] = useState(defaults.additional);
  const [confirmed, setConfirmed] = useState(false);
  const [touched, setTouched] = useState(false);

  // Re-seed when the *effective* AC type changes (unit pick or override flip).
  useEffect(() => {
    setSystems(defaults.systems);
    setAdditional(defaults.additional);
    setConfirmed(false);
    setTouched(false);
    setNotSureCount(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveType]);

  // If the underlying unit's AC type changes (Step 1 selection), drop any prior override.
  useEffect(() => {
    setOverride(null);
    setOverridePanelOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acTypeFromUnit]);

  const displaySystems = isUnsureMode ? 1 : systems;
  const displayAdditional = isUnsureMode ? 0 : additional;
  const systemsCost = displaySystems * SYSTEM_PRICE;
  const addonsCost = displayAdditional * ADDON_PRICE;
  const total = systemsCost + addonsCost;
  const showAckError = touched && !confirmed;
  const AddonIcon = effectiveType === "ducted" ? Filter : AirVent;

  const resetOverride = () => {
    setOverride(null);
    setOverridePanelOpen(false);
    setNotSureCount(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-['Inter'] flex justify-center overflow-y-auto">
      <div className="w-full max-w-xl">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-8 md:p-10 flex flex-col">

          <div className="mb-8">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-2">
              Step 4 of 7
            </div>
            <h1 className="text-2xl font-semibold text-slate-900">{copy.heading}</h1>
            <p className="mt-2 text-sm text-slate-500">{copy.intro}</p>
          </div>

          <div className="flex-1">
            {/* Pre-filled pink box — hidden once the user has overridden. */}
            {!hasOverride && (
              <div className="mb-3 rounded-xl border border-pink-200 bg-pink-50 p-4 flex gap-3">
                <Info className="h-5 w-5 text-pink-600 shrink-0" />
                <div className="text-sm text-pink-900">
                  <span className="font-semibold">Pre-filled from your last service.</span>{" "}
                  {copy.prefilledRest}
                </div>
              </div>
            )}

            {/* "This isn't correct" affordance — split flow only, no override yet. */}
            {effectiveType === "split" && !hasOverride && (
              <div className="mb-6">
                {!overridePanelOpen ? (
                  <button
                    type="button"
                    onClick={() => setOverridePanelOpen(true)}
                    data-testid="link-not-correct"
                    className="text-xs font-medium text-slate-500 underline underline-offset-2 hover:text-slate-900 transition-colors"
                  >
                    This isn’t correct
                  </button>
                ) : (
                  <OverridePanel
                    onSelect={(choice) => {
                      if (choice === "keep") {
                        setOverride(null);
                      } else if (choice === "ducted") {
                        setOverride("ducted");
                      } else {
                        setOverride("unsure");
                      }
                      setOverridePanelOpen(false);
                    }}
                    onClose={() => setOverridePanelOpen(false)}
                  />
                )}
              </div>
            )}

            {/* Override status banner */}
            {override === "ducted" && (
              <OverrideBanner
                tone="info"
                title="Updated AC type: Ducted"
                detail="Showing ducted setup. Adjust systems and filters below."
                onReset={resetOverride}
              />
            )}
            {override === "unsure" && (
              <OverrideBanner
                tone="info"
                title="No problem — our technician will confirm your AC setup on-site."
                detail="We’ll book a default of 1 system with 0 additional components and your technician will confirm the setup during the service."
                onReset={resetOverride}
              />
            )}

            {isUnsureMode ? (
              <UnsureCard
                acTypeLabel={effectiveType === "ducted" ? "ducted system" : "split system"}
                onUndo={
                  notSureCount && override !== "unsure"
                    ? () => setNotSureCount(false)
                    : undefined
                }
              />
            ) : (
              <div className="space-y-6">
                {/* Systems Stepper */}
                <div className="rounded-xl border border-slate-200 p-6 bg-white shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div className="pr-4">
                      <h3 className="font-semibold text-slate-900 text-lg">{copy.systemsLabel}</h3>
                      <p className="text-xs font-medium mt-1" style={{ color: BRAND }}>
                        ${SYSTEM_PRICE} per system
                      </p>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <button
                        type="button"
                        onClick={() => setSystems(Math.max(1, systems - 1))}
                        disabled={systems <= 1}
                        data-testid="btn-systems-minus"
                        aria-label="Decrease systems"
                        className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <div className="w-8 text-center text-xl font-bold text-slate-900">{systems}</div>
                      <button
                        type="button"
                        onClick={() => setSystems(systems + 1)}
                        data-testid="btn-systems-plus"
                        aria-label="Increase systems"
                        className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <p className="mt-3 text-sm text-slate-500">{copy.systemsHelper}</p>

                  {effectiveType === "split" ? (
                    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-3">
                      <div className="flex items-center justify-center gap-3 text-xs sm:text-sm flex-wrap">
                        <div className="flex items-center gap-2">
                          <div className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 bg-white text-slate-600">
                            <Fan className="h-4 w-4" />
                          </div>
                          <span className="font-medium text-slate-700">1 outdoor unit</span>
                        </div>
                        <span className="text-slate-400 font-semibold">=</span>
                        <span className="font-semibold text-slate-900">1 split system</span>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/70 p-4">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">
                        How to check
                      </div>
                      <ul className="space-y-1.5 text-sm text-slate-600 list-disc pl-5 marker:text-slate-400">
                        <li>Look outside for outdoor AC units — more than one may mean more than one system</li>
                        <li>Look inside for large return air grilles, usually in the ceiling or hallway</li>
                        <li>Do not count small ceiling vents or air outlets — these are not systems</li>
                        <li>If you’re unsure, select 1 and our technician will confirm on-site</li>
                      </ul>
                    </div>
                  )}

                  {/* Section 6: "Not sure?" shortcut — split only */}
                  {effectiveType === "split" && (
                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        onClick={() => setNotSureCount(true)}
                        data-testid="link-not-sure-count"
                        className="text-xs font-medium text-slate-500 underline underline-offset-2 hover:text-slate-900 transition-colors"
                      >
                        Not sure? We can confirm this on-site
                      </button>
                    </div>
                  )}
                </div>

                {/* Additional Units Stepper */}
                <div className="rounded-xl border border-slate-200 p-6 bg-white shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div className="pr-4">
                      <div className="flex items-center gap-2">
                        <div className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 bg-slate-50 text-slate-600">
                          <AddonIcon className="h-4 w-4" />
                        </div>
                        <h3 className="font-semibold text-slate-900 text-lg">{copy.addonLabel}</h3>
                      </div>
                      <p className="text-xs font-medium mt-2" style={{ color: BRAND }}>
                        ${ADDON_PRICE} per extra {effectiveType === "ducted" ? "filter" : "unit"}
                      </p>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <button
                        type="button"
                        onClick={() => setAdditional(Math.max(0, additional - 1))}
                        disabled={additional <= 0}
                        data-testid="btn-additional-minus"
                        aria-label={`Decrease ${copy.addonLabel.toLowerCase()}`}
                        className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <div className="w-8 text-center text-xl font-bold text-slate-900">{additional}</div>
                      <button
                        type="button"
                        onClick={() => setAdditional(additional + 1)}
                        data-testid="btn-additional-plus"
                        aria-label={`Increase ${copy.addonLabel.toLowerCase()}`}
                        className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <p className="mt-3 text-sm text-slate-500">{copy.addonHelper}</p>
                  {copy.addonRemoteNote && (
                    <div className="mt-3 flex items-start gap-2 rounded-md bg-slate-50 px-3 py-2">
                      <HelpCircle className="h-4 w-4 mt-0.5 shrink-0 text-slate-400" />
                      <p className="text-xs text-slate-600 leading-relaxed">{copy.addonRemoteNote}</p>
                    </div>
                  )}
                  <p className="mt-2 text-xs text-slate-400">{copy.addonNote}</p>
                </div>
              </div>
            )}

            {/* Live Service Estimate */}
            <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-6">
              <div className="mb-3 flex items-center justify-between border-b border-slate-200 pb-3">
                <h2 className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">
                  Service estimate
                </h2>
                <span className="text-[11px] text-slate-400">Updates as you adjust</span>
              </div>
              <div className="space-y-2 text-sm text-slate-600">
                <div className="flex justify-between">
                  <span>
                    {displaySystems} ×{" "}
                    {displaySystems === 1 ? copy.systemsUnitSingular : copy.systemsUnitPlural}{" "}
                    <span className="text-slate-400">(${SYSTEM_PRICE} ea.)</span>
                  </span>
                  <span className="tabular-nums text-slate-900 font-medium">${systemsCost}</span>
                </div>
                {displayAdditional > 0 && (
                  <div className="flex justify-between">
                    <span>
                      {displayAdditional} ×{" "}
                      {displayAdditional === 1 ? copy.addonUnitSingular : copy.addonUnitPlural}{" "}
                      <span className="text-slate-400">(${ADDON_PRICE} ea.)</span>
                    </span>
                    <span className="tabular-nums text-slate-900 font-medium">${addonsCost}</span>
                  </div>
                )}
              </div>
              <div className="mt-4 flex items-baseline justify-between border-t border-slate-200 pt-4">
                <span className="text-sm font-semibold text-slate-900">
                  Total <span className="text-xs font-normal text-slate-400">(incl. GST)</span>
                </span>
                <span className="text-2xl font-bold tabular-nums" style={{ color: BRAND }}>
                  ${total}
                </span>
              </div>
            </div>

            {/* Required acknowledgement */}
            <div
              className={`mt-6 rounded-xl border p-5 transition ${
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
                      showAckError ? "ac-ack-error-desktop" : "ac-ack-helper-desktop"
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
                  <p className="text-sm font-medium text-slate-900">{ACK_LABEL}</p>
                  <p
                    id="ac-ack-helper-desktop"
                    className="mt-2 text-xs text-slate-500 leading-relaxed"
                  >
                    {ACK_HELPER}
                  </p>
                </div>
              </label>
              {showAckError && (
                <div
                  id="ac-ack-error-desktop"
                  role="alert"
                  className="mt-3 flex items-start gap-2 text-xs font-medium"
                  style={{ color: ERROR_PURPLE }}
                >
                  <AlertCircle className="h-4 w-4 mt-px shrink-0" />
                  <span>{ACK_ERROR}</span>
                </div>
              )}
            </div>
          </div>

          <div className="mt-12 pt-6 border-t border-slate-100 flex items-center justify-between">
            <button
              type="button"
              className="text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors"
              data-testid="button-back-desktop"
            >
              ← Back
            </button>
            {/* Wrapper catches clicks on the disabled Continue so we can mark
                the ack as touched and surface the error. */}
            <span
              onMouseDown={() => {
                if (!confirmed) setTouched(true);
              }}
            >
              <button
                type="button"
                disabled={!confirmed}
                data-testid="button-continue"
                className="flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white transition disabled:opacity-50 hover:opacity-90"
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

/* --------------------------------- helpers --------------------------------- */

type OverrideChoice = "keep" | "ducted" | "unsure";

function OverridePanel({
  onSelect,
  onClose,
}: {
  onSelect: (choice: OverrideChoice) => void;
  onClose: () => void;
}) {
  const opts: { value: OverrideChoice; label: string }[] = [
    { value: "keep", label: "No, keep split system" },
    { value: "ducted", label: "Yes, it is now ducted" },
    { value: "unsure", label: "I’m not sure — technician to confirm on-site" },
  ];
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Update AC type
          </p>
          <p className="mt-1 text-sm font-medium text-slate-900">
            Has your AC system type changed?
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-xs font-medium text-slate-400 hover:text-slate-700"
        >
          Cancel
        </button>
      </div>
      <div className="mt-3 space-y-2">
        {opts.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onSelect(o.value)}
            data-testid={`override-${o.value}`}
            className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-left text-sm text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition-colors"
          >
            <span>{o.label}</span>
            <ArrowRight className="h-4 w-4 text-slate-400" />
          </button>
        ))}
      </div>
    </div>
  );
}

function OverrideBanner({
  tone,
  title,
  detail,
  onReset,
}: {
  tone: "info";
  title: string;
  detail: string;
  onReset: () => void;
}) {
  return (
    <div
      className="mb-6 flex gap-3 rounded-xl border p-4"
      style={{ borderColor: BRAND + "40", backgroundColor: BRAND + "0d" }}
    >
      <Info className="h-5 w-5 shrink-0" style={{ color: BRAND }} />
      <div className="flex-1 text-sm">
        <p className="font-semibold text-slate-900">{title}</p>
        <p className="mt-1 text-slate-600">{detail}</p>
      </div>
      <button
        type="button"
        onClick={onReset}
        data-testid="button-override-reset"
        className="self-start text-xs font-medium underline underline-offset-2 hover:opacity-80"
        style={{ color: BRAND }}
      >
        Reset
      </button>
    </div>
  );
}

function UnsureCard({
  acTypeLabel,
  onUndo,
}: {
  acTypeLabel: string;
  onUndo?: () => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500">
          <RefreshCw className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-slate-900 text-lg">
            We’ll confirm your setup on-site
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Our technician will confirm your setup during the service. We’ll book a default of
            1 {acTypeLabel} with 0 additional components and adjust if needed.
          </p>
          {onUndo && (
            <button
              type="button"
              onClick={onUndo}
              data-testid="button-undo-not-sure"
              className="mt-3 text-xs font-medium text-slate-500 underline underline-offset-2 hover:text-slate-900"
            >
              ← I’d like to enter the count myself
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
