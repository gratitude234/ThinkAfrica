import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/FollowButton", () => ({
  default: ({ authorName, initialFollowing }: { authorName?: string; initialFollowing: boolean }) => (
    <button type="button" data-following={String(initialFollowing)}>
      {initialFollowing ? `Following ${authorName}` : `Follow ${authorName}`}
    </button>
  ),
}));

vi.mock("@/components/ui/UserAvatar", () => ({
  default: ({ name }: { name: string }) => <span aria-hidden="true">{name.slice(0, 1)}</span>,
}));

import ProfileRelatedThinkers from "./ProfileRelatedThinkers";

describe("ProfileRelatedThinkers", () => {
  it("explains recommendations with demonstrated topics and public network context", () => {
    render(
      <ProfileRelatedThinkers
        currentUserId="viewer-1"
        thinkers={[
          {
            id: "thinker-1",
            username: "amina",
            fullName: "Amina Yusuf",
            avatarUrl: null,
            professionalTitle: "Policy researcher",
            sharedTopics: ["politics & governance", "education policy"],
            ownerFollows: true,
            followsOwner: true,
            viewerFollows: true,
            latestPublishedAt: "2026-10-02T10:00:00Z",
          },
          {
            id: "thinker-2",
            username: "tunde",
            fullName: "Tunde Adebayo",
            avatarUrl: null,
            professionalTitle: null,
            sharedTopics: ["education policy"],
            ownerFollows: false,
            followsOwner: false,
            viewerFollows: false,
            latestPublishedAt: "2026-10-01T10:00:00Z",
          },
        ]}
      />
    );

    expect(screen.getByRole("heading", { name: "Related Thinkers" })).toBeInTheDocument();
    expect(screen.getByText("Matched by published topics; follow relationships strengthen the connection.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View Amina Yusuf's profile" })).toHaveAttribute("href", "/amina");
    expect(screen.getByText("Writes about Politics & Governance · Education Policy")).toBeInTheDocument();
    expect(screen.getByText("Mutual follow")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Following Amina Yusuf" })).toHaveAttribute("data-following", "true");
    expect(screen.getByRole("button", { name: "Follow Tunde Adebayo" })).toHaveAttribute("data-following", "false");
  });

  it("renders nothing when there is no topic-grounded relationship", () => {
    const { container } = render(
      <ProfileRelatedThinkers thinkers={[]} currentUserId={null} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
