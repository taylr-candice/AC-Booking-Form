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
 * - Presentational     — `PriceBlock` and `UnsureMergedCard` share
 *                        structure across mobile and desktop; the
 *                        visual differences are gated on a `variant`
 *                        prop.
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  AirVent,
  Check,
  Grid3x3,
  Minus,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import {
  bookingActions,
  useBookingSession,
} from "../../../state/bookingSession";
import {
  computeAcDiscrepancy,
  type AcMode,
  type AcRecord,
  type AcType,
} from "../../../state/bookingHelpers";
import {
  readLiveOtherServicesFromStorage,
  subscribeLiveOtherServices,
} from "../../../state/liveOtherServices";
import {
  DEFAULT_AC_INDOOR_CAPS,
  readLiveAcCapsFromStorage,
  subscribeLiveAcCaps,
  type LiveAcCaps,
} from "../../../state/liveAcServices";
import {
  otherServiceMinutes,
  otherServicePrice,
  otherServicePriceBreakdown,
  type OtherServiceRule,
} from "../../../state/bookingDerived";
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
  addonUnitSingular: string;
  addonUnitPlural: string;
};

export type Override = null | "split" | "ducted" | "unsure";

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

/** Per-system inclusions, always singular.
 *  The surrounding label reads "Each system includes" so the count
 *  scales naturally — no more 1/2-system pluralisation branching. */
export function formatSystemsIncludes(type: KnownType): string[] {
  if (type === "split") {
    return ["1 outdoor unit", "1 indoor unit head"];
  }
  return ["1 outdoor unit", "1 indoor unit / return-air grille"];
}

/** Acknowledgment copy adapts to the customer's effective AC type. */
export function buildAck(type: AcType) {
  const noun = type === "ducted" ? "return-air grilles" : "indoor units";
  return {
    label: `I understand the price may be adjusted, and a follow-up visit or rebook may be required, if the number of systems or ${noun} on-site is different from what I booked.`,
    error: `Please confirm you understand the price may be adjusted (and a follow-up visit may be required) if the booked number of systems or ${noun} doesn't match what's on-site.`,
  };
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
    // Task #222 — pass the recorded type so the booking-session
    // action can clamp to the per-AC-type catalogue cap. The
    // recorded.type field is `"split" | "ducted"` here (the on-file
    // path doesn't fire for unknown types), so the cap lookup is
    // always meaningful.
    bookingActions.setAdditionalIndoor(recorded.additional, {
      acTypeKey:
        recorded.type === "split" || recorded.type === "ducted"
          ? recorded.type
          : null,
    });
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
  const [notSureCount, setNotSureCount] = useState(false);
  const liveAcCaps = useLiveAcCaps();

  const effectiveType: AcType =
    override === "split" || override === "ducted" ? override : acTypeFromUnit;

  const knownType: KnownType | null =
    effectiveType === "split" || effectiveType === "ducted"
      ? effectiveType
      : null;

  /**
   * Per-AC-type max for the indoor-unit / return-air grille
   * stepper (Task #222). Always positive when the AC type is known:
   * uses the live catalogue projection from AdminApp when present,
   * else falls back to {@link DEFAULT_AC_INDOOR_CAPS} so the cap
   * still applies in canvas-isolated previews and on fresh loads
   * before AdminApp's `useEffect` has run. `null` only for the
   * "type not yet picked" branch where the stepper isn't rendered.
   */
  const additionalMaxQty: number | null = knownType
    ? liveAcCaps[knownType] != null && liveAcCaps[knownType]! > 0
      ? Math.floor(liveAcCaps[knownType]!)
      : DEFAULT_AC_INDOOR_CAPS[knownType]
    : null;

  // The type picker only shows when we genuinely don't know the type
  // and the customer hasn't picked one yet. Customers who want to
  // change a known type use the inline "I now have a [opposite type]
  // system" link in AcMobile / AcDesktop, which calls `toggleType`
  // directly rather than reopening a picker.
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
  // Local cap-aware clamp so a stale `additional` from a previous
  // type (or a catalogue edit that lowered the cap mid-flow) can't
  // surface a value the stepper can't reach. The booking-session
  // action also clamps as defence-in-depth (Task #222).
  const displayAdditional = isUnsureMode
    ? 0
    : additionalMaxQty != null
      ? Math.min(additional, additionalMaxQty)
      : additional;

  useEffect(() => {
    bookingActions.setSystems(displaySystems);
    bookingActions.setAdditionalIndoor(displayAdditional, {
      acTypeKey: knownType,
    });
  }, [displaySystems, displayAdditional, knownType]);

  // Reconcile local state when the cap drops mid-flow (e.g. ops just
  // edited the cap from 8 → 6 in Admin → Services). Without this the
  // raw `additional` could sit above `additionalMaxQty` even though
  // the displayed/written count is already clamped — every retry of
  // `setAdditionalCapped(displayAdditional + 1)` would no-op until
  // the customer lowered the count manually. (Task #222)
  useEffect(() => {
    if (additionalMaxQty != null && additional > additionalMaxQty) {
      setAdditional(additionalMaxQty);
    }
  }, [additional, additionalMaxQty]);

  /**
   * Cap-aware setter for the indoor-unit stepper. Clamps the
   * incoming value to `additionalMaxQty` so the local React state
   * can't drift above the catalogue cap (the booking session action
   * also clamps; this keeps the local view in lockstep so the
   * displayed count never lies). Used by AcMobile / AcDesktop in
   * place of the raw `setAdditional` setter (Task #222).
   */
  const setAdditionalCapped = (next: number) => {
    const min = 0;
    const max = additionalMaxQty != null ? additionalMaxQty : Infinity;
    setAdditional(Math.max(min, Math.min(max, Math.floor(next))));
  };

  const showAckError = touched && !confirmed;
  const AddonIcon = effectiveType === "ducted" ? Grid3x3 : AirVent;
  const ack = buildAck(effectiveType);

  const resetOverride = () => {
    setOverride(null);
    setNotSureCount(false);
  };

  /**
   * Task #110 — flip the effective AC type for this booking when the
   * customer reports they've swapped systems since we last looked.
   * Writes into the `override` slot so the discrepancy capture effect
   * picks the change up. Counts reset to the new type's prefill
   * defaults because the previous counts no longer apply (a 3-system
   * split doesn't translate cleanly to a 3-system ducted etc.).
   *
   * The opposite type is computed off `effectiveType` rather than
   * `acTypeFromUnit` so that consecutive flips bounce back and forth
   * predictably even after the first flip has stuck. The link copy in
   * the views uses `oppositeType()` so the label and the action stay
   * in lockstep without each render-site re-deriving the toggle.
   */
  const toggleType = () => {
    const next: KnownType =
      effectiveType === "ducted" ? "split" : "ducted";
    setOverride(next);
    setNotSureCount(false);
  };

  const oppositeType: KnownType =
    effectiveType === "ducted" ? "split" : "ducted";

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
    setAdditionalCapped,
    additionalMaxQty,
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
    toggleType,
    oppositeType,
  };
}

// ─── Shared presentational components ─────────────────────────────────────

/** Transparent price breakdown shown in both on-file (mobile uses
 *  dense padding) and full-configuration modes. Renders the base
 *  service line, an optional per-extras line, and a Total row.
 *
 *  When `knownType` is `null` the customer is in the type-level
 *  "unsure" state — the base 1 × $179 line gets a "Default —
 *  confirmed on the day" qualifier underneath. When the AC type is
 *  known there's no inline qualifier, because the "Each system
 *  includes" block higher up already explains what one $179 service
 *  covers. */
export function PriceBlock({
  systems,
  additional,
  knownType,
  variant,
  otherServices = [],
}: {
  systems: number;
  additional: number;
  knownType: KnownType | null;
  variant: Variant;
  /**
   * Selected "other" catalogue services (Task #186, Task #201) to
   * itemise in the price card. Each entry pairs a catalogue rule
   * with a qty; the price card renders one line per service and
   * shows `qty × name` (when qty > 1) plus the combined
   * `priceAud × qty + addonPriceAud × max(qty − 1, 0)` charge. Pass
   * `[]` (or omit) for the AC-only path that pre-dates Task #186.
   */
  otherServices?: readonly SelectedOtherService[];
}) {
  const base = systems * SYSTEM_PRICE;
  const extras = additional * ADDON_PRICE;
  const othersTotal = otherServices.reduce(
    (sum, { rule, qty }) => sum + otherServicePrice(rule, qty),
    0,
  );
  const total = base + extras + othersTotal;
  // Only the "unsure" mode (no AC type yet) gets a qualifier line under
  // the base service row. Once a known type is picked, the per-system
  // inclusions are already spelled out by the "Each system includes"
  // block higher in the step, so a duplicate qualifier here is noise.
  const qualifier = knownType ? null : "Default — confirmed on the day";
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
            {qualifier && (
              <p className="mt-0.5 text-[11px] text-slate-500 leading-snug">
                {qualifier}
              </p>
            )}
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
        {/* Task #186 / Task #201 / Task #211: one block per selected
            "other" catalogue service. Qty 1 reads the same as the
            original single-toggle path; qty 2 prefixes "n × " to the
            name and keeps a single combined row so the compact
            common-case stays compact. Qty ≥ 3 expands into a header
            row plus two indented sub-rows — `qty × $base` and
            `(qty − 1) × $addon` — each carrying its own subtotal so
            the math behind the combined formula is self-explanatory
            and matches the customer's post-payment receipt. */}
        {otherServices.map(({ rule, qty }) => {
          const breakdown = otherServicePriceBreakdown(rule, qty);
          const showBreakdown = qty >= 3;
          if (!showBreakdown) {
            return (
              <div
                key={rule.id}
                className="flex items-start justify-between gap-3"
                data-testid={`row-price-other-${rule.id}`}
              >
                <div className="min-w-0">
                  <p>
                    {qty > 1 ? `${qty} × ${rule.name}` : rule.name}{" "}
                    <span className="text-slate-500">
                      {qty > 1
                        ? `(base + ${qty - 1} × ${rule.addonLabel})`
                        : "(base)"}
                    </span>
                  </p>
                  {rule.appliesToNote ? (
                    <p className="mt-0.5 text-[11px] text-slate-500 leading-snug">
                      {rule.appliesToNote}
                    </p>
                  ) : null}
                </div>
                <span className="tabular-nums text-slate-900 font-medium shrink-0">
                  ${breakdown.totalAud}
                </span>
              </div>
            );
          }
          return (
            <div
              key={rule.id}
              data-testid={`row-price-other-${rule.id}`}
              className="space-y-1.5"
            >
              <p className="text-slate-700">
                {qty} × {rule.name}
              </p>
              {rule.appliesToNote ? (
                <p className="text-[11px] text-slate-500 leading-snug">
                  {rule.appliesToNote}
                </p>
              ) : null}
              <div className="ml-3 space-y-1 border-l border-slate-200 pl-3 text-[13px]">
                <div
                  className="flex items-start justify-between gap-3"
                  data-testid={`row-price-other-${rule.id}-base`}
                >
                  <p className="text-slate-600">
                    {breakdown.baseQty} × ${breakdown.baseUnitAud}{" "}
                    <span className="text-slate-500">base price</span>
                  </p>
                  <span className="tabular-nums text-slate-900 font-medium shrink-0">
                    ${breakdown.baseSubtotalAud}
                  </span>
                </div>
                <div
                  className="flex items-start justify-between gap-3"
                  data-testid={`row-price-other-${rule.id}-addon`}
                >
                  <p className="text-slate-600">
                    {breakdown.addonQty} × ${breakdown.addonUnitAud}{" "}
                    <span className="text-slate-500">{rule.addonLabel}</span>
                  </p>
                  <span className="tabular-nums text-slate-900 font-medium shrink-0">
                    ${breakdown.addonSubtotalAud}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
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

/**
 * Single card shown above the price block whenever the customer is in
 * an "unsure" state (Task #102). Shows one clear message about the
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
  const padding = isMobile ? "p-3" : "p-4";
  const headingSize = isMobile ? "text-[13px]" : "text-sm";
  const bodySize = isMobile ? "text-[12px]" : "text-[13px]";
  const actionSize = isMobile ? "text-[11px]" : "text-xs";
  const contextSize = isMobile ? "text-[10px]" : "text-[11px]";

  return (
    <div
      className={`rounded-lg border border-slate-200 bg-slate-50 ${padding}`}
      data-testid="card-unsure-merged"
    >
      <div className="flex items-start gap-2.5">
        <RefreshCw className="h-3.5 w-3.5 shrink-0 mt-0.5 text-slate-400" />
        <div className="flex-1 min-w-0">
          <h3 className={`font-semibold text-slate-700 ${headingSize}`}>
            We’ll confirm your setup during the service
          </h3>
          {contextLine && (
            <p
              className={`mt-1 ${contextSize} font-medium uppercase tracking-wide text-slate-400`}
              data-testid="text-unsure-context"
            >
              {contextLine}
            </p>
          )}
          <p
            className={`mt-1.5 ${bodySize} text-slate-500 leading-relaxed`}
          >
            We’ll book a default of 1 system (${SYSTEM_PRICE}). If our
            technician finds extras on the day, we’ll invoice you for
            those —{" "}
            <button
              type="button"
              onClick={onViewTerms}
              data-testid="link-view-terms-unsure"
              className="underline underline-offset-2 text-slate-600 hover:text-slate-900"
            >
              see terms
            </button>
            .
          </p>
          {(onUndoCount || onChangeType) && (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {onUndoCount && (
                <button
                  type="button"
                  onClick={onUndoCount}
                  data-testid="button-undo-not-sure"
                  className={`${actionSize} text-slate-500 underline underline-offset-2 hover:text-slate-900`}
                >
                  ← I’d like to enter the count myself
                </button>
              )}
              {onChangeType && (
                <button
                  type="button"
                  onClick={onChangeType}
                  data-testid="button-change-ac-type-unsure"
                  className={`${actionSize} text-slate-500 underline underline-offset-2 hover:text-slate-900`}
                >
                  Change AC type
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * One-line price reassurance shown under the price block when the
 * customer is in type-level unsure mode (`override === "unsure"`).
 * The price block in this state shows the default `1 × $179` line, so
 * customers naturally wonder "what if I actually have 2 systems?".
 * This sentence answers that question in plain language and references
 * the same $179 / $39 figures as the price block, so the customer
 * doesn't need to open the "see terms" modal to get the gist.
 */
export function UnsurePriceReassurance({ variant }: { variant: Variant }) {
  const isMobile = variant === "mobile";
  const textSize = isMobile ? "text-[11px]" : "text-xs";
  return (
    <p
      data-testid="text-unsure-price-reassurance"
      className={`mt-2 ${textSize} text-slate-500 leading-snug`}
    >
      If we find more systems or extra units on the day, we’ll only invoice
      the difference — ${SYSTEM_PRICE} per extra system, ${ADDON_PRICE} per
      extra unit.
    </p>
  );
}

// ─── Other services (Task #186) ───────────────────────────────────────────

/**
 * Subscribe to the cross-iframe "other" service bridge (Task #186)
 * and return the projected catalogue. Driven by
 * `useSyncExternalStore` against `subscribeLiveOtherServices`, which
 * fires on cross-window `storage` events AND on same-window writes
 * by `AdminApp`. The empty-array default fires in canvas-isolated
 * mode where no admin shell has populated sessionStorage — both the
 * section and the price card collapse to nothing.
 *
 * The hook reads from sessionStorage rather than module-level state
 * because each step of the customer flow renders inside an `<iframe>`
 * with its own JS realm; module state in `AdminApp`'s frame isn't
 * visible there, but same-origin sessionStorage is.
 */
export function useLiveOtherServices(): readonly OtherServiceRule[] {
  return useSyncExternalStore(
    subscribeLiveOtherServices,
    readLiveOtherServicesFromStorage,
    readLiveOtherServicesFromStorage,
  );
}

/**
 * Subscribe to the cross-iframe AC caps bridge (Task #222) and
 * return the projected per-AC-type max-add-on map. Driven by
 * `useSyncExternalStore` against `subscribeLiveAcCaps`, which fires
 * on cross-window `storage` events AND on same-window writes by
 * `AdminApp`. The empty `{split: null, ducted: null}` default fires
 * in canvas-isolated mode where no admin shell has populated
 * sessionStorage — in that case the stepper has no per-type cap
 * and the booking session falls back to its legacy 0..29 ceiling.
 */
export function useLiveAcCaps(): LiveAcCaps {
  return useSyncExternalStore(
    subscribeLiveAcCaps,
    readLiveAcCapsFromStorage,
    readLiveAcCapsFromStorage,
  );
}

/** A selected "other" service paired with the chosen quantity
 *  (Task #201). The customer-flow projection of one entry in
 *  `other_service_quantities` resolved against the live catalogue. */
export type SelectedOtherService = {
  rule: OtherServiceRule;
  qty: number;
};

/**
 * Resolve the customer's currently-selected `other_service_quantities`
 * against the live catalogue, preserving session insertion order and
 * dropping stale ids / non-positive qtys. Used by the AC step price
 * card so removed catalogue entries silently disappear instead of
 * crashing the booking flow.
 */
export function useSelectedOtherServices(): SelectedOtherService[] {
  const session = useBookingSession();
  const others = useLiveOtherServices();
  return useMemo(() => {
    const quantities = session.other_service_quantities;
    const ids = Object.keys(quantities);
    if (ids.length === 0) return [];
    const byId = new Map<string, OtherServiceRule>(
      others.map((s) => [s.id, s]),
    );
    const out: SelectedOtherService[] = [];
    for (const id of ids) {
      const qty = quantities[id];
      if (typeof qty !== "number" || qty <= 0) continue;
      const m = byId.get(id);
      if (m) out.push({ rule: m, qty });
    }
    return out;
  }, [others, session.other_service_quantities]);
}

/**
 * Per-service cards for the catalogue's "other" services
 * (Task #186, Task #201) — rendered between the AC config block and
 * the price card on Step 2. Each card shows the service name, the
 * "applies to" note (if any), the per-unit duration / price, and:
 *
 *   - a `+ Add` affordance when the customer hasn't selected it
 *     (`qty === 0`) — tapping it sets qty to 1 and reveals the
 *     stepper, mirroring the AC indoor-units pattern.
 *   - a `−  qty  +` stepper plus a remove (×) button when selected
 *     (`qty ≥ 1`), so the customer can book multiple bathrooms /
 *     filter cleans without phoning ops.
 *
 * Quantity edits write through to `other_service_quantities` via
 * `bookingActions.setOtherServiceQuantity`, which the slot picker
 * (`getBookingDurationMinutes`) and the Pay step
 * (`computeBookingTotal`) both consume.
 *
 * Returns `null` when the catalogue has no "other" entries — the
 * customer flow stays visually identical to its pre-Task-#186 layout
 * until ops actually authors a service.
 */
export function OtherServicesSection({ variant }: { variant: Variant }) {
  const session = useBookingSession();
  const others = useLiveOtherServices();
  if (others.length === 0) return null;
  const quantities = session.other_service_quantities;
  const isMobile = variant === "mobile";
  const titleSize = isMobile ? "text-[15px]" : "text-base";
  const helperSize = isMobile ? "text-[12px]" : "text-[13px]";
  return (
    <div data-testid="block-other-services" className="space-y-3">
      <div>
        <h3 className={`${titleSize} font-semibold text-slate-900`}>
          Add another service
        </h3>
        <p className={`mt-1 ${helperSize} text-slate-500 leading-snug`}>
          Bundle a one-off task with this visit. Each option adds its
          own time to the slot and to your total — pick a quantity
          to book multiple.
        </p>
      </div>
      <div className="space-y-2">
        {others.map((s) => (
          <OtherServiceCard
            key={s.id}
            rule={s}
            qty={quantities[s.id] ?? 0}
            variant={variant}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * One row of the {@link OtherServicesSection}. Split out as its own
 * component so the "selected vs not selected" branch can read
 * cleanly: when `qty === 0` we render a single full-width "+ Add"
 * button so the row stays tappable in its entirety; once selected
 * the row swaps to a header + StepperRow layout that mirrors the
 * AC indoor-units stepper (same minus / plus buttons, same disabled
 * state at qty = 1).
 */
function OtherServiceCard({
  rule,
  qty,
  variant,
}: {
  rule: OtherServiceRule;
  qty: number;
  variant: Variant;
}) {
  const isMobile = variant === "mobile";
  const helperSize = isMobile ? "text-[12px]" : "text-[13px]";
  const cardPadding = isMobile ? "p-3" : "p-4";
  const isOn = qty >= 1;

  const perUnitMin = rule.baseMinutes;
  const perUnitAud = rule.priceAud;
  const totalMin = otherServiceMinutes(rule, qty);
  const totalAud = otherServicePrice(rule, qty);
  // Per-service quantity ceiling; falls back to the global 99 for
  // legacy catalogue blobs that don't carry a `maxQty`.
  const maxQty =
    rule.maxQty != null && rule.maxQty > 0 ? Math.floor(rule.maxQty) : 99;
  const atCap = qty >= maxQty;

  if (!isOn) {
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={false}
        data-testid={`toggle-other-service-${rule.id}`}
        onClick={() => bookingActions.setOtherServiceQuantity(rule.id, 1)}
        className={`flex w-full items-start justify-between gap-3 rounded-xl border ${cardPadding} text-left transition hover:border-slate-300`}
        style={{ borderColor: "#e2e8f0", backgroundColor: "#fff" }}
      >
        <span className="flex items-start gap-3 min-w-0">
          <span
            className="mt-0.5 grid h-5 w-5 place-items-center rounded-full border-2 shrink-0"
            style={{ borderColor: BRAND, backgroundColor: "#fff" }}
            aria-hidden="true"
          >
            <Plus className="h-3 w-3" style={{ color: BRAND }} strokeWidth={3} />
          </span>
          <span className="min-w-0">
            <span
              className={`block ${helperSize} font-semibold text-slate-900`}
            >
              {rule.name}
            </span>
            {rule.appliesToNote && (
              <span className="mt-0.5 block text-[11px] text-slate-500 leading-snug">
                {rule.appliesToNote}
              </span>
            )}
            <span className="mt-1 block text-[11px] text-slate-500">
              Adds ~{perUnitMin} min · ${perUnitAud} per unit
            </span>
          </span>
        </span>
        <span
          className={`shrink-0 ${helperSize} font-semibold underline underline-offset-2`}
          style={{ color: BRAND }}
        >
          + Add
        </span>
      </button>
    );
  }

  return (
    <div
      data-testid={`card-other-service-${rule.id}`}
      className={`rounded-xl border ${cardPadding} transition`}
      style={{ borderColor: BRAND, backgroundColor: "rgba(237,1,127,0.04)" }}
      role="checkbox"
      aria-checked={true}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span
            className="mt-0.5 grid h-5 w-5 place-items-center rounded-md border-2 shrink-0"
            style={{ backgroundColor: BRAND, borderColor: BRAND }}
            aria-hidden="true"
          >
            <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
          </span>
          <div className="min-w-0">
            <p
              className={`${helperSize} font-semibold text-slate-900`}
            >
              {rule.name}
            </p>
            {rule.appliesToNote && (
              <p className="mt-0.5 text-[11px] text-slate-500 leading-snug">
                {rule.appliesToNote}
              </p>
            )}
            <p className="mt-1 text-[11px] text-slate-500">
              {qty > 1 ? `${qty} × ~${perUnitMin} min` : `~${perUnitMin} min`}
              {" · "}${perUnitAud} per unit
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => bookingActions.setOtherServiceQuantity(rule.id, 0)}
          data-testid={`btn-remove-other-service-${rule.id}`}
          aria-label={`Remove ${rule.name}`}
          className="-m-1.5 grid h-7 w-7 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors shrink-0"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <StepperRow
          qty={qty}
          onDecrement={() =>
            bookingActions.setOtherServiceQuantity(rule.id, qty - 1)
          }
          onIncrement={() =>
            bookingActions.setOtherServiceQuantity(rule.id, qty + 1)
          }
          minQty={1}
          maxQty={maxQty}
          incrementTitle={
            atCap ? `Max ${maxQty} — call us for more` : undefined
          }
          decrementTestId={`btn-other-service-minus-${rule.id}`}
          incrementTestId={`btn-other-service-plus-${rule.id}`}
          decrementAriaLabel={`Decrease ${rule.name}`}
          incrementAriaLabel={`Increase ${rule.name}`}
          variant={variant}
        />
        <span
          className="shrink-0 tabular-nums text-sm font-semibold text-slate-900"
          data-testid={`text-other-service-total-${rule.id}`}
        >
          +${totalAud}
          <span className="ml-1 text-[11px] font-normal text-slate-500">
            · ~{totalMin} min
          </span>
        </span>
      </div>
      {atCap && (
        <p
          className="mt-2 text-[11px] text-slate-500"
          data-testid={`text-other-service-cap-hint-${rule.id}`}
        >
          Max {maxQty} — call us for more.
        </p>
      )}
    </div>
  );
}

/**
 * Reusable −/+ stepper row, modelled on the AC indoor-units stepper
 * pattern (same minus/plus icons, same disabled-at-min behaviour).
 * Lifted out so any add-on count UI can share one stepper without
 * each call site re-implementing the JSX.
 *
 * Visual variants intentionally mirror the AC stepper: mobile uses
 * the rounded-lg slate-100 button chrome, desktop uses the
 * rounded-full bordered chrome — so a customer who used the AC
 * stepper finds the same affordance here without re-learning it.
 */
function StepperRow({
  qty,
  onDecrement,
  onIncrement,
  minQty = 0,
  maxQty,
  incrementTitle,
  decrementTestId,
  incrementTestId,
  decrementAriaLabel,
  incrementAriaLabel,
  variant,
}: {
  qty: number;
  onDecrement: () => void;
  onIncrement: () => void;
  minQty?: number;
  /** Optional upper bound. When `qty >= maxQty` the "+" button
   *  greys out and stops firing — caller is responsible for
   *  surfacing a hint near the row explaining the cap. */
  maxQty?: number;
  /** Native `title` for the "+" button — used to expose the cap
   *  reason on hover for sighted users. */
  incrementTitle?: string;
  decrementTestId?: string;
  incrementTestId?: string;
  decrementAriaLabel: string;
  incrementAriaLabel: string;
  variant: Variant;
}) {
  const isMobile = variant === "mobile";
  const decrementDisabled = qty <= minQty;
  const incrementDisabled = maxQty != null && qty >= maxQty;
  if (isMobile) {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onDecrement}
          disabled={decrementDisabled}
          data-testid={decrementTestId}
          aria-label={decrementAriaLabel}
          className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50"
        >
          <Minus className="h-4 w-4" />
        </button>
        <div className="text-base font-bold text-slate-900 w-8 text-center tabular-nums">
          {qty}
        </div>
        <button
          type="button"
          onClick={onIncrement}
          disabled={incrementDisabled}
          title={incrementTitle}
          data-testid={incrementTestId}
          aria-label={incrementAriaLabel}
          className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50 disabled:hover:bg-slate-100"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onDecrement}
        disabled={decrementDisabled}
        data-testid={decrementTestId}
        aria-label={decrementAriaLabel}
        className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
      >
        <Minus className="h-4 w-4" />
      </button>
      <div className="w-7 text-center text-lg font-bold text-slate-900 tabular-nums">
        {qty}
      </div>
      <button
        type="button"
        onClick={onIncrement}
        disabled={incrementDisabled}
        title={incrementTitle}
        data-testid={incrementTestId}
        aria-label={incrementAriaLabel}
        className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
