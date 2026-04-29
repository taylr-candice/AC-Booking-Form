import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * End-to-end regression test for the sidebar invoice-void badge
 * (Task #113).
 *
 * The dashboard banner ({@link InvoiceVoidAlerts}) only renders at the
 * top of the Bookings and Payments views, so an admin spending their
 * day in Awaiting coordination, Buildings, Rollouts, or Units would
 * never see outstanding voids. The sidebar pink count badge surfaces
 * the same queue from any view; a unit test (`Sidebar.test.tsx`)
 * covers the component in isolation but no end-to-end test walks the
 * full path that the badge was added to close:
 *
 *   1. A customer races and supersedes another booking.
 *   2. The pink badge appears on the Bookings (and Payments) entries
 *      in the admin sidebar from a non-Bookings view.
 *   3. Clicking the Bookings nav lands on the bookings view with the
 *      existing alert banner visible.
 *   4. Recording the void clears the badge.
 *
 * This spec drives the same race + supersede flow as
 * `race-record-invoice-void.spec.ts` but parks the admin on the
 * Awaiting coordination view to assert the sidebar badge is the
 * surface that surfaces the queue, then records the void via the
 * banner's "Record void" affordance and asserts the badge drops.
 *
 * Seed-data references (see `state/adminMockData.ts`):
 *   - `u-aspen-02` — "G02 / 335 Aspen Boulevard", ducted/1/0,
 *     no seeded bookings, on the Aspen rollout (`rl-ac-aspen`)
 *   - Aspen rollout dates: 2026-04-27 .. 2026-05-09
 *   - No seeded booking carries `supersededByBookingId`, so the
 *     pre-test invoice-void count is 0 and the badge is hidden.
 */

const BASE_PATH = process.env.BASE_PATH ?? "/__mockup";
const ADMIN_URL = `${BASE_PATH}/preview/admin/AdminApp`;

const ADMIN_CUSTOMER_NAME = "Henrik Test";
const ADMIN_CUSTOMER_EMAIL = "henrik.test@example.com";
const ADMIN_CUSTOMER_PHONE = "0411 222 333";

const CUSTOMER_FIRST = "Priya";
const CUSTOMER_LAST = "Sharma";
const CUSTOMER_EMAIL = "priya.sharma@example.com";
const CUSTOMER_PHONE = "0411 999 000";

const ADMIN_BOOKING_DATE = "2026-05-04";
const CUSTOMER_BOOKING_DATE = "2026-05-05";

function badgeFor(page: Page, view: string): Locator {
  return page.locator(`[data-testid="sidebar-badge"][data-view="${view}"]`);
}

/**
 * Click a sidebar nav entry by label. The accessible name swallows
 * the badge's aria-label when one is present (e.g. clicking the
 * "Bookings" entry after the supersede fires resolves to
 * "Bookings 1 Bookings alert"), so we anchor to the leading label
 * via a `^Label\b` regex rather than `exact: true`.
 */
async function clickNav(page: Page, label: string): Promise<void> {
  const re = new RegExp(`^${label}\\b`);
  await page.getByRole("button", { name: re }).first().click();
}

async function goToBookings(page: Page): Promise<void> {
  await page.goto(ADMIN_URL);
  await clickNav(page, "Bookings");
  // Wait for the bookings list to render — the seeded bk-1042 row is
  // always visible by default (active, non-cancelled).
  await expect(
    page.getByRole("button", {
      name: /Open booking bk-1042 for Henrik Olsen/i,
    }),
  ).toBeVisible();
}

/**
 * Phone-book a fresh invoice_pending admin booking on u-aspen-02.
 * Mirrors the New Booking flow walk in `race-record-invoice-void.spec.ts`.
 * Returns the freshly-created booking id parsed off the bookings list.
 */
async function createAdminInvoicePendingBooking(page: Page): Promise<string> {
  await page
    .getByRole("button", { name: "New booking", exact: true })
    .click();

  // Step 1 — Unit & customer
  await page
    .getByRole("button", { name: /G02 \/ 335 Aspen Boulevard/i })
    .first()
    .click();
  await page.getByPlaceholder("e.g. Sam Patel").fill(ADMIN_CUSTOMER_NAME);
  await page.getByPlaceholder("name@example.com").fill(ADMIN_CUSTOMER_EMAIL);
  await page.getByPlaceholder("0411 222 333").fill(ADMIN_CUSTOMER_PHONE);
  await page.getByRole("button", { name: /Continue/i }).click();

  // Step 2 — AC config (defaults match u-aspen-02: ducted / 1 system / 0 extra)
  await page.getByRole("button", { name: /Continue/i }).click();

  // Step 3 — Schedule
  await page
    .getByTestId(`rollout-pick-slot-${ADMIN_BOOKING_DATE}__morning`)
    .click();
  await page.getByRole("button", { name: /Continue/i }).click();

  // Step 4 — Review + confirm. Lands back on the bookings list.
  await page.getByRole("button", { name: /Create booking/i }).click();

  const adminRow = page.getByRole("button", {
    name: new RegExp(`Open booking .* for ${ADMIN_CUSTOMER_NAME}`, "i"),
  });
  await expect(adminRow).toBeVisible();
  const accessibleName = (await adminRow.getAttribute("aria-label")) ?? "";
  const match = /bk-\d+/.exec(accessibleName);
  if (!match) {
    throw new Error(
      `Could not parse booking id from row aria-label: ${accessibleName}`,
    );
  }
  return match[0];
}

/**
 * Drive the customer booking flow for `u-aspen-02` to the point of
 * payment by reaching into the in-page `bookingSession` module via
 * dynamic import. Vite serves source modules at predictable URLs
 * keyed by their filesystem path, so this resolves to the SAME
 * module instance the admin shell uses — the registered uniqueness
 * guard fires inside `submitBooking()` and supersedes the prior
 * admin booking (cancel + free capacity + stamp
 * `supersededByBookingId`).
 */
async function driveCustomerSubmitOnSameUnit(page: Page): Promise<void> {
  const sessionModuleUrl = `${BASE_PATH}/src/state/bookingSession.ts`;
  await page.evaluate(
    async ({
      moduleUrl,
      unitId,
      first,
      last,
      email,
      phone,
      date,
    }) => {
      const m = (await import(/* @vite-ignore */ moduleUrl)) as {
        bookingActions: {
          reset: () => void;
          setUnit: (id: string | null) => void;
          setRole: (role: "owner" | "agent" | null) => void;
          setContact: (fields: Record<string, string>) => void;
          setSystems: (n: number) => void;
          setAdditionalIndoor: (n: number) => void;
          setPrimaryResidence: (
            r: "live_in" | "leased_out" | "vacant" | null,
          ) => void;
          setAccessMethod: (a: string | null) => void;
          setSchedule: (date: string | null, slot: string | null) => void;
          setCancellationAcknowledged: (v: boolean) => void;
          submitBooking: () => void;
        };
      };
      m.bookingActions.reset();
      m.bookingActions.setUnit(unitId);
      m.bookingActions.setRole("owner");
      m.bookingActions.setContact({
        contact_first_name: first,
        contact_last_name: last,
        contact_email: email,
        contact_phone: phone,
      });
      m.bookingActions.setSystems(1);
      m.bookingActions.setAdditionalIndoor(0);
      m.bookingActions.setPrimaryResidence("live_in");
      m.bookingActions.setAccessMethod("owner_live_at_unit");
      m.bookingActions.setSchedule(date, "morning");
      m.bookingActions.setCancellationAcknowledged(true);
      m.bookingActions.submitBooking();
    },
    {
      moduleUrl: sessionModuleUrl,
      unitId: "u-aspen-02",
      first: CUSTOMER_FIRST,
      last: CUSTOMER_LAST,
      email: CUSTOMER_EMAIL,
      phone: CUSTOMER_PHONE,
      date: CUSTOMER_BOOKING_DATE,
    },
  );
}

test.describe("Admin · sidebar invoice-void badge lifecycle", () => {
  test("badge appears on Bookings + Payments from a non-Bookings view, navigates to the banner, and clears once the void is recorded", async ({
    page,
  }) => {
    // 1. Set the stage: phone-book the admin invoice_pending row.
    await goToBookings(page);
    const adminBookingId = await createAdminInvoicePendingBooking(page);

    // Sanity: with no superseded bookings yet, the badge is hidden on
    // every nav entry.
    await expect(page.getByTestId("sidebar-badge")).toHaveCount(0);

    // 2. Park the admin on Awaiting coordination — i.e. NOT a view
    //    that renders the dashboard banner — so the only surface
    //    that can advertise the void queue is the sidebar badge.
    await clickNav(page, "Awaiting coordination");
    // The Awaiting coordination view does not render the banner, even
    // before the supersede fires.
    await expect(page.getByTestId("banner-invoice-voids")).toHaveCount(0);

    // 3. Drive the customer flow on the same unit so the supersede
    //    guard fires and marks the admin row with
    //    `supersededByBookingId`.
    await driveCustomerSubmitOnSameUnit(page);

    // 4. The sidebar now shows a pink badge on Bookings AND Payments
    //    (the banner lives at the top of both views, so both nav
    //    entries advertise the same queue) — and only on those two
    //    entries. The admin is still parked on Awaiting coordination,
    //    confirming the badge is the surface the admin sees.
    const bookingsBadge = badgeFor(page, "bookings");
    const paymentsBadge = badgeFor(page, "payments");
    await expect(bookingsBadge).toBeVisible();
    await expect(paymentsBadge).toBeVisible();
    await expect(bookingsBadge).toHaveText("1");
    await expect(paymentsBadge).toHaveText("1");
    // Only those two entries — no stray badges on the other views.
    await expect(page.getByTestId("sidebar-badge")).toHaveCount(2);
    // And the dashboard banner is still NOT rendered on this view.
    await expect(page.getByTestId("banner-invoice-voids")).toHaveCount(0);

    // 5. Click the Bookings nav (the badge is inside that button).
    //    Lands on the bookings view with the alert banner expanded
    //    listing the freshly-superseded admin row.
    await clickNav(page, "Bookings");
    const banner = page.getByTestId("banner-invoice-voids");
    await expect(banner).toBeVisible();
    const bannerRow = banner
      .getByTestId("banner-invoice-row")
      .filter({ has: page.locator(`[data-booking-id="${adminBookingId}"]`) });
    await expect(bannerRow).toBeVisible();
    await expect(bannerRow).toContainText(ADMIN_CUSTOMER_NAME);
    // Badge is still visible alongside the banner — same count, same
    // queue (the badge doesn't clear just because the admin opened
    // the view; only recording the void clears it).
    await expect(bookingsBadge).toHaveText("1");
    await expect(paymentsBadge).toHaveText("1");

    // 6. Record the void via the banner's inline acknowledge
    //    affordance — the existing race spec covers the BookingDetail
    //    path, this one keeps the focus on the badge transitions.
    await banner
      .getByTestId("banner-acknowledge")
      .and(page.locator(`[data-booking-id="${adminBookingId}"]`))
      .click();

    // 7. The banner disappears (no more pending voids) and so does
    //    every sidebar badge — the queue is empty again.
    await expect(page.getByTestId("banner-invoice-voids")).toHaveCount(0);
    await expect(page.getByTestId("sidebar-badge")).toHaveCount(0);

    // Bouncing back to a non-Bookings view should still show no
    // badges — guards against a stale-render regression where the
    // count would only refresh after a subsequent nav.
    await clickNav(page, "Awaiting coordination");
    await expect(page.getByTestId("sidebar-badge")).toHaveCount(0);
  });
});
