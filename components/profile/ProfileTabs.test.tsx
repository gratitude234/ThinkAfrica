import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ProfileTabs from "./ProfileTabs";

describe("ProfileTabs", () => {
  it("offers a visitor Posts, Articles and About, and no Drafts", () => {
    render(<ProfileTabs username="amara" active="posts" isOwnProfile={false} />);

    expect(screen.getAllByRole("tab").map((link) => link.textContent)).toEqual([
      "Overview",
      "About",
      "Articles",
      "Posts",
    ]);
    expect(screen.queryByRole("tab", { name: "Drafts" })).not.toBeInTheDocument();
  });

  it("offers the owner Drafts, at its own address", () => {
    render(<ProfileTabs username="amara" active="drafts" isOwnProfile />);

    expect(screen.getAllByRole("tab").map((link) => link.textContent)).toEqual([
      "Overview",
      "About",
      "Articles",
      "Posts",
      "Drafts",
    ]);
    expect(screen.getByRole("tab", { name: "Drafts" })).toHaveAttribute(
      "href",
      "/amara?view=drafts"
    );
  });
});
