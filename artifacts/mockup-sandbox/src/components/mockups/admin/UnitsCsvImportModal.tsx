/**
 * Bulk import/update modal for the admin Units view.
 *
 * The component is the dumb shell: it owns the upload UX (file picker,
 * paste textarea), holds the parsed preview in local state, and calls
 * the parent back with the raw CSV text on Apply. All parsing,
 * validation, and apply logic lives in `state/unitsCsv.ts` so it can be
 * unit-tested without React.
 */

import { useMemo, useRef, useState } from "react";
import { AlertCircle, Check, FileUp, X } from "lucide-react";

import type { AdminAgent, AdminUnit } from "@/state/adminMockData";
import {
  applyUnitsImport,
  parseUnitsImport,
  type UnitImportRow,
  type UnitsImportPreview,
} from "@/state/unitsCsv";

const BRAND = "#ED017F";

type Props = {
  units: AdminUnit[];
  agents: AdminAgent[];
  onApply: (next: AdminUnit[]) => void;
  onClose: () => void;
};

export function UnitsCsvImportModal({ units, agents, onApply, onClose }: Props) {
  const [csvText, setCsvText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const preview: UnitsImportPreview | null = useMemo(() => {
    if (!csvText.trim()) return null;
    return parseUnitsImport(csvText, units, agents);
  }, [csvText, units, agents]);

  const canApply =
    preview !== null &&
    !preview.fatal &&
    preview.counts.error === 0 &&
    preview.counts.new + preview.counts.update > 0;

  function handleFile(file: File | null) {
    if (!file) return;
    setFileName(file.name);
    file
      .text()
      .then((text) => setCsvText(text))
      .catch(() => {
        setFileName(null);
        setCsvText("");
      });
  }

  function clearInput() {
    setCsvText("");
    setFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleApply() {
    if (!preview || !canApply) return;
    const next = applyUnitsImport(units, preview, () => `u${Date.now()}`);
    onApply(next);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      data-testid="modal-units-import"
    >
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-500">
              Bulk update
            </div>
            <div className="text-[16px] font-semibold text-slate-900">
              Import units from CSV
            </div>
            <div className="mt-1 text-[12px] text-slate-500">
              Existing rows are updated by id (or by exact address if id is
              blank). Rows missing from your file are not deleted.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-testid="button-units-import-close"
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Upload controls */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <label
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
                data-testid="label-units-import-file"
              >
                <FileUp className="h-4 w-4" />
                Choose .csv file
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  data-testid="input-units-import-file"
                  onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                />
              </label>
              {fileName && (
                <div className="text-[12px] text-slate-600">
                  Loaded <span className="font-medium">{fileName}</span>
                </div>
              )}
              {csvText && (
                <button
                  type="button"
                  onClick={clearInput}
                  data-testid="button-units-import-clear"
                  className="text-[12px] font-semibold text-slate-500 underline hover:text-slate-700"
                >
                  Clear
                </button>
              )}
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-500">
                Or paste CSV text
              </label>
              <textarea
                value={csvText}
                onChange={(e) => {
                  setCsvText(e.target.value);
                  if (fileName) setFileName(null);
                }}
                placeholder="id,addressLine1,addressLine2,acType,systems,additional,agentId&#10;,10 / 25 Example Street,Lot 10 · Suburb NSW 2000,split,2,0,"
                rows={6}
                data-testid="textarea-units-import-csv"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-[12px] focus:border-slate-400 focus:outline-none"
              />
            </div>
          </div>

          {/* Preview */}
          {preview && (
            <div
              className="mt-5 flex flex-col gap-3"
              data-testid="block-units-import-preview"
            >
              {preview.fatal ? (
                <div
                  className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800"
                  data-testid="text-units-import-fatal"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{preview.fatal}</span>
                </div>
              ) : (
                <>
                  <CountsBar
                    counts={preview.counts}
                    canApply={canApply}
                  />
                  <PreviewTable rows={preview.rows} />
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            data-testid="button-units-import-cancel"
            className="rounded-lg px-4 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={!canApply}
            data-testid="button-units-import-apply"
            className="rounded-lg px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: BRAND }}
          >
            {preview && canApply
              ? `Apply ${preview.counts.new + preview.counts.update} change${
                  preview.counts.new + preview.counts.update === 1 ? "" : "s"
                }`
              : "Apply"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Subcomponents ─────────────────────────────────────────────────────────

function CountsBar({
  counts,
  canApply,
}: {
  counts: UnitsImportPreview["counts"];
  canApply: boolean;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] font-medium text-slate-700"
      data-testid="text-units-import-counts"
    >
      <CountChip label="New" count={counts.new} tone="new" />
      <CountChip label="Updates" count={counts.update} tone="update" />
      <CountChip label="Unchanged" count={counts.unchanged} tone="unchanged" />
      <CountChip label="Errors" count={counts.error} tone="error" />
      <span className="ml-auto text-[11px] text-slate-500">
        {canApply
          ? "Ready to apply."
          : counts.error > 0
            ? "Fix the error rows before applying."
            : counts.new + counts.update === 0
              ? "Nothing to change."
              : "Ready to apply."}
      </span>
    </div>
  );
}

function CountChip({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: "new" | "update" | "unchanged" | "error";
}) {
  const palette: Record<typeof tone, { bg: string; fg: string }> = {
    new: { bg: "bg-pink-50", fg: "text-pink-700" },
    update: { bg: "bg-amber-50", fg: "text-amber-700" },
    unchanged: { bg: "bg-slate-100", fg: "text-slate-600" },
    error: { bg: "bg-red-50", fg: "text-red-700" },
  };
  const p = palette[tone];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 ${p.bg} ${p.fg}`}
    >
      <span className="font-semibold">{count}</span>
      <span>{label}</span>
    </span>
  );
}

function StatusChip({ status }: { status: UnitImportRow["status"] }) {
  const map: Record<UnitImportRow["status"], { label: string; cls: string }> = {
    new: { label: "New", cls: "bg-pink-50 text-pink-700" },
    update: { label: "Update", cls: "bg-amber-50 text-amber-700" },
    unchanged: { label: "Unchanged", cls: "bg-slate-100 text-slate-600" },
    error: { label: "Error", cls: "bg-red-50 text-red-700" },
  };
  const m = map[status];
  return (
    <span
      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider ${m.cls}`}
    >
      {m.label}
    </span>
  );
}

function PreviewTable({ rows }: { rows: UnitImportRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] text-slate-500">
        No data rows after the header.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <table className="w-full text-left text-[12px]">
        <thead className="border-b border-slate-200 bg-slate-50 text-[10.5px] uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-3 py-2 font-semibold w-10">Row</th>
            <th className="px-3 py-2 font-semibold w-24">Status</th>
            <th className="px-3 py-2 font-semibold">Address</th>
            <th className="px-3 py-2 font-semibold">AC config</th>
            <th className="px-3 py-2 font-semibold">Agent</th>
            <th className="px-3 py-2 font-semibold">Notes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.rawRowNumber}
              className="border-b border-slate-100 align-top last:border-b-0"
              data-testid={`row-units-import-${row.rawRowNumber}`}
            >
              <td className="px-3 py-2 text-slate-500">{row.rawRowNumber}</td>
              <td className="px-3 py-2">
                <StatusChip status={row.status} />
              </td>
              <td className="px-3 py-2">
                <div className="font-medium text-slate-900">
                  {row.raw.addressLine1 || (
                    <span className="text-slate-400">—</span>
                  )}
                </div>
                <div className="text-[11px] text-slate-500">
                  {row.raw.addressLine2}
                </div>
              </td>
              <td className="px-3 py-2 text-slate-700">
                <div className="capitalize">
                  {row.raw.acType || "unknown"}
                </div>
                <div className="text-[11px] text-slate-500">
                  {row.raw.systems || "0"} systems · {row.raw.additional || "0"}{" "}
                  extras
                </div>
              </td>
              <td className="px-3 py-2 text-slate-700">
                {row.raw.agentId || (
                  <span className="text-slate-400">—</span>
                )}
              </td>
              <td className="px-3 py-2">
                {row.status === "error" ? (
                  <ul className="space-y-0.5 text-[11.5px] text-red-700">
                    {row.errors.map((e, idx) => (
                      <li key={idx} className="flex items-start gap-1">
                        <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                        <span>{e}</span>
                      </li>
                    ))}
                  </ul>
                ) : row.status === "update" && row.diff && row.diff.length > 0 ? (
                  <ul className="space-y-0.5 text-[11.5px] text-slate-700">
                    {row.diff.map((d) => (
                      <li key={d.field}>
                        <span className="font-medium text-slate-600">
                          {d.field}:
                        </span>{" "}
                        <span className="text-slate-500 line-through">
                          {d.before || '""'}
                        </span>{" "}
                        →{" "}
                        <span className="font-semibold text-amber-700">
                          {d.after || '""'}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : row.status === "unchanged" ? (
                  <div className="inline-flex items-center gap-1 text-[11.5px] text-slate-500">
                    <Check className="h-3 w-3" />
                    Already matches the record on file
                  </div>
                ) : row.status === "new" ? (
                  <div className="text-[11.5px] text-slate-500">
                    Will be added as a new unit
                  </div>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
