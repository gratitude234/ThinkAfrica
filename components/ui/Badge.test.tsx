import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Badge from "./Badge";

describe("Badge", () => {
  it("labels a generic new Article as just 'Article', with no stale format suffix", () => {
    render(<Badge type="essay" content_kind="article" article_format={null} />);

    expect(screen.getByText("Article")).toBeInTheDocument();
    expect(screen.queryByText(/Essay/)).not.toBeInTheDocument();
  });

  it("labels a legacy Essay as 'Article · Essay'", () => {
    render(<Badge type="essay" content_kind="article" article_format="essay" />);

    expect(screen.getByText("Article · Essay")).toBeInTheDocument();
  });

  it("labels a legacy Policy Brief as 'Article · Policy Brief'", () => {
    render(<Badge type="policy_brief" content_kind="article" article_format="policy_brief" />);

    expect(screen.getByText("Article · Policy Brief")).toBeInTheDocument();
  });

  it("falls back to legacy-type inference when content_kind/article_format columns are entirely absent", () => {
    render(<Badge type="policy_brief" />);

    expect(screen.getByText("Article · Policy Brief")).toBeInTheDocument();
  });

  it("labels a research post as 'Research', unaffected by the article-format machinery", () => {
    render(<Badge type="research" content_kind="research" />);

    expect(screen.getByText("Research")).toBeInTheDocument();
  });

  it("labels a lightweight Post using its own legacy/word-count rules, not the Article path", () => {
    render(<Badge type="blog" content_kind="post" wordCount={30} />);

    expect(screen.getByText("Quick Take")).toBeInTheDocument();
  });
});
