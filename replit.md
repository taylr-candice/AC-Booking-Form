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
    - **Units bulk CSV import/update** — Units view has three actions next to "Add unit": **Download template**, **Export current units**, and **Import CSV**. Import opens a modal with file picker + paste textarea + live preview. Pure parse/validate/apply layer in `state/unitsCsv.ts` (with `parseCsvText`, `formatUnitsCsv`, `unitsCsvTemplate`, `parseUnitsImport`, `applyUnitsImport`). Modal is `admin/UnitsCsvImportModal.tsx`. Match precedence: by `id` first, then by exact `addressLine1 + addressLine2` fallback; an unknown id is an error (never silently becomes a new row). Apply is gated on zero error rows AND at least one new/update row. Updates fold in via the existing `setUnits` setter so customer-side AC pre-fill picks up changes immediately. Columns: `id, addressLine1, addressLine2, acType (split|ducted|unknown), systems, additional, agentId`. Parser handles quoted fields, embedded commas/newlines, doubled quotes, CRLF, BOM, blank lines, and header-order tolerance.
- AC step (`booking-pages/AcDesktop`, `AcMobile`) shows an emphasized pink "please get this right" note under the intro — these details set how long the technician needs and drive whether the slot can finish in one visit.
- Slot picker pages (`booking-slots/SlotsDesktop`, `SlotsMobile`, `SlotsMobileLite`) use a compact day grid → window reveal → optional ack → Confirm flow (Task #72). The pink access-commitment banner and yellow "Not sure" callout are gone; access lives in a single compact recap line at the top: "Access: <label> · Change" (reuses `data-testid="button-change-access"`). Day cards (`data-testid="day-card-<isoDate>"`) sit in a 4-up grid on mobile and 6-up grid on desktop; a day card is uniformly greyed out (no reason text) when ALL of its windows are unavailable. Clicking a day reveals its Morning / Afternoon / Evening (when present) cards beneath; window-card testid contract is preserved (`mobile-slot-*` / `desktop-slot-*`). For be-there access methods (`isBeThereMethod`), an "I'll be available for the entire window" checkbox renders below the windows and gates Confirm; non-be-there methods skip the checkbox entirely and Confirm enables on slot selection alone. Confirm CTA is labelled "Confirm" (testids `button-continue-mobile` / `button-continue-desktop` preserved). The desktop variant's timezone pill mirrors the city the building is in (`unitCity()` in `bookingHelpers.ts` maps state codes ACT/NSW/VIC/QLD/WA/SA/TAS/NT to Canberra/Sydney/Melbourne/Brisbane/Perth/Adelaide/Hobart/Darwin). The booking-flow wrappers' `NAV_GOTO_RETURN_TO` set covers both Step 3 (after edit-AC) and Step 4 (after edit-access) so the next "Continue" tap on either step flings the customer straight back to the slot picker.
- Evening windows (5pm–8pm, 180m, `EVENING_WINDOW_MIN`) are supported in the data model (`adminMockData.ts`: `RolloutSlot.window`, `RolloutDay.evening?`, `WINDOW_TIME_RANGE.evening`, `AdminBooking.serviceSlot`, `UnitUnavailableBlocker.slot`, `BuildingRolloutSummary.nextScheduled.slot`, `AdminCreatedScheduleChoice.window`). RL_ASPEN_DAYS seeds 4 evening windows for the demo. Customer pickers render `day.evening` when present. **Admin scheduling paths (`NewBookingFlow.pickedWindow`, `AdminApp.appendBooking` / `rescheduleBooking` / `scheduleCoordinationBooking` / `undoCancelBookingAndReschedule`, `RolloutScheduleEditor`, `ScheduleCoordinationModal`, `rolloutSlotPicker`) still narrow to `"morning" | "afternoon"` and do not yet expose evening — admins can't currently create or pick evening slots. Customer-created evening bookings round-trip through the data layer fine but appear morning/afternoon-only in admin UI.** Follow-up tracked.
- Access pages (`booking-pages/AccessMobile`, `AccessDesktop`) only render the "Additional access notes" textarea for be-there access methods (where the customer will actually be on-site to hand off context). `bookingActions.setAccessMethod` cascade-clears `access_notes` when switching to a non-be-there method, so a previously-typed note can't be silently carried into a booking with no UI to view or edit it.
- **Universal customer-facing copy (no role variants).** The booking flow runs without login, so we cannot reliably tell whether the person clicking is the unit owner, their agent, or the tenant. Every customer-side label, ack, and prompt must read sensibly for any of them — no `if role === "agent"` copy variants. Where role context (e.g. who's liable for a fee) genuinely matters, put it inside the policy / modal text, not in the tickbox or button label. Standing rule, applies to all new work.
- Pay step (`booking-pages/PayDesktop`, `PayMobile`) offers exactly **two payment methods**: `Pay now` (everyone — handed off to Stripe where card + Apple Pay live) and `Invoice me` (agents only — prepayment required). No inline card form, no separate Apple Pay tile, no "coming soon" footer button. Copy lives in `bookingHelpers.ts`: `PAY_NOW_LABEL`/`PAY_NOW_SUBLABEL`, `INVOICE_LABEL`/`INVOICE_SUBLABEL`, `STRIPE_REDIRECT_NOTE`, `INVOICE_PREPAYMENT_TITLE`/`INVOICE_PREPAYMENT_BODY`, `INVOICE_REFERENCE_NOTE`, `BILLING_EMAIL_HELPER`. Invoice flow says: order is created with pending payment status on submission, tax invoice auto-emailed to the contact email and the optional billing email. Pay button label switches: `Pay $X` → `Continue to payment $X` (pay-now) or `Submit booking` (invoice). Cancellation block shows `mailto:support@taylr.com.au` (constant `CANCELLATION_CONTACT_EMAIL`).
- Shared session store: `src/state/bookingSession.ts` (sessionStorage-backed, key `taylr.bookingSession.v1`)
- Derived selectors and helpers: `src/state/bookingDerived.ts`, `src/state/bookingHelpers.ts`
- Step-5 access-method matrix: `src/state/accessMethodCatalog.ts`
- Full spec: `docs/replit_logic_v2_*.md`
- Brand: pink `#ED017F`, selection green `#5FBB97`, font Inter; AU 10% GST baked in; `SYSTEM_PRICE_AUD = 179`, `ADDON_PRICE_AUD = 39`
- Preview URLs are auto-discovered by `mockupPreviewPlugin.ts` at `/__mockup/preview/<folder>/<ComponentName>`. Files/folders prefixed with `_` are ignored.
