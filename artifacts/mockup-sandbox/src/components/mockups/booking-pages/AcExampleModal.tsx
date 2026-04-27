import { useEffect, Fragment } from "react";
import { ArrowRight, X } from "lucide-react";

const BRAND = "#ED017F";

export type ExampleVariant = "split-indoor" | "ducted-filter";

type Section = {
  label?: string;
  imageSrc: string;
  imageAlt: string;
  description?: string;
  guideBelow?: boolean;
  guideLabel?: string;
};

type Variant = {
  title: string;
  sections: Section[];
  unitSingular: string;
  unitPlural: string;
  footnote?: string;
};

const ASSET_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const VARIANTS: Record<ExampleVariant, Variant> = {
  "split-indoor": {
    title: "What counts as an extra indoor unit?",
    sections: [
      {
        imageSrc: `${ASSET_BASE}/examples/split-indoor-unit.jpg`,
        imageAlt:
          "A white wall-mounted split AC indoor unit installed high on a living-room wall.",
        guideBelow: true,
      },
    ],
    unitSingular: "indoor unit",
    unitPlural: "indoor units",
    footnote: "Each wall-mounted unit counts as one.",
  },
  "ducted-filter": {
    title: "What counts as an extra filter?",
    sections: [
      {
        label: "Counts as an extra filter",
        imageSrc: `${ASSET_BASE}/examples/ducted-return-grille.jpg`,
        imageAlt: "A large white ceiling return-air grille, typical of a ducted AC system.",
        description: "The filter sits behind this large return-air grille.",
        guideBelow: true,
        guideLabel: "For return air grilles only",
      },
      {
        label: "Do NOT count these",
        imageSrc: `${ASSET_BASE}/examples/small-ceiling-vents.png`,
        imageAlt: "Two small ceiling supply-air vents in a white plaster ceiling.",
        description:
          "These are checked as part of every service — you do not need to add anything for these.",
      },
    ],
    unitSingular: "filter",
    unitPlural: "filters",
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

  let guideRendered = false;

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
        className="relative z-10 flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
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

        <div className="flex-1 overflow-y-auto px-5 pt-4 pb-5">
          {v.sections.map((section, i) => {
            const isPostGuideSection = guideRendered;
            const sectionWrapperCls = isPostGuideSection
              ? "mt-6 border-t border-slate-200 pt-5"
              : i === 0
                ? ""
                : "mt-5";
            const renderGuideHere = section.guideBelow && !guideRendered;
            if (renderGuideHere) guideRendered = true;
            return (
              <Fragment key={i}>
                <div className={sectionWrapperCls} data-testid={`section-${i}`}>
                  {section.label && (
                    <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-slate-500">
                      {section.label}
                    </p>
                  )}
                  <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                    <img
                      src={section.imageSrc}
                      alt={section.imageAlt}
                      className="aspect-[4/3] w-full object-cover"
                      loading="lazy"
                    />
                  </div>
                  {section.description && (
                    <p className="mt-2 text-[13px] text-slate-700 leading-relaxed">
                      {section.description}
                    </p>
                  )}
                  {renderGuideHere && (
                    <div data-testid={`guide-block-${i}`}>
                      <p
                        className="mt-5 text-sm font-medium text-slate-900"
                        data-testid="text-modal-intro"
                      >
                        {intro}
                      </p>
                      <p className="mt-3 text-[12px] font-semibold uppercase tracking-wide text-slate-500">
                        {section.guideLabel ?? "Use this guide:"}
                      </p>
                      <ul className="mt-2 space-y-1.5" data-testid="list-modal-guide">
                        {guide.map((row, idx) => (
                          <li
                            key={idx}
                            className="flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-[13px]"
                          >
                            <span className="font-medium text-slate-900 min-w-0 flex-1">
                              {row.left}
                            </span>
                            <ArrowRight
                              className="h-3.5 w-3.5 shrink-0"
                              style={{ color: BRAND }}
                              aria-hidden="true"
                            />
                            <span className="text-slate-700 text-right min-w-0 flex-1">
                              {row.right}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </Fragment>
            );
          })}

          {v.footnote && <p className="mt-4 text-[12px] text-slate-500">{v.footnote}</p>}

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
