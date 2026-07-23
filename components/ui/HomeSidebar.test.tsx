import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HomeSidebar, { draftHref } from "./HomeSidebar";

const baseProps = {
  activeDebate: null,
  recentDraft: null,
  activationState: null,
  featuredToday: null,
  peopleSuggestions: [],
  currentUserId: null,
  topics: [],
};

// "Continue writing" is a known draft, not an ambiguous "Write"/"Create"
// entry point -- it must keep linking straight to the correct editor
// (resolved via content_kind) instead of routing through the shared
// Create chooser.
describe("draftHref (existing-draft resume link bypasses the Create chooser)", () => {
  it("resolves a research draft straight to the research submission flow", () => {
    expect(
      draftHref({ id: "d1", title: "t", updated_at: "2026-01-01", type: "research", content_kind: "research" })
    ).toBe("/submit/research?draft=d1");
  });

  it("resolves a legacy research draft (no content_kind column) the same way", () => {
    expect(draftHref({ id: "d2", title: "t", updated_at: "2026-01-01", type: "research" })).toBe(
      "/submit/research?draft=d2"
    );
  });

  it("resolves an Article/Post draft straight to the Article composer", () => {
    expect(
      draftHref({ id: "d3", title: "t", updated_at: "2026-01-01", type: "essay", content_kind: "article" })
    ).toBe("/write?draft=d3");
    expect(draftHref({ id: "d4", title: "t", updated_at: "2026-01-01", type: "blog" })).toBe(
      "/write?draft=d4"
    );
  });
});

describe("HomeSidebar", () => {
  it("omits the Featured today card when no distinct candidate exists", () => {
    render(<HomeSidebar {...baseProps} />);
    expect(screen.queryByText("Featured today")).not.toBeInTheDocument();
  });

  it("renders a distinct Featured today candidate with its content-kind label", () => {
    render(
      <HomeSidebar
        {...baseProps}
        featuredToday={{
          id: "post-2",
          title: "Reforming Fuel Subsidies Without Triggering Unrest",
          slug: "reforming-fuel-subsidies",
          type: "policy_brief",
          content_kind: "article",
          article_format: "policy_brief",
          profiles: { username: "fatima-d", full_name: "Fatima Diallo" },
        }}
      />
    );

    expect(screen.getByText("Featured today")).toBeInTheDocument();
    expect(screen.getByText("Reforming Fuel Subsidies Without Triggering Unrest")).toBeInTheDocument();
    expect(screen.getByText("Article")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Reforming Fuel Subsidies/ })).toHaveAttribute(
      "href",
      "/post/reforming-fuel-subsidies"
    );
  });

  it("shows no Active debate filler when no live debate exists", () => {
    render(<HomeSidebar {...baseProps} />);
    expect(screen.queryByText("Live debate")).not.toBeInTheDocument();
    expect(screen.queryByText(/No live debate/i)).not.toBeInTheDocument();
  });

  it("caps writer suggestions at three", () => {
    const people = ["a", "b", "c", "d"].map((id) => ({
      id,
      username: id,
      full_name: `Writer ${id}`,
      university: null,
      avatar_url: null,
    }));
    render(<HomeSidebar {...baseProps} peopleSuggestions={people} />);
    expect(screen.getAllByText(/^Writer /)).toHaveLength(3);
  });

  it("renders topics as compact links, not another bordered card", () => {
    const { container } = render(
      <HomeSidebar {...baseProps} topics={["Climate Policy", "Labour Law"]} />
    );
    const nav = screen.getByRole("navigation", { name: "Browse popular topics" });
    expect(nav).toBeInTheDocument();
    expect(nav.tagName).toBe("NAV");
    // With every other rail card absent, topics are the only thing
    // rendered -- confirming they aren't wrapped in a bordered <section>
    // card of their own.
    expect(container.querySelectorAll("section").length).toBe(0);
  });
});
