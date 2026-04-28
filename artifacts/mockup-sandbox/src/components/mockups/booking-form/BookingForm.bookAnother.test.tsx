// @vitest-environment happy-dom
/**
 * UI-level regression tests for the "Book another" button on the booking
 * confirmation screen.
 *
 * Spec §12: from either terminal screen (the standard "Booking confirmed"
 * for scheduled flows or the "Payment received" for coordination flows),
 * a returning user can hit "Book another" and start a fresh booking with
 * their identity-level fields (role, agency, contact name / email /
 * mobile) carried over and everything else (unit, AC counts, access
 * method, signature, schedule) wiped.
 *
 * The store-level contract is pinned by `bookingSession.bookAnother.test.ts`.
 * These tests pin the *UI surface*: that the button on the confirmation
 * terminal in `BookingForm.tsx` is wired to the identity-preserving
 * `bookAnother` handler — and not, say, to the full `reset` (which would
 * wipe contact details too) or to nothing at all. A regression in that
 * wiring would be invisible without a test driving the actual button.
 *
 * The component holds its booking state in local React state, so we have
 * to drive the form end-to-end via the rendered UI to observe both
 * preservation and wipe.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";

import { BookingForm } from "./BookingForm";
import { bookingActions } from "@/state/bookingSession";

// ─── Polyfills happy-dom doesn't ship for Radix's pointer-event APIs ──────
// Radix Popover / Select probe these on the trigger element to manage
// pointer capture. happy-dom doesn't implement them; we install no-op /
// false-returning stubs so the components don't blow up when clicked.
type PointerCaps = {
  hasPointerCapture?: (id: number) => boolean;
  setPointerCapture?: (id: number) => void;
  releasePointerCapture?: (id: number) => void;
  scrollIntoView?: () => void;
};
function installRadixDomShims() {
  const proto = globalThis.Element?.prototype as PointerCaps | undefined;
  if (!proto) return;
  if (typeof proto.hasPointerCapture !== "function") {
    proto.hasPointerCapture = () => false;
  }
  if (typeof proto.setPointerCapture !== "function") {
    proto.setPointerCapture = () => {};
  }
  if (typeof proto.releasePointerCapture !== "function") {
    proto.releasePointerCapture = () => {};
  }
  if (typeof proto.scrollIntoView !== "function") {
    proto.scrollIntoView = () => {};
  }
}

// ─── Test helpers ──────────────────────────────────────────────────────────

const OWNER_CONTACT = {
  firstName: "Sam",
  lastName: "Lee",
  email: "sam@example.com",
  mobile: "0411222333",
};

const AGENT_CONTACT = {
  firstName: "Robin",
  lastName: "Park",
  email: "robin@agency.test",
  mobile: "0455666777",
};

const AGENT_AGENCY_ID = "a2";

/**
 * Click the Step 1 unit popover and pick the unit with the given id.
 *
 * Mirrors what a real user does: open the search popover, type into it
 * (so the cmdk filter has something to match), and click the unit row.
 */
async function pickUnit(user: UserEvent, unitId: string) {
  await user.click(screen.getByTestId("button-select-unit"));
  // Each unit row is rendered with `data-testid="option-unit-${id}"`.
  // findBy* waits for the popover content to mount.
  const option = await screen.findByTestId(`option-unit-${unitId}`);
  await user.click(option);
}

/**
 * Type-and-blur into a field via its data-testid. Centralised so any
 * future "what counts as committed input" change (e.g. trim / blur
 * handlers) only has to be updated here.
 */
async function typeInto(user: UserEvent, testId: string, value: string) {
  const input = screen.getByTestId(testId) as HTMLInputElement;
  await user.clear(input);
  await user.type(input, value);
}

/** Click the wizard's Next button. Throws (via getBy) if it isn't there. */
async function clickNext(user: UserEvent) {
  await user.click(screen.getByTestId("button-next"));
}

/**
 * Drive the form from a fresh render through to the confirmed terminal
 * for an OWNER picking the simplest "I'll be at the unit" access path.
 *
 * Uses unit `u1`, which has saved AC counts (2 systems + 1 additional)
 * — non-default values so we can later eyeball that the AC step really
 * was wiped to {1, 0} after `bookAnother`.
 */
async function driveOwnerToConfirmedTerminal(user: UserEvent) {
  // Step 1 — unit + role
  await pickUnit(user, "u1");
  await user.click(screen.getByTestId("button-role-owner"));
  await clickNext(user);

  // Step 2 — contact details
  await typeInto(user, "input-first-name", OWNER_CONTACT.firstName);
  await typeInto(user, "input-last-name", OWNER_CONTACT.lastName);
  await typeInto(user, "input-email", OWNER_CONTACT.email);
  await typeInto(user, "input-mobile", OWNER_CONTACT.mobile);
  await clickNext(user);

  // Step 3 — AC counts. u1 seeded 2/1; bump systems once so the
  // pre-bookAnother state has clearly-non-default values.
  await user.click(screen.getByTestId("button-systems-inc"));
  expect(screen.getByTestId("text-systems-value")).toHaveTextContent("3");
  await clickNext(user);

  // Step 4 — owner / live_in / "I'll be at the unit" (no follow-ups,
  // no signature required → the simplest happy path).
  await user.click(screen.getByTestId("button-owner-live-in"));
  await user.click(screen.getByTestId("radio-owner_present"));
  await clickNext(user);

  // Step 5 — schedule. Pick the morning slot of the first available date.
  const slots = screen.getAllByTestId(/^slot-.*-am$/);
  const firstOpenAm = slots.find((el) => !(el as HTMLButtonElement).disabled);
  if (!firstOpenAm) {
    throw new Error("Test fixture has no open morning slots — adjust SLOTS in BookingForm.tsx.");
  }
  await user.click(firstOpenAm);
  await clickNext(user);

  // Step 6 — pay
  await user.click(screen.getByTestId("button-pay"));
  // Terminal title nails down which terminal we landed on.
  expect(await screen.findByTestId("text-terminal-title")).toHaveTextContent("Booking confirmed");
}

/**
 * Drive the form from a fresh render through to the coordination
 * terminal ("Payment received") for an AGENT arranging access via the
 * tenant — that path skips Step 5 (Schedule) and lands on the
 * coordination variant of the terminal.
 */
async function driveAgentToCoordinationTerminal(user: UserEvent) {
  // Step 1 — unit + role
  await pickUnit(user, "u3");
  await user.click(screen.getByTestId("button-role-agent"));
  await clickNext(user);

  // Step 2 — agency + contact details. Agent flow requires both.
  // Open the agency Select and pick AGENT_AGENCY_ID.
  await user.click(screen.getByTestId("select-agency"));
  await user.click(await screen.findByTestId(`option-agency-${AGENT_AGENCY_ID}`));
  await typeInto(user, "input-first-name", AGENT_CONTACT.firstName);
  await typeInto(user, "input-last-name", AGENT_CONTACT.lastName);
  await typeInto(user, "input-email", AGENT_CONTACT.email);
  await typeInto(user, "input-mobile", AGENT_CONTACT.mobile);
  await clickNext(user);

  // Step 3 — AC counts. u3 seeded 1/0; nothing to do (already valid).
  await clickNext(user);

  // Step 4 — agent → "Please arrange with tenant" (coordination).
  // Requires a tenant + signature.
  await user.click(screen.getByTestId("radio-arrange_tenant_agent"));
  await typeInto(user, "input-tenant-firstname-0", "Casey");
  await typeInto(user, "input-tenant-lastname-0", "Tenant");
  await typeInto(user, "input-tenant-email-0", "casey@tenant.test");
  await typeInto(user, "input-tenant-phone-0", "0488111222");
  await user.click(screen.getByTestId("checkbox-sig-agree"));
  await typeInto(user, "input-sig-name", `${AGENT_CONTACT.firstName} ${AGENT_CONTACT.lastName}`);
  await clickNext(user);

  // Coordination skips Step 5 → straight to Step 6 (Review & pay).
  await user.click(screen.getByTestId("button-pay"));
  expect(await screen.findByTestId("text-terminal-title")).toHaveTextContent("Payment received");
}

// ─── Setup ─────────────────────────────────────────────────────────────────

installRadixDomShims();

beforeEach(() => {
  // BookingForm.bookAnother also pokes the shared store; reset it so
  // tests can't bleed state into each other.
  bookingActions.reset();
});

afterEach(() => {
  cleanup();
  bookingActions.reset();
});

// ─── Confirmed terminal ────────────────────────────────────────────────────

describe("BookingForm — 'Book another' on the confirmed terminal", () => {
  it("returns the user to Step 1 with no unit selected, but keeps role + contact across the reset", async () => {
    const user = userEvent.setup();
    render(<BookingForm />);

    await driveOwnerToConfirmedTerminal(user);

    // Click the button under test.
    await user.click(screen.getByTestId("button-book-another"));

    // ── Back on Step 1, no unit selected ───────────────────────────
    // The Step 1 heading and the empty-state placeholder for the unit
    // picker prove we're on a fresh Step 1 with `unitId === null`.
    // (If the wiring had been pointed at `reset`, we'd still be on
    //  Step 1 with no unit — but the contact assertions below would
    //  then fail. If it had been pointed at nothing, we'd still be on
    //  the terminal screen and `getByTestId("button-select-unit")`
    //  would throw.)
    expect(screen.getByText("Which unit is this booking for?")).toBeInTheDocument();
    const unitButton = screen.getByTestId("button-select-unit");
    expect(within(unitButton).getByText("Search units…")).toBeInTheDocument();
    expect(screen.queryByTestId("text-selected-unit-address")).not.toBeInTheDocument();
    // Stepper highlights step 1 only — no other step is "current".
    expect(screen.getByTestId("stepper-step-1")).toHaveClass("bg-pink-50");

    // ── Role carried over ──────────────────────────────────────────
    // The role chooser only appears once a unit is selected. Pick a
    // *different* unit (`u4`, no saved AC counts) so we can re-enter
    // the wizard and observe the carried-over role + contact.
    await pickUnit(user, "u4");
    expect(screen.getByTestId("button-role-owner")).toHaveClass("border-pink-300");
    expect(screen.getByTestId("button-role-agent")).not.toHaveClass("border-pink-300");
    await clickNext(user);

    // ── Contact carried over (Step 2) ──────────────────────────────
    expect(screen.getByTestId("input-first-name")).toHaveValue(OWNER_CONTACT.firstName);
    expect(screen.getByTestId("input-last-name")).toHaveValue(OWNER_CONTACT.lastName);
    expect(screen.getByTestId("input-email")).toHaveValue(OWNER_CONTACT.email);
    expect(screen.getByTestId("input-mobile")).toHaveValue(OWNER_CONTACT.mobile);
    // Step 2 should be valid immediately because every field carried
    // over — Next is enabled without any further typing.
    expect(screen.getByTestId("button-next")).toBeEnabled();
    await clickNext(user);

    // ── AC counts wiped (Step 3) ───────────────────────────────────
    // Pre-bookAnother we left systems at 3 (u1 seed of 2 + one inc).
    // u4 has no saved counts, so a wipe-then-reseed lands on the
    // initial defaults of 1 / 0. If `bookAnother` had failed to wipe
    // the AC step, the previous 3 / 1 would have leaked through (the
    // unit picker only re-seeds if the unit id actually changes, and
    // we did change to u4 — so this assertion is most informative
    // about the additional-indoor count, which u4 doesn't reseed
    // away from whatever was already there. Either way, both being
    // reset is the user-visible contract.)
    expect(screen.getByTestId("text-systems-value")).toHaveTextContent("1");
    expect(screen.getByTestId("text-additional-value")).toHaveTextContent("0");
    await clickNext(user);

    // ── Access method wiped (Step 4) ───────────────────────────────
    // The owner / live-in selection from the previous booking is gone:
    // the access-method radios are hidden until ownerType is chosen
    // again, and Next is therefore disabled.
    expect(screen.queryByTestId("radio-owner_present")).not.toBeInTheDocument();
    expect(screen.getByTestId("button-next")).toBeDisabled();

    // ── Schedule wiped (Step 5) ────────────────────────────────────
    // Re-pick the same access path so we can advance to Step 5 and
    // confirm no slot is carried over from the previous booking.
    await user.click(screen.getByTestId("button-owner-live-in"));
    await user.click(screen.getByTestId("radio-owner_present"));
    await clickNext(user);
    // No slot should be pre-selected: a selected slot picks up the
    // brand pink-300 border, so none of the rendered slots should
    // have that class. As a belt-and-braces second check, Next is
    // disabled (Step 5 only validates with a chosen slot).
    const allSlots = screen.getAllByTestId(/^slot-.*-(am|pm)$/);
    expect(allSlots.length).toBeGreaterThan(0);
    for (const s of allSlots) {
      expect(s).not.toHaveClass("border-pink-300");
    }
    expect(screen.getByTestId("button-next")).toBeDisabled();
  });
});

// ─── Coordination terminal ─────────────────────────────────────────────────

describe("BookingForm — 'Book another' on the coordination terminal", () => {
  it("returns the user to Step 1 with no unit, keeps role + agency + contact, and wipes the rest", async () => {
    const user = userEvent.setup();
    render(<BookingForm />);

    await driveAgentToCoordinationTerminal(user);

    // Click the coordination-variant button (different testid from
    // the confirmed-terminal button — both must work the same way).
    await user.click(screen.getByTestId("button-book-another-coord"));

    // ── Back on Step 1, no unit selected ───────────────────────────
    expect(screen.getByText("Which unit is this booking for?")).toBeInTheDocument();
    const unitButton = screen.getByTestId("button-select-unit");
    expect(within(unitButton).getByText("Search units…")).toBeInTheDocument();
    expect(screen.queryByTestId("text-selected-unit-address")).not.toBeInTheDocument();

    // ── Role carried over ──────────────────────────────────────────
    await pickUnit(user, "u2");
    expect(screen.getByTestId("button-role-agent")).toHaveClass("border-pink-300");
    expect(screen.getByTestId("button-role-owner")).not.toHaveClass("border-pink-300");
    await clickNext(user);

    // ── Agency + contact carried over (Step 2) ─────────────────────
    // The agency Select renders the chosen agency's name into its
    // trigger when a value is set — checking for that name proves
    // the agency_id was preserved.
    const agencyTrigger = screen.getByTestId("select-agency");
    expect(within(agencyTrigger).getByText("Ray White City Living")).toBeInTheDocument();
    expect(screen.getByTestId("input-first-name")).toHaveValue(AGENT_CONTACT.firstName);
    expect(screen.getByTestId("input-last-name")).toHaveValue(AGENT_CONTACT.lastName);
    expect(screen.getByTestId("input-email")).toHaveValue(AGENT_CONTACT.email);
    expect(screen.getByTestId("input-mobile")).toHaveValue(AGENT_CONTACT.mobile);
    expect(screen.getByTestId("button-next")).toBeEnabled();
    await clickNext(user);

    // Step 3 — u2 has no saved counts, so a fresh seed of 1/0 here
    // also confirms the wipe (we never incremented in this flow, so
    // the more interesting wipe is on Step 4 below).
    expect(screen.getByTestId("text-systems-value")).toHaveTextContent("1");
    expect(screen.getByTestId("text-additional-value")).toHaveTextContent("0");
    await clickNext(user);

    // ── Access method, signature, tenants all wiped (Step 4) ───────
    // For an agent there's no "do you live here?" layer, so the
    // access-method radios are visible immediately — but none of
    // them should be selected. The Radix radio's `aria-checked`
    // attribute is the user-visible signal of selection.
    const tenantRadioInput = within(
      screen.getByTestId("radio-arrange_tenant_agent"),
    ).getByRole("radio");
    expect(tenantRadioInput).toHaveAttribute("aria-checked", "false");
    // The tenant inputs and signature block only render once a
    // method needing them is chosen, so their absence on a fresh
    // Step 4 confirms the previous booking's selections are gone.
    expect(screen.queryByTestId("input-tenant-firstname-0")).not.toBeInTheDocument();
    expect(screen.queryByTestId("checkbox-sig-agree")).not.toBeInTheDocument();
    expect(screen.queryByTestId("input-sig-name")).not.toBeInTheDocument();
    // And, belt-and-braces, Step 4 isn't valid yet — Next is
    // disabled because no access method is selected.
    expect(screen.getByTestId("button-next")).toBeDisabled();
  });
});
