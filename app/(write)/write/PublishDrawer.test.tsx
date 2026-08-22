import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ArticleFormat } from "@/lib/contentModel";
import PublishDrawer from "./PublishDrawer";
import { publishPost } from "./actions";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: null, error: null }),
          limit: () => Promise.resolve({ data: [], error: null }),
        }),
        limit: () => Promise.resolve({ data: [], error: null }),
      }),
    }),
  }),
}));

vi.mock("@/lib/activationEvents", () => ({
  trackActivationEvent: vi.fn(),
}));

vi.mock("./actions", () => ({
  publishPost: vi.fn(async () => ({ error: null, slug: "a-slug" })),
}));

/**
 * Caught in review: this drawer used to hardcode articleFormat back to
 * null every time it opened (`useEffect(() => { ... setArticleFormat(null);
 * ... }, [open])`), regardless of what genre the underlying draft actually
 * had. Reopening and publishing a Policy-Brief-format Article silently
 * converted it to General. These tests exercise the fix: the drawer must
 * initialize from -- and reset to -- initialArticleFormat, and must tell
 * its parent about every selection via onMetadataChange so a value picked
 * in one open cycle survives being closed and reopened.
 */
function renderDrawer(overrides: Partial<React.ComponentProps<typeof PublishDrawer>> = {}) {
  const onMetadataChange = overrides.onMetadataChange ?? vi.fn();
  const props: React.ComponentProps<typeof PublishDrawer> = {
    open: overrides.open ?? true,
    onClose: overrides.onClose ?? vi.fn(),
    draftId: overrides.draftId ?? "draft-1",
    title: overrides.title ?? "A real title",
    content: overrides.content ?? "<p>Enough words to pass validation here easily.</p>",
    wordCount: overrides.wordCount ?? 60,
    initialTags: overrides.initialTags ?? [],
    initialReferences: overrides.initialReferences ?? [],
    initialPostType: overrides.initialPostType ?? "essay",
    initialArticleFormat: overrides.initialArticleFormat ?? null,
    onMetadataChange,
    coverUploading: overrides.coverUploading ?? false,
    onCoverUploadingChange: overrides.onCoverUploadingChange ?? vi.fn(),
  };
  const utils = render(<PublishDrawer {...props} />);
  return { ...utils, onMetadataChange };
}

function genreButton(label: "General" | "Essay" | "Policy Brief") {
  return screen.getByRole("button", { name: label });
}

describe("PublishDrawer genre picker", () => {
  it("initializes the genre picker from initialArticleFormat instead of always starting at General", () => {
    renderDrawer({ initialArticleFormat: "policy_brief" as ArticleFormat });

    expect(genreButton("Policy Brief")).toHaveAttribute("aria-pressed", "true");
    expect(genreButton("General")).toHaveAttribute("aria-pressed", "false");
  });

  it("reports a genre selection to the parent via onMetadataChange, not just local state", async () => {
    const user = userEvent.setup();
    const { onMetadataChange } = renderDrawer({ initialArticleFormat: null });

    await user.click(genreButton("Policy Brief"));

    expect(onMetadataChange).toHaveBeenCalledWith({ articleFormat: "policy_brief" });
    expect(genreButton("Policy Brief")).toHaveAttribute("aria-pressed", "true");
  });

  it("reports clearing back to General as an explicit null, not a no-op", async () => {
    const user = userEvent.setup();
    const { onMetadataChange } = renderDrawer({ initialArticleFormat: "essay" as ArticleFormat });

    await user.click(genreButton("General"));

    expect(onMetadataChange).toHaveBeenCalledWith({ articleFormat: null });
    expect(genreButton("General")).toHaveAttribute("aria-pressed", "true");
  });

  it("resets to the current initialArticleFormat prop when reopened, rather than a hardcoded null", () => {
    const { rerender } = renderDrawer({ open: false, initialArticleFormat: "policy_brief" as ArticleFormat });

    // Closed drawers render nothing -- this simulates the parent having
    // updated initialArticleFormat (via the earlier onMetadataChange call)
    // while the drawer was closed, then the user reopening it.
    rerender(
      <PublishDrawer
        open={true}
        onClose={vi.fn()}
        draftId="draft-1"
        title="A real title"
        content="<p>Enough words to pass validation here easily.</p>"
        wordCount={60}
        initialPostType="essay"
        initialArticleFormat={"policy_brief" as ArticleFormat}
        coverUploading={false}
        onCoverUploadingChange={vi.fn()}
      />
    );

    expect(genreButton("Policy Brief")).toHaveAttribute("aria-pressed", "true");
  });

  it("treats a legacy Policy Brief draft as an immediately-published Article genre", () => {
    renderDrawer({ initialPostType: "policy_brief" });

    expect(genreButton("Policy Brief")).toBeInTheDocument();
    expect(screen.getByText("Public immediately")).toBeInTheDocument();
  });

  it("requires one explicit confirmation but still allows publishing an Article without topics", async () => {
    const user = userEvent.setup();
    const mockedPublishPost = vi.mocked(publishPost);
    mockedPublishPost.mockClear();
    renderDrawer({
      initialTags: [],
      wordCount: 100,
      content: `<p>${Array.from({ length: 100 }, () => "word").join(" ")}</p>`,
    });

    await user.click(screen.getByRole("button", { name: "Publish now" }));

    expect(mockedPublishPost).not.toHaveBeenCalled();
    expect(screen.getByText("Publish without topics?")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Publish without topics" })
    );
    expect(mockedPublishPost).toHaveBeenCalledOnce();
  });

  it("supports arrow-key navigation across the publication preview tabs", () => {
    renderDrawer();

    const feedTab = screen.getByRole("tab", { name: "Feed" });
    feedTab.focus();
    fireEvent.keyDown(feedTab, { key: "ArrowRight" });

    const articleTab = screen.getByRole("tab", { name: "Article" });
    expect(articleTab).toHaveAttribute("aria-selected", "true");
    expect(articleTab).toHaveFocus();
    expect(screen.getByRole("tabpanel")).toHaveAttribute(
      "aria-labelledby",
      articleTab.id
    );
  });

  it("blocks publication until a partially-entered source is completed or removed", () => {
    renderDrawer({
      initialReferences: [
        {
          id: "source-1",
          post_id: "draft-1",
          display_order: 0,
          ref_type: "other",
          authors: null,
          title: "A source without verification details",
          year: null,
          source: null,
          url: null,
          doi: null,
          raw: null,
        },
      ],
    });

    expect(screen.getByText(/Complete or remove 1 incomplete source/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish now" })).toBeDisabled();
  });

  it("blocks publication when the body cites a source that was removed", () => {
    renderDrawer({
      content:
        '<p>A claim <a href="#ref-id-11111111-1111-4111-8111-111111111111">[source]</a></p>',
      initialReferences: [],
    });

    expect(screen.getByText(/citation marker.*no longer has a source/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish now" })).toBeDisabled();
  });

  it("recovers from a rejected publish request instead of leaving the drawer stuck", async () => {
    const user = userEvent.setup();
    vi.mocked(publishPost).mockRejectedValueOnce(new Error("offline"));
    renderDrawer({ initialTags: ["Education"] });

    await user.click(screen.getByRole("button", { name: "Publish now" }));

    expect(
      await screen.findByText(/check your connection and try again/i)
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish now" })).toBeEnabled();
  });
});
