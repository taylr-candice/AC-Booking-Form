/**
 * Shared logic + presentational helpers for the AC step (Step 2 of the
 * customer booking flow). Both `AcMobile` and `AcDesktop` consume this
 * module so a single change to mode handling, copy, or pricing flows
 * through to both surfaces and can't quietly drift apart.
 *
 * - `useAcStep`        — owns mode/effective-type, the discrepancy
 *                        capture effect, override/reset wiring, the
 *                        acknowledgement state, and the count steppers.
 * - `useAcOnFileSync`  — keeps the booking session in sync with the
 *                        on-file values when the customer accepts what
 *                        we have on record.
 * - Presentational     — `PriceBlock`, `ChoicePanel`, `OverrideBanner`,
 *                        `UnsureCard` share structure across mobile and
 *                        desktop; the visual differences are gated on a
 *                        `variant` prop.
 */

import { useEffect, useState } from "react";
import { AirVent, ArrowRight, Grid3x3, Info, RefreshCw } from "lucide-react";
import { bookingActions } from "../../../state/bookingSession";
import {
  computeAcDiscrepancy,
  type AcMode,
  type AcRecord,
  type AcType,
} from "../../../state/bookingHelpers";
import { type ExampleVariant } from "./AcExampleModal";

// ─── Visual constants ───────────────────────────────────────────────────────

export const BRAND = "#ED017F";
export const ERROR_PURPLE = "#9747FF";
export const SYSTEM_PRICE = 179;
export const ADDON_PRICE = 39;

// ─── Types ─────────────────────────────────────────────────────────────────

export type KnownType = "split" | "ducted";

export type Copy = {
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

export type Override = null | "split" | "ducted" | "unsure";
/** Which inline panel (if any) is open under the pre-filled banner. */
export type OpenPanel = null | "type" | "numbers";

export type Variant = "mobile" | "desktop";

// ─── Static copy ───────────────────────────────────────────────────────────

export const COPY: Record<KnownType, Copy> = {
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

export const PREFILL_DEFAULTS: Record<
  KnownType,
  { systems: number; additional: number }
> = {
  ducted: { systems: 1, additional: 0 },
  split: { systems: 2, additional: 0 },
};

// ─── Pure copy helpers ─────────────────────────────────────────────────────

export function formatSystemsIncludes(
  type: KnownType,
  systems: number,
): string[] {
  if (type === "split") {
    const outdoor = systems === 1 ? "outdoor unit" : "outdoor units";
    const indoor = systems === 1 ? "indoor unit head" : "indoor unit heads";
    return [`${systems} ${outdoor}`, `${systems} ${indoor}`];
  }
  const outdoor = systems === 1 ? "outdoor unit" : "outdoor units";
  const indoor =
    systems === 1
      ? "indoor unit / return-air grille"
      : "indoor units / return-air grilles";
  return [`${systems} ${outdoor}`, `${systems} ${indoor}`];
}

/** Short qualifier shown next to the base price line in the price
 *  breakdown — explains what one $179 service covers. */
export function baseLineQualifier(type: KnownType): string {
  if (type === "split") return "1 outdoor + 1 indoor unit per system";
  return "1 outdoor + 1 indoor / return-air grille per system";
}

/** Acknowledgment copy adapts to the customer's effective AC type. */
export function buildAck(type: AcType) {
  const noun = type === "ducted" ? "return-air grilles" : "indoor units";
  return {
    label: `I understand the price may be adjusted, and a follow-up visit or rebook may be required, if the number of systems or ${noun} on-site is different from what I booked.`,
    error: `Please confirm you understand the price may be adjusted (and a follow-up visit may be required) if the booked number of systems or ${noun} doesn't match what's on-site.`,
  };
}

export function overrideBannerTitle(
  acTypeFromUnit: AcType,
  override: Override,
): string {
  const originUnknown = acTypeFromUnit === "unknown";
  if (override === "ducted")
    return originUnknown ? "AC type: Ducted" : "Updated AC type: Ducted";
  if (override === "split")
    return originUnknown
      ? "AC type: Split system"
      : "Updated AC type: Split system";
  if (override === "unsure")
    return "No problem — our technician will confirm your AC setup on-site.";
  return "";
}

export function overrideBannerDetail(override: Override): string {
  if (override === "ducted")
    return "Showing ducted setup. Adjust systems and return-air grilles below.";
  if (override === "split")
    return "Showing split setup. Adjust systems and indoor units below.";
  if (override === "unsure")
    return "We’ll book a default of 1 system with 0 additional components and confirm on-site.";
  return "";
}

/** Helper / addon-explainer text shown under the extras stepper.
 *  Ducted gets a slightly different sentence because the inclusions
 *  cover both indoor units and return-air grilles. */
export function getAddonHelperLines(
  effectiveType: AcType,
  copy: Copy,
): string[] {
  if (effectiveType === "ducted") {
    return [
      "If your apartment has more indoor unit / return-air grilles than shown in the inclusions above, add the extras here.",
    ];
  }
  return copy.addonHelper;
}

// ─── On-file sync hook ────────────────────────────────────────────────────

/**
 * Persist the on-file numbers to the booking session so the slot
 * picker / admin views stay in sync. Idempotent — actions no-op on
 * equal writes. Clears any stale discrepancy on every render-driven
 * dep change so an earlier overridden state doesn't bleed through
 * after the customer reverts to "use what's on file".
 */
export function useAcOnFileSync(recorded: AcRecord): void {
  useEffect(() => {
    bookingActions.setSystems(recorded.systems);
    bookingActions.setAdditionalIndoor(recorded.additional);
    bookingActions.setAcDiscrepancy(null);
  }, [recorded.type, recorded.systems, recorded.additional]);
}

// ─── useAcStep — shared logic for the full configuration view ─────────────

export type UseAcStepArgs = {
  unitId: string | null;
  mode: AcMode;
  acTypeFromUnit: AcType;
  recorded: AcRecord | null;
};

/**
 * Owns mode / effective-type computation, the discrepancy capture
 * effect (only writes when `mode === "overridden"`), the
 * acknowledgement state, the override / reset action wiring, and the
 * derived UI flags. Returned shape is identical on mobile and desktop —
 * the views only differ in layout.
 */
export function useAcStep({
  unitId,
  mode,
  acTypeFromUnit,
  recorded,
}: UseAcStepArgs) {
  const [override, setOverride] = useState<Override>(null);
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null);
  const [notSureCount, setNotSureCount] = useState(false);

  const effectiveType: AcType =
    override === "split" || override === "ducted" ? override : acTypeFromUnit;

  const knownType: KnownType | null =
    effectiveType === "split" || effectiveType === "ducted"
      ? effectiveType
      : null;

  // The type picker shows when (a) we genuinely don't know the type
  // and the customer hasn't picked one yet, or (b) the customer
  // explicitly opened it via "Change AC type" (`openPanel === "type"`).
  // Branch (b) is what lets a customer in overridden mode change the
  // recorded type — Task #50 acceptance criteria require type editing
  // in overridden / no-record modes, not just for unknown units.
  const needsTypePick =
    (acTypeFromUnit === "unknown" && override === null) ||
    openPanel === "type";
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
  const [exampleModal, setExampleModal] = useState<ExampleVariant | null>(
    null,
  );
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
    recorded &&
    !isUnsureMode &&
    (effectiveType === "split" || effectiveType === "ducted")
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

  const handleTypeChoice = (choice: string) => {
    if (choice === "ducted") setOverride("ducted");
    else if (choice === "split") setOverride("split");
    else setOverride("unsure");
    setOpenPanel(null);
  };

  const heading = needsTypePick
    ? "Tell us about the AC setup"
    : copy?.heading ?? "Tell us about the AC setup";
  const intro = needsTypePick
    ? "We don’t yet have AC details for this unit."
    : copy?.intro ?? "Our technician will confirm your AC setup on-site.";

  const exampleVariantForType: ExampleVariant =
    effectiveType === "ducted" ? "ducted-filter" : "split-indoor";

  return {
    // mode / type
    override,
    openPanel,
    setOpenPanel,
    notSureCount,
    setNotSureCount,
    effectiveType,
    knownType,
    needsTypePick,
    isUnsureMode,
    hasOverride,
    copy,
    // counts + acknowledgement
    systems,
    setSystems,
    additional,
    setAdditional,
    confirmed,
    setConfirmed,
    touched,
    setTouched,
    displaySystems,
    displayAdditional,
    showAckError,
    ack,
    // overlays
    exampleModal,
    setExampleModal,
    termsOpen,
    setTermsOpen,
    // visual / discrepancy
    AddonIcon,
    exampleVariantForType,
    heading,
    intro,
    liveDiscrepancy,
    // actions
    resetOverride,
    handleTypeChoice,
  };
}

// ─── Shared presentational components ─────────────────────────────────────

/** Transparent price breakdown shown in both on-file (mobile uses
 *  dense padding) and full-configuration modes. Renders the base
 *  service line with a short qualifier explaining what one $179
 *  service covers, an optional per-extras line, and a Total row.
 *
 *  When `knownType` is `null` the customer is in the type-level
 *  "unsure" state — we show the default 1 × $179 base line with a
 *  generic "confirmed on the day" qualifier instead of the
 *  type-specific "1 outdoor + 1 indoor unit per system" line. */
export function PriceBlock({
  systems,
  additional,
  knownType,
  variant,
}: {
  systems: number;
  additional: number;
  knownType: KnownType | null;
  variant: Variant;
}) {
  const base = systems * SYSTEM_PRICE;
  const extras = additional * ADDON_PRICE;
  const total = base + extras;
  const qualifier = knownType
    ? baseLineQualifier(knownType)
    : "Default — confirmed on the day";
  const addonNoun =
    knownType === "ducted" ? "extra return-air grille" : "extra indoor unit";
  const addonNounPlural =
    knownType === "ducted" ? "extra return-air grilles" : "extra indoor units";

  const isMobile = variant === "mobile";
  const padding = isMobile ? "p-4" : "p-6";
  const titleSize = isMobile ? "text-[13px]" : "text-[12px]";

  return (
    <div
      className={`rounded-xl border border-slate-200 bg-slate-50 ${padding}`}
      data-testid="block-price"
    >
      <div className="mb-3 border-b border-slate-200 pb-3">
        <h2
          className={`${titleSize} font-semibold tracking-wide uppercase text-slate-500`}
        >
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
        <div
          className="flex items-start justify-between gap-3"
          data-testid="row-price-base"
        >
          <div className="min-w-0">
            <p>
              {systems} × ${SYSTEM_PRICE}{" "}
              <span className="text-slate-500">
                service{systems === 1 ? "" : "s"}
              </span>
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500 leading-snug">
              {qualifier}
            </p>
          </div>
          <span className="tabular-nums text-slate-900 font-medium shrink-0">
            ${base}
          </span>
        </div>
        {additional > 0 && (
          <div
            className="flex items-start justify-between gap-3"
            data-testid="row-price-extras"
          >
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
      {isMobile ? (
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
      ) : (
        <div className="mt-4 flex items-baseline justify-between border-t border-slate-200 pt-4">
          <span className="text-sm font-semibold text-slate-900">
            Total{" "}
            <span className="text-xs font-normal text-slate-400">
              (incl. GST)
            </span>
          </span>
          <span
            className="text-2xl font-bold tabular-nums"
            style={{ color: BRAND }}
            data-testid="text-price-total"
          >
            ${total}
          </span>
        </div>
      )}
    </div>
  );
}

export function ChoicePanel({
  eyebrow,
  title,
  options,
  onSelect,
  onClose,
  variant,
}: {
  eyebrow: string;
  title: string;
  options: { value: string; label: string }[];
  onSelect: (value: string) => void;
  onClose?: () => void;
  variant: Variant;
}) {
  const isMobile = variant === "mobile";
  const padding = isMobile ? "p-3.5" : "p-4";
  const eyebrowSize = isMobile ? "text-[10px]" : "text-[11px]";
  const titleSize = isMobile ? "text-[13px]" : "text-sm";
  const cancelSize = isMobile ? "text-[11px]" : "text-xs";
  const optionSize = isMobile ? "text-[13px]" : "text-sm";

  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white ${padding} shadow-sm`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p
            className={`${eyebrowSize} font-semibold uppercase tracking-wide text-slate-500`}
          >
            {eyebrow}
          </p>
          <p className={`mt-1 ${titleSize} font-medium text-slate-900`}>
            {title}
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={`${cancelSize} font-medium text-slate-400 hover:text-slate-700`}
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
            className={`flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-left ${optionSize} text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition-colors`}
          >
            <span>{o.label}</span>
            <ArrowRight className="h-4 w-4 text-slate-400" />
          </button>
        ))}
      </div>
    </div>
  );
}

export function OverrideBanner({
  title,
  detail,
  onReset,
  resetLabel,
  variant,
}: {
  title: string;
  detail: string;
  onReset: () => void;
  resetLabel: string;
  variant: Variant;
}) {
  const isMobile = variant === "mobile";
  const wrapper = isMobile
    ? "mb-5 flex gap-2.5 rounded-lg border p-3"
    : "mb-6 flex gap-3 rounded-xl border p-4";
  const iconClass = isMobile ? "h-4 w-4 mt-0.5 shrink-0" : "h-5 w-5 shrink-0";
  const bodyText = isMobile ? "flex-1 text-[12px]" : "flex-1 text-sm";
  const detailClass = isMobile
    ? "mt-1 text-slate-600 leading-relaxed"
    : "mt-1 text-slate-600";
  const buttonSize = isMobile ? "text-[11px]" : "text-xs";

  return (
    <div
      className={wrapper}
      style={{ borderColor: BRAND + "40", backgroundColor: BRAND + "0d" }}
    >
      <Info className={iconClass} style={{ color: BRAND }} />
      <div className={bodyText}>
        <p className="font-semibold text-slate-900">{title}</p>
        <p className={detailClass}>{detail}</p>
      </div>
      <button
        type="button"
        onClick={onReset}
        data-testid="button-override-reset"
        className={`self-start ${buttonSize} font-medium underline underline-offset-2 hover:opacity-80`}
        style={{ color: BRAND }}
      >
        {resetLabel}
      </button>
    </div>
  );
}

/**
 * Single card shown above the price block whenever the customer is in
 * an "unsure" state (Task #102). Replaces the old OverrideBanner +
 * UnsureCard pair so the customer sees one clear message about the
 * default-1-system, invoice-extras-on-the-day deal — with an inline
 * "see terms" link to the existing AcTermsModal — and the appropriate
 * affordance to back out:
 *   - count-level unsure (`onUndoCount`): "← I’d like to enter the
 *     count myself" — keeps the type context line ("Showing split
 *     setup" / "Showing ducted setup") and returns the customer to
 *     the systems stepper.
 *   - type-level unsure (`onChangeType`): "Change AC type" — clears
 *     the unsure override and reopens the type picker.
 *
 * The two affordances are mutually exclusive — only one is set per
 * render based on which entry route the customer took.
 */
export function UnsureMergedCard({
  contextLine,
  onUndoCount,
  onChangeType,
  onViewTerms,
  variant,
}: {
  contextLine?: string;
  onUndoCount?: () => void;
  onChangeType?: () => void;
  onViewTerms: () => void;
  variant: Variant;
}) {
  const isMobile = variant === "mobile";
  const padding = isMobile ? "p-4" : "p-6";
  const iconBox = isMobile ? "h-9 w-9" : "h-10 w-10";
  const headingSize = isMobile ? "text-[15px]" : "text-lg";
  const bodySize = isMobile ? "text-[12px]" : "text-sm";
  const actionMt = isMobile ? "mt-3" : "mt-3";
  const actionSize = isMobile ? "text-[11px]" : "text-xs";
  const contextSize = isMobile ? "text-[11px]" : "text-xs";

  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white ${padding} shadow-sm`}
      data-testid="card-unsure-merged"
    >
      <div className="flex items-start gap-3">
        <div
          className={`grid ${iconBox} shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500`}
        >
          <RefreshCw className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <h3 className={`font-semibold text-slate-900 ${headingSize}`}>
            We’ll confirm your setup during the service
          </h3>
          {contextLine && (
            <p
              className={`mt-1 ${contextSize} font-medium uppercase tracking-wide text-slate-500`}
              data-testid="text-unsure-context"
            >
              {contextLine}
            </p>
          )}
          <p
            className={`mt-2 ${bodySize} text-slate-600 leading-relaxed`}
          >
            We’ll book a default of 1 system (${SYSTEM_PRICE}). If our
            technician finds extras on the day, we’ll invoice you for
            those —{" "}
            <button
              type="button"
              onClick={onViewTerms}
              data-testid="link-view-terms-unsure"
              className="font-medium underline underline-offset-2 hover:opacity-80"
              style={{ color: BRAND }}
            >
              see terms
            </button>
            .
          </p>
          {onUndoCount && (
            <button
              type="button"
              onClick={onUndoCount}
              data-testid="button-undo-not-sure"
              className={`${actionMt} ${actionSize} font-medium text-slate-500 underline underline-offset-2 hover:text-slate-900`}
            >
              ← I’d like to enter the count myself
            </button>
          )}
          {onChangeType && (
            <button
              type="button"
              onClick={onChangeType}
              data-testid="button-change-ac-type-unsure"
              className={`${actionMt} ${actionSize} font-medium underline underline-offset-2 hover:opacity-80`}
              style={{ color: BRAND }}
            >
              Change AC type
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
