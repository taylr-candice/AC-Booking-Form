import { AlertCircle, Check } from "lucide-react";
import type { ReactNode } from "react";

import { BRAND, ERROR_PURPLE } from "./acStepShared";

export function PinkAckCheckbox({
  checked,
  onChange,
  invalid = false,
  errorText,
  label,
  helper,
  testId,
  errorTestId,
  ariaDescribedBy,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  invalid?: boolean;
  errorText?: string;
  label: ReactNode;
  helper?: ReactNode;
  testId: string;
  errorTestId?: string;
  ariaDescribedBy?: string;
}) {
  const showError = invalid && !checked;
  const errorId = errorTestId ?? `${testId}-error`;
  const describedBy = showError
    ? errorId
    : ariaDescribedBy;

  return (
    <div
      className={`rounded-xl border p-4 transition ${
        showError ? "" : "border-slate-200 bg-white"
      }`}
      style={
        showError
          ? {
              borderColor: ERROR_PURPLE,
              backgroundColor: "rgba(151,71,255,0.04)",
            }
          : undefined
      }
    >
      <label className="flex items-start gap-3 cursor-pointer">
        <span className="relative mt-0.5">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
            data-testid={testId}
            aria-invalid={showError}
            aria-describedby={describedBy}
            className="sr-only"
          />
          <span
            className="grid h-5 w-5 place-items-center rounded-md border-2 transition"
            style={
              checked
                ? { backgroundColor: BRAND, borderColor: BRAND }
                : showError
                ? { borderColor: ERROR_PURPLE, backgroundColor: "#fff" }
                : { borderColor: "#cbd5e1", backgroundColor: "#fff" }
            }
          >
            {checked && (
              <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
            )}
          </span>
        </span>
        <div className="flex-1">
          <div className="text-[12px] text-slate-700 leading-snug">{label}</div>
          {helper && (
            <div className="mt-2 text-[11px] text-slate-500 leading-relaxed">
              {helper}
            </div>
          )}
        </div>
      </label>
      {showError && errorText && (
        <div
          id={errorId}
          role="alert"
          className="mt-3 flex items-start gap-2 text-[11px] font-medium"
          style={{ color: ERROR_PURPLE }}
          data-testid={errorId}
        >
          <AlertCircle className="h-4 w-4 mt-px shrink-0" />
          <span>{errorText}</span>
        </div>
      )}
    </div>
  );
}
