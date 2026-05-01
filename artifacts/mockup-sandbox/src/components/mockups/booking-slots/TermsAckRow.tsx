/**
 * Reusable "ack with summary + View terms link" panel used on the
 * Schedule step. Tickbox + summary label, with a "View terms" link
 * that opens a focused modal. Uses the shared `PinkAckCheckbox` so the
 * styling, brand-pink fill on tick, and ERROR_PURPLE invalid state
 * match the AC step.
 */

import { PinkAckCheckbox } from "../booking-pages/PinkAckCheckbox";
import { BRAND } from "../booking-pages/acStepShared";

export function TermsAckRow({
  checked,
  onChange,
  label,
  onViewTerms,
  ackTestId,
  rowTestId,
  viewTermsTestId,
  invalid = false,
  errorText,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  onViewTerms: () => void;
  ackTestId: string;
  rowTestId: string;
  viewTermsTestId: string;
  invalid?: boolean;
  errorText?: string;
  /**
   * Kept for backwards compatibility with prior callers; unused now
   * that the ack uses the shared PinkAckCheckbox styling.
   */
  size?: "compact" | "regular";
}) {
  return (
    <div data-testid={rowTestId}>
      <PinkAckCheckbox
        checked={checked}
        onChange={onChange}
        invalid={invalid}
        errorText={errorText}
        testId={ackTestId}
        label={label}
        helper={
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onViewTerms();
            }}
            data-testid={viewTermsTestId}
            className="font-medium underline underline-offset-2 hover:opacity-80"
            style={{ color: BRAND }}
          >
            View terms
          </button>
        }
      />
    </div>
  );
}
