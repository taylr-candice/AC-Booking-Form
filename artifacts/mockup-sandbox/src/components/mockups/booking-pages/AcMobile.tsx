import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  Info,
  Minus,
  Plus,
  X,
} from "lucide-react";
import { bookingActions, useBookingSelector } from "../../../state/bookingSession";
import {
  getAcBrand,
  getAcMode,
  getAcRecord,
  getAcType,
  type AcMode,
  type AcRecord,
  type AcType,
} from "../../../state/bookingHelpers";
import { AcExampleModal } from "./AcExampleModal";
import { AcTermsModal } from "./AcTermsModal";
import {
  ADDON_PRICE,
  BRAND,
  ERROR_PURPLE,
  formatSystemsIncludes,
  getAddonHelperLines,
  type KnownType,
  PriceBlock,
  SYSTEM_PRICE,
  UnsureMergedCard,
  UnsurePriceReassurance,
  useAcOnFileSync,
  useAcStep,
} from "./acStepShared";

export function AcMobile() {
  const unitId = useBookingSelector((s) => s.unit_id);
  const overrideActive = useBookingSelector((s) => s.ac_override_active);
  const acTypeFromUnit = getAcType(unitId);
  const acBrandFromUnit = getAcBrand(unitId);
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
        brand={acBrandFromUnit}
        cameFromSlotPicker={cameFromSlotPicker}
      />
    );
  }

  // ─── OVERRIDDEN / NO-RECORD MODE — full configuration UI ────────────────
  // Task #110: SlotPickerCallout is intentionally NOT forwarded here —
  // the override view's "Update the details" surface drops the pink
  // "you've come back to update" callout along with the other noisy
  // affordances (ChoicePanel, "Use what's on file", OverrideBanner).
  return (
    <FullConfigView
      unitId={unitId}
      mode={mode}
      acTypeFromUnit={acTypeFromUnit}
      recorded={recorded}
    />
  );
}

/* ─── On-file (minimal) view ──────────────────────────────────────────────── */

function OnFileView({
  recorded,
  brand,
  cameFromSlotPicker,
}: {
  recorded: AcRecord;
  brand: string;
  cameFromSlotPicker: boolean;
}) {
  useAcOnFileSync(recorded);

  const knownType: KnownType = recorded.type;
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
            Confirm the AC setup
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
        {cameFromSlotPicker && <SlotPickerCallout />}

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
              {brand && (
                <p
                  className="mt-1 text-[12px] font-medium text-slate-700"
                  data-testid="text-on-file-brand-mobile"
                >
                  {brand} brand
                </p>
              )}
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
          variant="mobile"
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
}: {
  unitId: string | null;
  mode: AcMode;
  acTypeFromUnit: AcType;
  recorded: AcRecord | null;
}) {
  const ac = useAcStep({ unitId, mode, acTypeFromUnit, recorded });
  const {
    override,
    notSureCount,
    setNotSureCount,
    effectiveType,
    knownType,
    needsTypePick,
    isUnsureMode,
    copy,
    systems,
    setSystems,
    additional,
    setAdditional,
    confirmed,
    setConfirmed,
    setTouched,
    displaySystems,
    displayAdditional,
    showAckError,
    ack,
    exampleModal,
    setExampleModal,
    termsOpen,
    setTermsOpen,
    AddonIcon,
    exampleVariantForType,
    heading,
    intro,
    liveDiscrepancy,
    toggleType,
    oppositeType,
  } = ac;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-white font-['Inter']">
      <div className="flex items-start justify-between px-5 pb-3 pt-5">
        <div className="pr-3">
          {!isUnsureMode && (
            <h1 className="text-[22px] font-semibold leading-tight text-slate-900">{heading}</h1>
          )}
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
        {!isUnsureMode && <p className="mb-4 text-sm text-slate-500">{intro}</p>}

        {/* Task #110 — single small "I now have a [opposite type]
            system" link beneath the type heading. The building always
            tells us a type now, so we replaced the noisier ChoicePanel
            + "Use what's on file" + "Change AC type" + OverrideBanner
            stack with this one affordance. The link is suppressed in
            unsure mode (where the AC type isn't part of the
            conversation) and when we somehow don't have a known type
            yet (defensive — should not happen with the new building
            data contract). */}
        {!isUnsureMode && knownType && (
          <div className="mb-4">
            <button
              type="button"
              onClick={toggleType}
              data-testid="link-toggle-ac-type"
              className="text-[12px] font-medium underline underline-offset-2 hover:opacity-80"
              style={{ color: BRAND }}
            >
              I now have a {oppositeType} system
            </button>
          </div>
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

              {/* Task #110 — the count is the only thing the building
                  data CAN'T tell us, so the "Not sure?" affordance is
                  always available beneath the systems stepper in the
                  override view (we used to gate it on `acTypeFromUnit
                  === "unknown" || hasOverride`, but the building now
                  always supplies a known type and the override view
                  is shown for both no-record and explicit override
                  modes — there's no remaining state where this link
                  shouldn't be reachable). */}
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
                {getAddonHelperLines(effectiveType, copy).map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
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
          <UnsureMergedCard
            contextLine={
              notSureCount && knownType
                ? `Showing ${knownType} setup`
                : undefined
            }
            onUndoCount={
              notSureCount && override !== "unsure"
                ? () => setNotSureCount(false)
                : undefined
            }
            // Task #110 — `override === "unsure"` is no longer
            // reachable from the customer flow (the only override
            // entry point is the type-toggle link, which flips to a
            // known type). The `onChangeType` prop on UnsureMergedCard
            // would have surfaced "Change AC type" inside the merged
            // card for the type-level unsure path; that path is gone,
            // so we leave the prop unset.
            onViewTerms={() => setTermsOpen(true)}
            variant="mobile"
          />
        )}

        {/* Price block — base + per-extras + total. In the type-level
            "unsure" state we deliberately drop the type-specific
            qualifier ("1 outdoor + 1 indoor unit per system") even
            when `acTypeFromUnit` would resolve `knownType` to a real
            type — the customer told us they're unsure, so the
            qualifier "Default — confirmed on the day" is the honest
            read (Task #102). The count-level unsure state keeps the
            type-specific qualifier because the type IS known. */}
        {!needsTypePick && (
          <div className="mt-6">
            <PriceBlock
              systems={displaySystems}
              additional={displayAdditional}
              knownType={override === "unsure" ? null : knownType}
              variant="mobile"
            />
            {override === "unsure" && (
              <UnsurePriceReassurance variant="mobile" />
            )}
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

/* ─── Local helpers ──────────────────────────────────────────────────────── */

function SlotPickerCallout() {
  return (
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
  );
}
