import { expect, test, type Page } from "@playwright/test";

/**
 * End-to-end regression test for the admin "Undo cancellation when the
 * original slot is still free" happy path.
 *
 * Sibling to {@link ./undo-cancel-conflict.spec.ts}, which covers the
 * pivot-into-reschedule branch when the slot was given away. Here we
 * lock in the simpler in-place restore: the operator cancels a
 * booking, immediately changes their mind, and the same row pops back
 * at its original date/window without any modal in the way.
 *
 * Walks the live admin mockup through:
 *   1. Cancel an existing booking (`bk-1042`, Henrik Olsen on `u1`,
 *      2026-04-29 morning) with a recognisable note.
 *   2. Immediately click "Undo cancellation" — no second customer
 *      has grabbed the slot, so the conflict dialog must NOT appear
 *      and the reschedule modal must stay closed.
 *   3. Assert the booking is restored at its original
 *      2026-04-29 · morning slot, the timeline carries the
 *      "Undo · {note}" entry, the undo affordance drops off, and
 *      the cancel affordance comes back.
 *
 * Seed-data references (see `state/adminMockData.ts`):
 *   - `bk-1042` — Henrik Olsen, unit `u1`, 2026-04-29 morning
 *   - `u1`     — "G01 / 335 Aspen Boulevard" on the Aspen rollout
 *               (`rl-ac-aspen`, time-budget capacity)
 */

const BASE_PATH = process.env.BASE_PATH ?? "/__mockup";
const ADMIN_URL = `${BASE_PATH}/preview/admin/AdminApp`;

const CANCEL_NOTE = "Customer rang back — keep the slot.";

const ORIGINAL_DATE = "2026-04-29";
const ORIGINAL_WINDOW = "morning";

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

test.describe("Admin · Undo cancellation when slot is still free", () => {
  test("restores the booking in place at the original slot with an Undo timeline entry", async ({
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

    // 2. Immediately click "Undo cancellation". Nobody else grabbed
    //    the slot, so this is the in-place restore branch — the
    //    conflict dialog must NOT surface and the reschedule modal
    //    must stay closed.
    await page.getByTestId("button-undo-cancel").click();

    await expect(page.getByTestId("modal-undo-conflict")).toHaveCount(0);
    await expect(page.getByTestId("modal-reschedule-booking")).toHaveCount(0);

    // 3. The booking is restored in place. The timeline carries the
    //    "Undo · {note}" entry that reuses the cancellation note,
    //    and the row is no longer cancelled — the undo button drops
    //    off, the cancel button comes back.
    const restoredLabel = `Undo · ${CANCEL_NOTE}`;
    await expect(page.getByText(restoredLabel)).toBeVisible();
    await expect(page.getByTestId("button-undo-cancel")).toHaveCount(0);
    await expect(page.getByTestId("button-open-cancel")).toBeVisible();

    // The original date / window are preserved — restoring in place
    // means capacity was re-consumed on the same slot, not a new one.
    // Scope to the SlotCell on the booking detail's Schedule card so
    // the assertion can't false-positive on the timeline label
    // ("Slot booked · 29 Apr · Morning") that appears elsewhere on
    // the page.
    const slotCell = page.getByTestId("slot-cell");
    await expect(slotCell).toContainText(ORIGINAL_DATE);
    await expect(slotCell).toContainText(new RegExp(ORIGINAL_WINDOW, "i"));
  });
});
