import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SearchOverlay from "./SearchOverlay";

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigation.push, replace: vi.fn() }),
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
  vi.useRealTimers();
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

describe("SearchOverlay retired review and citation badges", () => {
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

  it("never shows Reviewed or Citable, even for a publication from the retired workflow", async () => {
    await searchAndGetResult({
      id: "2",
      title: "An accepted policy brief",
      slug: "p2",
      type: "policy_brief",
      citation_id: "IND-2026-0001",
      published_version_id: "11111111-1111-1111-1111-111111111111",
      profiles: null,
    });

    expect(screen.queryByText("Reviewed")).not.toBeInTheDocument();
    expect(screen.queryByText("Citable")).not.toBeInTheDocument();
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

  it("shows a recoverable error when the request fails", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    render(<SearchOverlay isOpen onClose={vi.fn()} />);
    await userEvent.type(screen.getByRole("textbox"), "anything");

    expect(await screen.findByText(/Search is unavailable/)).toBeInTheDocument();
  });

  it("ignores a slow response that a later keystroke has superseded", async () => {
    vi.useFakeTimers();

    // Debouncing orders the requests, not the responses. A slow "af" landing
    // after a fast "africa" used to replace the right results with stale ones.
    let resolveFirst: (value: unknown) => void = () => {};
    let resolveSecond: (value: unknown) => void = () => {};
    fetchMock
      .mockImplementationOnce(
        () => new Promise((resolve) => (resolveFirst = resolve))
      )
      .mockImplementationOnce(
        () => new Promise((resolve) => (resolveSecond = resolve))
      );

    render(<SearchOverlay isOpen onClose={vi.fn()} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "a" } });
    fireEvent.change(input, { target: { value: "af" } });
    expect(fetchMock).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(300));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.change(input, { target: { value: "africa" } });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(300));
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolveSecond({
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
    });
    expect(screen.getByText("The current answer")).toBeInTheDocument();

    await act(async () => {
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
    });

    expect(screen.queryByText("The stale answer")).not.toBeInTheDocument();
    expect(screen.getByText("The current answer")).toBeInTheDocument();
  });
});

describe("global shell search", () => {
  it("shows Post excerpts instead of legacy titles and includes writers", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({
      posts: [{ id: "post", title: "Legacy heading", excerpt: "<p>A short thought</p>", content_kind: "post", slug: "thought", profiles: null }],
      people: [{ id: "writer", username: "amara", full_name: "Amara Okafor", avatar_url: null }],
    }) });
    render(<SearchOverlay isOpen onClose={vi.fn()} />);
    await userEvent.type(screen.getByRole("textbox"), "thought");
    expect(await screen.findByText("A short thought")).toBeInTheDocument();
    expect(screen.queryByText("Legacy heading")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Amara Okafor/ })).toHaveAttribute("href", "/amara");
    expect(screen.getByRole("link", { name: /A short thought/ })).toHaveAttribute("href", "/post/thought");
  });

  it("cancels pending results when the input is cleared", async () => {
    let resolve: (value: unknown) => void = () => {};
    fetchMock.mockImplementation(() => new Promise(done => { resolve = done; }));
    render(<SearchOverlay isOpen onClose={vi.fn()} />);
    await userEvent.type(screen.getByRole("textbox"), "pending");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await userEvent.click(screen.getByRole("button", { name: "Clear search" }));
    await act(async () => resolve({ ok: true, json: async () => ({ posts: [{ id: "old", title: "Stale", slug: "old" }] }) }));
    expect(screen.queryByText("Stale")).not.toBeInTheDocument();
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it("autofocuses, wraps Tab, and restores focus on close", async () => {
    const trigger = document.createElement("button"); document.body.append(trigger); trigger.focus();
    const view = render(<SearchOverlay isOpen onClose={vi.fn()} />);
    const input = screen.getByRole("textbox");
    expect(input).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Close search" })).toHaveFocus();
    await userEvent.tab(); expect(input).toHaveFocus();
    view.rerender(<SearchOverlay isOpen={false} onClose={vi.fn()} />);
    expect(trigger).toHaveFocus(); trigger.remove();
  });
});


it("opens the keyboard-selected writer with Enter", async () => {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({
    posts: [{ id: "a", title: "An article", slug: "article", content_kind: "article", profiles: null }],
    people: [{ id: "w", username: "amara", full_name: "Amara", avatar_url: null }],
  }) });
  const close = vi.fn();
  render(<SearchOverlay isOpen onClose={close} />);
  const input = screen.getByRole("textbox");
  await userEvent.type(input, "amara");
  await screen.findByText("@amara");
  await userEvent.keyboard("{ArrowDown}{Enter}");
  expect(navigation.push).toHaveBeenCalledWith("/amara");
  expect(close).toHaveBeenCalled();
});
