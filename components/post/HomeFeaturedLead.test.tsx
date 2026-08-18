import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HomeFeaturedLead, { type HomeFeaturedPost } from "./HomeFeaturedLead";

function featured(
  provenance: HomeFeaturedPost["featured_provenance"]
): HomeFeaturedPost {
  return {
    id: "post-1",
    title: "Rebuilding public trust",
    slug: "rebuilding-public-trust",
    excerpt: "A practical framework for accountable public institutions.",
    type: "essay",
    content_kind: "article",
    article_format: "essay",
    featured_provenance: provenance,
    profiles: {
      username: "amara",
      full_name: "Amara Okafor",
      university: "University of Lagos",
    },
  };
}

describe("HomeFeaturedLead provenance", () => {
  it.each([
    ["editorial", "Editor’s pick"],
    ["recommended", "Recommended for you"],
    ["latest", "Latest publication"],
  ] as const)("labels a %s lead honestly", (provenance, label) => {
    render(<HomeFeaturedLead post={featured(provenance)} />);

    expect(screen.getByText(new RegExp(label))).toBeInTheDocument();
  });
});
