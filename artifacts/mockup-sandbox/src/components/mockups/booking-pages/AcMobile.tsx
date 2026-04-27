import React, { useEffect, useState } from "react";
import {
  AirVent,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CalendarCheck,
  Check,
  Eye,
  Fan,
  Filter,
  Gauge,
  HelpCircle,
  Info,
  MessageSquare,
  Minus,
  Plus,
  RefreshCw,
  User,
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
  systemsHelper: string;
  systemsIncludes?: string[];
  systemsUnitSingular: string;
  systemsUnitPlural: string;
  addonLabel: string;
  addonHelper: string;
  addonRemoteNote?: string;
  addonNote: string;
  addonUnitSingular: string;
  addonUnitPlural: string;
};

const COPY: Record<KnownType, Copy> = {
  ducted: {
    heading: "Confirm your ducted AC setup",
    intro:
      "Please confirm the number of systems and any additional filters so we can price your service correctly.",
    systemsLabel: "Number of ducted systems",
    systemsHelper:
      "Count 1 system for each separate ducted AC setup. A system usually has its own outdoor unit and large return air grille.",
    systemsUnitSingular: "ducted system",
    systemsUnitPlural: "ducted systems",
    addonLabel: "Additional filters",
    addonHelper:
      "Add any extra filters beyond the first filter included with each system.",
    addonNote:
      "Filters are usually located behind large return air grilles. Do not count small ceiling vents or air outlets.",
    addonUnitSingular: "additional filter",
    addonUnitPlural: "additional filters",
  },
  split: {
    heading: "Confirm your split AC setup",
    intro:
      "Please confirm the number of split systems and any additional indoor units so we can price your service correctly.",
    systemsLabel: "Number of split systems",
    systemsHelper: "A split system usually has an outdoor unit.",
    systemsIncludes: ["1 indoor unit", "1 outdoor unit"],
    systemsUnitSingular: "split system",
    systemsUnitPlural: "split systems",
    addonLabel: "Additional indoor units",
    addonHelper:
      "Your system includes 1 indoor unit. Add extra indoor units only if you have more than one connected to the same system.",
    addonRemoteNote: "Each indoor unit usually has its own remote.",
    addonNote: "Do not count ceiling vents or ducted outlets.",
    addonUnitSingular: "additional indoor unit",
    addonUnitPlural: "additional indoor units",
  },
};

const PREFILL_DEFAULTS: Record<KnownType, { systems: number; additional: number }> = {
  ducted: { systems: 1, additional: 1 },
  split: { systems: 2, additional: 0 },
};

const ACK_LABEL =
  "I understand the final price may be adjusted after the technician confirms the AC setup on-site.";
const ACK_HELPER =
  "If fewer systems, indoor units or filters are required, Taylr will credit or refund the difference. If additional systems, indoor units or filters are identified during the service, Taylr may invoice the difference after the service is completed.";
const ACK_ERROR =
  "Please confirm you understand the final price may be adjusted after the technician checks the AC setup on-site.";

type Override = null | "split" | "ducted" | "unsure";

export function AcMobile() {
  const unitId = useBookingSelector((s) => s.unit_id);
  const acTypeFromUnit = getAcType(unitId);

  const [override, setOverride] = useState<Override>(null);
  const [overridePanelOpen, setOverridePanelOpen] = useState(false);
  const [notSureCount, setNotSureCount] = useState(false);

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

  useEffect(() => {
    setSystems(defaults.systems);
    setAdditional(defaults.additional);
    setConfirmed(false);
    setTouched(false);
    setNotSureCount(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveType]);

  useEffect(() => {
    setOverride(null);
    setOverridePanelOpen(false);
    setNotSureCount(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acTypeFromUnit]);

  const displaySystems = isUnsureMode ? 1 : systems;
  const displayAdditional = isUnsureMode ? 0 : additional;
  const total = displaySystems * SYSTEM_PRICE + displayAdditional * ADDON_PRICE;
  const showAckError = touched && !confirmed;
  const AddonIcon = effectiveType === "ducted" ? Filter : AirVent;

  const resetOverride = () => {
    setOverride(null);
    setOverridePanelOpen(false);
    setNotSureCount(false);
  };

  const heading = needsTypePick ? "Tell us about your AC setup" : copy?.heading ?? "Tell us about your AC setup";
  const intro = needsTypePick
    ? "We don’t yet have AC details for this unit."
    : copy?.intro ?? "Our technician will confirm your AC setup on-site.";

  const estimateUnitSingular = copy?.systemsUnitSingular ?? "AC system";
  const estimateUnitPlural = copy?.systemsUnitPlural ?? "AC systems";
  const estimateAddonSingular = copy?.addonUnitSingular ?? "additional component";
  const estimateAddonPlural = copy?.addonUnitPlural ?? "additional components";

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-white font-['Inter']">
      <div className="border-b border-slate-100 bg-slate-50/70 px-5 pb-1 pt-2 text-[11px] text-slate-400">
        Booking
      </div>

      <div className="flex items-start justify-between px-5 pb-3 pt-5">
        <div className="pr-3">
          <h1 className="text-[22px] font-semibold leading-tight text-slate-900">{heading}</h1>
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
        <p className="mb-4 text-sm text-slate-500">{intro}</p>

        {knownType && !hasOverride && acTypeFromUnit !== "unknown" && (
          <div className="mb-2 rounded-lg border border-pink-200 bg-pink-50 p-3 text-sm text-pink-900 flex gap-2.5 items-start">
            <Info className="h-4 w-4 mt-0.5 shrink-0 text-pink-600" />
            <div>
              <p className="font-semibold">Pre-filled based on our records.</p>
              <p className="mt-0.5 text-[11px] text-pink-900/80 leading-relaxed">
                This may come from prior services or building data — adjust if anything has changed.
              </p>
            </div>
          </div>
        )}

        {knownType && !hasOverride && acTypeFromUnit !== "unknown" && (
          <div className="mb-5">
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
                  if (choice === "keep-split" || choice === "keep-ducted") setOverride(null);
                  else if (choice === "ducted") setOverride("ducted");
                  else if (choice === "split") setOverride("split");
                  else if (choice === "unsure") setOverride("unsure");
                  setOverridePanelOpen(false);
                }}
                onClose={() => setOverridePanelOpen(false)}
              />
            )}
          </div>
        )}

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

        {hasOverride && (
          <OverrideBanner
            title={overrideBannerTitle(acTypeFromUnit, override)}
            detail={overrideBannerDetail(override)}
            onReset={resetOverride}
            resetLabel={acTypeFromUnit === "unknown" ? "Change" : "Reset"}
          />
        )}

        {knownType && !isUnsureMode && copy && (
          <div className="space-y-6">
            {/* Number of systems */}
            <div>
              <div className="mb-2 flex items-baseline justify-between">
                <div>
                  <h3 className="font-semibold text-slate-900">{copy.systemsLabel}</h3>
                  <p className="text-xs font-medium" style={{ color: BRAND }}>
                    ${SYSTEM_PRICE} per system
                  </p>
                  {copy.systemsIncludes && (
                    <div className="mt-1.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        Includes
                      </p>
                      <ul className="mt-0.5 space-y-0.5">
                        {copy.systemsIncludes.map((b) => (
                          <li
                            key={b}
                            className="flex items-center gap-1.5 text-[11px] text-slate-600"
                          >
                            <Check className="h-3 w-3 text-slate-400" strokeWidth={3} />
                            {b}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
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

              <p className="mt-2 text-[12px] text-slate-500 leading-relaxed">{copy.systemsHelper}</p>

              {effectiveType === "split" ? (
                <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5">
                  <div className="flex items-center justify-center gap-2 text-[11px] flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <div className="grid h-7 w-7 place-items-center rounded-md border border-slate-200 bg-white text-slate-600">
                        <Fan className="h-3.5 w-3.5" />
                      </div>
                      <span className="font-medium text-slate-700">1 outdoor unit</span>
                    </div>
                    <span className="text-slate-400 font-semibold">=</span>
                    <span className="font-semibold text-slate-900">1 system</span>
                    <span className="text-[10px] text-slate-400">(where visible)</span>
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
                    <li>If you’re unsure, select 1 and our technician will confirm on-site</li>
                  </ul>
                </div>
              )}

              {effectiveType === "split" && (
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setNotSureCount(true)}
                    data-testid="link-not-sure-count"
                    className="text-[11px] font-medium text-slate-500 underline underline-offset-2 hover:text-slate-900 transition-colors"
                  >
                    Not sure? We can confirm this on-site
                  </button>
                </div>
              )}
            </div>

            {/* Additional units / filters */}
            <div>
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="grid h-7 w-7 place-items-center rounded-md border border-slate-200 bg-slate-50 text-slate-600">
                    <AddonIcon className="h-3.5 w-3.5" />
                  </div>
                  <h3 className="font-semibold text-slate-900">{copy.addonLabel}</h3>
                  <button
                    type="button"
                    onClick={() =>
                      setExampleModal(
                        effectiveType === "ducted" ? "ducted-filter" : "split-indoor",
                      )
                    }
                    data-testid="button-see-example"
                    className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                  >
                    <Eye className="h-3 w-3" />
                    See example
                  </button>
                </div>
                <p className="text-xs font-medium shrink-0" style={{ color: BRAND }}>
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
              {copy.addonRemoteNote && (
                <div className="mt-2 flex items-start gap-2 rounded-md bg-slate-50 px-2.5 py-2">
                  <HelpCircle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-slate-400" />
                  <p className="text-[11px] text-slate-600 leading-relaxed">{copy.addonRemoteNote}</p>
                </div>
              )}
              <p className="mt-1 text-[11px] text-slate-400">{copy.addonNote}</p>
            </div>
          </div>
        )}

        {isUnsureMode && (
          <UnsureCard
            onUndo={
              notSureCount && override !== "unsure" ? () => setNotSureCount(false) : undefined
            }
          />
        )}

        {/* Live Service Estimate */}
        {!needsTypePick && (
          <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 border-b border-slate-200 pb-3">
              <h2 className="text-[13px] font-semibold tracking-wide uppercase text-slate-500">
                Service estimate
              </h2>
            </div>
            <div className="space-y-2 text-sm text-slate-600">
              <div className="flex justify-between">
                <span>
                  {displaySystems} ×{" "}
                  {displaySystems === 1 ? estimateUnitSingular : estimateUnitPlural}
                </span>
                <span className="tabular-nums text-slate-900 font-medium">
                  ${displaySystems * SYSTEM_PRICE}
                </span>
              </div>
              {displayAdditional > 0 && (
                <div className="flex justify-between">
                  <span>
                    {displayAdditional} ×{" "}
                    {displayAdditional === 1 ? estimateAddonSingular : estimateAddonPlural}
                  </span>
                  <span className="tabular-nums text-slate-900 font-medium">
                    ${displayAdditional * ADDON_PRICE}
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
        )}

        {/* Required acknowledgement */}
        {!needsTypePick && (
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
                <p className="text-[13px] font-medium text-slate-900 leading-snug">{ACK_LABEL}</p>
                <p
                  id="ac-ack-helper-mobile"
                  className="mt-2 text-[11px] text-slate-500 leading-relaxed"
                >
                  {ACK_HELPER}
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
        )}
      </div>

      <div className="border-t border-slate-100 bg-white px-5 py-3">
        <span
          onMouseDown={() => {
            if (!confirmed && !needsTypePick) setTouched(true);
          }}
        >
          <button
            type="button"
            disabled={needsTypePick || !confirmed}
            data-testid="button-continue"
            className="flex w-full items-center justify-center gap-2 rounded-full px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition disabled:opacity-50"
            style={{ backgroundColor: BRAND }}
          >
            Continue
            <ArrowRight className="h-4 w-4" />
          </button>
        </span>
      </div>

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

      {exampleModal && (
        <AcExampleModal variant={exampleModal} onClose={() => setExampleModal(null)} />
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
    <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            {eyebrow}
          </p>
          <p className="mt-1 text-[13px] font-medium text-slate-900">{title}</p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-[11px] font-medium text-slate-400 hover:text-slate-700"
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
            className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-left text-[13px] text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition-colors"
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
      className="mb-5 flex gap-2.5 rounded-lg border p-3"
      style={{ borderColor: BRAND + "40", backgroundColor: BRAND + "0d" }}
    >
      <Info className="h-4 w-4 mt-0.5 shrink-0" style={{ color: BRAND }} />
      <div className="flex-1 text-[12px]">
        <p className="font-semibold text-slate-900">{title}</p>
        <p className="mt-1 text-slate-600 leading-relaxed">{detail}</p>
      </div>
      <button
        type="button"
        onClick={onReset}
        data-testid="button-override-reset"
        className="self-start text-[11px] font-medium underline underline-offset-2 hover:opacity-80"
        style={{ color: BRAND }}
      >
        {resetLabel}
      </button>
    </div>
  );
}

function UnsureCard({ onUndo }: { onUndo?: () => void }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500">
          <RefreshCw className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-slate-900 text-[15px]">
            We’ll confirm your setup during the service
          </h3>
          {onUndo && (
            <button
              type="button"
              onClick={onUndo}
              data-testid="button-undo-not-sure"
              className="mt-2 text-[11px] font-medium text-slate-500 underline underline-offset-2 hover:text-slate-900"
            >
              ← I’d like to enter the count myself
            </button>
          )}
        </div>
      </div>
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
