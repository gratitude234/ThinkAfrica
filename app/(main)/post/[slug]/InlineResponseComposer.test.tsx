import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import InlineResponseComposer from "./InlineResponseComposer";

const refresh = vi.fn();
const createPost = vi.fn();
const requestAuth = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/app/(write)/create/post/actions", () => ({
  createPost: (input: unknown) => createPost(input),
}));
vi.mock("@/components/ui/GuestAuthGateProvider", () => ({
  useGuestAuthGate: () => ({ requestAuth }),
}));

beforeEach(() => {
  refresh.mockClear();
  createPost.mockReset().mockResolvedValue({ error: null, slug: "post-abc" });
  requestAuth.mockClear();
});

function typeResponse(text: string) {
  fireEvent.change(screen.getByLabelText("Write a response"), { target: { value: text } });
}

describe("InlineResponseComposer", () => {
  it("gates guests to sign-in rather than showing a composer they can't submit", () => {
    render(<InlineResponseComposer parentPostId="parent-1" userId={null} />);

    expect(screen.queryByLabelText("Write a response")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Sign in to respond" }));
    expect(requestAuth).toHaveBeenCalledWith("respond", { contentKind: "post" });
  });

  it("won't submit an empty response", () => {
    render(<InlineResponseComposer parentPostId="parent-1" userId="user-1" />);
    expect(screen.getByRole("button", { name: "Respond" })).toBeDisabled();
  });

  it("posts the response against the parent and refreshes the thread", async () => {
    render(<InlineResponseComposer parentPostId="parent-1" userId="user-1" />);

    typeResponse("Sharp point about scope.");
    fireEvent.click(screen.getByRole("button", { name: "Respond" }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(createPost).toHaveBeenCalledWith({
      body: "Sharp point about scope.",
      topics: [],
      inResponseTo: "parent-1",
    });
    expect(screen.getByLabelText("Write a response")).toHaveValue("");
  });

  it("submits on Cmd/Ctrl+Enter", async () => {
    render(<InlineResponseComposer parentPostId="parent-1" userId="user-1" />);

    typeResponse("Ship it.");
    fireEvent.keyDown(screen.getByLabelText("Write a response"), {
      key: "Enter",
      metaKey: true,
    });

    await waitFor(() => expect(createPost).toHaveBeenCalledTimes(1));
  });

  it("keeps the draft and shows the error when publishing fails", async () => {
    createPost.mockResolvedValue({ error: "You must be signed in.", slug: null });
    render(<InlineResponseComposer parentPostId="parent-1" userId="user-1" />);

    typeResponse("Draft worth keeping.");
    fireEvent.click(screen.getByRole("button", { name: "Respond" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("You must be signed in."));
    expect(screen.getByLabelText("Write a response")).toHaveValue("Draft worth keeping.");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("offers the long-form editor as the secondary path", () => {
    render(<InlineResponseComposer parentPostId="parent-1" userId="user-1" />);

    expect(
      screen.getByRole("link", { name: "Write a long-form response" }).getAttribute("href")
    ).toBe("/write?inResponseTo=parent-1&kind=article");
  });
});
