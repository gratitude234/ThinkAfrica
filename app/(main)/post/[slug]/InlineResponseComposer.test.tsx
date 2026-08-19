import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { COMMENT_PROMOTION_THRESHOLD } from "@/lib/commentContent";
import InlineResponseComposer from "./InlineResponseComposer";

const refresh = vi.fn();
const createPost = vi.fn();
const submitComment = vi.fn();
const requestAuth = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/app/(write)/create/post/actions", () => ({
  createPost: (input: unknown) => createPost(input),
}));
vi.mock("./commentActions", () => ({
  submitComment: (input: unknown) => submitComment(input),
}));
vi.mock("@/components/ui/GuestAuthGateProvider", () => ({
  useGuestAuthGate: () => ({ requestAuth }),
}));

beforeEach(() => {
  refresh.mockClear();
  createPost.mockReset().mockResolvedValue({ error: null, slug: "post-abc" });
  submitComment.mockReset().mockResolvedValue({ error: null, comment: { id: "c1" } });
  requestAuth.mockClear();
});

function typeReply(text: string) {
  fireEvent.change(screen.getByLabelText("Write a comment"), { target: { value: text } });
}

describe("InlineResponseComposer", () => {
  it("gates guests to sign-in rather than showing a box they can't submit", () => {
    render(<InlineResponseComposer parentPostId="parent-1" userId={null} />);

    expect(screen.queryByLabelText("Write a comment")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Sign in to reply" }));
    expect(requestAuth).toHaveBeenCalledWith("respond", { contentKind: "post" });
  });

  it("won't submit an empty reply", () => {
    render(<InlineResponseComposer parentPostId="parent-1" userId="user-1" />);
    expect(screen.getByRole("button", { name: "Comment" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Publish as a Response" })).toBeDisabled();
  });

  it("posts a comment by default, not a published Response", async () => {
    render(<InlineResponseComposer parentPostId="parent-1" userId="user-1" />);

    typeReply("Sharp point about scope.");
    fireEvent.click(screen.getByRole("button", { name: "Comment" }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(submitComment).toHaveBeenCalledWith({
      postId: "parent-1",
      content: "Sharp point about scope.",
    });
    expect(createPost).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Write a comment")).toHaveValue("");
  });

  it("publishes a Response only when that is explicitly chosen", async () => {
    render(<InlineResponseComposer parentPostId="parent-1" userId="user-1" />);

    typeReply("A developed counter-argument.");
    fireEvent.click(screen.getByRole("button", { name: "Publish as a Response" }));

    await waitFor(() =>
      expect(createPost).toHaveBeenCalledWith({
        body: "A developed counter-argument.",
        topics: [],
        inResponseTo: "parent-1",
      })
    );
    expect(submitComment).not.toHaveBeenCalled();
  });

  it("suggests promotion past the threshold without switching on its own", async () => {
    render(<InlineResponseComposer parentPostId="parent-1" userId="user-1" />);

    typeReply("a".repeat(COMMENT_PROMOTION_THRESHOLD - 1));
    expect(screen.queryByText(/stand on its own/)).toBeNull();

    typeReply("a".repeat(COMMENT_PROMOTION_THRESHOLD));
    expect(screen.getByText(/stand on its own/)).toBeInTheDocument();

    // The default action is still a comment.
    fireEvent.click(screen.getByRole("button", { name: "Comment" }));
    await waitFor(() => expect(submitComment).toHaveBeenCalledTimes(1));
    expect(createPost).not.toHaveBeenCalled();
  });

  it("submits on Cmd/Ctrl+Enter", async () => {
    render(<InlineResponseComposer parentPostId="parent-1" userId="user-1" />);

    typeReply("Ship it.");
    fireEvent.keyDown(screen.getByLabelText("Write a comment"), { key: "Enter", metaKey: true });

    await waitFor(() => expect(submitComment).toHaveBeenCalledTimes(1));
  });

  it("keeps the draft and shows the error when posting fails", async () => {
    submitComment.mockResolvedValue({ error: "You must be signed in." });
    render(<InlineResponseComposer parentPostId="parent-1" userId="user-1" />);

    typeReply("Draft worth keeping.");
    fireEvent.click(screen.getByRole("button", { name: "Comment" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("You must be signed in.")
    );
    expect(screen.getByLabelText("Write a comment")).toHaveValue("Draft worth keeping.");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("offers the long-form editor as the third path", () => {
    render(<InlineResponseComposer parentPostId="parent-1" userId="user-1" />);

    expect(
      screen.getByRole("link", { name: "Open the full editor" }).getAttribute("href")
    ).toBe("/write?inResponseTo=parent-1&kind=article");
  });

  it("gives Response the same weight as Comment rather than a text link", () => {
    render(<InlineResponseComposer parentPostId="parent-1" userId="user-1" />);

    const respond = screen.getByRole("button", { name: "Publish as a Response" });
    const comment = screen.getByRole("button", { name: "Comment" });

    // Both are full-height buttons. Response used to be a 13px text link beside
    // a filled button, which styled the consequential action as the throwaway.
    expect(respond.className).toContain("min-h-11");
    expect(comment.className).toContain("min-h-11");
  });

  it("keeps the textarea id addressable so a second composer can coexist", () => {
    const { unmount } = render(
      <InlineResponseComposer parentPostId="parent-1" userId="user-1" />
    );
    expect(document.getElementById("inline-response")).not.toBeNull();
    unmount();

    render(
      <InlineResponseComposer
        parentPostId="parent-1"
        userId="user-1"
        composerId="inline-response-foot"
      />
    );
    expect(document.getElementById("inline-response-foot")).not.toBeNull();
    expect(document.getElementById("inline-response")).toBeNull();
  });
});
