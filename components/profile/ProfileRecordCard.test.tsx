import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ProfileRecordCard from "./ProfileRecordCard";

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

describe("ProfileRecordCard", () => {
  it("renders titled publications editorially with evidence labels", () => {
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

    expect(screen.getByRole("heading", { name: "A public argument" })).toBeInTheDocument();
    expect(screen.getByText("Source-backed")).toBeInTheDocument();
    expect(screen.queryByText("Article", { exact: true })).not.toBeInTheDocument();
  });

  it("renders untitled responses compactly with a neutral Response label", () => {
    render(
      <ProfileRecordCard
        item={{
          id: "response-1",
          kind: "response",
          occurredAt: publication.publishedAt,
          publication: {
            ...publication,
            id: "response-1",
            title: null,
            slug: "response-1",
            inResponseTo: "parent-1",
            excerpt: "A concise public response.",
            type: "blog",
            contentKind: "post",
            referenceCount: 0,
          },
        }}
      />
    );

    expect(screen.getByText("Response")).toBeInTheDocument();
    expect(screen.getByText("A concise public response.")).toBeInTheDocument();
    // The row itself is the link now, so an untitled response leads with its
    // own text rather than a separate "Read response" call to action.
    expect(
      screen.getByRole("link", { name: "A concise public response." })
    ).toHaveAttribute("href", "/post/response-1");
    expect(screen.getAllByText("A concise public response.")).toHaveLength(1);
    expect(screen.queryByText("Post", { exact: true })).not.toBeInTheDocument();
  });
});
