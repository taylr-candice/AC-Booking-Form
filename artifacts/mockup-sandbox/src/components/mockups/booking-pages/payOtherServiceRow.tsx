import {
  type OtherServiceRule,
  otherServicePrice,
  otherServicePriceBreakdown,
} from "../../../state/bookingDerived";

const BRAND = "#ED017F";

/**
 * Shared row used by both PayDesktop and PayMobile to render a single
 * "other" service line on the Step-5 review summary. Keeps the two
 * variants visually consistent so a customer who switches between
 * desktop and mobile sees the same per-line breakdown.
 *
 * Behaviour pinned by `Pay.otherServices.test.tsx` and
 * `booking-other-service-multi-add.spec.ts`:
 *   - `data-testid="row-pay-other-{id}"`
 *   - qty = 1 → bare service name, base $priceAud, NO `×` character
 *     anywhere in the row (the qty=1 test forbids it).
 *   - qty > 1 → leading "{qty} × {name}" header AND a qty-aware total
 *     of `priceAud × qty + addonPriceAud × (qty − 1)` somewhere in
 *     the row.
 *
 * Visual treatment for qty > 1 surfaces the base + add-on math the
 * Step-2 price card already shows, so the receipt and price card read
 * the same way:
 *   header  → "{qty} × {name}"   (chip prefix + service name)
 *   sub-line → "$base × qty + $addon × (qty − 1) {addonLabel}"
 *   right    → combined total in BRAND, bold, tabular-nums
 */
export function PayOtherServiceRow({
  rule,
  qty,
  variant,
}: {
  rule: OtherServiceRule;
  qty: number;
  variant: "desktop" | "mobile";
}) {
  const total = otherServicePrice(rule, qty);
  const isMulti = qty > 1;
  const isMobile = variant === "mobile";

  const containerClass = isMobile
    ? "flex items-start justify-between gap-3 text-sm"
    : "flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0";

  if (!isMulti) {
    return (
      <div
        className={containerClass}
        data-testid={`row-pay-other-${rule.id}`}
      >
        <span
          className={
            isMobile
              ? "min-w-0 text-slate-700"
              : "min-w-0 text-sm font-medium text-slate-900"
          }
        >
          {rule.name}
        </span>
        <span
          className={
            isMobile
              ? "tabular-nums font-medium text-slate-900 shrink-0"
              : "tabular-nums text-sm font-medium text-slate-900 shrink-0"
          }
        >
          ${total}
        </span>
      </div>
    );
  }

  // qty > 1 — distinct multi-line treatment with chip + breakdown.
  // Task #211: qty ≥ 3 expands the inline "$base × qty + $addon × N−1"
  // sub-line into two indented sub-rows, each with its own subtotal,
  // so the receipt itemises the same way as the Step-2 price card.
  const addonCount = qty - 1;
  const showItemizedBreakdown = qty >= 3;
  const breakdown = showItemizedBreakdown
    ? otherServicePriceBreakdown(rule, qty)
    : null;
  return (
    <div className={containerClass} data-testid={`row-pay-other-${rule.id}`}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex shrink-0 items-center rounded-md bg-pink-50 px-1.5 py-0.5 text-[11px] font-bold tabular-nums leading-none"
            style={{ color: BRAND }}
            aria-label={`Quantity ${qty}`}
          >
            {qty} ×
          </span>
          {/* Space text node so textContent reads "{qty} × {name}" with
              a single space between the multiply sign and the service
              name (the e2e + unit specs grep on the literal string). */}
          {" "}
          <span
            className={
              isMobile
                ? "min-w-0 text-slate-700"
                : "min-w-0 text-sm font-medium text-slate-900"
            }
          >
            {rule.name}
          </span>
        </div>
        {showItemizedBreakdown && breakdown ? (
          <div className="mt-1 ml-3 space-y-1 border-l border-slate-200 pl-3 text-[13px]">
            <div
              className="flex items-start justify-between gap-3"
              data-testid={`row-pay-other-${rule.id}-base`}
            >
              <span className="text-slate-600">
                <span className="tabular-nums">{breakdown.baseQty}</span>
                {" × "}
                <span className="tabular-nums">${breakdown.baseUnitAud}</span>{" "}
                <span className="text-slate-500">base price</span>
              </span>
              <span className="tabular-nums font-medium text-slate-900 shrink-0">
                ${breakdown.baseSubtotalAud}
              </span>
            </div>
            <div
              className="flex items-start justify-between gap-3"
              data-testid={`row-pay-other-${rule.id}-addon`}
            >
              <span className="text-slate-600">
                <span className="tabular-nums">{breakdown.addonQty}</span>
                {" × "}
                <span className="tabular-nums">${breakdown.addonUnitAud}</span>{" "}
                <span className="text-slate-500">{rule.addonLabel}</span>
              </span>
              <span className="tabular-nums font-medium text-slate-900 shrink-0">
                ${breakdown.addonSubtotalAud}
              </span>
            </div>
          </div>
        ) : (
          <div
            className={
              isMobile
                ? "mt-1 text-[11.5px] leading-snug text-slate-500"
                : "mt-1 text-[11.5px] leading-snug text-slate-500"
            }
          >
            <span className="tabular-nums">${rule.priceAud}</span>
            {" base × "}
            <span className="tabular-nums">{qty}</span>
            {" + "}
            <span className="tabular-nums">${rule.addonPriceAud}</span>
            {" × "}
            <span className="tabular-nums">{addonCount}</span>{" "}
            {rule.addonLabel}
          </div>
        )}
      </div>
      <div className="text-right shrink-0">
        <div
          className="text-sm font-bold tabular-nums"
          style={{ color: BRAND }}
        >
          ${total}
        </div>
      </div>
    </div>
  );
}
