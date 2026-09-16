import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Badge from "./Badge";

/**
 * The badge says one of two words.
 *
 * It used to be keyed on the legacy `posts.type`, with a genre suffix
 * ("Article · Policy Brief"), a "Research" label, and a "Quick Take" label for
 * a Blog under 200 words. Phase 2I removed all four: a piece is a Post or an
 * Article and the badge names it.
 */
describe("Badge", () => {
  it("names an Article", () => {
    render(<Badge content_kind="article" />);
    expect(screen.getByText("Article")).toBeInTheDocument();
  });

  it("names a Post", () => {
    render(<Badge content_kind="post" />);
    expect(screen.getByText("Post")).toBeInTheDocument();
  });

  it("carries no genre suffix on an Article", () => {
    render(<Badge content_kind="article" />);

    expect(screen.queryByText(/Essay/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Policy Brief/)).not.toBeInTheDocument();
    expect(screen.queryByText(/·/)).not.toBeInTheDocument();
  });

  it("never renders a retired label, whatever it is handed", () => {
    for (const kind of ["research", "essay", "policy_brief", "blog"]) {
      const { unmount } = render(<Badge content_kind={kind} />);
      for (const gone of ["Research", "Essay", "Policy Brief", "Blog", "Quick Take"]) {
        expect(screen.queryByText(gone), `${kind} rendered ${gone}`).not.toBeInTheDocument();
      }
      unmount();
    }
  });

  it("falls back to a generic label rather than crashing on an unreadable kind", () => {
    render(<Badge content_kind={null} />);
    expect(screen.getByText("Content")).toBeInTheDocument();
  });
});
