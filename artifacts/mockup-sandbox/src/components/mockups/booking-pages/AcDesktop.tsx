import React, { useEffect, useState } from "react";
import {
  AirVent,
  AlertCircle,
  ArrowRight,
  Check,
  Grid3x3,
  Info,
  Minus,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import { bookingActions, useBookingSelector } from "../../../state/bookingSession";
import {
  computeAcDiscrepancy,
  getAcMode,
  getAcRecord,
  getAcType,
  type AcMode,
  type AcRecord,
  type AcType,
} from "../../../state/bookingHelpers";
import { AcExampleModal, type ExampleVariant } from "./AcExampleModal";
import { AcTermsModal } from "./AcTermsModal";

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
    heading: "Confirm the AC setup",
    intro:
      "Please confirm the number of systems and any extra return-air grilles so we can price your service correctly.",
    systemsLabel: "Number of ducted systems",
    systemsUnitSingular: "ducted service",
    systemsUnitPlural: "ducted services",
    addonLabel: "Extra return-air grilles",
    addonHelper: [
      "If your apartment has more return-air grilles than shown above, add the extras here.",
    ],
    addonUnitSingular: "extra return-air grille",
    addonUnitPlural: "extra return-air grilles",
  },
  split: {
    heading: "Confirm the AC setup",
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
  const outdoor = systems === 1 ? "outdoor unit" : "outdoor units";
  const indoor = systems === 1 ? "indoor unit / return-air grille" : "indoor units / return-air grilles";
  return [`${systems} ${outdoor}`, `${systems} ${indoor}`];
}

function baseLineQualifier(type: KnownType): string {
  if (type === "split") return "1 outdoor + 1 indoor unit per system";
  return "1 outdoor + 1 indoor / return-air grille per system";
}

const PREFILL_DEFAULTS: Record<KnownType, { systems: number; additional: number }> = {
  ducted: { systems: 1, additional: 0 },
  split: { systems: 2, additional: 0 },
};

function buildAck(type: AcType) {
  const noun = type === "ducted" ? "return-air grilles" : "indoor units";
  return {
    label: `I understand the price may be adjusted, and a follow-up visit or rebook may be required, if the number of systems or ${noun} on-site is different from what I booked.`,
    error: `Please confirm you understand the price may be adjusted (and a follow-up visit may be required) if the booked number of systems or ${noun} doesn't match what's on-site.`,
  };
}

type Override = null | "split" | "ducted" | "unsure";
type OpenPanel = null | "type" | "numbers";

export function AcDesktop() {
  const unitId = useBookingSelector((s) => s.unit_id);
  const overrideActive = useBookingSelector((s) => s.ac_override_active);
  const acTypeFromUnit = getAcType(unitId);
  const recorded = getAcRecord(unitId);
  const mode: AcMode = getAcMode(unitId, overrideActive);

  const cameFromSlotPicker = useBookingSelector(
    (s) => s.ac_step_origin === "slot_picker",
  );

  if (mode === "on-file" && recorded) {
    return (
      <OnFileView
        recorded={recorded}
        cameFromSlotPicker={cameFromSlotPicker}
      />
    );
  }

  return (
    <FullConfigView
      unitId={unitId}
      mode={mode}
      acTypeFromUnit={acTypeFromUnit}
      recorded={recorded}
      cameFromSlotPicker={cameFromSlotPicker}
    />
  );
}

/* ─── On-file (minimal) view ──────────────────────────────────────────────── */

function OnFileView({
  recorded,
  cameFromSlotPicker,
}: {
  recorded: AcRecord;
  cameFromSlotPicker: boolean;
}) {
  useEffect(() => {
    bookingActions.setSystems(recorded.systems);
    bookingActions.setAdditionalIndoor(recorded.additional);
    bookingActions.setAcDiscrepancy(null);
  }, [recorded.type, recorded.systems, recorded.additional]);

  const knownType: KnownType = recorded.type;
  const copy = COPY[knownType];
  const sysWord = knownType === "ducted" ? "ducted system" : "split system";
  const sysWordPlural = knownType === "ducted" ? "ducted systems" : "split systems";
  const addonWord = knownType === "ducted" ? "return-air grille" : "indoor unit";
  const addonWordPlural =
    knownType === "ducted" ? "return-air grilles" : "indoor units";

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-['Inter'] flex justify-center overflow-y-auto">
      <div className="w-full max-w-xl">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-8 md:p-10 flex flex-col">
          {cameFromSlotPicker && (
            <div
              className="mb-6 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm leading-relaxed"
              style={{ borderColor: "#FBCFE2", backgroundColor: "#FFF1F8", color: "#9D174D" }}
              data-testid="callout-from-slot-picker-desktop"
            >
              <Info className="mt-0.5 h-5 w-5 shrink-0" />
              <div className="flex-1">
                <span className="font-semibold">You came back to confirm your AC details.</span>{" "}
                Updating these now means we're more likely to finish your service in one visit.
              </div>
              <button
                type="button"
                onClick={() => bookingActions.setAcStepOrigin(null)}
                aria-label="Dismiss"
                data-testid="button-dismiss-from-slot-picker-desktop"
                className="-m-1 rounded p-1 transition hover:opacity-70"
                style={{ color: "#9D174D" }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-slate-900">{copy.heading}</h1>
          </div>

          {/* What's on file summary card */}
          <div
            className="rounded-xl border border-pink-200 bg-pink-50 p-5 mb-5"
            data-testid="card-on-file-summary-desktop"
          >
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-pink-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-[12px] font-semibold uppercase tracking-wide text-pink-900/80">
                  We have on record
                </p>
                <p className="mt-1.5 text-[18px] font-semibold text-slate-900">
                  {recorded.systems} {recorded.systems === 1 ? sysWord : sysWordPlural}
                  {recorded.additional > 0 && (
                    <>
                      {" "}
                      + {recorded.additional} extra{" "}
                      {recorded.additional === 1 ? addonWord : addonWordPlural}
                    </>
                  )}
                </p>
                <p className="mt-1.5 text-[13px] text-pink-900/80 leading-relaxed">
                  Based on prior services or building data for this unit.
                </p>
              </div>
            </div>
          </div>

          {/* Price block */}
          <PriceBlock
            systems={recorded.systems}
            additional={recorded.additional}
            knownType={knownType}
          />

          {/* Update affordance */}
          <div className="mt-5 flex justify-center">
            <button
              type="button"
              onClick={() => bookingActions.setAcOverrideActive(true)}
              data-testid="link-update-details"
              className="text-[13px] font-medium underline underline-offset-2 hover:opacity-80"
              style={{ color: BRAND }}
            >
              Update the details
            </button>
          </div>

          <div className="mt-10 pt-6 border-t border-slate-100 flex items-center justify-between">
            <button
              type="button"
              className="text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors"
              data-testid="button-back-desktop"
            >
              ← Back
            </button>
            <button
              type="button"
              data-testid="button-continue"
              className="flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90"
              style={{ backgroundColor: BRAND }}
            >
              Agree and continue
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Full configuration view (overridden + no-record) ────────────────────── */

function FullConfigView({
  unitId,
  mode,
  acTypeFromUnit,
  recorded,
  cameFromSlotPicker,
}: {
  unitId: string | null;
  mode: AcMode;
  acTypeFromUnit: AcType;
  recorded: AcRecord | null;
  cameFromSlotPicker: boolean;
}) {
  const [override, setOverride] = useState<Override>(null);
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null);
  const [notSureCount, setNotSureCount] = useState(false);

  const effectiveType: AcType =
    override === "split" || override === "ducted" ? override : acTypeFromUnit;

  const knownType: KnownType | null =
    effectiveType === "split" || effectiveType === "ducted" ? effectiveType : null;

  // The type picker shows when (a) we genuinely don't know the type
  // and the customer hasn't picked one yet, or (b) the customer
  // explicitly opened it via "Change AC type" (`openPanel === "type"`).
  // Branch (b) is what lets a customer in overridden mode change the
  // recorded type — Task #50 acceptance criteria require type editing
  // in overridden / no-record modes, not just for unknown units.
  const needsTypePick =
    (acTypeFromUnit === "unknown" && override === null) || openPanel === "type";
  const isUnsureMode = override === "unsure" || notSureCount;
  const hasOverride = override !== null;

  const copy = knownType ? COPY[knownType] : null;
  const defaults = knownType
    ? recorded && recorded.type === knownType
      ? { systems: recorded.systems, additional: recorded.additional }
      : PREFILL_DEFAULTS[knownType]
    : { systems: 1, additional: 0 };

  const [systems, setSystems] = useState(defaults.systems);
  const [additional, setAdditional] = useState(defaults.additional);
  const [confirmed, setConfirmed] = useState(false);
  const [touched, setTouched] = useState(false);
  const [exampleModal, setExampleModal] = useState<ExampleVariant | null>(null);
  const [termsOpen, setTermsOpen] = useState(false);

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
    setOpenPanel(null);
    setNotSureCount(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acTypeFromUnit]);

  // Discrepancy snapshot — only captured in `overridden` mode.
  useEffect(() => {
    if (mode !== "overridden" || !recorded) {
      bookingActions.setAcDiscrepancy(null);
      return;
    }
    if (isUnsureMode) {
      bookingActions.setAcDiscrepancy(
        computeAcDiscrepancy(recorded, { type: "unsure" }),
      );
      return;
    }
    if (effectiveType === "split" || effectiveType === "ducted") {
      bookingActions.setAcDiscrepancy(
        computeAcDiscrepancy(recorded, {
          type: effectiveType,
          systems,
          additional,
        }),
      );
      return;
    }
    bookingActions.setAcDiscrepancy(null);
  }, [
    mode,
    unitId,
    recorded?.type,
    recorded?.systems,
    recorded?.additional,
    effectiveType,
    isUnsureMode,
    systems,
    additional,
  ]);

  const liveDiscrepancy =
    recorded && !isUnsureMode && (effectiveType === "split" || effectiveType === "ducted")
      ? computeAcDiscrepancy(recorded, {
          type: effectiveType,
          systems,
          additional,
        })
      : null;

  const displaySystems = isUnsureMode ? 1 : systems;
  const displayAdditional = isUnsureMode ? 0 : additional;

  useEffect(() => {
    bookingActions.setSystems(displaySystems);
    bookingActions.setAdditionalIndoor(displayAdditional);
  }, [displaySystems, displayAdditional]);

  const showAckError = touched && !confirmed;
  const AddonIcon = effectiveType === "ducted" ? Grid3x3 : AirVent;
  const ack = buildAck(effectiveType);

  const resetOverride = () => {
    setOverride(null);
    setOpenPanel(null);
    setNotSureCount(false);
  };

  const heading = needsTypePick ? "Tell us about the AC setup" : copy?.heading ?? "Tell us about the AC setup";
  const intro = needsTypePick
    ? "We don’t yet have AC details for this unit."
    : copy?.intro ?? "Our technician will confirm your AC setup on-site.";

  const exampleVariantForType: ExampleVariant =
    effectiveType === "ducted" ? "ducted-filter" : "split-indoor";

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-['Inter'] flex justify-center overflow-y-auto">
      <div className="w-full max-w-xl">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-8 md:p-10 flex flex-col">

          {cameFromSlotPicker && (
            <div
              className="mb-6 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm leading-relaxed"
              style={{ borderColor: "#FBCFE2", backgroundColor: "#FFF1F8", color: "#9D174D" }}
              data-testid="callout-from-slot-picker-desktop"
            >
              <Info className="mt-0.5 h-5 w-5 shrink-0" />
              <div className="flex-1">
                <span className="font-semibold">You came back to confirm your AC details.</span>{" "}
                Updating these now means we're more likely to finish your service in one visit.
              </div>
              <button
                type="button"
                onClick={() => bookingActions.setAcStepOrigin(null)}
                aria-label="Dismiss"
                data-testid="button-dismiss-from-slot-picker-desktop"
                className="-m-1 rounded p-1 transition hover:opacity-70"
                style={{ color: "#9D174D" }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          <div className="mb-8">
            <h1 className="text-2xl font-semibold text-slate-900">{heading}</h1>
            <p className="mt-2 text-sm text-slate-500">{intro}</p>
            <p
              className="mt-2 text-sm font-medium"
              style={{ color: "#9D174D" }}
              data-testid="note-ac-accuracy-desktop"
            >
              Please get this right — these details set how long we'll need at
              your unit. If they don't match what we find on-site, we may not
              finish in one visit and could need to rebook.
            </p>
          </div>

          <div className="flex-1">
            {/* "Use what's on file" link — only when we have a record (overridden mode). */}
            {mode === "overridden" && (
              <div className="mb-5">
                <button
                  type="button"
                  onClick={() => bookingActions.setAcOverrideActive(false)}
                  data-testid="link-use-on-file"
                  className="text-[13px] font-medium underline underline-offset-2 hover:opacity-80"
                  style={{ color: BRAND }}
                >
                  ← Use what's on file
                </button>
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
                  setOpenPanel(null);
                }}
                onClose={
                  // Allow closing the picker when it was opened via
                  // "Change AC type" — but never when we genuinely have
                  // no type yet, because in that case the customer must
                  // pick something.
                  acTypeFromUnit === "unknown" && override === null
                    ? undefined
                    : () => setOpenPanel(null)
                }
              />
            )}

            {/* "Change AC type" affordance — visible whenever we have a
                known effective type, the type picker isn't already open,
                and the customer isn't currently in "unsure" mode.
                Available in both overridden and no-record modes. */}
            {!needsTypePick && knownType && !isUnsureMode && (
              <div className="mb-5">
                <button
                  type="button"
                  onClick={() => setOpenPanel("type")}
                  data-testid="link-change-ac-type"
                  className="text-[13px] font-medium underline underline-offset-2 hover:opacity-80"
                  style={{ color: BRAND }}
                >
                  Change AC type
                </button>
              </div>
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

                  {(acTypeFromUnit === "unknown" || hasOverride) && (
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
                        <button
                          type="button"
                          onClick={() => setExampleModal(exampleVariantForType)}
                          data-testid="button-see-example"
                          aria-label={
                            effectiveType === "ducted"
                              ? "What counts as an extra return-air grille?"
                              : "What counts as an extra indoor unit?"
                          }
                          className="grid h-6 w-6 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                        >
                          <Info className="h-4 w-4" />
                        </button>
                      </div>
                      <p className="text-xs font-medium mt-2" style={{ color: BRAND }}>
                        ${ADDON_PRICE} per extra {effectiveType === "ducted" ? "grille" : "unit"}
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

                  <div
                    className="mt-3 space-y-2 text-xs text-slate-500"
                    data-testid="text-extras-helper"
                  >
                    {effectiveType === "ducted" ? (
                      <p>
                        If your apartment has more indoor unit / return-air grilles than shown in the inclusions above, add the extras here.
                      </p>
                    ) : (
                      copy.addonHelper.map((p, i) => <p key={i}>{p}</p>)
                    )}
                  </div>
                </div>
              </div>
            )}

            {liveDiscrepancy && (
              <p
                data-testid="text-discrepancy-note"
                className="mt-3 text-xs text-slate-500"
              >
                We’ll update our records based on your booking.
              </p>
            )}

            {isUnsureMode && (
              <UnsureCard
                onUndo={
                  notSureCount && override !== "unsure"
                    ? () => setNotSureCount(false)
                    : undefined
                }
              />
            )}

            {/* Price block — base + per-extras + total */}
            {!needsTypePick && knownType && (
              <div className="mt-6">
                <PriceBlock
                  systems={displaySystems}
                  additional={displayAdditional}
                  knownType={knownType}
                />
              </div>
            )}

            {/* Required acknowledgement */}
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
                    <p className="text-sm font-medium text-slate-900">{ack.label}</p>
                    <div
                      id="ac-ack-helper-desktop"
                      className="mt-2 text-xs text-slate-500 leading-relaxed"
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setTermsOpen(true);
                        }}
                        data-testid="link-view-terms"
                        className="font-medium underline underline-offset-2 hover:opacity-80"
                        style={{ color: BRAND }}
                      >
                        View terms
                      </button>
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
                    <span>{ack.error}</span>
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
      {termsOpen && (
        <AcTermsModal acType={effectiveType} onClose={() => setTermsOpen(false)} />
      )}
    </div>
  );
}

/* --------------------------------- price block --------------------------------- */

function PriceBlock({
  systems,
  additional,
  knownType,
}: {
  systems: number;
  additional: number;
  knownType: KnownType;
}) {
  const base = systems * SYSTEM_PRICE;
  const extras = additional * ADDON_PRICE;
  const total = base + extras;
  const qualifier = baseLineQualifier(knownType);
  const addonNoun =
    knownType === "ducted" ? "extra return-air grille" : "extra indoor unit";
  const addonNounPlural =
    knownType === "ducted" ? "extra return-air grilles" : "extra indoor units";

  return (
    <div
      className="rounded-xl border border-slate-200 bg-slate-50 p-6"
      data-testid="block-price"
    >
      <div className="mb-3 border-b border-slate-200 pb-3">
        <h2 className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">
          Price
        </h2>
        <p
          className="mt-1.5 text-[11px] text-slate-500 leading-snug"
          data-testid="text-price-anchor"
        >
          Each AC system is ${SYSTEM_PRICE}, so your total reflects the number
          of systems on-site, plus ${ADDON_PRICE} for each extra unit beyond
          what's included.
        </p>
      </div>
      <div className="space-y-2 text-sm text-slate-600">
        <div className="flex items-start justify-between gap-3" data-testid="row-price-base">
          <div className="min-w-0">
            <p>
              {systems} × ${SYSTEM_PRICE}{" "}
              <span className="text-slate-500">service{systems === 1 ? "" : "s"}</span>
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500 leading-snug">{qualifier}</p>
          </div>
          <span className="tabular-nums text-slate-900 font-medium shrink-0">
            ${base}
          </span>
        </div>
        {additional > 0 && (
          <div className="flex items-start justify-between gap-3" data-testid="row-price-extras">
            <div className="min-w-0">
              <p>
                {additional} × ${ADDON_PRICE}{" "}
                <span className="text-slate-500">
                  {additional === 1 ? addonNoun : addonNounPlural}
                </span>
              </p>
            </div>
            <span className="tabular-nums text-slate-900 font-medium shrink-0">
              ${extras}
            </span>
          </div>
        )}
      </div>
      <div className="mt-4 flex items-baseline justify-between border-t border-slate-200 pt-4">
        <span className="text-sm font-semibold text-slate-900">
          Total <span className="text-xs font-normal text-slate-400">(incl. GST)</span>
        </span>
        <span
          className="text-2xl font-bold tabular-nums"
          style={{ color: BRAND }}
          data-testid="text-price-total"
        >
          ${total}
        </span>
      </div>
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
  if (override === "ducted") return "Showing ducted setup. Adjust systems and return-air grilles below.";
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
