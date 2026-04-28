// @vitest-environment happy-dom
/**
 * UI-level regression test for the "Try again" button on the
 * "Payment cancelled" terminal in `BookingForm.tsx`.
 *
 * Spec: a cancelled checkout means *no* booking was actually made — the
 * user just bounced off the payment screen. Sending them back to Step 6
 * (Review & pay) with every previous answer intact is what the screen
 * is for, and the alternative — silently wiping their unit / AC /
 * access / signature / schedule answers — is the exact frustration we
 * want to avoid.
 *
 * The button (`button-try-again`) is currently wired to a small inline
 * handler that only clears `terminal`. A regression that mistakenly
 * pointed it at `bookAnother` (preserves only identity) or `reset`
 * (preserves nothing) would silently destroy the user's progress; the
 * existing `BookingForm.bookAnother.test.tsx` only pins the two
 * terminal screens that *do* reset, not this one.
 *
 * The component holds its booking state in local React state, so we
 * have to drive the form end-to-end via the rendered UI to observe
 * preservation. We assert preservation through Step 6's Review screen
 * (which renders unit / role / booker / AC counts / access method /
 * service time as plain text) plus, for the agent-coordination case,
 * also via the persisted access-method radio + tenant fields + signed
 * name + agreement checkbox after stepping back.
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
const AGENT_AGENCY_NAME = "Ray White City Living";

// Unit addresses from the UNITS fixture in BookingForm.tsx — used to
// assert post-Try-again that the previously chosen unit identity
// survived the cancel.
const UNIT_U1_ADDRESS = "12 / 88 Marine Parade, Coogee NSW 2034";
const UNIT_U3_ADDRESS = "705 / 21 Bourke Street, Surry Hills NSW 2010";

const TENANT = {
  firstName: "Casey",
  lastName: "Tenant",
  email: "casey@tenant.test",
  phone: "0488111222",
};

/** Open the Step 1 unit popover and click the unit row with the given id. */
async function pickUnit(user: UserEvent, unitId: string) {
  await user.click(screen.getByTestId("button-select-unit"));
  const option = await screen.findByTestId(`option-unit-${unitId}`);
  await user.click(option);
}

/** Type-and-blur into a field via its data-testid. */
async function typeInto(user: UserEvent, testId: string, value: string) {
  const input = screen.getByTestId(testId) as HTMLInputElement;
  await user.clear(input);
  await user.type(input, value);
}

/** Click the wizard's Next button. Throws (via getBy) if it isn't there. */
async function clickNext(user: UserEvent) {
  await user.click(screen.getByTestId("button-next"));
}

// ─── Setup ─────────────────────────────────────────────────────────────────

installRadixDomShims();

beforeEach(() => {
  // BookingForm.bookAnother also pokes the shared store; reset it so
  // tests can't bleed state into each other (we don't expect Try again
  // to touch the store, but resetting keeps this test independent of
  // anything left behind by other suites or earlier iterations).
  bookingActions.reset();
});

afterEach(() => {
  cleanup();
  bookingActions.reset();
});

// ─── Owner happy-path: schedule preserved ──────────────────────────────────

describe("BookingForm — 'Try again' on the cancelled-payment terminal (owner / scheduled flow)", () => {
  it("returns the user to Step 6 with unit, role, contact, AC counts, access method and chosen slot intact, and Pay now still works", async () => {
    const user = userEvent.setup();
    render(<BookingForm />);

    // ── Step 1: unit + role ────────────────────────────────────────
    await pickUnit(user, "u1");
    await user.click(screen.getByTestId("button-role-owner"));
    await clickNext(user);

    // ── Step 2: contact details ────────────────────────────────────
    await typeInto(user, "input-first-name", OWNER_CONTACT.firstName);
    await typeInto(user, "input-last-name", OWNER_CONTACT.lastName);
    await typeInto(user, "input-email", OWNER_CONTACT.email);
    await typeInto(user, "input-mobile", OWNER_CONTACT.mobile);
    await clickNext(user);

    // ── Step 3: AC counts. u1 seeds 2/1 — bump systems once and
    //     additional once so the post-Try-again state has clearly
    //     non-default values to observe (3 systems / 2 additional).
    await user.click(screen.getByTestId("button-systems-inc"));
    await user.click(screen.getByTestId("button-additional-inc"));
    expect(screen.getByTestId("text-systems-value")).toHaveTextContent("3");
    expect(screen.getByTestId("text-additional-value")).toHaveTextContent("2");
    await clickNext(user);

    // ── Step 4: owner / live-in / "I'll be at the unit" ────────────
    await user.click(screen.getByTestId("button-owner-live-in"));
    await user.click(screen.getByTestId("radio-owner_present"));
    await clickNext(user);

    // ── Step 5: pick the morning slot of the first open date and
    //     remember its testid (e.g. `slot-2026-05-04-am`) so we can
    //     later step back here and confirm the *same* slot is still
    //     chosen.
    const slots = screen.getAllByTestId(/^slot-.*-am$/);
    const firstOpenAm = slots.find((el) => !(el as HTMLButtonElement).disabled);
    if (!firstOpenAm) {
      throw new Error("Test fixture has no open morning slots — adjust SLOTS in BookingForm.tsx.");
    }
    const chosenSlotTestId = firstOpenAm.getAttribute("data-testid")!;
    await user.click(firstOpenAm);
    await clickNext(user);

    // ── Step 6: capture the total so we can compare it later. We're
    //     definitely on Step 6 now: the stepper highlights step 6 and
    //     the Pay button is rendered.
    expect(screen.getByTestId("stepper-step-6")).toHaveClass("bg-pink-50");
    const totalBefore = screen.getByTestId("text-total-final").textContent;
    expect(totalBefore).toMatch(/\$\d+/);
    expect(screen.getByTestId("button-pay")).toBeEnabled();

    // ── Bounce off payment via the mockup's "Simulate cancelled
    //     payment" affordance and confirm the terminal screen.
    await user.click(screen.getByTestId("button-cancel-payment"));
    expect(await screen.findByTestId("text-terminal-title")).toHaveTextContent("Payment cancelled");
    // Sanity: the confirmed-terminal "Book another" button is *not*
    // rendered here — only "Try again" is.
    expect(screen.queryByTestId("button-book-another")).not.toBeInTheDocument();
    expect(screen.queryByTestId("button-book-another-coord")).not.toBeInTheDocument();

    // ── Click the button under test ────────────────────────────────
    await user.click(screen.getByTestId("button-try-again"));

    // ── Back on Step 6, NOT Step 1 ─────────────────────────────────
    // The terminal's gone, the Step 6 stepper pip is the current one
    // again, and the Pay button is back. (If the wiring had been
    // pointed at `bookAnother` or `reset`, we'd have landed on Step 1
    // with no `button-pay` and no Review heading — both checks below
    // would throw.)
    expect(screen.queryByTestId("text-terminal-title")).not.toBeInTheDocument();
    expect(screen.getByTestId("stepper-step-6")).toHaveClass("bg-pink-50");
    expect(screen.getByText("Review and pay")).toBeInTheDocument();

    // ── Every Step-6 review row shows the previously entered value ─
    // The Review screen renders unit address, role, booker name +
    // contact, AC counts, access method and the chosen slot as plain
    // text — so an assertion per row pins the whole preservation
    // contract in one place. (If the handler had wiped state, none
    // of these strings would still be on screen.)
    // Unit identity survived the cancel — the Step 6 review row
    // renders the chosen unit's address verbatim and its lot label.
    // (A regression that cleared `unitId` while preserving everything
    // else would still pass the role / contact / AC checks below, so
    // this assertion has to be explicit.)
    expect(screen.getByText(UNIT_U1_ADDRESS)).toBeInTheDocument();
    expect(screen.getByText("Lot 12")).toBeInTheDocument();
    expect(
      screen.getByText(`${OWNER_CONTACT.firstName} ${OWNER_CONTACT.lastName}`),
    ).toBeInTheDocument();
    expect(
      screen.getByText(`${OWNER_CONTACT.email} · ${OWNER_CONTACT.mobile}`),
    ).toBeInTheDocument();
    expect(screen.getByText("Owner")).toBeInTheDocument();
    expect(screen.getByText("3 systems + 2 additional indoor units")).toBeInTheDocument();
    expect(screen.getByText("I'll be at the unit")).toBeInTheDocument();
    // Step 6 renders the chosen slot's window as "morning window"
    // (CSS capitalises it). Its presence proves a slot survived the
    // cancel — the stepper-walk-back below pins down *which* slot.
    expect(screen.getByText("morning window")).toBeInTheDocument();

    // Total didn't change either — same systems/additional counts ⇒
    // same total string as before the cancel.
    expect(screen.getByTestId("text-total-final")).toHaveTextContent(totalBefore!);

    // Belt-and-braces: walk back to Step 5 via the stepper and
    // confirm the previously chosen slot is still selected (selected
    // slots get the brand pink-300 border class).
    await user.click(screen.getByTestId("stepper-step-5"));
    expect(screen.getByTestId(chosenSlotTestId)).toHaveClass("border-pink-300");

    // Walk forward to Step 6 again and re-run the payment — this
    // time successfully — to prove the wizard is fully functional
    // after the bounce.
    await clickNext(user);
    expect(screen.getByTestId("stepper-step-6")).toHaveClass("bg-pink-50");
    const payBtn = screen.getByTestId("button-pay");
    expect(payBtn).toBeEnabled();
    await user.click(payBtn);
    expect(await screen.findByTestId("text-terminal-title")).toHaveTextContent("Booking confirmed");
  });
});

// ─── Agent coordination flow: signature + tenant fields preserved ──────────

describe("BookingForm — 'Try again' on the cancelled-payment terminal (agent / coordination flow)", () => {
  it("returns the user to Step 6 with agency, signature and tenant access details intact, and Pay now still works", async () => {
    const user = userEvent.setup();
    render(<BookingForm />);

    // ── Step 1: unit + role (agent) ────────────────────────────────
    await pickUnit(user, "u3");
    await user.click(screen.getByTestId("button-role-agent"));
    await clickNext(user);

    // ── Step 2: agency + contact details ───────────────────────────
    await user.click(screen.getByTestId("select-agency"));
    await user.click(await screen.findByTestId(`option-agency-${AGENT_AGENCY_ID}`));
    await typeInto(user, "input-first-name", AGENT_CONTACT.firstName);
    await typeInto(user, "input-last-name", AGENT_CONTACT.lastName);
    await typeInto(user, "input-email", AGENT_CONTACT.email);
    await typeInto(user, "input-mobile", AGENT_CONTACT.mobile);
    await clickNext(user);

    // ── Step 3: AC counts. u3 seeds 1/0; nothing to do.
    await clickNext(user);

    // ── Step 4: agent → "Arrange with tenant" (coordination path).
    //     Requires a tenant + signature.
    await user.click(screen.getByTestId("radio-arrange_tenant_agent"));
    await typeInto(user, "input-tenant-firstname-0", TENANT.firstName);
    await typeInto(user, "input-tenant-lastname-0", TENANT.lastName);
    await typeInto(user, "input-tenant-email-0", TENANT.email);
    await typeInto(user, "input-tenant-phone-0", TENANT.phone);
    await user.click(screen.getByTestId("checkbox-sig-agree"));
    const signedName = `${AGENT_CONTACT.firstName} ${AGENT_CONTACT.lastName}`;
    await typeInto(user, "input-sig-name", signedName);
    await clickNext(user);

    // ── Step 6 (coordination skips Step 5). For coordination flows
    //     the stepper renders 5 pips (Schedule is dropped), so the
    //     "current" pip on Step 6 is `stepper-step-5`.
    expect(screen.getByTestId("stepper-step-5")).toHaveClass("bg-pink-50");
    const totalBefore = screen.getByTestId("text-total-final").textContent;
    expect(totalBefore).toMatch(/\$\d+/);
    expect(screen.getByTestId("button-pay")).toBeEnabled();

    // ── Bounce off payment ─────────────────────────────────────────
    await user.click(screen.getByTestId("button-cancel-payment"));
    expect(await screen.findByTestId("text-terminal-title")).toHaveTextContent("Payment cancelled");

    // ── Click the button under test ────────────────────────────────
    await user.click(screen.getByTestId("button-try-again"));

    // ── Back on Step 6, NOT Step 1 ─────────────────────────────────
    expect(screen.queryByTestId("text-terminal-title")).not.toBeInTheDocument();
    expect(screen.getByTestId("stepper-step-5")).toHaveClass("bg-pink-50");
    expect(screen.getByText("Review and pay")).toBeInTheDocument();

    // ── Review screen shows the agent's preserved answers ──────────
    // Unit identity survived (address + lot, same rationale as the
    // owner test).
    expect(screen.getByText(UNIT_U3_ADDRESS)).toBeInTheDocument();
    expect(screen.getByText("Lot 705")).toBeInTheDocument();
    expect(screen.getByText("Agent / Property Manager")).toBeInTheDocument();
    expect(screen.getByText(AGENT_AGENCY_NAME)).toBeInTheDocument();
    expect(screen.getByText(`${AGENT_CONTACT.firstName} ${AGENT_CONTACT.lastName}`)).toBeInTheDocument();
    expect(
      screen.getByText(`${AGENT_CONTACT.email} · ${AGENT_CONTACT.mobile}`),
    ).toBeInTheDocument();
    expect(screen.getByText("1 system")).toBeInTheDocument();
    expect(screen.getByText("Arrange with tenant")).toBeInTheDocument();
    expect(screen.getByText("1 tenant on file")).toBeInTheDocument();
    expect(screen.getByTestId("text-total-final")).toHaveTextContent(totalBefore!);

    // ── Walk back to Step 4 to confirm signature + tenant fields
    //     survived the cancel. (coordination's Step-6 review row
    //     summarises tenant count but doesn't re-render their
    //     details, so we have to step back to see them.)
    await user.click(screen.getByTestId("stepper-step-4"));
    const tenantRadioInput = within(
      screen.getByTestId("radio-arrange_tenant_agent"),
    ).getByRole("radio");
    expect(tenantRadioInput).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("input-tenant-firstname-0")).toHaveValue(TENANT.firstName);
    expect(screen.getByTestId("input-tenant-lastname-0")).toHaveValue(TENANT.lastName);
    expect(screen.getByTestId("input-tenant-email-0")).toHaveValue(TENANT.email);
    expect(screen.getByTestId("input-tenant-phone-0")).toHaveValue(TENANT.phone);
    const sigCheckbox = screen.getByTestId("checkbox-sig-agree");
    expect(sigCheckbox).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("input-sig-name")).toHaveValue(signedName);

    // Walk forward to Step 6 (coordination skips Step 5) and re-run
    // payment to prove the wizard is fully functional after the
    // bounce.
    await clickNext(user);
    expect(screen.getByTestId("stepper-step-5")).toHaveClass("bg-pink-50");
    const payBtn = screen.getByTestId("button-pay");
    expect(payBtn).toBeEnabled();
    await user.click(payBtn);
    expect(await screen.findByTestId("text-terminal-title")).toHaveTextContent("Payment received");
  });
});
