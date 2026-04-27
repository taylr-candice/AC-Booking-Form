import { useEffect } from "react";
import { Check, X } from "lucide-react";

const BRAND = "#ED017F";

export type ExampleVariant = "split-indoor" | "ducted-filter";

type Bullet = { kind: "do" | "dont"; text: string };

type Content = {
  title: string;
  imageSrc: string;
  imageAlt: string;
  caption: string;
  bullets: Bullet[];
};

const ASSET_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const CONTENT: Record<ExampleVariant, Content> = {
  "split-indoor": {
    title: "What counts as an indoor unit",
    imageSrc: `${ASSET_BASE}/examples/split-indoor-unit.jpg`,
    imageAlt: "A white wall-mounted split AC indoor unit installed high on a living-room wall.",
    caption:
      "Indoor units are wall-mounted boxes that blow air directly into the room. Each one usually has its own remote.",
    bullets: [
      { kind: "do", text: "Count each wall-mounted indoor unit in the apartment" },
      { kind: "do", text: "The first indoor unit is included with your system — count only extras" },
      { kind: "dont", text: "Do not count ceiling vents or ducted air outlets" },
    ],
  },
  "ducted-filter": {
    title: "What counts as a filter",
    imageSrc: `${ASSET_BASE}/examples/ducted-return-grille.jpg`,
    imageAlt: "A large white ceiling return-air grille, typical of a ducted AC system.",
    caption:
      "Filters sit behind the large return-air grilles in the ceiling or hallway — not behind the small ceiling vents that blow air out.",
    bullets: [
      { kind: "do", text: "Count each large return-air grille (the filter is behind it)" },
      { kind: "do", text: "The first filter is included with your system — count only extras" },
      { kind: "dont", text: "Do not count small ceiling vents or air outlets" },
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
          <p className="mt-3 text-[12px] text-slate-500 leading-relaxed">{content.caption}</p>

          <ul className="mt-4 space-y-2">
            {content.bullets.map((b, i) => (
              <li key={i} className="flex items-start gap-2.5 text-[13px] text-slate-700">
                {b.kind === "do" ? (
                  <span
                    className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-white"
                    style={{ backgroundColor: BRAND }}
                    aria-hidden="true"
                  >
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                ) : (
                  <span
                    className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-slate-200 text-slate-500"
                    aria-hidden="true"
                  >
                    <X className="h-3 w-3" strokeWidth={3} />
                  </span>
                )}
                <span className="leading-snug">{b.text}</span>
              </li>
            ))}
          </ul>

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
