import React, { useEffect, useState } from "react";
import {
  AirVent,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
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
  getAcRecord,
  getAcType,
  type AcRecord,
  type AcType,
} from "../../../state/bookingHelpers";
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
    heading: "Confirm the AC setup",
    intro:
      "Please confirm the number of systems and any extra return-air grilles so we can price your service correctly.",
    systemsLabel: "Number of ducted systems",
    systemsUnitSingular: "ducted service",
    systemsUnitPlural: "ducted services",
    addonLabel: "Extra return-air grilles",
    // NOTE: For ducted, the rendered helper text below is the inline JSX
    // branch (it includes the "See example" inline link). This array is kept
    // in sync as a fallback / contract for future renderers but isn't shown
    // for ducted today.
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

const ACK_HELPER_INTRO =
  "This only applies when the booking selection doesn't match what's actually on-site. Taylr will not perform any work beyond the preventative maintenance service shown above.";

// Acknowledgment copy adapts to the customer's effective AC type so the
// wording explicitly mirrors what they're counting on the page above.
// Ducted -> "return-air grilles"; split -> "indoor units"; unknown
// (unsure / unknown picker) -> the generic "indoor units" fallback.
function buildAck(type: AcType) {
  const noun = type === "ducted" ? "return-air grilles" : "indoor units";
  return {
    label: `I understand the final price may be adjusted if the number of systems or ${noun} on-site is different from what I booked.`,
    bullets: [
      `If there are more systems or ${noun} on the day, Taylr will service all of them and invoice the unpaid difference afterward.`,
      "If there are fewer, Taylr will credit or refund the difference.",
    ],
    error: `Please confirm you understand the price may be adjusted if the booked number of systems or ${noun} doesn't match what's on-site.`,
  };
}

type Override = null | "split" | "ducted" | "unsure";
/** Which inline panel (if any) is open under the pre-filled banner. */
type OpenPanel = null | "type" | "numbers";

export function AcMobile() {
  const unitId = useBookingSelector((s) => s.unit_id);
  const acTypeFromUnit = getAcType(unitId);
  const recorded = getAcRecord(unitId);
  // Surface the contextual "you came back from the slot picker" banner
  // only when the customer arrived via the slot picker's Update/Edit AC
  // affordance. Cleared by `goToStep` (every other entry path), and by
  // the dismiss button on the banner itself.
  const cameFromSlotPicker = useBookingSelector(
    (s) => s.ac_step_origin === "slot_picker",
  );

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
  // Seed the steppers from the unit's recorded counts when we have a
  // record AND the customer hasn't switched away from that recorded
  // type. After a type override, fall back to the type's generic
  // defaults so the customer doesn't see e.g. "1 ducted system" pre-set
  // when they just told us they actually have a split system.
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

  // Continuously sync the discrepancy snapshot to the booking session so
  // the admin mockup can read it. The action no-ops on equal writes, so
  // calling it on every render-driven dep change is safe.
  useEffect(() => {
    if (!recorded) {
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
    // `unitId` is included so the effect always rewrites the snapshot
    // after a unit switch, even when the new unit's recorded values and
    // the customer's current steppers happen to be identical (the alias
    // case `u1` ↔ `unit-g01-335-aspen` is the canonical example). Without
    // it, `setUnit`'s clear-to-null would survive into a state that
    // actually has a discrepancy.
  }, [
    unitId,
    recorded?.type,
    recorded?.systems,
    recorded?.additional,
    effectiveType,
    isUnsureMode,
    systems,
    additional,
  ]);

  // Re-derived locally for the calm "we'll update our records" note
  // below the steppers — same source of truth as what we write to the
  // session above.
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

  // Persist the customer's stepper values to the booking session so the
  // slot picker (Task #27 time-budget chip + capacity calc) and the
  // admin mockup read the same numbers. The actions no-op on equal
  // writes, so calling this on every render-driven dep change is safe.
  // For "unsure" mode we still write 1/0 — the duration helper uses
  // `ac_discrepancy.customer.type === "unsure"` to apply its fallback,
  // so the stored counts don't matter for slot fitting in that case.
  useEffect(() => {
    bookingActions.setSystems(displaySystems);
    bookingActions.setAdditionalIndoor(displayAdditional);
  }, [displaySystems, displayAdditional]);

  const total = displaySystems * SYSTEM_PRICE + displayAdditional * ADDON_PRICE;
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

  const estimateUnitSingular = copy?.systemsUnitSingular ?? "AC system";
  const estimateUnitPlural = copy?.systemsUnitPlural ?? "AC systems";
  const estimateAddonSingular = copy?.addonUnitSingular ?? "additional component";
  const estimateAddonPlural = copy?.addonUnitPlural ?? "additional components";

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

        {knownType && !hasOverride && acTypeFromUnit !== "unknown" && recorded && (
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

        {knownType && !hasOverride && acTypeFromUnit !== "unknown" && recorded && (
          <div className="mb-5">
            {openPanel === null && (
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px]">
                <span className="text-slate-500">Something not right?</span>
                <button
                  type="button"
                  onClick={() => setOpenPanel("type")}
                  data-testid="link-change-ac-type"
                  className="font-medium text-slate-500 underline underline-offset-2 hover:text-slate-900 transition-colors"
                >
                  Change AC type
                </button>
                <span className="text-slate-300" aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={() => setOpenPanel("numbers")}
                  data-testid="link-change-ac-numbers"
                  className="font-medium text-slate-500 underline underline-offset-2 hover:text-slate-900 transition-colors"
                >
                  The numbers we have are wrong
                </button>
              </div>
            )}
            {openPanel === "type" && (
              <ChoicePanel
                eyebrow="Update AC type"
                title="Has your AC system type changed?"
                options={
                  acTypeFromUnit === "split"
                    ? [
                        { value: "keep-split", label: "No, keep split system" },
                        { value: "ducted", label: "Yes, it is now ducted" },
                      ]
                    : [
                        { value: "keep-ducted", label: "No, keep ducted system" },
                        { value: "split", label: "Yes, it is now a split system" },
                      ]
                }
                onSelect={(choice) => {
                  if (choice === "keep-split" || choice === "keep-ducted") setOverride(null);
                  else if (choice === "ducted") setOverride("ducted");
                  else if (choice === "split") setOverride("split");
                  setOpenPanel(null);
                }}
                onClose={() => setOpenPanel(null)}
              />
            )}
            {openPanel === "numbers" && (
              <NumbersPanel
                recorded={recorded}
                systems={systems}
                additional={additional}
                onSystems={(n) => setSystems(Math.max(1, Math.min(10, n)))}
                onAdditional={(n) => setAdditional(Math.max(0, Math.min(29, n)))}
                onClose={() => setOpenPanel(null)}
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

              {(acTypeFromUnit === "unknown" || hasOverride || openPanel === "type") && (
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
                    onClick={() =>
                      setExampleModal(effectiveType === "ducted" ? "ducted-filter" : "split-indoor")
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
              <div
                className="mt-2 space-y-1.5 text-[11px] text-slate-500"
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
                        className="font-medium text-slate-500 underline underline-offset-2 hover:text-slate-900 transition-colors"
                      >
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
                        className="font-medium text-slate-500 underline underline-offset-2 hover:text-slate-900 transition-colors"
                      >
                        See example
                      </button>
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {liveDiscrepancy && openPanel !== "numbers" && (
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
                <p className="text-[13px] font-medium text-slate-900 leading-snug">{ack.label}</p>
                <div
                  id="ac-ack-helper-mobile"
                  className="mt-2 text-[11px] text-slate-500 leading-relaxed"
                >
                  <p>{ACK_HELPER_INTRO}</p>
                  <ul className="mt-2 list-disc space-y-1 pl-4">
                    {ack.bullets.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
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

function NumbersPanel({
  recorded,
  systems,
  additional,
  onSystems,
  onAdditional,
  onClose,
}: {
  recorded: AcRecord;
  systems: number;
  additional: number;
  onSystems: (n: number) => void;
  onAdditional: (n: number) => void;
  onClose: () => void;
}) {
  const isDucted = recorded.type === "ducted";
  const sysWord = isDucted ? "ducted system" : "split system";
  const sysWordPlural = isDucted ? "ducted systems" : "split systems";
  const addonWord = isDucted ? "return-air grille" : "indoor unit";
  const addonWordPlural = isDucted ? "return-air grilles" : "indoor units";
  const recordedSystemsLabel = `${recorded.systems} ${
    recorded.systems === 1 ? sysWord : sysWordPlural
  }`;
  const recordedAddonLabel = `${recorded.additional} extra ${
    recorded.additional === 1 ? addonWord : addonWordPlural
  }`;

  return (
    <div
      className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm"
      data-testid="panel-change-numbers"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Update what’s on-site
          </p>
          <p className="mt-1 text-[13px] font-medium text-slate-900">
            Tell us the actual numbers in your apartment.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          data-testid="button-close-numbers-panel"
          className="text-[11px] font-medium text-slate-400 hover:text-slate-700"
        >
          Done
        </button>
      </div>

      <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2.5 text-[12px] text-slate-600">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          We have on record
        </p>
        <ul className="mt-1.5 space-y-0.5">
          <li>· {recordedSystemsLabel}</li>
          <li>· {recordedAddonLabel}</li>
        </ul>
      </div>

      <div className="mt-3 space-y-3">
        <PanelStepperRow
          label={`Number of ${sysWordPlural} on-site`}
          value={systems}
          min={1}
          max={10}
          onChange={onSystems}
          testIdMinus="btn-numbers-systems-minus"
          testIdPlus="btn-numbers-systems-plus"
          testIdValue="value-numbers-systems"
        />
        <PanelStepperRow
          label={`Extra ${addonWordPlural} on-site`}
          value={additional}
          min={0}
          max={29}
          onChange={onAdditional}
          testIdMinus="btn-numbers-additional-minus"
          testIdPlus="btn-numbers-additional-plus"
          testIdValue="value-numbers-additional"
        />
      </div>

      <p className="mt-3 text-[11px] text-slate-500">
        We’ll update our records based on your booking.
      </p>
    </div>
  );
}

function PanelStepperRow({
  label,
  value,
  min,
  max,
  onChange,
  testIdMinus,
  testIdPlus,
  testIdValue,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  testIdMinus: string;
  testIdPlus: string;
  testIdValue: string;
}) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-medium text-slate-700">{label}</p>
      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-2">
        <button
          type="button"
          onClick={() => onChange(value - 1)}
          disabled={value <= min}
          aria-label={`Decrease ${label.toLowerCase()}`}
          data-testid={testIdMinus}
          className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50"
        >
          <Minus className="h-4 w-4" />
        </button>
        <div
          className="text-base font-bold text-slate-900 w-10 text-center"
          data-testid={testIdValue}
        >
          {value}
        </div>
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          disabled={value >= max}
          aria-label={`Increase ${label.toLowerCase()}`}
          data-testid={testIdPlus}
          className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
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

