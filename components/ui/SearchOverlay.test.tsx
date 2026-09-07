import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SearchOverlay from "./SearchOverlay";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

/**
 * The overlay no longer queries the database. It asks /api/search, so what is
 * stubbed here is fetch, and the assertions are about what the component does
 * with an answer rather than about how it obtained one.
 */
const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function respondWith(posts: Array<Record<string, unknown>>) {
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ posts }),
  });
}

async function searchAndGetResult(result: Record<string, unknown>) {
  respondWith([result]);
  render(<SearchOverlay isOpen onClose={vi.fn()} />);
  await userEvent.type(screen.getByRole("textbox"), "test query");

  return screen.findByText(String(result.title));
}

describe("SearchOverlay Reviewed badge", () => {
  it("does not claim a pending policy brief is Reviewed based on type alone", async () => {
    await searchAndGetResult({
      id: "1",
      title: "A pending policy brief",
      slug: "p1",
      type: "policy_brief",
      citation_id: null,
      published_version_id: null,
      profiles: null,
    });

    expect(screen.queryByText("Reviewed")).not.toBeInTheDocument();
  });

  it("shows Reviewed once a policy brief has an accepted published version", async () => {
    await searchAndGetResult({
      id: "2",
      title: "An accepted policy brief",
      slug: "p2",
      type: "policy_brief",
      citation_id: null,
      published_version_id: "11111111-1111-1111-1111-111111111111",
      profiles: null,
    });

    expect(await screen.findByText("Reviewed")).toBeInTheDocument();
  });
});

describe("SearchOverlay request handling", () => {
  it("asks the application, never the database, and sends the query encoded", async () => {
    // The whole point of the move: a browser holding a database credential is
    // what makes a non-Supabase database impossible.
    respondWith([]);
    render(<SearchOverlay isOpen onClose={vi.fn()} />);
    await userEvent.type(screen.getByRole("textbox"), "a, b");

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const url = String(fetchMock.mock.calls.at(-1)?.[0]);
    expect(url).toContain("/api/search?scope=overlay");
    // A comma is data. Interpolated raw into a PostgREST filter it used to be
    // grammar, and the search silently returned nothing.
    expect(url).toContain(encodeURIComponent("a, b"));
  });

  it("shows nothing rather than throwing when the request fails", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    render(<SearchOverlay isOpen onClose={vi.fn()} />);
    await userEvent.type(screen.getByRole("textbox"), "anything");

    expect(await screen.findByText(/No posts found/)).toBeInTheDocument();
  });

  it("ignores a slow response that a later keystroke has superseded", async () => {
    // Debouncing orders the requests, not the responses. A slow "af" landing
    // after a fast "africa" used to replace the right results with stale ones.
    let resolveFirst: (value: unknown) => void = () => {};
    fetchMock
      .mockImplementationOnce(
        () => new Promise((resolve) => (resolveFirst = resolve))
      )
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          posts: [
            {
              id: "2",
              title: "The current answer",
              slug: "current",
              type: "essay",
              citation_id: null,
              published_version_id: null,
              profiles: null,
            },
          ],
        }),
      });

    render(<SearchOverlay isOpen onClose={vi.fn()} />);
    await userEvent.type(screen.getByRole("textbox"), "af");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    await userEvent.type(screen.getByRole("textbox"), "rica");
    expect(await screen.findByText("The current answer")).toBeInTheDocument();

    resolveFirst({
      ok: true,
      json: async () => ({
        posts: [
          {
            id: "1",
            title: "The stale answer",
            slug: "stale",
            type: "essay",
            citation_id: null,
            published_version_id: null,
            profiles: null,
          },
        ],
      }),
    });

    await vi.waitFor(() =>
      expect(screen.queryByText("The stale answer")).not.toBeInTheDocument()
    );
    expect(screen.getByText("The current answer")).toBeInTheDocument();
  });
});
