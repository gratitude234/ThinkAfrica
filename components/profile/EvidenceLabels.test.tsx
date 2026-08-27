import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { INTELLECTUAL_RECORD_LABEL_DEFINITIONS } from "@/lib/intellectualRecord";
import EvidenceLabels from "./EvidenceLabels";
import EvidenceLegend from "./EvidenceLegend";

const ALL_LABELS = Object.values(INTELLECTUAL_RECORD_LABEL_DEFINITIONS);

describe("EvidenceLabels", () => {
  it("explains each chip without a hover-only title attribute", () => {
    const { container } = render(<EvidenceLabels labels={ALL_LABELS} />);

    // `title` is unreachable on touch and unread by most screen readers. It
    // was the one explanation path these chips had.
    expect(container.querySelectorAll("[title]")).toHaveLength(0);

    for (const label of ALL_LABELS) {
      const chip = screen.getByText(label.label).closest("li");
      expect(chip).not.toBeNull();
      // The chip's accessible text carries the sentence, not just the name.
      expect(chip).toHaveTextContent(label.description);
    }
  });

  it("keeps the visible chip text short while announcing the full sentence", () => {
    render(<EvidenceLabels labels={[INTELLECTUAL_RECORD_LABEL_DEFINITIONS.citable]} />);

    const chip = screen.getByText("Citable").closest("li");
    const srOnly = chip?.querySelector(".sr-only");
    expect(srOnly?.textContent).toContain("stable citation ID");
  });

  it("renders nothing when a publication carries no evidence", () => {
    const { container } = render(<EvidenceLabels labels={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("EvidenceLegend", () => {
  it("defines every evidence label rather than describing labels in general", async () => {
    const user = userEvent.setup();
    render(<EvidenceLegend />);

    const trigger = screen.getByRole("button", { name: "Evidence labels" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    const panel = screen.getByRole("group", {
      name: "What the evidence labels mean",
    });
    // The question a reader actually has is "what does Citable mean?", which
    // the previous single generic sentence never answered.
    for (const label of ALL_LABELS) {
      expect(within(panel).getByText(label.label)).toBeInTheDocument();
      expect(within(panel).getByText(label.description)).toBeInTheDocument();
    }
    expect(within(panel).getByText(/not popularity scores/i)).toBeInTheDocument();
  });

  it("closes on Escape and returns focus to its trigger", async () => {
    const user = userEvent.setup();
    render(<EvidenceLegend />);

    const trigger = screen.getByRole("button", { name: "Evidence labels" });
    await user.click(trigger);
    expect(screen.getByRole("group")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
