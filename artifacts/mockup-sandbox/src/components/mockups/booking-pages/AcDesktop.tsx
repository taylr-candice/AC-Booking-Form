import React, { useEffect, useState } from "react";
import {
  AirVent,
  AlertCircle,
  ArrowRight,
  Check,
  Eye,
  Grid3x3,
  Info,
  Minus,
  Plus,
  RefreshCw,
} from "lucide-react";
import { useBookingSelector } from "../../../state/bookingSession";
import { getAcType, type AcType } from "../../../state/bookingHelpers";
import { AcExampleModal, type ExampleVariant } from "./AcExampleModal";

const BRAND = "#ED017F";
const ERROR_PURPLE = "#9747FF";
const SYSTEM_PRICE = 179;
const ADDON_PRICE = 39;

type KnownType = "split" | "ducted";

type Copy = {
  heading: string;
  intro: string;
  systemsLabel: string;
  systemsUnitSingular: string;
  systemsUnitPlural: string;
  addonLabel: string;
  addonHelper: string[];
  addonUnitSingular: string;
  addonUnitPlural: string;
};

const COPY: Record<KnownType, Copy> = {
  ducted: {
    heading: "Confirm your ducted AC setup",
    intro:
      "Please confirm the number of systems and any extra filters so we can price your service correctly.",
    systemsLabel: "Number of ducted systems",
    systemsUnitSingular: "ducted service",
    systemsUnitPlural: "ducted services",
    addonLabel: "Extra return-air grilles or extra indoor units",
    // NOTE: For ducted, the rendered helper text below is the inline JSX
    // branch (it includes the "See example" inline link). This array is kept
    // in sync as a fallback / contract for future renderers but isn't shown
    // for ducted today.
    addonHelper: [
      "If you count more return-air grilles in the apartment than shown above, add the extras here.",
      "Filters sit behind large return-air grilles — not small air vents or outlets.",
    ],
    addonUnitSingular: "extra filter",
    addonUnitPlural: "extra filters",
  },
  split: {
    heading: "Confirm your split AC setup",
    intro:
      "Please confirm the number of split systems and any extra indoor units so we can price your service correctly.",
    systemsLabel: "Number of split systems",
    systemsUnitSingular: "split service",
    systemsUnitPlural: "split services",
    addonLabel: "Extra indoor units",
    addonHelper: [
      "If your apartment has more indoor unit heads than shown above, add the extras here.",
    ],
    addonUnitSingular: "extra indoor unit",
    addonUnitPlural: "extra indoor units",
  },
};

function formatSystemsIncludes(type: KnownType, systems: number): string[] {
  if (type === "split") {
    const outdoor = systems === 1 ? "outdoor unit" : "outdoor units";
    const indoor = systems === 1 ? "indoor unit head" : "indoor unit heads";
    return [`${systems} ${outdoor}`, `${systems} ${indoor}`];
  }
  // Ducted: each system = 1 outdoor + 1 indoor distribution unit (the filter
  // sits behind the return-air grille). Showing "indoor units / return-air
  // grilles" gives bookers a clearer physical picture than just "system services".
  const outdoor = systems === 1 ? "outdoor unit" : "outdoor units";
  const indoor = systems === 1 ? "indoor unit / return-air grille" : "indoor units / return-air grilles";
  return [`${systems} ${outdoor}`, `${systems} ${indoor}`];
}

const PREFILL_DEFAULTS: Record<KnownType, { systems: number; additional: number }> = {
  ducted: { systems: 1, additional: 0 },
  split: { systems: 2, additional: 0 },
};

const ACK_LABEL =
  "I understand the final price may be adjusted if the number of systems, indoor unit heads or filters on-site is different from what I booked.";
const ACK_HELPER_INTRO =
  "This only applies when the booking selection doesn't match what's actually on-site. Taylr will not perform any work beyond the preventative maintenance service shown above.";
const ACK_HELPER_BULLETS = [
  "If there are more systems, indoor unit heads or filters on the day, Taylr will service all of them and invoice the unpaid difference afterward.",
  "If there are fewer, Taylr will credit or refund the difference.",
];
const ACK_ERROR =
  "Please confirm you understand the price may be adjusted if the booked number of systems, indoor unit heads or filters doesn't match what's on-site.";

type Override = null | "split" | "ducted" | "unsure";

export function AcDesktop() {
  const unitId = useBookingSelector((s) => s.unit_id);
  const acTypeFromUnit = getAcType(unitId);

  const [override, setOverride] = useState<Override>(null);
  const [overridePanelOpen, setOverridePanelOpen] = useState(false);
  const [notSureCount, setNotSureCount] = useState(false);

  // Resolved type after considering any override.
  const effectiveType: AcType =
    override === "split" || override === "ducted" ? override : acTypeFromUnit;

  const knownType: KnownType | null =
    effectiveType === "split" || effectiveType === "ducted" ? effectiveType : null;

  const needsTypePick = acTypeFromUnit === "unknown" && override === null;
  const isUnsureMode = override === "unsure" || notSureCount;
  const hasOverride = override !== null;

  const copy = knownType ? COPY[knownType] : null;
  const defaults = knownType ? PREFILL_DEFAULTS[knownType] : { systems: 1, additional: 0 };

  const [systems, setSystems] = useState(defaults.systems);
  const [additional, setAdditional] = useState(defaults.additional);
  const [confirmed, setConfirmed] = useState(false);
  const [touched, setTouched] = useState(false);
  const [exampleModal, setExampleModal] = useState<ExampleVariant | null>(null);

  // Re-seed when the chosen flow changes (unit pick or type override).
  useEffect(() => {
    setSystems(defaults.systems);
    setAdditional(defaults.additional);
    setConfirmed(false);
    setTouched(false);
    setNotSureCount(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveType]);

  // Step-1 unit changes wipe any prior override + count shortcut.
  useEffect(() => {
    setOverride(null);
    setOverridePanelOpen(false);
    setNotSureCount(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acTypeFromUnit]);

  const displaySystems = isUnsureMode ? 1 : systems;
  const displayAdditional = isUnsureMode ? 0 : additional;
  const systemsCost = displaySystems * SYSTEM_PRICE;
  const addonsCost = displayAdditional * ADDON_PRICE;
  const total = systemsCost + addonsCost;
  const showAckError = touched && !confirmed;
  const AddonIcon = effectiveType === "ducted" ? Grid3x3 : AirVent;

  const resetOverride = () => {
    setOverride(null);
    setOverridePanelOpen(false);
    setNotSureCount(false);
  };

  // Heading + intro depend on whether we know the type yet.
  const heading = needsTypePick ? "Tell us about your AC setup" : copy?.heading ?? "Tell us about your AC setup";
  const intro = needsTypePick
    ? "We don’t yet have AC details for this unit."
    : copy?.intro ?? "Our technician will confirm your AC setup on-site.";

  // Estimate row label for unsure-from-unknown (no copy entry).
  const estimateUnitSingular = copy?.systemsUnitSingular ?? "AC system";
  const estimateUnitPlural = copy?.systemsUnitPlural ?? "AC systems";
  const estimateAddonSingular = copy?.addonUnitSingular ?? "additional component";
  const estimateAddonPlural = copy?.addonUnitPlural ?? "additional components";

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-['Inter'] flex justify-center overflow-y-auto">
      <div className="w-full max-w-xl">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-8 md:p-10 flex flex-col">

          <div className="mb-8">
            <h1 className="text-2xl font-semibold text-slate-900">{heading}</h1>
            <p className="mt-2 text-sm text-slate-500">{intro}</p>
          </div>

          <div className="flex-1">
            {/* Pre-filled pink box — only when we have records (known type) and the user hasn't overridden. */}
            {knownType && !hasOverride && acTypeFromUnit !== "unknown" && (
              <div className="mb-3 rounded-xl border border-pink-200 bg-pink-50 p-4 flex gap-3">
                <Info className="h-5 w-5 text-pink-600 shrink-0" />
                <div className="text-sm text-pink-900">
                  <p className="font-semibold">Pre-filled based on our records.</p>
                  <p className="mt-0.5 text-[12px] text-pink-900/80">
                    This may come from prior services or building data — adjust if anything has changed.
                  </p>
                </div>
              </div>
            )}

            {/* "This isn't correct" affordance — only when we know the type and the user hasn't overridden. */}
            {knownType && !hasOverride && acTypeFromUnit !== "unknown" && (
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
                  <ChoicePanel
                    eyebrow="Update AC type"
                    title="Has your AC system type changed?"
                    options={
                      acTypeFromUnit === "split"
                        ? [
                            { value: "keep-split", label: "No, keep split system" },
                            { value: "ducted", label: "Yes, it is now ducted" },
                            { value: "unsure", label: "I’m not sure — technician to confirm on-site" },
                          ]
                        : [
                            { value: "keep-ducted", label: "No, keep ducted system" },
                            { value: "split", label: "Yes, it is now a split system" },
                            { value: "unsure", label: "I’m not sure — technician to confirm on-site" },
                          ]
                    }
                    onSelect={(choice) => {
                      if (choice === "keep-split" || choice === "keep-ducted") {
                        setOverride(null);
                      } else if (choice === "ducted") {
                        setOverride("ducted");
                      } else if (choice === "split") {
                        setOverride("split");
                      } else if (choice === "unsure") {
                        setOverride("unsure");
                      }
                      setOverridePanelOpen(false);
                    }}
                    onClose={() => setOverridePanelOpen(false)}
                  />
                )}
              </div>
            )}

            {/* Unknown-unit picker (BEFORE any flow loads). */}
            {needsTypePick && (
              <ChoicePanel
                eyebrow="AC type"
                title="What type of AC does the apartment have?"
                options={[
                  { value: "ducted", label: "Ducted (ceiling vents)" },
                  { value: "split", label: "Split system (wall units)" },
                  { value: "unsure", label: "Not sure — technician to confirm on-site" },
                ]}
                onSelect={(choice) => {
                  if (choice === "ducted") setOverride("ducted");
                  else if (choice === "split") setOverride("split");
                  else setOverride("unsure");
                }}
              />
            )}

            {/* Override / pick banner (any time override is set). */}
            {hasOverride && (
              <OverrideBanner
                title={overrideBannerTitle(acTypeFromUnit, override)}
                detail={overrideBannerDetail(override)}
                onReset={resetOverride}
                resetLabel={acTypeFromUnit === "unknown" ? "Change" : "Reset"}
              />
            )}

            {/* Steppers — only when we have a known type and we're not in unsure mode. */}
            {knownType && !isUnsureMode && copy && (
              <div className="space-y-6">
                {/* Systems Stepper */}
                <div className="rounded-xl border border-slate-200 p-6 bg-white shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div className="pr-4">
                      <h3 className="font-semibold text-slate-900 text-lg">{copy.systemsLabel}</h3>
                      <p className="text-xs font-medium mt-1" style={{ color: BRAND }}>
                        ${SYSTEM_PRICE} per system
                      </p>
                      {knownType && (
                        <div className="mt-2" data-testid="block-includes">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            Includes
                          </p>
                          <ul className="mt-1 space-y-0.5">
                            {formatSystemsIncludes(knownType, displaySystems).map((b) => (
                              <li
                                key={b}
                                className="flex items-center gap-1.5 text-xs text-slate-600"
                              >
                                <Check className="h-3 w-3 text-slate-400" strokeWidth={3} />
                                {b}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
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

                  {/* "Not sure?" shortcut — only when AC type is unknown or user has signaled uncertainty */}
                  {(acTypeFromUnit === "unknown" || hasOverride || overridePanelOpen) && (
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
                    <div className="pr-4 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-slate-200 bg-slate-50 text-slate-600">
                          <AddonIcon className="h-4 w-4" />
                        </div>
                        <h3 className="font-semibold text-slate-900 text-lg">{copy.addonLabel}</h3>
                      </div>
                      <div className="mt-2 flex items-center gap-3 flex-wrap">
                        <p className="text-xs font-medium" style={{ color: BRAND }}>
                          ${ADDON_PRICE} per extra {effectiveType === "ducted" ? "filter" : "unit"}
                        </p>
                        {effectiveType !== "ducted" && (
                          <button
                            type="button"
                            onClick={() => setExampleModal("split-indoor")}
                            data-testid="button-see-example"
                            className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 underline underline-offset-2 hover:text-slate-900 transition-colors"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            See example
                          </button>
                        )}
                      </div>
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

                  <div
                    className="mt-3 space-y-2 text-xs text-slate-500"
                    data-testid="text-extras-helper"
                  >
                    {effectiveType === "ducted" ? (
                      <>
                        <p>
                          If your apartment has more indoor unit / return-air grilles than shown in the inclusions above, add the extras here.
                        </p>
                        <p>
                          Not sure what a return-air grille looks like?{" "}
                          <button
                            type="button"
                            onClick={() => setExampleModal("ducted-filter")}
                            data-testid="button-see-example-inline"
                            className="inline-flex items-center gap-1 font-medium text-slate-500 underline underline-offset-2 hover:text-slate-900 transition-colors"
                          >
                            <Eye className="h-3 w-3" />
                            See example
                          </button>
                        </p>
                      </>
                    ) : (
                      <>
                        {copy.addonHelper.map((p, i) => (
                          <p key={i}>{p}</p>
                        ))}
                        <p>
                          Not sure what an indoor unit head looks like?{" "}
                          <button
                            type="button"
                            onClick={() => setExampleModal("split-indoor")}
                            data-testid="button-see-example-inline"
                            className="inline-flex items-center gap-1 font-medium text-slate-500 underline underline-offset-2 hover:text-slate-900 transition-colors"
                          >
                            <Eye className="h-3 w-3" />
                            See example
                          </button>
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Unsure card — replaces the steppers when in unsure mode. */}
            {isUnsureMode && (
              <UnsureCard
                onUndo={
                  notSureCount && override !== "unsure"
                    ? () => setNotSureCount(false)
                    : undefined
                }
              />
            )}

            {/* Live Service Estimate — hide on the type-pick gate. */}
            {!needsTypePick && (
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
                      {displaySystems === 1 ? estimateUnitSingular : estimateUnitPlural}{" "}
                      <span className="text-slate-400">(${SYSTEM_PRICE} ea.)</span>
                    </span>
                    <span className="tabular-nums text-slate-900 font-medium">${systemsCost}</span>
                  </div>
                  {displayAdditional > 0 && (
                    <div className="flex justify-between">
                      <span>
                        {displayAdditional} ×{" "}
                        {displayAdditional === 1 ? estimateAddonSingular : estimateAddonPlural}{" "}
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
            )}

            {/* Required acknowledgement — hidden during type pick. */}
            {!needsTypePick && (
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
                    <div
                      id="ac-ack-helper-desktop"
                      className="mt-2 text-xs text-slate-500 leading-relaxed"
                    >
                      <p>{ACK_HELPER_INTRO}</p>
                      <ul className="mt-2 list-disc space-y-1 pl-4">
                        {ACK_HELPER_BULLETS.map((b, i) => (
                          <li key={i}>{b}</li>
                        ))}
                      </ul>
                    </div>
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
              onMouseDown={() => {
                if (!confirmed && !needsTypePick) setTouched(true);
              }}
            >
              <button
                type="button"
                disabled={needsTypePick || !confirmed}
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

      {exampleModal && (
        <AcExampleModal
          variant={exampleModal}
          onClose={() => setExampleModal(null)}
        />
      )}
    </div>
  );
}

/* --------------------------------- helpers --------------------------------- */

function overrideBannerTitle(acTypeFromUnit: AcType, override: Override): string {
  const originUnknown = acTypeFromUnit === "unknown";
  if (override === "ducted") return originUnknown ? "AC type: Ducted" : "Updated AC type: Ducted";
  if (override === "split") return originUnknown ? "AC type: Split system" : "Updated AC type: Split system";
  if (override === "unsure") return "No problem — our technician will confirm your AC setup on-site.";
  return "";
}

function overrideBannerDetail(override: Override): string {
  if (override === "ducted") return "Showing ducted setup. Adjust systems and filters below.";
  if (override === "split") return "Showing split setup. Adjust systems and indoor units below.";
  if (override === "unsure")
    return "We’ll book a default of 1 system with 0 additional components and confirm on-site.";
  return "";
}

function ChoicePanel({
  eyebrow,
  title,
  options,
  onSelect,
  onClose,
}: {
  eyebrow: string;
  title: string;
  options: { value: string; label: string }[];
  onSelect: (value: string) => void;
  onClose?: () => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {eyebrow}
          </p>
          <p className="mt-1 text-sm font-medium text-slate-900">{title}</p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-xs font-medium text-slate-400 hover:text-slate-700"
          >
            Cancel
          </button>
        )}
      </div>
      <div className="mt-3 space-y-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onSelect(o.value)}
            data-testid={`choice-${o.value}`}
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
  title,
  detail,
  onReset,
  resetLabel,
}: {
  title: string;
  detail: string;
  onReset: () => void;
  resetLabel: string;
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
        {resetLabel}
      </button>
    </div>
  );
}

function UnsureCard({ onUndo }: { onUndo?: () => void }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500">
          <RefreshCw className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-slate-900 text-lg">
            We’ll confirm your setup during the service
          </h3>
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
