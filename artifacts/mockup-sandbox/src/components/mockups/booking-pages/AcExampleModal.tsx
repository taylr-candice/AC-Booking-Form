import { useEffect } from "react";
import { ArrowRight, X } from "lucide-react";

const BRAND = "#ED017F";

export type ExampleVariant = "split-indoor" | "ducted-filter";

type GuideRow = { left: string; right: string };

type Content = {
  title: string;
  imageSrc: string;
  imageAlt: string;
  intro: string;
  guideTitle: string;
  guide: GuideRow[];
  footnote: string;
};

const ASSET_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const CONTENT: Record<ExampleVariant, Content> = {
  "split-indoor": {
    title: "What counts as an extra indoor unit?",
    imageSrc: `${ASSET_BASE}/examples/split-indoor-unit.jpg`,
    imageAlt: "A white wall-mounted split AC indoor unit installed high on a living-room wall.",
    intro: "Your first indoor unit is already included.",
    guideTitle: "Use this guide:",
    guide: [
      { left: "1 indoor unit", right: "add 0 extra units" },
      { left: "2 indoor units", right: "add 1 extra unit" },
      { left: "3 indoor units", right: "add 2 extra units" },
    ],
    footnote: "Each wall-mounted unit counts as one.",
  },
  "ducted-filter": {
    title: "What counts as an extra filter?",
    imageSrc: `${ASSET_BASE}/examples/ducted-return-grille.jpg`,
    imageAlt: "A large white ceiling return-air grille, typical of a ducted AC system.",
    intro: "Your first filter is already included.",
    guideTitle: "Use this guide:",
    guide: [
      { left: "1 return air grille", right: "add 0 extra filters" },
      { left: "2 return air grilles", right: "add 1 extra filter" },
      { left: "3 return air grilles", right: "add 2 extra filters" },
    ],
    footnote: "Do not count small vents.",
  },
};

export function AcExampleModal({
  variant,
  onClose,
}: {
  variant: ExampleVariant;
  onClose: () => void;
}) {
  const content = CONTENT[variant];

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
            {content.title}
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
              src={content.imageSrc}
              alt={content.imageAlt}
              className="aspect-[4/3] w-full object-cover"
              loading="lazy"
            />
          </div>

          <p className="mt-3 text-sm font-medium text-slate-900">{content.intro}</p>

          <p className="mt-3 text-[12px] font-semibold uppercase tracking-wide text-slate-500">
            {content.guideTitle}
          </p>
          <ul className="mt-2 space-y-1.5">
            {content.guide.map((row, i) => (
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

          <p className="mt-4 text-[12px] text-slate-500">{content.footnote}</p>

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
