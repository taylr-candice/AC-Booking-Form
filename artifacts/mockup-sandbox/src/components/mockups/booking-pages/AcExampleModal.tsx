import { useEffect } from "react";
import { X } from "lucide-react";

const BRAND = "#ED017F";

export type ExampleVariant = "split-indoor" | "ducted-filter";

type Section = {
  label?: string;
  imageSrc: string;
  imageAlt: string;
  paragraphs: string[];
};

type Variant = {
  title: string;
  sections: Section[];
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
        paragraphs: [
          "Each wall-mounted indoor unit head counts as one indoor unit.",
          "Your service already includes the indoor unit heads shown in the 'Includes' section.",
          "Only add extras if the apartment has more indoor unit heads than shown there.",
        ],
      },
    ],
  },
  "ducted-filter": {
    title: "What counts as an extra filter?",
    sections: [
      {
        label: "Counts as an extra filter",
        imageSrc: `${ASSET_BASE}/examples/ducted-return-grille.jpg`,
        imageAlt:
          "A large white ceiling return-air grille, typical of a ducted AC system.",
        paragraphs: [
          "Filters sit behind large return-air grilles.",
          "Your service already includes the filter cleans shown in the 'Includes' section.",
          "Only add extras if the apartment has more large return-air grilles than shown there.",
        ],
      },
      {
        label: "Do NOT count these",
        imageSrc: `${ASSET_BASE}/examples/small-ceiling-vents.png`,
        imageAlt: "Two small ceiling supply-air vents in a white plaster ceiling.",
        paragraphs: [
          "Do not count small air vents or outlets on walls or ceilings.",
          "These may be assessed as part of the visit, but no extra filter charge is required for them.",
        ],
      },
    ],
  },
};

export function AcExampleModal({
  variant,
  onClose,
}: {
  variant: ExampleVariant;
  onClose: () => void;
}) {
  const v = VARIANTS[variant];

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
          {v.sections.map((section, i) => (
            <div
              key={i}
              className={i === 0 ? "" : "mt-6 border-t border-slate-200 pt-5"}
              data-testid={`section-${i}`}
            >
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
              <div className="mt-3 space-y-2 text-[13px] text-slate-700 leading-relaxed">
                {section.paragraphs.map((p, idx) => (
                  <p key={idx}>{p}</p>
                ))}
              </div>
            </div>
          ))}

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
