import type { AnchorHTMLAttributes } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ContinueDraftRow from "./ContinueDraftRow";

const queryResult = vi.hoisted(() => ({
  current: {
    data: null as Array<Record<string, unknown>> | null,
    error: null as { message: string } | null,
  },
  throwOnCreate: false,
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => {
    if (queryResult.throwOnCreate) {
      throw new Error("Your project's URL and API key are required");
    }

    const builder = {
      select: () => builder,
      eq: () => builder,
      order: () => builder,
      limit: () => builder,
      then: (
        resolve: (value: typeof queryResult.current) => unknown,
        reject?: (reason: unknown) => unknown
      ) => Promise.resolve(queryResult.current).then(resolve, reject),
    };

    return { from: () => builder };
  },
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    onClick,
    ...rest
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} onClick={onClick} {...rest}>
      {children}
    </a>
  ),
}));

function draftRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "draft-1",
    title: "Land tenure reform",
    type: "essay",
    content_kind: "article",
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function renderRow(props: Partial<Parameters<typeof ContinueDraftRow>[0]> = {}) {
  return render(
    <ContinueDraftRow userId="user-1" onNavigate={() => {}} {...props} />
  );
}

describe("ContinueDraftRow", () => {
  beforeEach(() => {
    queryResult.current = { data: null, error: null };
    queryResult.throwOnCreate = false;
  });

  it("offers the most recent Article draft with a resume link", async () => {
    queryResult.current = { data: [draftRow()], error: null };

    renderRow();

    const link = await screen.findByRole("link", { name: /Continue latest draft/ });
    expect(link).toHaveAttribute("href", "/write?draft=draft-1");
    expect(screen.getByText("Land tenure reform")).toBeInTheDocument();
  });

  it("does not offer a Research draft while Research is switched off", async () => {
    queryResult.current = {
      data: [draftRow({ id: "draft-9", type: "research", content_kind: "research" })],
      error: null,
    };

    const { container } = renderRow();

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("names an untitled draft rather than showing a blank row", async () => {
    queryResult.current = { data: [draftRow({ title: "   " })], error: null };

    renderRow();

    expect(await screen.findByText("Untitled draft")).toBeInTheDocument();
  });

  it("skips a draft older than the seven-day resume window", async () => {
    const stale = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    queryResult.current = { data: [draftRow({ updated_at: stale })], error: null };

    const { container } = renderRow();

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("falls past a kind with no resume route to the next usable draft", async () => {
    queryResult.current = {
      data: [
        draftRow({ id: "draft-post", type: "blog", content_kind: "post" }),
        draftRow({ id: "draft-article" }),
      ],
      error: null,
    };

    renderRow();

    const link = await screen.findByRole("link", { name: /Continue latest draft/ });
    expect(link).toHaveAttribute("href", "/write?draft=draft-article");
  });

  it("shows nothing to a signed-out visitor", async () => {
    queryResult.current = { data: [draftRow()], error: null };

    const { container } = renderRow({ userId: null });

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("stays hidden when the lookup fails, since the row is only a shortcut", async () => {
    queryResult.current = { data: null, error: { message: "network down" } };

    const { container } = renderRow();

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("never lets an unavailable Supabase client take the create menu down", async () => {
    queryResult.throwOnCreate = true;

    const { container } = renderRow();

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("reports whether a draft was found so the chooser can reposition", async () => {
    const onResolved = vi.fn();
    queryResult.current = { data: [draftRow()], error: null };

    renderRow({ onResolved });

    await waitFor(() => expect(onResolved).toHaveBeenCalledWith(true));
  });
});
