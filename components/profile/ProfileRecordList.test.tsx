import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ProfileRecordList from "./ProfileRecordList";
import type { ProfileRecordPage } from "@/lib/profileViewData";

vi.mock("@/lib/activationEvents", () => ({ trackActivationEvent: vi.fn() }));

const RECORD: ProfileRecordPage = {
  items: [
    {
      id: "article-1",
      title: "Rethinking public transport",
      slug: "rethinking-public-transport",
      excerpt: "What African cities can learn from transport systems that put people first.",
      kind: "article",
      coverImageUrl: null,
      publishedAt: "2026-10-01T09:00:00Z",
      createdAt: "2026-09-30T09:00:00Z",
      isCoAuthor: false,
      wordCount: 1000,
    },
    {
      id: "post-1",
      title: "Legacy Post title must stay hidden",
      slug: "systems-imagination",
      excerpt: "There is no youth scarcity in Africa. There is a systems imagination problem.",
      kind: "post",
      coverImageUrl: null,
      publishedAt: "2025-12-12T09:00:00Z",
      createdAt: "2025-12-11T09:00:00Z",
      isCoAuthor: false,
      wordCount: 80,
    },
  ],
  page: 1,
  pageSize: 2,
  hasPreviousPage: false,
  hasNextPage: true,
  articleCount: 12,
  postCount: 31,
  totalPublished: 43,
  writingTopics: [
    { key: "politics & governance", count: 8 },
    { key: "education policy", count: 5 },
  ],
};

describe("ProfileRecordList", () => {
  it("shows the full current Posts + Articles history without exposing legacy Post titles", () => {
    render(
      <ProfileRecordList
        username="amara"
        displayName="Amara Okafor"
        profileId="author-1"
        record={RECORD}
        viewerState="anonymous"
        isOwnProfile={false}
      />
    );

    expect(screen.getByRole("heading", { name: "Intellectual Record", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "2026", level: 2 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "2025", level: 2 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Rethinking public transport" })).toHaveAttribute(
      "href",
      "/post/rethinking-public-transport"
    );
    expect(screen.queryByText("Legacy Post title must stay hidden")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /There is no youth scarcity/ })).toHaveAttribute(
      "href",
      "/post/systems-imagination"
    );
    expect(screen.getByRole("link", { name: "Politics & Governance" })).toHaveAttribute(
      "href",
      "/topics/politics%20%26%20governance"
    );
    expect(screen.getByRole("link", { name: "Older" })).toHaveAttribute(
      "href",
      "/amara/record?page=2"
    );
    expect(screen.queryByRole("link", { name: "Newer" })).not.toBeInTheDocument();
  });

  it("shows publishing actions only to the owner when the record is empty", () => {
    const empty = { ...RECORD, items: [], articleCount: 0, postCount: 0, totalPublished: 0, writingTopics: [], hasNextPage: false };
    const { rerender } = render(
      <ProfileRecordList
        username="amara"
        displayName="Amara Okafor"
        profileId="author-1"
        record={empty}
        viewerState="owner"
        isOwnProfile
      />
    );

    expect(screen.getByRole("heading", { name: "Your record starts with your first published piece" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Write a Post" })).toHaveAttribute("href", "/write");
    expect(screen.getByRole("link", { name: "Write an Article" })).toHaveAttribute("href", "/write?editor=article");

    rerender(
      <ProfileRecordList
        username="amara"
        displayName="Amara Okafor"
        profileId="author-1"
        record={empty}
        viewerState="anonymous"
        isOwnProfile={false}
      />
    );

    expect(screen.getByRole("heading", { name: "No published work yet" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Write a Post" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Write an Article" })).not.toBeInTheDocument();
  });
});
