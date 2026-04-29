import React, { useEffect, useState } from "react";
import {
  AirVent,
  AlertCircle,
  ArrowLeft,
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

/** Short qualifier shown next to the base price line in the price
 *  breakdown — explains what one $179 service covers. */
function baseLineQualifier(type: KnownType): string {
  if (type === "split") return "1 outdoor + 1 indoor unit per system";
  return "1 outdoor + 1 indoor / return-air grille per system";
}

const PREFILL_DEFAULTS: Record<KnownType, { systems: number; additional: number }> = {
  ducted: { systems: 1, additional: 0 },
  split: { systems: 2, additional: 0 },
};

// Acknowledgment copy adapts to the customer's effective AC type.
function buildAck(type: AcType) {
  const noun = type === "ducted" ? "return-air grilles" : "indoor units";
  return {
    label: `I understand the price may be adjusted, and a follow-up visit or rebook may be required, if the number of systems or ${noun} on-site is different from what I booked.`,
    error: `Please confirm you understand the price may be adjusted (and a follow-up visit may be required) if the booked number of systems or ${noun} doesn't match what's on-site.`,
  };
}

type Override = null | "split" | "ducted" | "unsure";
/** Which inline panel (if any) is open under the pre-filled banner. */
type OpenPanel = null | "type" | "numbers";

export function AcMobile() {
  const unitId = useBookingSelector((s) => s.unit_id);
  const overrideActive = useBookingSelector((s) => s.ac_override_active);
  const acTypeFromUnit = getAcType(unitId);
  const recorded = getAcRecord(unitId);
  const mode: AcMode = getAcMode(unitId, overrideActive);

  const cameFromSlotPicker = useBookingSelector(
    (s) => s.ac_step_origin === "slot_picker",
  );

  // ─── ON-FILE MODE — minimal view ────────────────────────────────────────
  if (mode === "on-file" && recorded) {
    return (
      <OnFileView
        recorded={recorded}
        cameFromSlotPicker={cameFromSlotPicker}
      />
    );
  }

  // ─── OVERRIDDEN / NO-RECORD MODE — full configuration UI ────────────────
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
  // Persist the on-file numbers to the session so the slot picker /
  // admin views stay in sync. Idempotent — actions no-op on equal
  // writes. Clear any stale discrepancy on every render-driven dep
  // change so an earlier overridden state doesn't bleed through after
  // the customer reverts to "use what's on file".
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
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-white font-['Inter']">
      <div className="flex items-start justify-between px-5 pb-3 pt-5">
        <div className="pr-3">
          <h1 className="text-[22px] font-semibold leading-tight text-slate-900">
            {copy.heading}
          </h1>
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
        {cameFromSlotPicker && (
          <div
            className="mb-3 flex items-start gap-2 rounded-xl border px-3 py-2.5 text-[12px] leading-relaxed"
            style={{ borderColor: "#FBCFE2", backgroundColor: "#FFF1F8", color: "#9D174D" }}
            data-testid="callout-from-slot-picker-mobile"
          >
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="flex-1">
              <span className="font-semibold">You came back to confirm your AC details.</span>{" "}
              Updating these now means we're more likely to finish your service in one visit.
            </div>
            <button
              type="button"
              onClick={() => bookingActions.setAcStepOrigin(null)}
              aria-label="Dismiss"
              data-testid="button-dismiss-from-slot-picker-mobile"
              className="-m-1 rounded p-1 transition hover:opacity-70"
              style={{ color: "#9D174D" }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* What's on file summary card */}
        <div
          className="mb-4 rounded-xl border border-pink-200 bg-pink-50 p-4"
          data-testid="card-on-file-summary-mobile"
        >
          <div className="flex items-start gap-2.5">
            <Info className="h-4 w-4 mt-0.5 shrink-0 text-pink-600" />
            <div className="flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-pink-900/80">
                We have on record
              </p>
              <p className="mt-1 text-[15px] font-semibold text-slate-900">
                {recorded.systems} {recorded.systems === 1 ? sysWord : sysWordPlural}
                {recorded.additional > 0 && (
                  <>
                    {" "}
                    + {recorded.additional} extra{" "}
                    {recorded.additional === 1 ? addonWord : addonWordPlural}
                  </>
                )}
              </p>
              <p className="mt-1 text-[12px] text-pink-900/80 leading-relaxed">
                Based on prior services or building data for this unit.
              </p>
            </div>
          </div>
        </div>

        {/* Price block — base + per-extras + total */}
        <PriceBlock
          systems={recorded.systems}
          additional={recorded.additional}
          knownType={knownType}
          dense
        />

        {/* Update affordance */}
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => bookingActions.setAcOverrideActive(true)}
            data-testid="link-update-details"
            className="text-[12px] font-medium underline underline-offset-2 hover:opacity-80"
            style={{ color: BRAND }}
          >
            Update the details
          </button>
        </div>
      </div>

      <div className="border-t border-slate-100 bg-white px-5 py-3">
        <button
          type="button"
          data-testid="button-continue"
          className="flex w-full items-center justify-center gap-2 rounded-full px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
          style={{ backgroundColor: BRAND }}
        >
          Agree and continue
          <ArrowRight className="h-4 w-4" />
        </button>
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

  const needsTypePick = acTypeFromUnit === "unknown" && override === null;
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

  // Discrepancy snapshot — only captured in `overridden` mode (i.e. we
  // have a record on file AND the customer chose to amend it). In
  // `no-record` mode there's nothing to compare against, so we leave
  // the snapshot null.
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

  const heading =
    needsTypePick
      ? "Tell us about the AC setup"
      : copy?.heading ?? "Tell us about the AC setup";
  const intro = needsTypePick
    ? "We don’t yet have AC details for this unit."
    : copy?.intro ?? "Our technician will confirm your AC setup on-site.";

  const exampleVariantForType: ExampleVariant =
    effectiveType === "ducted" ? "ducted-filter" : "split-indoor";

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-white font-['Inter']">
      <div className="flex items-start justify-between px-5 pb-3 pt-5">
        <div className="pr-3">
          <h1 className="text-[22px] font-semibold leading-tight text-slate-900">{heading}</h1>
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
        {cameFromSlotPicker && (
          <div
            className="mb-3 flex items-start gap-2 rounded-xl border px-3 py-2.5 text-[12px] leading-relaxed"
            style={{ borderColor: "#FBCFE2", backgroundColor: "#FFF1F8", color: "#9D174D" }}
            data-testid="callout-from-slot-picker-mobile"
          >
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="flex-1">
              <span className="font-semibold">You came back to confirm your AC details.</span>{" "}
              Updating these now means we're more likely to finish your service in one visit.
            </div>
            <button
              type="button"
              onClick={() => bookingActions.setAcStepOrigin(null)}
              aria-label="Dismiss"
              data-testid="button-dismiss-from-slot-picker-mobile"
              className="-m-1 rounded p-1 transition hover:opacity-70"
              style={{ color: "#9D174D" }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <p className="mb-2 text-sm text-slate-500">{intro}</p>
        <p
          className="mb-4 text-[13px] font-medium leading-snug"
          style={{ color: "#9D174D" }}
          data-testid="note-ac-accuracy-mobile"
        >
          Please get this right — these details set how long we'll need at
          your unit. If they don't match what we find on-site, we may not
          finish in one visit and could need to rebook.
        </p>

        {/* "Use what's on file" link — only when we have a record (overridden mode). */}
        {mode === "overridden" && (
          <div className="mb-4">
            <button
              type="button"
              onClick={() => bookingActions.setAcOverrideActive(false)}
              data-testid="link-use-on-file"
              className="text-[12px] font-medium underline underline-offset-2 hover:opacity-80"
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
                  {knownType && (
                    <div className="mt-1.5" data-testid="block-includes">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        Includes
                      </p>
                      <ul className="mt-0.5 space-y-0.5">
                        {formatSystemsIncludes(knownType, displaySystems).map((b) => (
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

              {(acTypeFromUnit === "unknown" || hasOverride) && (
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

            {/* Additional indoor units (split) / return-air grilles (ducted) */}
            <div>
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="grid h-7 w-7 place-items-center rounded-md border border-slate-200 bg-slate-50 text-slate-600">
                    <AddonIcon className="h-3.5 w-3.5" />
                  </div>
                  <h3 className="font-semibold text-slate-900">{copy.addonLabel}</h3>
                  <button
                    type="button"
                    onClick={() => setExampleModal(exampleVariantForType)}
                    data-testid="button-see-example"
                    aria-label={
                      effectiveType === "ducted"
                        ? "What counts as an extra return-air grille?"
                        : "What counts as an extra indoor unit?"
                    }
                    className="-m-2 grid h-9 w-9 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                  >
                    <Info className="h-3.5 w-3.5" />
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
              <div
                className="mt-2 space-y-1.5 text-[11px] text-slate-500"
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
            className="mt-3 text-[11px] text-slate-500"
          >
            We’ll update our records based on your booking.
          </p>
        )}

        {isUnsureMode && (
          <UnsureCard
            onUndo={
              notSureCount && override !== "unsure" ? () => setNotSureCount(false) : undefined
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
                <p className="text-[13px] font-medium text-slate-900 leading-snug">{ack.label}</p>
                <div
                  id="ac-ack-helper-mobile"
                  className="mt-2 text-[11px] text-slate-500 leading-relaxed"
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
                id="ac-ack-error-mobile"
                role="alert"
                className="mt-3 flex items-start gap-2 text-[11px] font-medium"
                style={{ color: ERROR_PURPLE }}
              >
                <AlertCircle className="h-4 w-4 mt-px shrink-0" />
                <span>{ack.error}</span>
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

/** Transparent price breakdown shown in both on-file (dense) and full
 *  configuration (full) modes. Renders the base service line with a
 *  short qualifier explaining what one $179 service covers, an
 *  optional per-extras line, and a Total (incl. GST) row. */
function PriceBlock({
  systems,
  additional,
  knownType,
  dense,
}: {
  systems: number;
  additional: number;
  knownType: KnownType;
  dense?: boolean;
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
      className={`rounded-xl border border-slate-200 bg-slate-50 ${dense ? "p-4" : "p-4"}`}
      data-testid="block-price"
    >
      <div className="mb-3 border-b border-slate-200 pb-3">
        <h2 className="text-[13px] font-semibold tracking-wide uppercase text-slate-500">
          Price
        </h2>
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
      <div className="mt-4 flex items-end justify-between border-t border-slate-200 pt-4">
        <span className="font-medium text-slate-900">Total (incl. GST)</span>
        <span
          className="text-xl font-bold tabular-nums"
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
