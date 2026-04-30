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

describe("CallTemplatesView · default-template star toggle", () => {
  it("starring a row pre-selects it in the per-row Log-call form with its note prefilled", () => {
    render(<AdminApp />);

    fireEvent.click(screen.getByRole("button", { name: "Call templates" }));
    const starBtn = screen.getByTestId(
      "button-default-call-template-voicemail_left",
    );
    expect(starBtn.getAttribute("data-default")).toBe("false");
    fireEvent.click(starBtn);
    expect(
      screen
        .getByTestId("button-default-call-template-voicemail_left")
        .getAttribute("data-default"),
    ).toBe("true");

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
    // Outcome is intentionally orthogonal to the default.
    expect(
      (screen.getByTestId("select-call-outcome") as HTMLSelectElement).value,
    ).toBe("no_answer");
    const optionLabels = Array.from(select.options).map((o) => o.textContent);
    expect(optionLabels).toContain("Custom…");
  });

  it("starring a row pre-selects it in the bulk Log-call form with its note prefilled", () => {
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
    expect(select.value).toBe("spoke_confirmed");
    const noteInput = screen.getByTestId(
      "input-bulk-call-note",
    ) as HTMLTextAreaElement;
    expect(noteInput.value.length).toBeGreaterThan(0);
  });

  it("only one row can be the default at a time — clicking a second star moves the default", () => {
    render(<AdminApp />);

    fireEvent.click(screen.getByRole("button", { name: "Call templates" }));
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

  it("clicking the active default's star unsets it — dropdowns fall back to Custom…", () => {
    render(<AdminApp />);

    fireEvent.click(screen.getByRole("button", { name: "Call templates" }));
    fireEvent.click(
      screen.getByTestId("button-default-call-template-voicemail_left"),
    );
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
  it("starring a row pre-selects it in the bulk Log-email form with subject + note prefilled", () => {
    render(<AdminApp />);

    fireEvent.click(screen.getByRole("button", { name: "Email templates" }));
    const star = screen.getByTestId(
      "button-default-email-template-rebook_link",
    );
    expect(star.getAttribute("data-default")).toBe("false");
    fireEvent.click(star);
    expect(
      screen
        .getByTestId("button-default-email-template-rebook_link")
        .getAttribute("data-default"),
    ).toBe("true");

    fireEvent.click(
      screen.getByRole("button", { name: "Awaiting coordination" }),
    );
    fireEvent.click(screen.getByTestId("checkbox-coordination-row-bk-1038"));
    fireEvent.click(screen.getByTestId("button-bulk-log-email"));

    const select = screen.getByTestId(
      "select-bulk-email-template",
    ) as HTMLSelectElement;
    expect(select.value).toBe("rebook_link");
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

  it("starring a row pre-selects it in the per-row Log-email form too", () => {
    render(<AdminApp />);

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
    fireEvent.click(screen.getByTestId("button-log-email"));

    const select = screen.getByTestId(
      "select-email-template",
    ) as HTMLSelectElement;
    expect(select.value).toBe("rebook_link");
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

    fireEvent.click(screen.getByRole("button", { name: "Call templates" }));
    fireEvent.click(
      screen.getByTestId("button-default-call-template-voicemail_left"),
    );

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

    fireEvent.click(screen.getByRole("button", { name: "Email templates" }));
    fireEvent.click(
      screen.getByTestId("button-default-email-template-rebook_link"),
    );

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

describe("Default-template fallback to Custom…", () => {
  it("with no default set, every Log form opens on Custom…", () => {
    render(<AdminApp />);

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
