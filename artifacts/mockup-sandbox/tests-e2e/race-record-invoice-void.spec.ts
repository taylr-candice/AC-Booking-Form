import { expect, test, type Page } from "@playwright/test";

/**
 * End-to-end regression test for the admin "race + record invoice
 * void" lifecycle (Tasks #49 + #71): when a customer wins the race
 * for a unit while an admin's `invoice_pending` booking is still
 * outstanding, the admin shell auto-cancels the prior booking,
 * surfaces the void-needed banner on the bookings list, and lets
 * the admin clear the alert by recording the void from
 * BookingDetail.
 *
 * Walks the live admin mockup through:
 *   1. Phone-book an `invoice_pending` admin booking on
 *      `u-aspen-02` (G02 / 335 Aspen Boulevard) for a fresh
 *      customer (Henrik Test) on 2026-05-04 morning.
 *   2. Drive the customer-side booking flow on the same unit
 *      (different slot, so the only conflict is the unit-level
 *      uniqueness check) by reaching into the in-page
 *      `bookingSession` module via dynamic import — the admin
 *      shell has registered its uniqueness guard on the same
 *      module instance, so `submitBooking()` triggers the
 *      supersede branch (cancel + free capacity + stamp
 *      `supersededByBookingId`).
 *   3. Assert the "Invoices that need cancelling in billing"
 *      banner is visible at the top of the bookings list with
 *      the admin booking row.
 *   4. Click banner Open → BookingDetail → "Record invoice void"
 *      and assert:
 *        - the per-booking supersede alert disappears
 *        - the service timeline gained the
 *          "Invoice supersede acknowledged · void recorded" entry
 *        - back on the bookings list, the banner is gone
 *
 * Seed-data references (see `state/adminMockData.ts`):
 *   - `u-aspen-02` — "G02 / 335 Aspen Boulevard", ducted/1/0,
 *     no seeded bookings, on the Aspen rollout (`rl-ac-aspen`)
 *   - Aspen rollout dates: 2026-04-27 .. 2026-05-09
 *   - `nextBookingId` starts at max(1042, …) + 1; with current
 *     seed the highest id is `bk-1044`, so the freshly-created
 *     admin booking will land as `bk-1045`. The test asserts on
 *     the customer name regex rather than the id, so it stays
 *     resilient if the seed grows again.
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

const TIMELINE_VOID_LABEL = "Invoice supersede acknowledged · void recorded";

async function goToBookings(page: Page): Promise<void> {
  await page.goto(ADMIN_URL);
  await page.getByRole("button", { name: "Bookings", exact: true }).click();
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
 * Mirrors the New Booking flow walk in `undo-cancel-conflict.spec.ts`.
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

test.describe("Admin · race + record invoice void lifecycle", () => {
  test("supersede guard cancels admin booking, banner appears, BookingDetail records the void and the alert clears", async ({
    page,
  }) => {
    // 1. Create the admin invoice_pending booking on u-aspen-02.
    await goToBookings(page);
    const adminBookingId = await createAdminInvoicePendingBooking(page);

    // 2. Drive the customer flow on the same unit (different slot)
    //    so the supersede guard fires.
    await driveCustomerSubmitOnSameUnit(page);

    // 3. The banner should appear at the top of the bookings list,
    //    listing the freshly-superseded admin row.
    const banner = page.getByTestId("banner-invoice-voids");
    await expect(banner).toBeVisible();
    const bannerRow = banner
      .getByTestId("banner-invoice-row")
      .filter({ has: page.locator(`[data-booking-id="${adminBookingId}"]`) });
    await expect(bannerRow).toBeVisible();
    await expect(bannerRow).toContainText(ADMIN_CUSTOMER_NAME);

    // 4. Click Open → BookingDetail. The per-booking supersede alert
    //    is visible there.
    await banner
      .getByTestId("banner-open")
      .and(page.locator(`[data-booking-id="${adminBookingId}"]`))
      .click();
    await expect(
      page.getByRole("button", { name: /Back to list/i }),
    ).toBeVisible();
    await expect(page.getByTestId("alert-supersede")).toBeVisible();

    // 5. Record the invoice void.
    await page.getByTestId("alert-supersede-acknowledge").click();

    // The per-booking supersede alert disappears…
    await expect(page.getByTestId("alert-supersede")).toHaveCount(0);
    // …and the service timeline gained the void-recorded entry.
    await expect(page.getByText(TIMELINE_VOID_LABEL)).toBeVisible();

    // 6. Back on the bookings list, the banner is gone — the admin
    //    row was the only superseded booking pending a void.
    await page.getByRole("button", { name: /Back to list/i }).click();
    await expect(page.getByTestId("banner-invoice-voids")).toHaveCount(0);
  });
});
