import { expect, test, type Page } from "@playwright/test";

/**
 * Task #224 — Focused regression for the Pay step (Step 5) under the
 * Task #201 quantity model.
 *
 * Background: while building the multi-add e2e spec we discovered the
 * Pay screens were still reading the removed `selected_other_service_ids`
 * field instead of the new `other_service_quantities` map, crashing
 * every booking that selected any "other" service. The desktop crash
 * was caught incidentally by `booking-other-service-multi-add.spec.ts`,
 * but the mobile crash and the per-row labels / prices on both
 * layouts had no direct coverage.
 *
 * This spec mounts `PayMobile` and `PayDesktop` directly via the
 * preview shell (so neither layout is gated behind the wrapper's step
 * progression) and asserts:
 *
 *   - Both layouts render without throwing for three quantity shapes
 *     the schema-4 session can take in production:
 *       1. an empty `other_service_quantities` map
 *       2. a single service at qty 1
 *       3. several services at mixed quantities (1, 2, and 3)
 *   - Each `row-pay-other-{id}` shows the qty-aware label
 *     ("{N} × {Name}" when N > 1, bare name when N = 1) and the
 *     correct dollar amount under the
 *     `priceAud × qty + addonPriceAud × max(qty − 1, 0)` formula.
 *   - `text-total` always equals the AC base ($179 for the seeded
 *     1 system / 0 additional unit) plus the sum of every selected
 *     service's per-line price.
 */

const BASE_PATH = process.env.BASE_PATH ?? "/__mockup";
const SESSION_STORAGE_KEY = "taylr.bookingSession.v2";
const LIVE_OTHER_SERVICES_KEY = "taylr.live-other-services.v1";

const SYSTEM_PRICE_AUD = 179;

const BATHROOM = {
  id: "svc-bath",
  name: "Bathroom extraction",
  baseMinutes: 30,
  addonMinutes: 10,
  priceAud: 99,
  addonPriceAud: 25,
  appliesToNote: "per bathroom in the unit",
  addonLabel: "additional bathroom",
} as const;

const KITCHEN = {
  id: "svc-kitchen",
  name: "Kitchen rangehood clean",
  baseMinutes: 20,
  addonMinutes: 5,
  priceAud: 60,
  addonPriceAud: 15,
  appliesToNote: "per rangehood in the unit",
  addonLabel: "additional rangehood",
} as const;

const LAUNDRY = {
  id: "svc-laundry",
  name: "Laundry vent service",
  baseMinutes: 25,
  addonMinutes: 8,
  priceAud: 80,
  addonPriceAud: 20,
  appliesToNote: "per vent in the unit",
  addonLabel: "additional vent",
} as const;

const CATALOGUE = [BATHROOM, KITCHEN, LAUNDRY] as const;

type Variant = "PayMobile" | "PayDesktop";

const VARIANTS: ReadonlyArray<{ variant: Variant; url: string }> = [
  {
    variant: "PayDesktop",
    url: `${BASE_PATH}/preview/booking-pages/PayDesktop`,
  },
  {
    variant: "PayMobile",
    url: `${BASE_PATH}/preview/booking-pages/PayMobile`,
  },
];

/** Per-line price under the Task #201 formula. */
function lineTotal(
  rule: { priceAud: number; addonPriceAud: number },
  qty: number,
): number {
  if (qty <= 0) return 0;
  return rule.priceAud * qty + rule.addonPriceAud * Math.max(qty - 1, 0);
}

/**
 * Seed sessionStorage *before* the page bundle runs so the booking
 * store reads the canned state on first import. Each call registers
 * an init script for the next navigation; tests use a fresh page so
 * scripts don't leak between cases.
 */
async function seedSession(
  page: Page,
  quantities: Readonly<Record<string, number>>,
): Promise<void> {
  await page.addInitScript(
    ({ sessionKey, catalogueKey, quantities, catalogue }) => {
      const session = {
        __schema: 4,
        current_step: 5,
        ac_step_origin: null,
        unit_id: "u-aspen-02",
        role: "owner",
        agency_id: null,
        agency_other_name: "",
        contact_first_name: "Sam",
        contact_last_name: "Tester",
        contact_email: "sam@example.com",
        contact_phone: "0400 000 000",
        num_systems: 1,
        num_additional_indoor: 0,
        other_service_quantities: quantities,
        ac_discrepancy: null,
        ac_override_active: false,
        primary_residence: "live_in",
        access_method: "owner_live_at_unit",
        key_holder_name: "",
        key_holder_phone: "",
        key_collection_location: "",
        return_method: null,
        managing_agency_id: null,
        tenants: [],
        signature_acknowledged: false,
        signature_name: "",
        access_notes: "",
        service_date: "2026-05-04",
        service_slot: "am",
        cancellation_acknowledged: false,
        submitted: false,
        reference: null,
        return_to: null,
        payment_cancelled: false,
        unit_unavailable: false,
        unit_unavailable_blocker: null,
      };
      try {
        window.sessionStorage.setItem(sessionKey, JSON.stringify(session));
        window.sessionStorage.setItem(catalogueKey, JSON.stringify(catalogue));
      } catch {
        /* private mode — let the test's first assertion fail loudly */
      }
    },
    {
      sessionKey: SESSION_STORAGE_KEY,
      catalogueKey: LIVE_OTHER_SERVICES_KEY,
      quantities,
      catalogue: CATALOGUE.map((r) => ({ ...r })),
    },
  );
}

/**
 * Fail the test loudly if either Pay layout throws while rendering
 * (the very symptom this task exists to guard against). Wired up
 * before the first navigation so the listener catches errors during
 * hydration.
 */
function trackUncaughtErrors(page: Page): { messages: string[] } {
  const messages: string[] = [];
  page.on("pageerror", (err) => {
    messages.push(err.message);
  });
  return { messages };
}

test.describe("Pay step — quantity-aware 'other' service rows", () => {
  for (const { variant, url } of VARIANTS) {
    test.describe(variant, () => {
      test("renders without throwing when other_service_quantities is empty", async ({
        page,
      }) => {
        const errors = trackUncaughtErrors(page);
        await seedSession(page, {});
        await page.goto(url);

        // text-total is the most stable Pay-step anchor — present in
        // both desktop and mobile, and waits for hydration.
        await expect(page.getByTestId("text-total")).toHaveText(
          `$${SYSTEM_PRICE_AUD}`,
        );

        // No `row-pay-other-*` rows when the map is empty.
        await expect(page.locator('[data-testid^="row-pay-other-"]')).toHaveCount(
          0,
        );

        expect(
          errors.messages,
          `unexpected page errors:\n${errors.messages.join("\n")}`,
        ).toEqual([]);
      });

      test("renders one row at qty 1 with the bare service name and base price", async ({
        page,
      }) => {
        const errors = trackUncaughtErrors(page);
        await seedSession(page, { [BATHROOM.id]: 1 });
        await page.goto(url);

        const expectedTotal =
          SYSTEM_PRICE_AUD + lineTotal(BATHROOM, 1);
        await expect(page.getByTestId("text-total")).toHaveText(
          `$${expectedTotal}`,
        );

        const row = page.getByTestId(`row-pay-other-${BATHROOM.id}`);
        await expect(row).toBeVisible();
        await expect(row).toContainText(BATHROOM.name);
        // qty = 1 collapses the row to "<name>" — the multiply chip
        // and breakdown line only render for qty > 1.
        await expect(row).not.toContainText("×");
        await expect(row).toContainText(`$${BATHROOM.priceAud}`);

        // Only one such row was rendered.
        await expect(page.locator('[data-testid^="row-pay-other-"]')).toHaveCount(
          1,
        );

        expect(
          errors.messages,
          `unexpected page errors:\n${errors.messages.join("\n")}`,
        ).toEqual([]);
      });

      test(
        "renders multiple rows at mixed quantities with qty-aware labels and prices",
        async ({ page }) => {
          const errors = trackUncaughtErrors(page);
          // 3 × bathroom, 2 × kitchen, 1 × laundry — covers every
          // qty branch (>2, =2, =1) the row component handles.
          await seedSession(page, {
            [BATHROOM.id]: 3,
            [KITCHEN.id]: 2,
            [LAUNDRY.id]: 1,
          });
          await page.goto(url);

          const bathTotal = lineTotal(BATHROOM, 3); // 99·3 + 25·2 = 347
          const kitchenTotal = lineTotal(KITCHEN, 2); // 60·2 + 15·1 = 135
          const laundryTotal = lineTotal(LAUNDRY, 1); // 80·1        =  80
          const expectedTotal =
            SYSTEM_PRICE_AUD + bathTotal + kitchenTotal + laundryTotal;
          await expect(page.getByTestId("text-total")).toHaveText(
            `$${expectedTotal}`,
          );

          // Bathroom — qty 3 → "3 × Bathroom extraction" + $347.
          const bathRow = page.getByTestId(`row-pay-other-${BATHROOM.id}`);
          await expect(bathRow).toBeVisible();
          await expect(bathRow).toContainText(`3 × ${BATHROOM.name}`);
          await expect(bathRow).toContainText(`$${bathTotal}`);

          // Kitchen — qty 2 → "2 × Kitchen rangehood clean" + $135.
          const kitchenRow = page.getByTestId(`row-pay-other-${KITCHEN.id}`);
          await expect(kitchenRow).toBeVisible();
          await expect(kitchenRow).toContainText(`2 × ${KITCHEN.name}`);
          await expect(kitchenRow).toContainText(`$${kitchenTotal}`);

          // Laundry — qty 1 → bare name, no `× `, base price.
          const laundryRow = page.getByTestId(`row-pay-other-${LAUNDRY.id}`);
          await expect(laundryRow).toBeVisible();
          await expect(laundryRow).toContainText(LAUNDRY.name);
          await expect(laundryRow).not.toContainText("×");
          await expect(laundryRow).toContainText(`$${laundryTotal}`);

          // Exactly the three seeded services were rendered.
          await expect(
            page.locator('[data-testid^="row-pay-other-"]'),
          ).toHaveCount(3);

          expect(
            errors.messages,
            `unexpected page errors:\n${errors.messages.join("\n")}`,
          ).toEqual([]);
        },
      );
    });
  }
});
