/**
 * Shared "Template used" filter dropdown — rendered identically by
 * both the Bookings list toolbar and the Awaiting-coordination queue
 * toolbar so the two surfaces can never drift on render gate,
 * synthetic-option layout, optgroup ordering, or encode/decode
 * wiring (Task #220).
 *
 * Before this extraction the two toolbars hand-rolled the same
 * `<select>` (same render gate `length > 0 || activeFilterIsMissing`,
 * same "(no longer in catalog)" synthetic option under a "No longer
 * in catalog" optgroup, same call-then-email optgroup ordering, same
 * encode/decode wiring) and only diverged on the testid prefix. Each
 * future tweak (e.g. a "Default" pill on options, search-in-dropdown,
 * sticky favourites) had to land in two places, and a copy-paste
 * regression silently let the two surfaces lie about which template
 * was filtering. Funnelling both through this component means the
 * picker behaves identically across the admin shell.
 *
 * The render gate is intentionally part of this component (not a
 * caller-side guard) so callers can mount it unconditionally and the
 * "show even when both catalogs are empty as long as a stale filter
 * is active" rule is enforced in one place — otherwise the only
 * "switch templates" affordance would disappear from the toolbar
 * exactly when the lens is most confusing.
 */

import {
  decodeTemplateFilter,
  encodeTemplateFilter,
  TEMPLATE_FILTER_ALL_VALUE,
  type BookingsTemplateFilter,
} from "./bookingsTemplateFilter";

/**
 * Minimal shape this component needs from a Call/Email template — an
 * `id` for a stable React key and a `name` for the option label /
 * encoded filter value. Both views pass full `CallTemplate` /
 * `EmailTemplate` records (which satisfy this contract), but
 * narrowing the prop surface here keeps the component portable: a
 * future surface that just has names (e.g. snapshot-only catalogs in
 * a read-only audit view) can still mount the picker.
 */
type TemplateOption = {
  readonly id: string;
  readonly name: string;
};

export function TemplateFilterSelect({
  value,
  onChange,
  callTemplates,
  emailTemplates,
  activeFilterIsMissing,
  testIdPrefix,
}: {
  /** Active filter — `null` when the toolbar is at its reset state. */
  value: BookingsTemplateFilter;
  /** Setter for the filter. Receives the decoded shape so the parent
   *  doesn't have to know the synthetic `<select>` value encoding. */
  onChange: (next: BookingsTemplateFilter) => void;
  /** Call template catalog driving the "Call templates" optgroup. */
  callTemplates: ReadonlyArray<TemplateOption>;
  /** Email template catalog driving the "Email templates" optgroup. */
  emailTemplates: ReadonlyArray<TemplateOption>;
  /** Whether the active filter's snapshot name is no longer present
   *  in its channel's catalog (renamed / removed). Resolved by the
   *  caller via the shared `templateFilterIsMissingFromCatalogs`
   *  helper so the synthetic option here, the chip hint below the
   *  toolbar, and the chip's own missing badge all read from the
   *  same predicate. */
  activeFilterIsMissing: boolean;
  /** Per-view testid prefix so each toolbar gets unique selectors
   *  while sharing one picker. The select itself receives this
   *  prefix verbatim (e.g. `bookings-filter-template`); the
   *  synthetic missing option gets `${prefix}-missing-option`. */
  testIdPrefix: string;
}) {
  // Render gate: hide the dropdown entirely when there's nothing to
  // pick AND no stale filter to surface. Folded into the component
  // (not the caller) so the "...or `activeFilterIsMissing`" rule
  // can't silently get dropped on either toolbar — the picker has
  // to stay mounted when a stale lens is active so the admin still
  // has a "switch / clear" affordance.
  if (
    callTemplates.length === 0 &&
    emailTemplates.length === 0 &&
    !activeFilterIsMissing
  ) {
    return null;
  }

  return (
    <select
      value={encodeTemplateFilter(value)}
      onChange={(e) => onChange(decodeTemplateFilter(e.target.value))}
      aria-label="Filter by template used"
      data-testid={testIdPrefix}
      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-900 focus:border-slate-400 focus:outline-none"
    >
      <option value={TEMPLATE_FILTER_ALL_VALUE}>All templates</option>
      {/* Synthetic option for an active filter whose snapshot name no
          longer maps to any catalog row in its channel. Without this,
          the controlled `<select>` silently displays the wrong row
          (browsers render the first option when the bound value
          matches no option) — the dropdown would lie about what's
          actively filtering the table. The "(no longer in catalog)"
          suffix lets an ops lead notice the lens has gone stale at a
          glance. The chip below each toolbar carries the same signal
          in long-form; AdminApp also auto-clears the filter when the
          rename / remove happens in-app (Task #162), so this is the
          defensive fallback for call-sites that don't auto-clear
          (e.g. tests or external state pivots). */}
      {activeFilterIsMissing && (
        <optgroup label="No longer in catalog">
          <option
            key="missing-active-filter"
            value={encodeTemplateFilter(value)}
            data-testid={`${testIdPrefix}-missing-option`}
          >
            {value!.name} (no longer in catalog)
          </option>
        </optgroup>
      )}
      {/* Call templates rendered before Email templates on both
          surfaces so an admin scanning the picker sees the same
          ordering regardless of which toolbar they opened it from. */}
      {callTemplates.length > 0 && (
        <optgroup label="Call templates">
          {callTemplates.map((t) => (
            <option
              key={`call-${t.id}`}
              value={encodeTemplateFilter({ kind: "call", name: t.name })}
            >
              {t.name}
            </option>
          ))}
        </optgroup>
      )}
      {emailTemplates.length > 0 && (
        <optgroup label="Email templates">
          {emailTemplates.map((t) => (
            <option
              key={`email-${t.id}`}
              value={encodeTemplateFilter({ kind: "email", name: t.name })}
            >
              {t.name}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}
