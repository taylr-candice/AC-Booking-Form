/**
 * Tiny presentational atoms reused across the admin screens (Card,
 * Field, FormField). These are dumb components — no behavior — so
 * they live together in one file rather than each in their own.
 */

import type { ReactNode } from "react";

export function Card({
  title,
  subtitle,
  children,
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      {(title || subtitle) && (
        <div className="mb-3">
          {title && (
            <div className="text-[14px] font-semibold text-slate-900">{title}</div>
          )}
          {subtitle && <div className="text-[11px] text-slate-500">{subtitle}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

export function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-[13px] font-medium text-slate-900">{value}</div>
    </div>
  );
}

export function FormField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-500">
        {label}
      </label>
      {children}
    </div>
  );
}
