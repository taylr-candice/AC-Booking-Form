import { useEffect } from "react";
import { ArrowRight, X } from "lucide-react";

const BRAND = "#ED017F";

export type ExampleVariant = "split-indoor" | "ducted-filter";

type Variant = {
  title: string;
  imageSrc: string;
  imageAlt: string;
  unitSingular: string;
  unitPlural: string;
  footnote: string;
};

const ASSET_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const VARIANTS: Record<ExampleVariant, Variant> = {
  "split-indoor": {
    title: "What counts as an extra indoor unit?",
    imageSrc: `${ASSET_BASE}/examples/split-indoor-unit.jpg`,
    imageAlt: "A white wall-mounted split AC indoor unit installed high on a living-room wall.",
    unitSingular: "indoor unit",
    unitPlural: "indoor units",
    footnote: "Each wall-mounted unit counts as one.",
  },
  "ducted-filter": {
    title: "What counts as an extra filter?",
    imageSrc: `${ASSET_BASE}/examples/ducted-return-grille.jpg`,
    imageAlt: "A large white ceiling return-air grille, typical of a ducted AC system.",
    unitSingular: "filter",
    unitPlural: "filters",
    footnote: "Do not count small vents.",
  },
};

function noun(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

export function AcExampleModal({
  variant,
  systems,
  onClose,
}: {
  variant: ExampleVariant;
  systems: number;
  onClose: () => void;
}) {
  const v = VARIANTS[variant];
  const intro = `You already have ${systems} ${noun(systems, v.unitSingular, v.unitPlural)} included.`;
  const guide = [0, 1, 2].map((extra) => {
    const total = systems + extra;
    return {
      left: `${total} ${noun(total, v.unitSingular, v.unitPlural)}`,
      right: `add ${extra}`,
    };
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ac-example-title"
      data-testid="modal-ac-example"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/55 backdrop-blur-sm"
        data-testid="modal-backdrop"
      />
      <div
        className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 pt-4 pb-3">
          <h2 id="ac-example-title" className="text-base font-semibold text-slate-900">
            {v.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            data-testid="button-modal-close"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 pt-4 pb-5">
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
            <img
              src={v.imageSrc}
              alt={v.imageAlt}
              className="aspect-[4/3] w-full object-cover"
              loading="lazy"
            />
          </div>

          <p
            className="mt-3 text-sm font-medium text-slate-900"
            data-testid="text-modal-intro"
          >
            {intro}
          </p>

          <p className="mt-3 text-[12px] font-semibold uppercase tracking-wide text-slate-500">
            Use this guide:
          </p>
          <ul className="mt-2 space-y-1.5" data-testid="list-modal-guide">
            {guide.map((row, i) => (
              <li
                key={i}
                className="flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-[13px]"
              >
                <span className="font-medium text-slate-900 min-w-0 flex-1">{row.left}</span>
                <ArrowRight
                  className="h-3.5 w-3.5 shrink-0"
                  style={{ color: BRAND }}
                  aria-hidden="true"
                />
                <span className="text-slate-700 text-right min-w-0 flex-1">{row.right}</span>
              </li>
            ))}
          </ul>

          <p className="mt-4 text-[12px] text-slate-500">{v.footnote}</p>

          <button
            type="button"
            onClick={onClose}
            data-testid="button-modal-close-footer"
            className="mt-5 w-full rounded-full px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
            style={{ backgroundColor: BRAND }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
