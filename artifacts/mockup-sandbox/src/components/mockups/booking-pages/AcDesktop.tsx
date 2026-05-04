import { useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  Eye,
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
  type KnownType,
  OtherServicesSection,
  PriceBlock,
  SYSTEM_PRICE,
  UnsureMergedCard,
  UnsurePriceReassurance,
  useAcOnFileSync,
  useAcStep,
  useSelectedOtherServices,
} from "./acStepShared";

export function AcDesktop() {
  const unitId = useBookingSelector((s) => s.unit_id);
  const overrideActive = useBookingSelector((s) => s.ac_override_active);
  const acTypeFromUnit = getAcType(unitId);
  const acBrandFromUnit = getAcBrand(unitId);
  const recorded = getAcRecord(unitId);
  const mode: AcMode = getAcMode(unitId, overrideActive);

  const cameFromSlotPicker = useBookingSelector(
    (s) => s.ac_step_origin === "slot_picker",
  );

  if (mode === "on-file" && recorded) {
    return (
      <OnFileView
        recorded={recorded}
        brand={acBrandFromUnit}
        cameFromSlotPicker={cameFromSlotPicker}
      />
    );
  }

  // Task #110 — same rationale as AcMobile: the override view drops
  // the SlotPickerCallout along with the rest of the noisier
  // affordances, so we no longer thread `cameFromSlotPicker` through.
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
  const selectedOtherServices = useSelectedOtherServices();

  const knownType: KnownType = recorded.type;
  const sysWord = knownType === "ducted" ? "ducted system" : "split system";
  const sysWordPlural = knownType === "ducted" ? "ducted systems" : "split systems";
  const addonWord = knownType === "ducted" ? "return-air grille" : "indoor unit";
  const addonWordPlural =
    knownType === "ducted" ? "return-air grilles" : "indoor units";

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-['Inter'] flex justify-center overflow-y-auto">
      <div className="w-full max-w-xl">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-8 md:p-10 flex flex-col">
          {cameFromSlotPicker && <SlotPickerCallout />}

          <div className="mb-6">
            <h1 className="text-2xl font-['Roboto'] font-black" style={{ color: "#1C3144" }}>Confirm the AC setup</h1>
          </div>

          {/* What's on file summary card */}
          <div
            className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 mb-5"
            data-testid="card-on-file-summary-desktop"
          >
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-[12px] font-semibold uppercase tracking-wide text-emerald-900/80">
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
                {brand && (
                  <p
                    className="mt-1 text-[13px] font-medium text-slate-700"
                    data-testid="text-on-file-brand-desktop"
                  >
                    {brand} brand
                  </p>
                )}
                <p className="mt-1.5 text-[13px] text-emerald-900/80 leading-relaxed">
                  Based on prior services or building data for this unit.
                </p>
              </div>
            </div>
          </div>

          {/* Task #186: customer-side Service catalogue toggles */}
          <div className="mb-4">
            <OtherServicesSection variant="desktop" />
          </div>

          {/* Price block */}
          <PriceBlock
            systems={recorded.systems}
            additional={recorded.additional}
            knownType={knownType}
            variant="desktop"
            otherServices={selectedOtherServices}
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
}: {
  unitId: string | null;
  mode: AcMode;
  acTypeFromUnit: AcType;
  recorded: AcRecord | null;
}) {
  const ac = useAcStep({ unitId, mode, acTypeFromUnit, recorded });
  const selectedOtherServices = useSelectedOtherServices();
  const [attemptedContinue, setAttemptedContinue] = useState(false);
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
    setAdditionalCapped,
    additionalMaxQty,
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
    <div className="min-h-screen bg-slate-50 p-8 font-['Inter'] flex justify-center overflow-y-auto">
      <div className="w-full max-w-xl">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-8 md:p-10 flex flex-col">

          {!isUnsureMode && (
            <div className="mb-8">
              <h1 className="text-2xl font-['Roboto'] font-black" style={{ color: "#1C3144" }}>{heading}</h1>
              <p className="mt-2 text-sm text-slate-500">{intro}</p>
            </div>
          )}

          <div className="flex-1">
            {/* Task #110 — single small "I now have a [opposite type]
                system" link beneath the type heading. Replaces the
                ChoicePanel + "Use what's on file" + "Change AC type" +
                OverrideBanner stack from before, on the same rationale
                as in AcMobile. */}
            {!isUnsureMode && knownType && (
              <div className="mb-5">
                <button
                  type="button"
                  onClick={toggleType}
                  data-testid="link-toggle-ac-type"
                  className="text-[13px] font-medium underline underline-offset-2 hover:opacity-80"
                  style={{ color: BRAND }}
                >
                  I now have a {oppositeType} system
                </button>
              </div>
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
                            Each system includes
                          </p>
                          <ul className="mt-1 space-y-0.5">
                            {formatSystemsIncludes(knownType).map((b) => (
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

                  {/* Task #110 — see AcMobile for the full rationale.
                      The count is the only thing the building data
                      can't tell us, so the "Not sure?" affordance is
                      always available beneath the systems stepper. */}
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
                          <Eye className="h-4 w-4" />
                        </button>
                      </div>
                      <p className="text-xs font-medium mt-2" style={{ color: BRAND }}>
                        ${ADDON_PRICE} per extra {effectiveType === "ducted" ? "grille" : "unit"}
                      </p>
                    </div>
                    {(() => {
                      // Drive the stepper from the cap-clamped
                      // `displayAdditional` (Task #222) — never the raw local
                      // `additional` — so the displayed count, the +/-
                      // enabled state and the booking session stay in
                      // lockstep when caps change mid-flow.
                      const atCap =
                        additionalMaxQty != null &&
                        displayAdditional >= additionalMaxQty;
                      return (
                        <div className="flex items-center gap-4 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              setAdditionalCapped(displayAdditional - 1)
                            }
                            disabled={displayAdditional <= 0}
                            data-testid="btn-additional-minus"
                            aria-label={`Decrease ${copy.addonLabel.toLowerCase()}`}
                            className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                          >
                            <Minus className="h-4 w-4" />
                          </button>
                          <div className="w-8 text-center text-xl font-bold text-slate-900">{displayAdditional}</div>
                          <button
                            type="button"
                            onClick={() =>
                              setAdditionalCapped(displayAdditional + 1)
                            }
                            disabled={atCap}
                            title={
                              atCap
                                ? `Max ${additionalMaxQty} — call us for more`
                                : undefined
                            }
                            data-testid="btn-additional-plus"
                            aria-label={`Increase ${copy.addonLabel.toLowerCase()}`}
                            className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>
                      );
                    })()}
                  </div>

                  {additionalMaxQty != null &&
                    displayAdditional >= additionalMaxQty && (
                      <p
                        className="mt-3 text-xs text-slate-500"
                        data-testid="text-additional-cap-hint"
                      >
                        Max {additionalMaxQty} — call us for more.
                      </p>
                    )}
                  <div
                    className="mt-3 space-y-2 text-xs text-slate-500"
                    data-testid="text-extras-helper"
                  >
                    <p>
                      If your apartment has additional{" "}
                      {effectiveType === "ducted"
                        ? "return-air grilles"
                        : "indoor units"}{" "}
                      than what is included in the standard service selected
                      above, add them here. Unsure how to check?{" "}
                      <button
                        type="button"
                        onClick={() => setExampleModal(exampleVariantForType)}
                        data-testid="link-take-a-look"
                        className="font-medium underline underline-offset-2 hover:opacity-80"
                        style={{ color: BRAND }}
                      >
                        take a look
                      </button>
                    </p>
                  </div>
                </div>
              </div>
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
                // Task #110 — see AcMobile for rationale; the type-
                // level unsure path is unreachable, so the change-type
                // affordance inside the merged card is dropped.
                onViewTerms={() => setTermsOpen(true)}
                variant="desktop"
              />
            )}

            {/* Price block — base + per-extras + total. The base
                service row carries no inline per-system qualifier
                when the AC type is known, because the "Each system
                includes" block higher up already lists what one $179
                service covers. The type-level "unsure" state still
                gets the honest "Default — confirmed on the day" line
                under the base row (Task #102) even when
                `acTypeFromUnit` would resolve `knownType` to a real
                type, because the customer told us they're unsure. */}
            {!needsTypePick && (
              <div className="mt-6 space-y-5">
                <OtherServicesSection variant="desktop" />
                <PriceBlock
                  systems={displaySystems}
                  additional={displayAdditional}
                  knownType={override === "unsure" ? null : knownType}
                  variant="desktop"
                  otherServices={selectedOtherServices}
                />
                {override === "unsure" && (
                  <UnsurePriceReassurance variant="desktop" />
                )}
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
            {attemptedContinue && needsTypePick && (
              <div
                className="mr-4 flex items-center gap-2 rounded-xl border px-3 py-2 text-[12px] font-medium"
                style={{ color: ERROR_PURPLE, borderColor: ERROR_PURPLE, backgroundColor: "rgba(151,71,255,0.04)" }}
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>Please select your AC type above.</span>
              </div>
            )}
            <span
              onClickCapture={(e) => {
                if (needsTypePick || !confirmed) {
                  e.stopPropagation();
                  e.preventDefault();
                  setAttemptedContinue(true);
                  if (!needsTypePick) setTouched(true);
                }
              }}
            >
              <button
                type="button"
                data-testid="button-continue"
                className="flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90"
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

/* ─── Local helpers ──────────────────────────────────────────────────────── */

function SlotPickerCallout() {
  return (
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
  );
}
