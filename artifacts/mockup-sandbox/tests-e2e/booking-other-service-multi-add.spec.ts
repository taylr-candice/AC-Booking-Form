import { expect, test, type FrameLocator, type Page } from "@playwright/test";

/**
 * Task #213 — End-to-end regression for the customer booking flow with
 * a quantity > 1 on a catalogue "other" service (Task #201).
 *
 * Drives the desktop booking flow wrapper in headless Chromium so the
 * full Vite-built bundle exercises:
 *   - the AC step's OtherServicesSection (`+ Add` toggle, +/− stepper,
 *     `×` remove control, price-card multi-line),
 *   - the slot picker (Step 4) sizing slots against
 *     `base × qty + addon × (qty − 1)` for a non-AC catalogue rule, and
 *   - the Pay step (Step 5) total reflecting the same formula.
 *
 * Pre-seeds same-origin sessionStorage so the booking session lands on
 * Step 2 with a known unit + role + an empty quantity map, plus a
 * single live "other" service catalogue entry the test can drive
 * deterministically. No admin shell is mounted — the customer-side
 * `STORAGE_BACKED_OTHER_SERVICE_LOOKUP` reads the seeded catalogue
 * directly so duration / pricing math works in canvas-isolated mode.
 *
 * Catalogue numbers chosen so every assertion has a unique total:
 *   service base = 60 min / $120, addon = 30 min / $50
 *   qty = 3 → minutes = 60·3 + 30·2 = 240, price = 120·3 + 50·2 = $460
 *   qty = 1 → minutes = 60,                price = $120
 *
 * AC math from `u-aspen-02` (ducted/1/0 on file, default 45 min rule
 * + $179 base price). The unit is on the Aspen rollout (so the
 * 2026-05-04 morning slot is the same one the multi-qty math is
 * sized against) AND has no seeded booking (so the slot picker
 * isn't locked by the "already scheduled by other" guard the way
 * `u1` would be):
 *   AC duration = 45 min, AC price = $179.
 *
 * `useAcOnFileSync` hard-syncs the session's systems / additional
 * count from the unit record on every mount, so we don't bother
 * seeding a custom (1, 1) — the AC step would just stomp it back
 * to (1, 0) anyway.
 *
 * Combined job sizes the test cares about:
 *   qty 3 → 45 + 240 = 285 min, $639
 *   qty 1 → 45 +  60 = 105 min, $299
 *   qty 0 (removed) →  45 min, $179
 *
 * Slot under test: 2026-05-04 morning on Aspen rollout
 * (`time_budget_per_window`, windowMinutes = 240, bookedMinutes = 0).
 *   - qty 3 (285 min) > 240 → status `not_enough_time` → button disabled
 *   - qty 1 (105 min) ≤ 240 → status `available`        → button enabled
 */

const BASE_PATH = process.env.BASE_PATH ?? "/__mockup";
const FLOW_URL = `${BASE_PATH}/preview/booking-flow/BookingFlowDesktop`;

const SESSION_STORAGE_KEY = "taylr.bookingSession.v2";
const LIVE_OTHER_SERVICES_KEY = "taylr.live-other-services.v1";

const SVC = {
  id: "svc-bath",
  name: "Bathroom extraction",
  baseMinutes: 60,
  addonMinutes: 30,
  priceAud: 120,
  addonPriceAud: 50,
  addonLabel: "additional bathroom",
  appliesToNote: "per bathroom in the unit",
} as const;

/**
 * Seed sessionStorage *before* the page script runs so the booking
 * store reads the canned state on first import. Uses `addInitScript`
 * so every navigation in the test (including same-origin iframe
 * loads) inherits the seed.
 */
async function seedSession(page: Page): Promise<void> {
  await page.addInitScript(
    ({ sessionKey, catalogueKey, svc }) => {
      const session = {
        __schema: 4,
        current_step: 2,
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
        other_service_quantities: {},
        ac_discrepancy: null,
        ac_override_active: false,
        primary_residence: null,
        access_method: null,
        key_holder_name: "",
        key_holder_phone: "",
        key_collection_location: "",
        return_method: null,
        managing_agency_id: null,
        tenants: [],
        signature_acknowledged: false,
        signature_name: "",
        access_notes: "",
        service_date: null,
        service_slot: null,
        cancellation_acknowledged: false,
        submitted: false,
        reference: null,
        return_to: null,
        payment_cancelled: false,
        unit_unavailable: false,
        unit_unavailable_blocker: null,
      };
      try {
        // `addInitScript` runs in every same-origin frame on every
        // navigation — including each step iframe's own load. We only
        // want the *first* navigation in the test to plant the seed;
        // subsequent iframe loads must inherit the live, mutated
        // session from sessionStorage (otherwise the seed would
        // clobber the customer's qty edits every time the wrapper
        // swapped to a new step's iframe).
        if (window.sessionStorage.getItem(sessionKey) === null) {
          window.sessionStorage.setItem(sessionKey, JSON.stringify(session));
        }
        if (window.sessionStorage.getItem(catalogueKey) === null) {
          window.sessionStorage.setItem(catalogueKey, JSON.stringify([svc]));
        }
      } catch {
        /* private mode — let the test's first assertion fail loudly */
      }
    },
    {
      sessionKey: SESSION_STORAGE_KEY,
      catalogueKey: LIVE_OTHER_SERVICES_KEY,
      svc: SVC,
    },
  );
}

function stepFrame(page: Page, stepId: 2 | 3 | 4 | 5): FrameLocator {
  return page.frameLocator(`[data-testid="flow-iframe-${stepId}"]`);
}

async function gotoStep(
  page: Page,
  stepId: 2 | 3 | 4 | 5,
): Promise<FrameLocator> {
  await page.getByTestId(`step-pill-${stepId}`).click();
  // Wait for the iframe to swap to the requested step before returning
  // a frame locator the caller can drive immediately.
  await expect(page.getByTestId(`flow-iframe-${stepId}`)).toBeVisible();
  const frame = stepFrame(page, stepId);
  // A well-known top-level testid each step renders, so we don't race
  // the iframe's React hydration. Each anchor is present in both the
  // mobile and desktop variant of its step — picking the desktop one
  // here matches the BookingFlowDesktop wrapper we're driving.
  const anchor =
    stepId === 4
      ? "day-card-2026-05-04"
      : stepId === 5
        ? "text-total"
        : "block-price"; // Steps 2 and 3 both render PriceBlock-style anchors;
  // the AC step's `block-price` is what we drive in the test.
  await expect(frame.getByTestId(anchor).first()).toBeVisible();
  return frame;
}

test.describe("Booking flow — multi-quantity 'other' service", () => {
  test("adds 3 of a catalogue service, sizes Step-4 slots and Step-5 total to the qty math, then removes it", async ({
    page,
  }) => {
    await seedSession(page);
    await page.goto(FLOW_URL);

    // ── Step 2 — AC step iframe (seeded current_step = 2) ──────────────
    const acIframe = page.getByTestId("flow-iframe-2");
    await expect(acIframe).toBeVisible();
    const ac = stepFrame(page, 2);
    // PriceBlock is a stable anchor on both the OnFileView and the
    // FullConfigView, so we wait for it before driving the toggle.
    await expect(ac.getByTestId("block-price")).toBeVisible();

    // Catalogue toggle starts collapsed (qty = 0). Tapping `+ Add`
    // promotes qty → 1 and swaps the row for the expanded card.
    const toggle = ac.getByTestId(`toggle-other-service-${SVC.id}`);
    await expect(toggle).toBeVisible();
    await toggle.click();

    const card = ac.getByTestId(`card-other-service-${SVC.id}`);
    await expect(card).toBeVisible();
    // Bump qty 1 → 3 via the stepper.
    const plus = ac.getByTestId(`btn-other-service-plus-${SVC.id}`);
    await plus.click();
    await plus.click();

    // ── Acceptance (1) — price-card row reads "3 × <name>" with a
    //                    Task #211 two-tier breakdown:
    //                      base sub-row : 3 × $120 = $360
    //                      addon sub-row: 2 × $50  = $100
    //                    The two sub-rows still sum to the existing
    //                    formula ($120·3 + $50·2 = $460), which the
    //                    price-card Total then rolls into the AC line.
    const priceRow = ac.getByTestId(`row-price-other-${SVC.id}`);
    await expect(priceRow).toBeVisible();
    await expect(priceRow).toContainText(`3 × ${SVC.name}`);
    const priceBase = ac.getByTestId(`row-price-other-${SVC.id}-base`);
    await expect(priceBase).toContainText(`3 × $${SVC.priceAud}`);
    await expect(priceBase).toContainText(`$${SVC.priceAud * 3}`);
    const priceAddon = ac.getByTestId(`row-price-other-${SVC.id}-addon`);
    await expect(priceAddon).toContainText(`2 × $${SVC.addonPriceAud}`);
    await expect(priceAddon).toContainText(SVC.addonLabel);
    await expect(priceAddon).toContainText(`$${SVC.addonPriceAud * 2}`);
    // Price card total = AC ($179, no addon row) + service ($460) = $639.
    await expect(ac.getByTestId("text-price-total")).toHaveText("$639");
    // Card stepper readout mirrors the qty-aware minutes / dollars.
    await expect(
      ac.getByTestId(`text-other-service-total-${SVC.id}`),
    ).toContainText("+$460");
    await expect(
      ac.getByTestId(`text-other-service-total-${SVC.id}`),
    ).toContainText("~240 min");

    // ── Step 4 — slot picker shrinks the chosen slot off the list ──────
    // qty = 3 → AC 45 + service 240 = 285 min job. The 2026-05-04
    // morning window is 240 min wide and unbooked, so the 285-min
    // job overflows it (and every other window in the rollout — none
    // is wider than 300 min, every booked window leaves < 285 min).
    // The desktop picker only mounts the per-window `DesktopSlotCard`s
    // once the customer has selected a day, and it disables the
    // surrounding `DayCard` whenever `dayHasAvailable === false`. So
    // for qty 3 we assert the day card is disabled — it's the
    // upstream gate the picker uses to block selection of any slot
    // on a day where none fit.
    const slots = await gotoStep(page, 4);
    const targetDay = slots.getByTestId("day-card-2026-05-04");
    await expect(targetDay).toBeDisabled();
    // …and the slot card it would have framed is consequently never
    // rendered (the day grid hasn't expanded its slot panel).
    await expect(slots.getByTestId("desktop-slot-20260504-am")).toHaveCount(0);

    // ── Acceptance (2) — Pay-step total matches the formula, and the
    //                    receipt row mirrors the price-card breakdown
    //                    (Task #211): a header line for the service
    //                    and two indented sub-rows for base × qty and
    //                    addon × (qty − 1).
    const pay = await gotoStep(page, 5);
    await expect(pay.getByTestId("text-total")).toHaveText("$639");
    const payRow = pay.getByTestId(`row-pay-other-${SVC.id}`);
    await expect(payRow).toContainText(`3 × ${SVC.name}`);
    const payBase = pay.getByTestId(`row-pay-other-${SVC.id}-base`);
    await expect(payBase).toContainText(`3 × $${SVC.priceAud}`);
    await expect(payBase).toContainText(`$${SVC.priceAud * 3}`);
    const payAddon = pay.getByTestId(`row-pay-other-${SVC.id}-addon`);
    await expect(payAddon).toContainText(`2 × $${SVC.addonPriceAud}`);
    await expect(payAddon).toContainText(SVC.addonLabel);
    await expect(payAddon).toContainText(`$${SVC.addonPriceAud * 2}`);

    // ── qty back down to 1 — same slot becomes selectable again ────────
    await gotoStep(page, 2);
    const minus = ac.getByTestId(`btn-other-service-minus-${SVC.id}`);
    await minus.click();
    await minus.click();
    // After the two minuses qty = 1 — the price card collapses the row
    // back to "<name>" without the leading "n × " prefix.
    await expect(priceRow).not.toContainText("× ");
    await expect(priceRow).toContainText("$120");
    await expect(ac.getByTestId("text-price-total")).toHaveText("$299");

    const slotsAgain = await gotoStep(page, 4);
    const targetDayAgain = slotsAgain.getByTestId("day-card-2026-05-04");
    // qty = 1 → 45 + 60 = 105 min job — every window on 2026-05-04 has
    // ≥ 120 min free, so the day card flips back to enabled.
    await expect(targetDayAgain).toBeEnabled();
    await targetDayAgain.click();
    // The slot panel expands once the day is picked; the morning slot
    // (240 min wide, unbooked) holds the 105-min job comfortably.
    const targetSlotAgain = slotsAgain.getByTestId(
      "desktop-slot-20260504-am",
    );
    await expect(targetSlotAgain).toBeEnabled();

    // ── Acceptance (3) — the remove (×) button drops the row entirely ─
    await gotoStep(page, 2);
    await ac.getByTestId(`btn-remove-other-service-${SVC.id}`).click();
    await expect(card).toHaveCount(0);
    await expect(priceRow).toHaveCount(0);
    // Price card total falls back to AC-only ($179, no addon row).
    await expect(ac.getByTestId("text-price-total")).toHaveText("$179");
  });
});
