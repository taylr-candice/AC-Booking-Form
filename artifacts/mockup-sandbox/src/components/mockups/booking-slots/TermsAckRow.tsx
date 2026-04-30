/**
 * Reusable "ack with summary + View terms link" panel used on the
 * Schedule step. Tickbox + summary label, with a "View terms" link
 * that opens a focused modal. The whole component lives on the
 * brand pink (#ED017F) — ticked rows shift to a soft pink wash and
 * pink border, the checkbox accent is brand pink in both states,
 * and the "View terms" link is brand pink.
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
  const containerStyle = checked
    ? {
        borderColor: "rgba(237,1,127,0.40)",
        backgroundColor: "rgba(237,1,127,0.06)",
      }
    : undefined;

  return (
    <div
      className={`flex items-start justify-between gap-3 rounded-lg border ${
        checked ? "" : "border-slate-200 bg-slate-50"
      } ${isCompact ? "px-3 py-2" : "px-3 py-2.5"}`}
      style={containerStyle}
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
