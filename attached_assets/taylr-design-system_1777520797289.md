# Taylr Design System Reference

This document is the source-of-truth for the visual & component conventions
used in the **Taylr Admin Simulator** (this repo). It captures the brand
tokens, typography, shadcn configuration, and dependency stack so that any
other Taylr project can adopt the same look-and-feel and stay in sync with
the admin.

> **Audience**: an agent or designer working on any downstream Taylr project
> that should share the admin's design language. Keep this file in that
> project's `docs/` folder and prefer these tokens over anything inherited
> from the shadcn defaults.

---

## 1. Brand

| Token              | Value     | Usage                                                                 |
| ------------------ | --------- | --------------------------------------------------------------------- |
| Taylr Pink         | `#ED017F` | Primary CTAs, active nav, links, focus rings, brand accents           |
| Taylr Pink (hover) | `#d0016e` | Pink text-link hover                                                  |
| Selection Green    | `#5FBB97` | Selected-state cards in opt-in flows (e.g. multi-card pickers)        |
| Slate scale        | Tailwind `slate-50 … slate-900` | Borders, dividers, muted text, neutral chips |

The pink is also expressed through the `--primary` and `--ring` HSL tokens
(see §3) so any shadcn component using `bg-primary` / `ring-ring` is
automatically on-brand.

---

## 2. Typography

| Role     | Family                | Where it's loaded                                  |
| -------- | --------------------- | -------------------------------------------------- |
| UI sans  | **Inter**             | Google Fonts in `client/index.html`                |
| Display  | **Plus Jakarta Sans** | Google Fonts in `client/index.html`                |
| Mono     | **JetBrains Mono** (fallback Geist Mono / system mono) | Google Fonts |

Tailwind aliases (`@theme inline` block in `client/src/index.css`):

```css
--font-sans:    'Inter', ui-sans-serif, system-ui, sans-serif;
--font-display: 'Plus Jakarta Sans', sans-serif;
--font-mono:    'JetBrains Mono', 'Geist Mono', ui-monospace, SFMono-Regular,
                Menlo, Monaco, Consolas, monospace;
```

**Conventions**

- Body and form text → `font-sans` (Inter). Default for everything.
- Page titles / hero headlines → `font-display` (Plus Jakarta Sans).
- Numeric data (totals, codes) → `font-mono`.
- All section headings and table column headers are **sentence case**, not Title Case.

---

## 3. Color tokens (HSL custom properties)

These live in `client/src/index.css` and drive every shadcn component via
`bg-primary`, `text-foreground`, etc. **Mirror these exactly in any
downstream project** that should share the admin's look.

### Light (`:root`)

```css
--background:            210 20% 98%;   /* very faint cool tint, NOT pure white */
--foreground:            224 71% 4%;    /* near-black */
--card:                  0 0% 100%;
--card-foreground:       224 71% 4%;
--popover:               0 0% 100%;
--popover-foreground:    224 71% 4%;
--primary:               327 99% 47%;   /* Taylr Pink */
--primary-foreground:    0 0% 100%;
--secondary:             220 14% 96%;
--secondary-foreground:  224 71% 4%;
--muted:                 220 14% 96%;
--muted-foreground:      220 9% 46%;
--accent:                220 14% 96%;
--accent-foreground:     224 71% 4%;
--destructive:           0 84% 60%;
--destructive-foreground:210 20% 98%;
--border:                220 13% 91%;
--input:                 220 13% 91%;
--ring:                  327 99% 47%;   /* pink focus rings */
--radius:                1rem;          /* rounder than shadcn default */
```

### Dark (`.dark`)

```css
--background:            224 71% 4%;
--foreground:            210 20% 98%;
--card:                  224 71% 4%;
--card-foreground:       210 20% 98%;
--popover:               224 71% 4%;
--popover-foreground:    210 20% 98%;
--primary:               327 99% 47%;   /* Pink stays pink */
--primary-foreground:    0 0% 100%;
--secondary:             215 28% 17%;
--secondary-foreground:  210 20% 98%;
--muted:                 215 28% 17%;
--muted-foreground:      217.9 10.6% 64.9%;
--accent:                215 28% 17%;
--accent-foreground:     210 20% 98%;
--destructive:           0 62.8% 30.6%;
--destructive-foreground:210 20% 98%;
--border:                215 28% 17%;
--input:                 215 28% 17%;
--ring:                  327 99% 47%;
```

---

## 4. Radius scale

```css
--radius:    1rem;     /* base — used by Card, Dialog, Drawer */
--radius-sm: 0.5rem;   /* Buttons, Input, Badge */
--radius-md: 0.75rem;  /* Tabs, dropdowns */
--radius-lg: 1rem;     /* Cards, popovers */
--radius-xl: 1.5rem;   /* Hero blocks, large modals */
```

Pills (`rounded-full`) are used for: status indicators, badges, and any "chip"
filter. Always pair `rounded-full` with `whitespace-nowrap`.

---

## 5. Component library

- **shadcn/ui** with `style: "new-york"`, `baseColor: "neutral"`, `cssVariables: true`
- **Radix UI** primitives under the hood for every interactive component
- **Lucide React** for all icons (no FontAwesome / Heroicons / mixed sets)
- **tw-animate-css** for keyframe utilities

`components.json` (admin — full file):

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "client/src/index.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "iconLibrary": "lucide",
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

A downstream project's `components.json` should keep the same `style`,
`baseColor`, `iconLibrary`, `cssVariables` flag, and the entire `aliases`
block. The only fields that legitimately differ are the `tailwind.config` and
`tailwind.css` paths, which depend on the downstream project's own folder
layout (e.g. `tailwind.css: "src/index.css"` if there's no `client/`
subfolder).

---

## 6. Layout & spacing

- Default spacing scale is Tailwind 4's default (4 px base).
- Page max-widths: detail pages cap at `max-w-7xl`, drawers at `max-w-2xl`,
  forms at `max-w-2xl` or `max-w-3xl`.
- Section gutters: `px-6 py-8` for desktop, `px-4 py-6` for mobile.
- Cards generally use `p-6`. Compact cards `p-4`.
- Tables are full-width inside their card, with `px-4 py-3` cell padding.

---

## 7. Component patterns from the admin

These are patterns you'll see across the admin app — downstream projects
should adopt the same conventions where applicable.

### Primary CTA (pink outline that fills on hover)

```tsx
<button
  className="px-4 py-2 rounded-xl border border-[#ED017F] bg-white
             text-[#ED017F] text-sm font-semibold
             hover:bg-[#ED017F] hover:text-white transition-colors
             disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
>
  Continue
</button>
```

### Brand-accent text link

```tsx
<button className="text-xs text-[#ED017F] font-medium hover:underline">
  Change
</button>
```

### Step indicator pill (inactive / active / done)

```tsx
<div className={`w-6 h-6 rounded-full flex items-center justify-center
  text-xs font-bold ${
    step === current
      ? "bg-[#ED017F] text-white"
      : step < current
        ? "bg-[#ED017F] text-white"
        : "bg-slate-100 text-slate-400"
  }`}>
  {step}
</div>
```

### Status pill

- Always `rounded-full`, `whitespace-nowrap`, `text-xs font-medium`.
- Operational statuses are **text-only** — no leading icon. (Decorative / brand
  badges may include an icon.)
- Color conventions:
  - Live / Active / OK → `bg-emerald-100 text-emerald-800`
  - Pending / Draft   → `bg-amber-100  text-amber-800`
  - Issue / Failed    → `bg-red-100    text-red-800`
  - Neutral / N/A     → `bg-slate-100  text-slate-600`

### Card with hover lift (interactive lists)

```tsx
<Card className="cursor-pointer transition-all duration-200
                 hover:shadow-lg hover:scale-[1.02]
                 border-2 hover:border-[#ED017F]" />
```

### Detail views — routed pages, not drawers

Primary entity detail views (`/units/:id`, `/buildings/:id`, `/oc/:id`,
`/agents/:id`, etc.) are **dedicated routed pages** wired up in
`client/src/App.tsx` (e.g. `UnitDetail`, `BuildingDetail`, `AgentDetail`,
`MemberDetail`). They are not drawers.

Drawers / slide-in panels are reserved for **secondary** flows on top of a page
— e.g. the "View as strata" picker, contextual editors, the OC import flow
side panel, and similar overlays. Use shadcn's `Sheet` for these, opened from
within a routed page rather than as the page itself.

For multi-step user flows in any downstream project, follow the same split:
each step is a routed page (e.g. `/step-1`, `/step-2`), not an overlay on a
single page.

---

## 8. Stack & dependencies

These are the libraries the admin uses. Keep downstream projects on the same
versions to minimise type/API drift and merge friction.

Versions below are the exact ranges currently in the admin's `package.json`.

| Concern         | Library                                       | Admin range           |
| --------------- | --------------------------------------------- | --------------------- |
| Framework       | `react`, `react-dom`                          | `^19.2.0`             |
| Bundler         | `vite` + `@vitejs/plugin-react`               | `^7.1.9`, `^5.0.4`    |
| Styling         | `tailwindcss` + `@tailwindcss/vite`           | `^4.1.14`             |
| Animation       | `framer-motion`                               | `^12.23.24`           |
| Animation utils | `tw-animate-css`, `tailwindcss-animate`       | `^1.4.0`, `^1.0.7`    |
| Routing         | `wouter`                                      | `^3.3.5`              |
| State           | `zustand`                                     | `^5.0.11`             |
| Forms           | `react-hook-form` + `@hookform/resolvers`     | `^7.66.0`, `^3.10.0`  |
| Validation      | `zod`                                         | `^3.25.76`            |
| Data fetching   | `@tanstack/react-query` (admin only)          | `^5.60.5`             |
| Icons           | `lucide-react`                                | `^0.545.0`            |
| Date            | `date-fns`                                    | `^3.6.0`              |
| Toast           | `sonner`                                      | `^2.0.7`              |
| Class utils     | `clsx`, `tailwind-merge`, `class-variance-authority` | `^2.1.1`, `^3.3.1`, `^0.7.1` |

**Do not introduce** any of these into a downstream project unless the admin
already uses them: `chakra-ui`, `mantine`, `mui`, `headlessui`, `react-router`,
`redux`, `axios` (use `fetch`), or any non-Lucide icon set.

---

## 9. Cross-project conventions

- **Sentence case** for all headings, tab labels, table headers, and section
  titles. (No `Title Case`.)
- **Status text only** in operational pills (no leading icons).
- **AU 10% GST** is baked into every customer-facing price; show the
  GST-inclusive value with a small `incl. GST` caption.
- **Date format**: `EEEE, d MMMM yyyy` (e.g. `Tuesday, 14 May 2026`) for human
  display; ISO for machine fields. Use `date-fns/format`.
- **Currency**: `Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' })`.
- **Demo password** for any password-gated mockup in this admin: `taylroc2026`.
  Downstream projects should pick their own distinct password so testers
  always know which app they unlocked.
- **Test IDs**: every interactive element gets a `data-testid` of the form
  `{action}-{target}` (`button-submit`, `input-email`) or `{type}-{content}`
  (`text-username`, `status-payment`). Lists append a unique id:
  `card-product-${productId}`.

---

## 10. Migration checklist (shadcn defaults → admin tokens)

If a downstream project starts from a vanilla shadcn install, its `index.css`
will use shadcn's neutral-grey defaults. To bring it in line with the Taylr
admin tokens, change the values below.

### 10.1 Light tokens (`:root`)

| Token                  | shadcn default value           | Should be (admin)              |
| ---------------------- | ------------------------------ | ------------------------------ |
| `--background`         | `0 0% 100%` (pure white)       | `210 20% 98%`                  |
| `--foreground`         | `240 10% 3.9%`                 | `224 71% 4%`                   |
| `--card-foreground`    | `240 10% 3.9%`                 | `224 71% 4%`                   |
| `--popover-foreground` | `240 10% 3.9%`                 | `224 71% 4%`                   |
| `--primary`            | `240 5.9% 10%` (near-black)    | `327 99% 47%` (Taylr Pink)     |
| `--primary-foreground` | `0 0% 98%`                     | `0 0% 100%`                    |
| `--secondary`          | `240 4.8% 95.9%`               | `220 14% 96%`                  |
| `--secondary-foreground` | `240 5.9% 10%`               | `224 71% 4%`                   |
| `--muted`              | `240 4.8% 95.9%`               | `220 14% 96%`                  |
| `--muted-foreground`   | `240 3.8% 46.1%`               | `220 9% 46%`                   |
| `--accent`             | `240 4.8% 95.9%`               | `220 14% 96%`                  |
| `--accent-foreground`  | `240 5.9% 10%`                 | `224 71% 4%`                   |
| `--destructive`        | `0 84.2% 60.2%`                | `0 84% 60%`                    |
| `--destructive-foreground` | `0 0% 98%`                 | `210 20% 98%`                  |
| `--border`             | `240 5.9% 90%`                 | `220 13% 91%`                  |
| `--input`              | `240 5.9% 90%`                 | `220 13% 91%`                  |
| `--ring`               | `240 5.9% 10%` (grey)          | `327 99% 47%` (pink)           |
| `--radius`             | `0.5rem`                       | `1rem`                         |

### 10.2 Dark tokens (`.dark`)

| Token                  | shadcn default                 | Should be (admin)              |
| ---------------------- | ------------------------------ | ------------------------------ |
| `--background`         | (shadcn dark default)          | `224 71% 4%`                   |
| `--foreground`         | (shadcn dark default)          | `210 20% 98%`                  |
| `--card-foreground`    | (shadcn dark default)          | `210 20% 98%`                  |
| `--popover-foreground` | (shadcn dark default)          | `210 20% 98%`                  |
| `--primary`            | (shadcn dark default — light)  | `327 99% 47%` (pink stays pink) |
| `--primary-foreground` | (shadcn dark default)          | `0 0% 100%`                    |
| `--secondary`          | (shadcn dark default)          | `215 28% 17%`                  |
| `--muted`              | (shadcn dark default)          | `215 28% 17%`                  |
| `--muted-foreground`   | (shadcn dark default)          | `217.9 10.6% 64.9%`            |
| `--accent`             | (shadcn dark default)          | `215 28% 17%`                  |
| `--destructive`        | (shadcn dark default)          | `0 62.8% 30.6%`                |
| `--border` / `--input` | (shadcn dark default)          | `215 28% 17%`                  |
| `--ring`               | (shadcn dark default — grey)   | `327 99% 47%` (pink)           |

### 10.3 Theme aliases & fonts

These are the `@theme inline` block in admin's `client/src/index.css`. A
vanilla shadcn install ships a slightly different set — replace it with
admin's exactly so utility classes and font choices line up:

| Item                    | shadcn default                                               | Should be (admin)                                                                                                             |
| ----------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `--font-sans`           | `'Inter', sans-serif`                                        | `'Inter', ui-sans-serif, system-ui, sans-serif`                                                                               |
| `--font-display`        | not declared                                                 | `'Plus Jakarta Sans', sans-serif`                                                                                             |
| `--font-mono`           | `Menlo, monospace`                                           | `'JetBrains Mono', 'Geist Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`                            |
| `--font-serif`          | `Georgia, serif`                                             | drop (admin doesn't declare it)                                                                                               |
| Radius aliases          | calc-based (`calc(var(--radius) - 4px)` etc.)                | fixed values (`--radius-sm: 0.5rem; --radius-md: 0.75rem; --radius-lg: 1rem; --radius-xl: 1.5rem;`)                           |
| Chart tokens            | `--chart-1 … --chart-5` declared                             | drop unless the downstream app actually uses Recharts (admin doesn't on customer-facing flows)                                |
| Sidebar tokens          | `--sidebar`, `--sidebar-foreground`, `--sidebar-primary`, …  | drop unless the downstream app has a sidebar                                                                                  |
| Custom helpers          | `--button-outline`, `--badge-outline`, `--elevate-1/2`, `--opaque-button-border-intensity` | drop (admin doesn't use them; they're shadcn defaults that introduce visual drift) |

### 10.4 Google Fonts `<link>`

Make sure the downstream project's `index.html` includes **Inter**, **Plus
Jakarta Sans**, and **JetBrains Mono** in its Google Fonts `<link>` tag (admin
loads many more for design exploration; most downstream projects only need
these three).

Once §10.1–§10.4 are applied, all default shadcn components (Button, Card,
Input, Dialog, etc.) in the downstream project will render with the Taylr
brand automatically — no `bg-[#ED017F]` overrides needed in component code.

---

## 11. Files in this repo worth referencing

- `client/src/index.css` — full admin token file (light + dark)
- `client/index.html` — Google Fonts `<link>` tag listing every weight
- `client/src/components/ui/` — shadcn primitives in their canonical form
- `components.json` — shadcn config (style, base color, paths)
- `client/src/pages/Home.tsx`, `client/src/components/AddOCModal.tsx` — best
  examples of the brand-pink CTA pattern
- `replit.md` — overall project overview and module list
