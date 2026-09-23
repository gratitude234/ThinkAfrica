import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProfilePublicationList from "./ProfilePublicationList";
import ProfileWorkLink from "./ProfileWorkLink";

const trackActivationEvent = vi.hoisted(() => vi.fn());
vi.mock("@/lib/activationEvents", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/activationEvents")>()),
  trackActivationEvent,
}));

const tracking = {
  profileId: "author-1",
  viewerState: "anonymous" as const,
  surface: "profile_articles" as const,
};

describe("ProfileWorkLink", () => {
  beforeEach(() => {
    trackActivationEvent.mockClear();
  });

  it("records the work opened, its kind and the surface it came from", async () => {
    const user = userEvent.setup();
    render(
      <ProfileWorkLink
        href="/post/a-public-argument"
        workId="publication-1"
        workKind="article"
        tracking={tracking}
      >
        A public argument
      </ProfileWorkLink>
    );

    await user.click(screen.getByRole("link"));

    expect(trackActivationEvent).toHaveBeenCalledWith({
      event: "profile_work_opened",
      source: "profile_articles",
      metadata: {
        profileId: "author-1",
        viewerState: "anonymous",
        surface: "profile_articles",
        workId: "publication-1",
        workKind: "article",
      },
    });
  });

  it("still navigates, and sends nothing, without funnel context", async () => {
    const user = userEvent.setup();
    render(
      <ProfileWorkLink
        href="/post/a-public-argument"
        workId="publication-1"
        workKind="article"
      >
        A public argument
      </ProfileWorkLink>
    );

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/post/a-public-argument");
    await user.click(link);
    expect(trackActivationEvent).not.toHaveBeenCalled();
  });
});

function page(kind: "post" | "article", items: Array<Record<string, unknown>>) {
  return {
    kind,
    items: items.map((item) => ({
      id: "publication-1",
      title: "A public argument",
      slug: "a-public-argument",
      excerpt: "The opening of a longer argument.",
      kind,
      articleFormat: null,
      legacyType: kind === "post" ? "blog" : "essay",
      coverImageUrl: null,
      publishedAt: "2026-08-20T10:00:00.000Z",
      createdAt: "2026-08-20T10:00:00.000Z",
      isCoAuthor: false,
      ...item,
    })) as never,
    page: 1,
    pageSize: 20,
    hasPreviousPage: false,
    hasNextPage: false,
  };
}

describe("ProfilePublicationList", () => {
  beforeEach(() => {
    trackActivationEvent.mockClear();
  });

  it("reports the tab's kind and surface when a row is opened", async () => {
    const user = userEvent.setup();
    render(
      <ProfilePublicationList
        username="ada"
        profileId="author-1"
        tab="articles"
        publications={page("article", [{}])}
        isOwnProfile={false}
        viewerState="authenticated"
      />
    );

    await user.click(screen.getByRole("link", { name: "A public argument" }));

    expect(trackActivationEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "profile_work_opened",
        source: "profile_articles",
        metadata: expect.objectContaining({
          surface: "profile_articles",
          viewerState: "authenticated",
          workKind: "article",
          workId: "publication-1",
        }),
      })
    );
  });

  it("grades nothing on a row", () => {
    const { container } = render(
      <ProfilePublicationList
        username="ada"
        profileId="author-1"
        tab="articles"
        publications={page("article", [{}])}
        isOwnProfile={false}
        viewerState="anonymous"
      />
    );
    expect(container.textContent).not.toMatch(/citable|source-backed|sources|reviewed|co-author/i);
  });

  it("says a visitor's empty tab is empty, and nothing more", () => {
    render(
      <ProfilePublicationList
        username="ada"
        profileId="author-1"
        tab="posts"
        publications={page("post", [])}
        isOwnProfile={false}
        viewerState="anonymous"
      />
    );
    expect(screen.getByText("No posts yet.")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("offers the owner one way to start, and no checklist", () => {
    render(
      <ProfilePublicationList
        username="ada"
        profileId="author-1"
        tab="articles"
        publications={page("article", [])}
        isOwnProfile
        viewerState="owner"
      />
    );
    expect(screen.getByText("No articles yet.")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Write your first Post or Article" })
    ).toHaveAttribute("href", "/write");
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("pages with plain addresses on the same tab", () => {
    render(
      <ProfilePublicationList
        username="ada"
        profileId="author-1"
        tab="articles"
        publications={{ ...page("article", [{}]), page: 2, hasPreviousPage: true, hasNextPage: true }}
        isOwnProfile={false}
        viewerState="anonymous"
      />
    );
    expect(screen.getByRole("link", { name: "Newer" })).toHaveAttribute(
      "href",
      "/ada?view=articles"
    );
    expect(screen.getByRole("link", { name: "Older" })).toHaveAttribute(
      "href",
      "/ada?view=articles&page=3"
    );
  });
});
