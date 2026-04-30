import { expect, test, type Page } from "@playwright/test";

/**
 * End-to-end regression test for the admin "Undo cancellation when the
 * slot was given away" pivot flow.
 *
 * Walks the live admin mockup through:
 *   1. Cancel an existing booking (`bk-1042`, Henrik Olsen on `u1`,
 *      2026-04-29 morning).
 *   2. Phone-book a second customer (Priya Sharma) into the same
 *      unit + slot the cancellation just freed.
 *   3. Reopen the cancelled booking and try to undo — the conflict
 *      dialog must surface, naming the squatter.
 *   4. Open the reschedule picker from the conflict dialog (undo
 *      mode), pick a different slot, confirm.
 *   5. Assert the cancelled booking is restored with the
 *      "Undo · {note} — restored to {date} · {window}" timeline
 *      entry, and that the second customer's booking is unchanged.
 *
 * Seed-data references (see `state/adminMockData.ts`):
 *   - `bk-1042` — Henrik Olsen, unit `u1`, 2026-04-29 morning
 *   - `u1`     — "G01 / 335 Aspen Boulevard" on the Aspen rollout
 *               (`rl-ac-aspen`, time-budget capacity)
 */

const BASE_PATH = process.env.BASE_PATH ?? "/__mockup";
const ADMIN_URL = `${BASE_PATH}/preview/admin/AdminApp`;

const CANCEL_NOTE = "Customer rang to cancel — needs new dates.";
const NEW_CUSTOMER_NAME = "Priya Sharma";
const NEW_CUSTOMER_EMAIL = "priya@example.com";
const NEW_CUSTOMER_PHONE = "0411 999 000";

const SHARED_DATE = "2026-04-29";
const RESTORE_DATE = "2026-05-01";

async function goToBookings(page: Page): Promise<void> {
  await page.goto(ADMIN_URL);
  await page.getByRole("button", { name: "Bookings", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: /Open booking bk-1042 for Henrik Olsen/i,
    }),
  ).toBeVisible();
}

async function openBooking(page: Page, id: string, name: string): Promise<void> {
  await page
    .getByRole("button", {
      name: new RegExp(`Open booking ${id} for ${name}`, "i"),
    })
    .click();
  // BookingDetail renders the id inside the "Booking ID" field —
  // wait on the back-to-list affordance instead, which only exists
  // on the detail screen.
  await expect(page.getByRole("button", { name: /Back to list/i })).toBeVisible();
}

test.describe("Admin · Undo cancellation when slot was given away", () => {
  test("conflict dialog pivots into reschedule (undo mode) and restores the booking on a new slot", async ({
    page,
  }) => {
    // 1. Cancel bk-1042 with a recognisable note so the restored
    //    timeline label can be asserted verbatim later on.
    await goToBookings(page);
    await openBooking(page, "bk-1042", "Henrik Olsen");

    await page.getByTestId("button-open-cancel").click();
    const cancelModal = page.getByTestId("modal-cancel-booking");
    await expect(cancelModal).toBeVisible();
    await cancelModal.getByTestId("textarea-cancel-note").fill(CANCEL_NOTE);
    await cancelModal.getByTestId("button-cancel-confirm").click();
    await expect(cancelModal).toBeHidden();

    // The undo affordance should now be available on the cancelled
    // booking — proves the cancellation actually landed.
    await expect(page.getByTestId("button-undo-cancel")).toBeVisible();

    // 2. Phone-book a second customer onto the freed slot
    //    (u1 · 2026-04-29 morning). NewBookingFlow sends us back
    //    to the bookings list on confirm.
    await page
      .getByRole("button", { name: /Back to list/i })
      .click();
    await page
      .getByRole("button", { name: "New booking", exact: true })
      .click();

    // Step 1 — Unit & customer
    await page
      .getByRole("button", { name: /G01 \/ 335 Aspen Boulevard/i })
      .first()
      .click();
    await page.getByPlaceholder("e.g. Sam Patel").fill(NEW_CUSTOMER_NAME);
    await page.getByPlaceholder("name@example.com").fill(NEW_CUSTOMER_EMAIL);
    await page.getByPlaceholder("0411 222 333").fill(NEW_CUSTOMER_PHONE);
    await page.getByRole("button", { name: /Continue/i }).click();

    // Step 2 — AC config (defaults match u1: ducted / 1 system / 1 extra)
    await page.getByRole("button", { name: /Continue/i }).click();

    // Step 3 — Schedule: pick the same morning slot bk-1042 just freed
    // Task #241: focus the calendar day to reveal its window picker.
    await page.getByTestId(`rollout-day-${SHARED_DATE}`).click();
    await page
      .getByTestId(`rollout-pick-slot-${SHARED_DATE}__morning`)
      .click();
    await page.getByRole("button", { name: /Continue/i }).click();

    // Step 4 — Review + confirm
    await page.getByRole("button", { name: /Create booking/i }).click();

    // Back on the bookings list. Reveal cancelled rows so we can
    // reopen bk-1042.
    await expect(
      page.getByRole("button", {
        name: new RegExp(`Open booking .* for ${NEW_CUSTOMER_NAME}`, "i"),
      }),
    ).toBeVisible();
    await page.getByRole("checkbox", { name: /Show cancelled/i }).check();
    await openBooking(page, "bk-1042", "Henrik Olsen");

    // 3. Try to undo — the original slot is taken, so the conflict
    //    dialog should surface naming the squatter.
    await page.getByTestId("button-undo-cancel").click();

    const conflict = page.getByTestId("modal-undo-conflict");
    await expect(conflict).toBeVisible();
    await expect(conflict).toContainText(NEW_CUSTOMER_NAME);
    await expect(conflict).toContainText(`${SHARED_DATE} · morning`);

    // 4. Pivot into reschedule (undo mode), pick a different slot.
    await page.getByTestId("button-undo-conflict-open-reschedule").click();
    await expect(conflict).toBeHidden();

    const rescheduleModal = page.getByTestId("modal-reschedule-booking");
    await expect(rescheduleModal).toBeVisible();
    await expect(rescheduleModal).toContainText(
      "Restore booking — pick a new slot",
    );
    // Sanity check: the explainer that's only rendered in undo mode.
    await expect(
      rescheduleModal.getByTestId("undo-reschedule-explainer"),
    ).toBeVisible();

    // Task #241: focus the calendar day for the restore slot first.
    // The reschedule modal pre-selects the booking's original slot,
    // so the panel needs to be re-focused on RESTORE_DATE.
    await rescheduleModal.getByTestId(`rollout-day-${RESTORE_DATE}`).click();
    await rescheduleModal
      .getByTestId(`rollout-pick-slot-${RESTORE_DATE}__morning`)
      .click();
    await rescheduleModal.getByTestId("button-confirm-undo-reschedule").click();
    await expect(rescheduleModal).toBeHidden();

    // 5. The booking is restored at the new slot and the undo
    //    timeline entry uses the original cancellation note. The
    //    BookingDetail screen stays open after the modal closes —
    //    wait on the timeline entry directly.
    const restoredLabel =
      `Undo · ${CANCEL_NOTE} — restored to ${RESTORE_DATE} · morning`;
    await expect(page.getByText(restoredLabel)).toBeVisible();
    // The undo affordance drops off once the booking is no longer
    // cancelled — belt-and-suspenders that we landed in "restored",
    // not still-cancelled state.
    await expect(page.getByTestId("button-undo-cancel")).toHaveCount(0);
    // The cancel affordance comes back, again confirming the row
    // is no longer cancelled.
    await expect(page.getByTestId("button-open-cancel")).toBeVisible();

    // The second booking is untouched — same customer, same slot.
    await page
      .getByRole("button", { name: /Back to list/i })
      .click();
    const squatterRowName = new RegExp(
      `Open booking .* for ${NEW_CUSTOMER_NAME}`,
      "i",
    );
    await expect(page.getByRole("button", { name: squatterRowName })).toBeVisible();
    await page.getByRole("button", { name: squatterRowName }).click();
    await expect(page.getByText(NEW_CUSTOMER_NAME).first()).toBeVisible();
    await expect(page.getByText(NEW_CUSTOMER_EMAIL).first()).toBeVisible();
    // Service date / slot for the second booking didn't move.
    await expect(page.getByText(SHARED_DATE).first()).toBeVisible();
    await expect(page.getByText(/morning/i).first()).toBeVisible();
  });
});
