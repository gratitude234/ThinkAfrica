import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ContributionSnapshot } from "@/lib/contribution";
import ArticlePreview, { lengthLabel } from "./ArticlePreview";

vi.mock("next/image", () => ({
  default: (props: { alt: string }) => <div role="img" aria-label={props.alt} />,
}));
vi.mock("@/components/ui/UserAvatar", () => ({
  default: ({ name }: { name: string }) => <span>{`Avatar of ${name}`}</span>,
}));

const body = "<p>Solar microgrids are changing Jos. Here is how.</p>";
const piece: ContributionSnapshot = {
  title: "Power to the people",
  content: body,
  excerpt: "",
  tags: ["energy"],
  coverImageUrl: "",
  references: [],
};

describe("ArticlePreview", () => {
  it("sets the title and body in the live page's type", () => {
    const { container } = render(<ArticlePreview snapshot={piece} authorName="Ada" wordCount={9} />);

    expect(screen.getByRole("heading", { level: 1, name: "Power to the people" })).toHaveClass(
      "publication-article-title"
    );
    expect(container.querySelector(".publication-article-body")?.innerHTML).toBe(body);
  });

  it("prints a summary under the title only when someone wrote it", () => {
    const { rerender } = render(
      <ArticlePreview snapshot={{ ...piece, excerpt: "Solar microgrids are changing Jos." }} authorName="Ada" wordCount={9} />
    );
    expect(screen.queryByText("Solar microgrids are changing Jos.")).not.toBeInTheDocument();

    rerender(
      <ArticlePreview snapshot={{ ...piece, excerpt: "How a city paid for its grid" }} authorName="Ada" wordCount={9} />
    );
    expect(screen.getByText("How a city paid for its grid")).toBeInTheDocument();
  });

  it("bylines the writer with the length, and ends on the topics", () => {
    render(<ArticlePreview snapshot={piece} authorName="Ada" wordCount={1240} />);

    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.getByText("Avatar of Ada")).toBeInTheDocument();
    expect(screen.getByText("1,240 words · 7 min read")).toBeInTheDocument();
    expect(screen.getByText("energy")).toBeInTheDocument();
  });
});

describe("lengthLabel", () => {
  it("counts words and minutes", () => {
    expect(lengthLabel(1)).toBe("1 word · 1 min read");
    expect(lengthLabel(0)).toBe("0 words");
    expect(lengthLabel(1240)).toBe("1,240 words · 7 min read");
  });
});
