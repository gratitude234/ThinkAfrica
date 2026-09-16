import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ProfileTabs from "./ProfileTabs";

describe("ProfileTabs", () => {
  it("offers a visitor Posts, Articles and About, and no Drafts", () => {
    render(<ProfileTabs username="amara" active="posts" isOwnProfile={false} />);

    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual([
      "Posts",
      "Articles",
      "About",
    ]);
    expect(screen.queryByRole("link", { name: "Drafts" })).not.toBeInTheDocument();
  });

  it("offers the owner Drafts, at its own address", () => {
    render(<ProfileTabs username="amara" active="drafts" isOwnProfile />);

    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual([
      "Posts",
      "Articles",
      "Drafts",
      "About",
    ]);
    expect(screen.getByRole("link", { name: "Drafts" })).toHaveAttribute(
      "href",
      "/amara?view=drafts"
    );
  });
});
