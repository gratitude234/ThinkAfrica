import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DraftSignalBar from "./DraftSignalBar";

const baseProps = {
  postType: "essay" as const,
  title: "",
  excerpt: "",
  content: "",
  tags: [] as string[],
  references: [],
  wordCount: 0,
  inResponseToTitle: null,
};

describe("DraftSignalBar", () => {
  it("stays out of the way on an untouched draft", () => {
    const { container } = render(<DraftSignalBar {...baseProps} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("names one next step once writing has started, without opening the full list", () => {
    render(
      <DraftSignalBar
        {...baseProps}
        title="Rethinking transport subsidies"
        content="<p>Buses run late every morning.</p>"
        wordCount={6}
      />
    );

    const disclosure = screen.getByRole("button");
    expect(disclosure).toHaveAttribute("aria-expanded", "false");
    // The first unmet check is surfaced; the rest stay collapsed.
    expect(screen.getByText("Why it matters")).toBeInTheDocument();
    expect(screen.queryByText("Reader question")).not.toBeInTheDocument();
  });

  it("reveals the whole checklist on demand", () => {
    render(
      <DraftSignalBar
        {...baseProps}
        title="Rethinking transport subsidies"
        content="<p>Buses run late every morning.</p>"
        wordCount={6}
      />
    );

    fireEvent.click(screen.getByRole("button"));

    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Reader question")).toBeInTheDocument();
    expect(screen.getByText("Evidence or example")).toBeInTheDocument();
  });

  it("switches to a done state rather than nagging when every check passes", () => {
    render(
      <DraftSignalBar
        {...baseProps}
        title="Rethinking transport subsidies"
        excerpt="A look at why campus bus subsidies miss the students who need them."
        content={
          "<p>This matters because students miss lectures. For example, the 7am route " +
          "was cut last term. What should the university do next?</p>"
        }
        wordCount={900}
      />
    );

    expect(screen.getByText("This draft covers the essentials")).toBeInTheDocument();
  });
});
