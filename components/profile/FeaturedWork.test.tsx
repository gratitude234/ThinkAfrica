import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import FeaturedWork from "./FeaturedWork";

describe("FeaturedWork", () => {
  it("is hidden from visitors when the author has not selected work", () => {
    const { container } = render(
      <FeaturedWork posts={[]} isOwnProfile={false} />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("shows owners a quiet manual-selection empty state", () => {
    render(
      <FeaturedWork
        posts={[]}
        isOwnProfile
        action={<button type="button">Add featured work</button>}
      />
    );

    expect(screen.getByText("Choose the work readers should see first")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add featured work" })).toBeInTheDocument();
    expect(screen.queryByText(/most read/i)).not.toBeInTheDocument();
  });

  it("preserves the supplied manual order and never labels work Post or Article", () => {
    render(
      <FeaturedWork
        posts={[
          {
            id: "first",
            title: "First selected idea",
            slug: "first",
            excerpt: "First excerpt",
            type: "essay",
          },
          {
            id: "second",
            title: null,
            slug: "second",
            excerpt: "Second selected idea",
            type: "blog",
          },
        ]}
      />
    );

    const links = screen.getAllByRole("link");
    expect(links[0]).toHaveTextContent("First selected idea");
    expect(links[1]).toHaveTextContent("Second selected idea");
    expect(screen.queryByText("Post", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText("Article", { exact: true })).not.toBeInTheDocument();
  });
});
