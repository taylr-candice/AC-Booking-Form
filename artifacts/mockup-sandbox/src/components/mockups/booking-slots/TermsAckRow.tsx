/**
 * Reusable "ack with summary + View terms link" panel used on the
 * Schedule step. Tickbox + summary label, with a "View terms" link
 * that opens a focused modal. The container is intentionally neutral
 * (white background, slate hairline border) — only the checkbox accent
 * and the "View terms" link carry the brand pink, so a checked state
 * doesn't flood the page with a coloured wash that competes with the
 * primary CTA.
 */

const BRAND = "#ED017F";

export function TermsAckRow({
  checked,
  onChange,
  label,
  onViewTerms,
  ackTestId,
  rowTestId,
  viewTermsTestId,
  size = "compact",
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  onViewTerms: () => void;
  ackTestId: string;
  rowTestId: string;
  viewTermsTestId: string;
  size?: "compact" | "regular";
}) {
  const isCompact = size === "compact";

  return (
    <div
      className={`flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white ${
        isCompact ? "px-3 py-2" : "px-3 py-2.5"
      }`}
      data-testid={rowTestId}
    >
      <label className="flex flex-1 cursor-pointer items-start gap-2 text-slate-700">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className={`mt-0.5 shrink-0 cursor-pointer rounded border-slate-300 ${
            isCompact ? "h-3.5 w-3.5" : "h-4 w-4"
          }`}
          style={{ accentColor: BRAND }}
          data-testid={ackTestId}
        />
        <span className={isCompact ? "text-[12px]" : "text-sm"}>{label}</span>
      </label>
      <button
        type="button"
        onClick={onViewTerms}
        data-testid={viewTermsTestId}
        className={`shrink-0 font-semibold underline underline-offset-2 hover:opacity-80 ${
          isCompact ? "text-[12px]" : "text-sm"
        }`}
        style={{ color: BRAND }}
      >
        View terms
      </button>
    </div>
  );
}
