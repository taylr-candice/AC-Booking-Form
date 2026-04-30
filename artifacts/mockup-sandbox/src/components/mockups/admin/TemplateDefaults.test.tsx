// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  findDefaultCallTemplate,
  findDefaultEmailTemplate,
  setDefaultCallTemplate,
  setDefaultEmailTemplate,
  type CallTemplate,
  type EmailTemplate,
} from "@/state/adminMockData";

import { AdminApp } from "./AdminApp";

afterEach(() => {
  cleanup();
});

describe("setDefaultCallTemplate / setDefaultEmailTemplate · helpers", () => {
  it("setting a default on a fresh catalog flips exactly one row's flag", () => {
    const before: CallTemplate[] = [
      { id: "a", name: "A", note: "a-note" },
      { id: "b", name: "B", note: "b-note" },
      { id: "c", name: "C", note: "c-note" },
    ];

    const after = setDefaultCallTemplate(before, "b");

    expect(after.find((t) => t.id === "a")?.isDefault).not.toBe(true);
    expect(after.find((t) => t.id === "b")?.isDefault).toBe(true);
    expect(after.find((t) => t.id === "c")?.isDefault).not.toBe(true);
    expect(findDefaultCallTemplate(after)?.id).toBe("b");
    expect(before.find((t) => t.id === "b")?.isDefault).not.toBe(true);
  });

  it("setting a different row's default clears the previously-default row", () => {
    const before: CallTemplate[] = [
      { id: "a", name: "A", note: "a-note", isDefault: true },
      { id: "b", name: "B", note: "b-note" },
    ];

    const after = setDefaultCallTemplate(before, "b");

    expect(after.find((t) => t.id === "a")?.isDefault).toBe(false);
    expect(after.find((t) => t.id === "b")?.isDefault).toBe(true);
    expect(findDefaultCallTemplate(after)?.id).toBe("b");
  });

  it("clicking the active default's star unsets the default", () => {
    const before: CallTemplate[] = [
      { id: "a", name: "A", note: "a-note", isDefault: true },
      { id: "b", name: "B", note: "b-note" },
    ];

    const after = setDefaultCallTemplate(before, "a");

    expect(after.find((t) => t.id === "a")?.isDefault).toBe(false);
    expect(after.find((t) => t.id === "b")?.isDefault).not.toBe(true);
    expect(findDefaultCallTemplate(after)).toBeUndefined();
  });

  it("setDefaultEmailTemplate mirrors the call helper's contract", () => {
    const before: EmailTemplate[] = [
      { id: "x", name: "X", subject: "x-subject", note: "x-note" },
      {
        id: "y",
        name: "Y",
        subject: "y-subject",
        note: "y-note",
        isDefault: true,
      },
    ];

    const switched = setDefaultEmailTemplate(before, "x");
    expect(switched.find((t) => t.id === "x")?.isDefault).toBe(true);
    expect(switched.find((t) => t.id === "y")?.isDefault).toBe(false);
    expect(findDefaultEmailTemplate(switched)?.id).toBe("x");

    const cleared = setDefaultEmailTemplate(switched, "x");
    expect(findDefaultEmailTemplate(cleared)).toBeUndefined();
  });

  it("unknown ids are a no-op", () => {
    const before: CallTemplate[] = [
      { id: "a", name: "A", note: "a-note", isDefault: true },
    ];
    const after = setDefaultCallTemplate(before, "nope");
    expect(after.find((t) => t.id === "a")?.isDefault).toBe(true);
    expect(findDefaultCallTemplate(after)?.id).toBe("a");
  });
});

/**
 * The seeded `isDefault` flags (`voicemail_left` for Call,
 * `rebook_link` for Email) are the user-visible contract for fresh
 * tenants — these tests pin both pre-selections plus their starred
 * state in the templates panels.
 */
describe("Seeded defaults · pre-selection out of the box", () => {
  it("the per-row Log-call form opens pre-selected on the seeded voicemail_left default", () => {
    render(<AdminApp />);

    fireEvent.click(
      screen.getByRole("button", { name: "Awaiting coordination" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /^Open booking bk-1038/ }),
    );
    fireEvent.click(screen.getByTestId("button-log-call"));

    const select = screen.getByTestId(
      "select-call-template",
    ) as HTMLSelectElement;
    expect(select.value).toBe("voicemail_left");
    const noteInput = screen.getByTestId(
      "input-call-note",
    ) as HTMLTextAreaElement;
    expect(noteInput.value.length).toBeGreaterThan(0);
  });

  it("the bulk Log-email form opens pre-selected on the seeded rebook_link default", () => {
    render(<AdminApp />);

    fireEvent.click(
      screen.getByRole("button", { name: "Awaiting coordination" }),
    );
    fireEvent.click(screen.getByTestId("checkbox-coordination-row-bk-1038"));
    fireEvent.click(screen.getByTestId("button-bulk-log-email"));

    const select = screen.getByTestId(
      "select-bulk-email-template",
    ) as HTMLSelectElement;
    expect(select.value).toBe("rebook_link");
    const subjectInput = screen.getByTestId(
      "input-bulk-email-subject",
    ) as HTMLInputElement;
    expect(subjectInput.value.length).toBeGreaterThan(0);
    const noteInput = screen.getByTestId(
      "input-bulk-email-note",
    ) as HTMLTextAreaElement;
    expect(noteInput.value.length).toBeGreaterThan(0);
  });

  it("the seeded Call default's star starts in the active state in the templates panel", () => {
    render(<AdminApp />);

    fireEvent.click(screen.getByRole("button", { name: "Call templates" }));
    expect(
      screen
        .getByTestId("button-default-call-template-voicemail_left")
        .getAttribute("data-default"),
    ).toBe("true");
  });

  it("the seeded Email default's star starts in the active state in the templates panel", () => {
    render(<AdminApp />);

    fireEvent.click(screen.getByRole("button", { name: "Email templates" }));
    expect(
      screen
        .getByTestId("button-default-email-template-rebook_link")
        .getAttribute("data-default"),
    ).toBe("true");
  });
});

describe("CallTemplatesView · default-template star toggle", () => {
  it("starring a non-default row pre-selects it in the per-row Log-call form with its note prefilled", () => {
    render(<AdminApp />);

    fireEvent.click(screen.getByRole("button", { name: "Call templates" }));
    // Promote a non-seeded row so the test exercises the user-driven
    // star flip (the seeded `voicemail_left` baseline is covered above).
    const starBtn = screen.getByTestId(
      "button-default-call-template-spoke_confirmed",
    );
    expect(starBtn.getAttribute("data-default")).toBe("false");
    fireEvent.click(starBtn);
    expect(
      screen
        .getByTestId("button-default-call-template-spoke_confirmed")
        .getAttribute("data-default"),
    ).toBe("true");
    // The previously-seeded default has been demoted as a side effect
    // — only one row at a time is allowed to wear the flag.
    expect(
      screen
        .getByTestId("button-default-call-template-voicemail_left")
        .getAttribute("data-default"),
    ).toBe("false");

    fireEvent.click(
      screen.getByRole("button", { name: "Awaiting coordination" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /^Open booking bk-1038/ }),
    );
    fireEvent.click(screen.getByTestId("button-log-call"));
    const select = screen.getByTestId(
      "select-call-template",
    ) as HTMLSelectElement;
    expect(select.value).toBe("spoke_confirmed");
    const noteInput = screen.getByTestId(
      "input-call-note",
    ) as HTMLTextAreaElement;
    expect(noteInput.value.length).toBeGreaterThan(0);
    // Outcome is intentionally orthogonal to the default.
    expect(
      (screen.getByTestId("select-call-outcome") as HTMLSelectElement).value,
    ).toBe("no_answer");
    const optionLabels = Array.from(select.options).map((o) => o.textContent);
    expect(optionLabels).toContain("Custom…");
  });

  it("starring a non-default row pre-selects it in the bulk Log-call form with its note prefilled", () => {
    render(<AdminApp />);

    fireEvent.click(screen.getByRole("button", { name: "Call templates" }));
    fireEvent.click(
      screen.getByTestId("button-default-call-template-no_answer"),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Awaiting coordination" }),
    );
    fireEvent.click(screen.getByTestId("checkbox-coordination-row-bk-1038"));
    fireEvent.click(screen.getByTestId("button-bulk-log-call"));

    const select = screen.getByTestId(
      "select-bulk-call-template",
    ) as HTMLSelectElement;
    expect(select.value).toBe("no_answer");
    const noteInput = screen.getByTestId(
      "input-bulk-call-note",
    ) as HTMLTextAreaElement;
    expect(noteInput.value.length).toBeGreaterThan(0);
  });

  it("only one row can be the default at a time — clicking a second star moves the default", () => {
    render(<AdminApp />);

    fireEvent.click(screen.getByRole("button", { name: "Call templates" }));
    // Walk: seeded `voicemail_left` is default → click it to clear →
    // click `spoke_confirmed` to promote. End state: voicemail_left
    // off, spoke_confirmed on. Same shape as a fresh tenant who first
    // demotes the seeded default and then picks their own.
    fireEvent.click(
      screen.getByTestId("button-default-call-template-voicemail_left"),
    );
    fireEvent.click(
      screen.getByTestId("button-default-call-template-spoke_confirmed"),
    );

    expect(
      screen
        .getByTestId("button-default-call-template-voicemail_left")
        .getAttribute("data-default"),
    ).toBe("false");
    expect(
      screen
        .getByTestId("button-default-call-template-spoke_confirmed")
        .getAttribute("data-default"),
    ).toBe("true");
  });

  it("clicking the seeded default's star unsets it — dropdowns fall back to Custom…", () => {
    render(<AdminApp />);

    fireEvent.click(screen.getByRole("button", { name: "Call templates" }));
    // Seeded `voicemail_left` starts active — one click demotes it.
    fireEvent.click(
      screen.getByTestId("button-default-call-template-voicemail_left"),
    );
    expect(
      screen
        .getByTestId("button-default-call-template-voicemail_left")
        .getAttribute("data-default"),
    ).toBe("false");

    fireEvent.click(
      screen.getByRole("button", { name: "Awaiting coordination" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /^Open booking bk-1038/ }),
    );
    fireEvent.click(screen.getByTestId("button-log-call"));
    const select = screen.getByTestId(
      "select-call-template",
    ) as HTMLSelectElement;
    expect(select.value).toBe("custom");
    expect(
      (screen.getByTestId("input-call-note") as HTMLTextAreaElement).value,
    ).toBe("");
  });
});

describe("EmailTemplatesView · default-template star toggle", () => {
  it("starring a non-default row pre-selects it in the bulk Log-email form with subject + note prefilled", () => {
    render(<AdminApp />);

    fireEvent.click(screen.getByRole("button", { name: "Email templates" }));
    // Promote a non-seeded row so the test exercises the user-driven
    // star flip (the seeded `rebook_link` baseline is covered above).
    const star = screen.getByTestId(
      "button-default-email-template-awaiting_confirm",
    );
    expect(star.getAttribute("data-default")).toBe("false");
    fireEvent.click(star);
    expect(
      screen
        .getByTestId("button-default-email-template-awaiting_confirm")
        .getAttribute("data-default"),
    ).toBe("true");
    // Seeded default has been demoted.
    expect(
      screen
        .getByTestId("button-default-email-template-rebook_link")
        .getAttribute("data-default"),
    ).toBe("false");

    fireEvent.click(
      screen.getByRole("button", { name: "Awaiting coordination" }),
    );
    fireEvent.click(screen.getByTestId("checkbox-coordination-row-bk-1038"));
    fireEvent.click(screen.getByTestId("button-bulk-log-email"));

    const select = screen.getByTestId(
      "select-bulk-email-template",
    ) as HTMLSelectElement;
    expect(select.value).toBe("awaiting_confirm");
    expect(
      (screen.getByTestId("input-bulk-email-subject") as HTMLInputElement)
        .value.length,
    ).toBeGreaterThan(0);
    expect(
      (screen.getByTestId("input-bulk-email-note") as HTMLTextAreaElement)
        .value.length,
    ).toBeGreaterThan(0);
    const optionLabels = Array.from(select.options).map((o) => o.textContent);
    expect(optionLabels).toContain("Custom…");
  });

  it("only one row can be the default at a time — clicking a second star moves the default", () => {
    render(<AdminApp />);

    fireEvent.click(screen.getByRole("button", { name: "Email templates" }));
    // Same walk as the call-side test: clear the seeded default
    // first, then promote a fresh row.
    fireEvent.click(
      screen.getByTestId("button-default-email-template-rebook_link"),
    );
    fireEvent.click(
      screen.getByTestId("button-default-email-template-awaiting_confirm"),
    );

    expect(
      screen
        .getByTestId("button-default-email-template-rebook_link")
        .getAttribute("data-default"),
    ).toBe("false");
    expect(
      screen
        .getByTestId("button-default-email-template-awaiting_confirm")
        .getAttribute("data-default"),
    ).toBe("true");
  });

  it("starring a non-default row pre-selects it in the per-row Log-email form too", () => {
    render(<AdminApp />);

    fireEvent.click(screen.getByRole("button", { name: "Email templates" }));
    fireEvent.click(
      screen.getByTestId("button-default-email-template-parcel_locker"),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Awaiting coordination" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /^Open booking bk-1038/ }),
    );
    fireEvent.click(screen.getByTestId("button-log-email"));

    const select = screen.getByTestId(
      "select-email-template",
    ) as HTMLSelectElement;
    expect(select.value).toBe("parcel_locker");
    expect(
      (screen.getByTestId("input-email-subject") as HTMLInputElement).value
        .length,
    ).toBeGreaterThan(0);
    expect(
      (screen.getByTestId("input-email-note") as HTMLTextAreaElement).value
        .length,
    ).toBeGreaterThan(0);
  });
});

describe("Default-template marker in Log dropdown options", () => {
  const optionFor = (select: HTMLSelectElement, value: string): HTMLOptionElement => {
    const opt = Array.from(select.options).find((o) => o.value === value);
    if (!opt) throw new Error(`option ${value} not found`);
    return opt;
  };

  it("per-row Log-call dropdown marks the default option and clears it when the default moves or is unset", () => {
    render(<AdminApp />);

    // The seeded default (`voicemail_left`) is active out of the box,
    // so the marker must already be on its option without any setup.
    fireEvent.click(
      screen.getByRole("button", { name: "Awaiting coordination" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /^Open booking bk-1038/ }),
    );
    fireEvent.click(screen.getByTestId("button-log-call"));
    let select = screen.getByTestId(
      "select-call-template",
    ) as HTMLSelectElement;
    expect(optionFor(select, "voicemail_left").textContent).toMatch(
      /\(default\)$/,
    );
    expect(optionFor(select, "spoke_confirmed").textContent).not.toMatch(
      /\(default\)/,
    );

    // Move the default to a different row and confirm the marker moves with it.
    fireEvent.click(screen.getByRole("button", { name: "Call templates" }));
    fireEvent.click(
      screen.getByTestId("button-default-call-template-spoke_confirmed"),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Awaiting coordination" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /^Open booking bk-1038/ }),
    );
    fireEvent.click(screen.getByTestId("button-log-call"));
    select = screen.getByTestId("select-call-template") as HTMLSelectElement;
    expect(optionFor(select, "spoke_confirmed").textContent).toMatch(
      /\(default\)$/,
    );
    expect(optionFor(select, "voicemail_left").textContent).not.toMatch(
      /\(default\)/,
    );

    // Unset the default; no option should carry the marker.
    fireEvent.click(screen.getByRole("button", { name: "Call templates" }));
    fireEvent.click(
      screen.getByTestId("button-default-call-template-spoke_confirmed"),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Awaiting coordination" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /^Open booking bk-1038/ }),
    );
    fireEvent.click(screen.getByTestId("button-log-call"));
    select = screen.getByTestId("select-call-template") as HTMLSelectElement;
    for (const opt of Array.from(select.options)) {
      expect(opt.textContent ?? "").not.toMatch(/\(default\)/);
    }
  });

  it("per-row Log-email dropdown marks the default option", () => {
    render(<AdminApp />);

    // `rebook_link` is the seeded default — the marker should be on
    // its option without any panel-level setup.
    fireEvent.click(
      screen.getByRole("button", { name: "Awaiting coordination" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /^Open booking bk-1038/ }),
    );
    fireEvent.click(screen.getByTestId("button-log-email"));
    const select = screen.getByTestId(
      "select-email-template",
    ) as HTMLSelectElement;
    expect(optionFor(select, "rebook_link").textContent).toMatch(
      /\(default\)$/,
    );
    expect(optionFor(select, "awaiting_confirm").textContent).not.toMatch(
      /\(default\)/,
    );
  });

  it("bulk Log-call dropdown marks the default option", () => {
    render(<AdminApp />);

    fireEvent.click(screen.getByRole("button", { name: "Call templates" }));
    fireEvent.click(
      screen.getByTestId("button-default-call-template-spoke_confirmed"),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Awaiting coordination" }),
    );
    fireEvent.click(screen.getByTestId("checkbox-coordination-row-bk-1038"));
    fireEvent.click(screen.getByTestId("button-bulk-log-call"));
    const select = screen.getByTestId(
      "select-bulk-call-template",
    ) as HTMLSelectElement;
    expect(optionFor(select, "spoke_confirmed").textContent).toMatch(
      /\(default\)$/,
    );
    expect(optionFor(select, "voicemail_left").textContent).not.toMatch(
      /\(default\)/,
    );
  });

  it("bulk Log-email dropdown marks the default option", () => {
    render(<AdminApp />);

    // Seeded `rebook_link` is the default — no setup needed.
    fireEvent.click(
      screen.getByRole("button", { name: "Awaiting coordination" }),
    );
    fireEvent.click(screen.getByTestId("checkbox-coordination-row-bk-1038"));
    fireEvent.click(screen.getByTestId("button-bulk-log-email"));
    const select = screen.getByTestId(
      "select-bulk-email-template",
    ) as HTMLSelectElement;
    expect(optionFor(select, "rebook_link").textContent).toMatch(
      /\(default\)$/,
    );
    expect(optionFor(select, "awaiting_confirm").textContent).not.toMatch(
      /\(default\)/,
    );
  });
});

describe("Templates panel header — default-template marker", () => {
  it("Call templates header reflects the seeded default out of the box and tracks star moves / unsets", () => {
    render(<AdminApp />);

    fireEvent.click(screen.getByRole("button", { name: "Call templates" }));

    // Out of the box, the seeded `voicemail_left` default is shown
    // in the header (no empty-state). The star is movable / clearable
    // from the panel — the rest of this test exercises both.
    let link = screen.getByTestId("link-call-templates-default");
    expect(link.textContent).toBe("No answer — left voicemail");
    expect(
      screen.queryByTestId("text-call-templates-default-empty"),
    ).toBeNull();

    // Move the default to a different row — header tracks the move.
    fireEvent.click(
      screen.getByTestId("button-default-call-template-spoke_confirmed"),
    );
    link = screen.getByTestId("link-call-templates-default");
    expect(link.textContent).toBe("Spoke to them — confirmed window");

    // Unset the default — header falls back to the empty-state message.
    fireEvent.click(
      screen.getByTestId("button-default-call-template-spoke_confirmed"),
    );
    expect(
      screen.getByTestId("text-call-templates-default-empty").textContent,
    ).toMatch(/No default set/);
    expect(screen.queryByTestId("link-call-templates-default")).toBeNull();
  });

  it("Email templates header reflects the seeded default out of the box and tracks star moves / unsets", () => {
    render(<AdminApp />);

    fireEvent.click(screen.getByRole("button", { name: "Email templates" }));

    // Seeded `rebook_link` is the out-of-the-box default — the
    // header link is rendered without any panel-side setup.
    let link = screen.getByTestId("link-email-templates-default");
    expect(link.textContent).toBe("Sent rebook link");
    expect(
      screen.queryByTestId("text-email-templates-default-empty"),
    ).toBeNull();

    fireEvent.click(
      screen.getByTestId("button-default-email-template-awaiting_confirm"),
    );
    link = screen.getByTestId("link-email-templates-default");
    expect(link.textContent).toBe("Awaiting confirmation nudge");

    fireEvent.click(
      screen.getByTestId("button-default-email-template-awaiting_confirm"),
    );
    expect(
      screen.getByTestId("text-email-templates-default-empty").textContent,
    ).toMatch(/No default set/);
    expect(screen.queryByTestId("link-email-templates-default")).toBeNull();
  });

  it("clicking the Call header link highlights the matching row", () => {
    render(<AdminApp />);

    // Seeded `voicemail_left` default — no extra star setup needed.
    fireEvent.click(screen.getByRole("button", { name: "Call templates" }));

    // Before the click, no row is highlighted.
    expect(
      screen
        .getByTestId("call-template-row-voicemail_left")
        .getAttribute("data-highlighted"),
    ).toBe("false");

    fireEvent.click(screen.getByTestId("link-call-templates-default"));

    expect(
      screen
        .getByTestId("call-template-row-voicemail_left")
        .getAttribute("data-highlighted"),
    ).toBe("true");
    // No other row should be highlighted.
    expect(
      screen
        .getByTestId("call-template-row-spoke_confirmed")
        .getAttribute("data-highlighted"),
    ).toBe("false");
  });

  it("clicking the Email header link highlights the matching row", () => {
    render(<AdminApp />);

    // Seeded `rebook_link` default — no extra star setup needed.
    fireEvent.click(screen.getByRole("button", { name: "Email templates" }));

    expect(
      screen
        .getByTestId("email-template-row-rebook_link")
        .getAttribute("data-highlighted"),
    ).toBe("false");

    fireEvent.click(screen.getByTestId("link-email-templates-default"));

    expect(
      screen
        .getByTestId("email-template-row-rebook_link")
        .getAttribute("data-highlighted"),
    ).toBe("true");
    expect(
      screen
        .getByTestId("email-template-row-awaiting_confirm")
        .getAttribute("data-highlighted"),
    ).toBe("false");
  });
});

describe("Default-template fallback to Custom…", () => {
  it("after clearing the seeded defaults, every Log form opens on Custom…", () => {
    render(<AdminApp />);

    // Demote both seeded defaults. Once cleared, the per-channel
    // dropdowns must collapse back to the Custom… sentinel — same
    // baseline a brand-new tenant would have if the seed catalogs
    // shipped without an `isDefault` row.
    fireEvent.click(screen.getByRole("button", { name: "Call templates" }));
    fireEvent.click(
      screen.getByTestId("button-default-call-template-voicemail_left"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Email templates" }));
    fireEvent.click(
      screen.getByTestId("button-default-email-template-rebook_link"),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Awaiting coordination" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /^Open booking bk-1038/ }),
    );
    fireEvent.click(screen.getByTestId("button-log-call"));
    expect(
      (screen.getByTestId("select-call-template") as HTMLSelectElement).value,
    ).toBe("custom");
    expect(
      (screen.getByTestId("input-call-note") as HTMLTextAreaElement).value,
    ).toBe("");
  });
});
