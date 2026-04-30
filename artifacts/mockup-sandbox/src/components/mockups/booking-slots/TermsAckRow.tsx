/**
 * Reusable "ack with summary + View terms link" panel used on the
 * Schedule step (Step 6). Shared treatment so the cancellation ack
 * (Task #121) and any future ack on this step (e.g. Task #124's
 * access-arrangement ack for unattended methods) read as one
 * "before you confirm" group instead of three different patterns.
 *
 * Visual: tickbox + summary label, with a discreet "View terms" link
 * to the right that opens a focused modal with the full policy.
 * Selected (ticked) state mirrors the picker's selection green
 * (`#5FBB97`) so the customer can tell at a glance which acks they've
 * already cleared.
 */

const BRAND = "#ED017F";
const SELECTED_GREEN = "#5FBB97";

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
  /** "compact" matches the existing be-there ack on Mobile / MobileLite;
   *  "regular" gives slightly larger type and padding for Desktop. */
  size?: "compact" | "regular";
}) {
  const isCompact = size === "compact";
  const containerStyle = checked
    ? {
        borderColor: "rgba(95,187,151,0.45)",
        backgroundColor: "rgba(95,187,151,0.08)",
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
          style={{ accentColor: checked ? SELECTED_GREEN : BRAND }}
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
