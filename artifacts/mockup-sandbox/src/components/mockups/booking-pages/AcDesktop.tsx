import {
  AlertCircle,
  ArrowRight,
  Check,
  Info,
  Minus,
  Plus,
  X,
} from "lucide-react";
import { bookingActions, useBookingSelector } from "../../../state/bookingSession";
import {
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
  ChoicePanel,
  ERROR_PURPLE,
  formatSystemsIncludes,
  getAddonHelperLines,
  type KnownType,
  OverrideBanner,
  overrideBannerDetail,
  overrideBannerTitle,
  PriceBlock,
  SYSTEM_PRICE,
  UnsureMergedCard,
  useAcOnFileSync,
  useAcStep,
} from "./acStepShared";

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
  useAcOnFileSync(recorded);

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
            <h1 className="text-2xl font-semibold text-slate-900">Confirm the AC setup</h1>
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
            variant="desktop"
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
  const ac = useAcStep({ unitId, mode, acTypeFromUnit, recorded });
  const {
    override,
    setOpenPanel,
    notSureCount,
    setNotSureCount,
    effectiveType,
    knownType,
    needsTypePick,
    isUnsureMode,
    hasOverride,
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
    resetOverride,
    handleTypeChoice,
  } = ac;

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-['Inter'] flex justify-center overflow-y-auto">
      <div className="w-full max-w-xl">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-8 md:p-10 flex flex-col">

          {cameFromSlotPicker && <SlotPickerCallout />}

          {!isUnsureMode && (
            <div className="mb-8">
              <h1 className="text-2xl font-semibold text-slate-900">{heading}</h1>
              <p className="mt-2 text-sm text-slate-500">{intro}</p>
            </div>
          )}

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
                onSelect={handleTypeChoice}
                onClose={
                  // Allow closing the picker when it was opened via
                  // "Change AC type" — but never when we genuinely have
                  // no type yet, because in that case the customer must
                  // pick something.
                  acTypeFromUnit === "unknown" && override === null
                    ? undefined
                    : () => setOpenPanel(null)
                }
                variant="desktop"
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

            {hasOverride && !isUnsureMode && (
              <OverrideBanner
                title={overrideBannerTitle(acTypeFromUnit, override)}
                detail={overrideBannerDetail(override)}
                onReset={resetOverride}
                resetLabel={acTypeFromUnit === "unknown" ? "Change" : "Reset"}
                variant="desktop"
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
                className="mt-3 text-xs text-slate-500"
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
                onChangeType={
                  override === "unsure" ? resetOverride : undefined
                }
                onViewTerms={() => setTermsOpen(true)}
                variant="desktop"
              />
            )}

            {/* Price block — base + per-extras + total. In the
                type-level "unsure" state we deliberately drop the
                type-specific qualifier ("1 outdoor + 1 indoor unit
                per system") even when `acTypeFromUnit` would resolve
                `knownType` to a real type — the customer told us
                they're unsure, so the qualifier "Default — confirmed
                on the day" is the honest read (Task #102). The
                count-level unsure state keeps the type-specific
                qualifier because the type IS known. */}
            {!needsTypePick && (
              <div className="mt-6">
                <PriceBlock
                  systems={displaySystems}
                  additional={displayAdditional}
                  knownType={override === "unsure" ? null : knownType}
                  variant="desktop"
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
