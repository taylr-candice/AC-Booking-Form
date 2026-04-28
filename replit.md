# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run test` — run all package test suites (currently mockup-sandbox vitest unit tests)
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Mockup Sandbox: Taylr Booking Form

The `artifacts/mockup-sandbox` package hosts the Taylr customer-facing booking form prototype.

- Mockups live under `src/components/mockups/`:
  - `booking-flow/BookingFlowMobile.tsx`, `BookingFlowDesktop.tsx` — end-to-end wrappers
  - `booking-pages/` — per-step pages (Unit, Role, Booker, Ac, Access, Pay) in mobile + desktop
  - `booking-slots/SlotsDesktop.tsx`, `SlotsMobile.tsx`, `SlotsMobileLite.tsx` — Step 6 slot picker
  - `booking-form/BookingForm.tsx` — original combined form (legacy)
  - `admin/AdminApp.tsx` — single-page admin ops mockup (bookings list + detail, slot calendar, units, agents, payments). Reads the customer's current sessionStorage booking via `liveBookingFromSession()` so the demo's live row appears alongside seeded data. Slot calendar supports two scheduling modes per window — `time_based` (window has minutes; bookings consume minutes by service length) and `count_based` (window has N slots; each booking takes one). See `slotIsAvailable()` in `state/adminMockData.ts`. Customers always see only "available / full".
- AC step (`booking-pages/AcDesktop`, `AcMobile`) shows an emphasized pink "please get this right" note under the intro — these details set how long the technician needs and drive whether the slot can finish in one visit.
- Slot picker pages (`booking-slots/SlotsDesktop`, `SlotsMobile`, `SlotsMobileLite`) show a single "Heads up" access-window banner only — the longer accountability nudge that used to differ for agents vs customers has been removed.
- Pay step (`booking-pages/PayDesktop`) "Invoice me" block is **prepayment-only**: the invoice must be paid before the scheduled service because Taylr's rates are pre-negotiated per minimum daily volume per building. Copy lives in `bookingHelpers.ts` as `INVOICE_PREPAYMENT_TITLE`, `INVOICE_PREPAYMENT_BODY`, `INVOICE_REFERENCE_NOTE`, and `BILLING_EMAIL_HELPER`. The billing email field is optional and falls back to the contact email; an invoice reference is generated on submission and emailed with the tax invoice. Cancellation block also shows a `mailto:` to `support@taylr.com.au` (constant `CANCELLATION_CONTACT_EMAIL`).
- Shared session store: `src/state/bookingSession.ts` (sessionStorage-backed, key `taylr.bookingSession.v1`)
- Derived selectors and helpers: `src/state/bookingDerived.ts`, `src/state/bookingHelpers.ts`
- Step-5 access-method matrix: `src/state/accessMethodCatalog.ts`
- Full spec: `docs/replit_logic_v2_*.md`
- Brand: pink `#ED017F`, selection green `#5FBB97`, font Inter; AU 10% GST baked in; `SYSTEM_PRICE_AUD = 179`, `ADDON_PRICE_AUD = 39`
- Preview URLs are auto-discovered by `mockupPreviewPlugin.ts` at `/__mockup/preview/<folder>/<ComponentName>`. Files/folders prefixed with `_` are ignored.
