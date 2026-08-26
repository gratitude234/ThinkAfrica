import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProfileRecordCard from "./ProfileRecordCard";
import ProfileWorkLink from "./ProfileWorkLink";

const trackActivationEvent = vi.hoisted(() => vi.fn());
vi.mock("@/lib/activationEvents", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/activationEvents")>()),
  trackActivationEvent,
}));

const tracking = {
  profileId: "author-1",
  viewerState: "anonymous" as const,
  surface: "latest_record" as const,
};

const publication = {
  id: "publication-1",
  title: "A public argument",
  slug: "a-public-argument",
  inResponseTo: null,
  excerpt: "The opening of a longer argument.",
  type: "essay",
  contentKind: "article",
  articleFormat: null,
  citationId: null,
  publishedVersionId: null,
  createdAt: "2026-08-20T10:00:00.000Z",
  publishedAt: "2026-08-20T10:00:00.000Z",
  coverImageUrl: null,
  tags: [],
  isCoAuthor: false,
  referenceCount: 1,
  coAuthors: [],
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
        workKind="publication"
        tracking={tracking}
      >
        A public argument
      </ProfileWorkLink>
    );

    await user.click(screen.getByRole("link"));

    expect(trackActivationEvent).toHaveBeenCalledWith({
      event: "profile_work_opened",
      source: "latest_record",
      metadata: {
        profileId: "author-1",
        viewerState: "anonymous",
        surface: "latest_record",
        workId: "publication-1",
        workKind: "publication",
      },
    });
  });

  it("still navigates, and sends nothing, without funnel context", async () => {
    const user = userEvent.setup();
    render(
      <ProfileWorkLink
        href="/post/a-public-argument"
        workId="publication-1"
        workKind="publication"
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

describe("ProfileRecordCard funnel wiring", () => {
  beforeEach(() => {
    trackActivationEvent.mockClear();
  });

  it("reports the entry kind the record classified, not the post type", async () => {
    const user = userEvent.setup();
    render(
      <ProfileRecordCard
        item={{
          id: publication.id,
          kind: "response",
          occurredAt: publication.publishedAt,
          publication,
        }}
        tracking={{ ...tracking, surface: "full_record", viewerState: "owner" }}
      />
    );

    await user.click(screen.getByRole("link", { name: "A public argument" }));

    expect(trackActivationEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "profile_work_opened",
        source: "full_record",
        metadata: expect.objectContaining({
          surface: "full_record",
          viewerState: "owner",
          workKind: "response",
          workId: "publication-1",
        }),
      })
    );
  });

  it("reports a debate argument by the debate it belongs to", async () => {
    const user = userEvent.setup();
    render(
      <ProfileRecordCard
        item={{
          id: "argument-3",
          kind: "debate",
          occurredAt: "2026-08-20T10:00:00.000Z",
          debate: {
            id: "argument-3",
            content: "The case against.",
            stance: "against",
            createdAt: "2026-08-20T10:00:00.000Z",
            debate: { id: "debate-7", title: "Should the levy stay?" },
          },
        }}
        tracking={tracking}
      />
    );

    await user.click(screen.getByRole("link", { name: "Should the levy stay?" }));

    expect(trackActivationEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          workKind: "debate",
          workId: "argument-3",
        }),
      })
    );
  });

  it("sends nothing when the page gave it no funnel context", async () => {
    const user = userEvent.setup();
    render(
      <ProfileRecordCard
        item={{
          id: publication.id,
          kind: "publication",
          occurredAt: publication.publishedAt,
          publication,
        }}
      />
    );

    await user.click(screen.getByRole("link", { name: "A public argument" }));
    expect(trackActivationEvent).not.toHaveBeenCalled();
  });
});
