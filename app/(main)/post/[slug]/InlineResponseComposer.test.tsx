import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import InlineResponseComposer from "./InlineResponseComposer";

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn(), submit: vi.fn(), requestAuth: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh, push: mocks.push }) }));
vi.mock("./commentActions", () => ({ submitComment: (input: unknown) => mocks.submit(input) }));
vi.mock("@/components/ui/GuestAuthGateProvider", () => ({ useGuestAuthGate: () => ({ requestAuth: mocks.requestAuth }) }));

describe("InlineResponseComposer", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.submit.mockResolvedValue({ error: null, comment: { id: "c1" } });
  });

  it("keeps comments inline", async () => {
    render(<InlineResponseComposer parentPostId="parent-1" userId="user-1" />);
    fireEvent.change(screen.getByLabelText("Add to the discussion"), { target: { value: "A comment." } });
    fireEvent.click(screen.getByRole("button", { name: "Comment" }));
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledWith({ postId: "parent-1", content: "A comment." }));
  });

  it("offers no way to turn a comment into a publication", () => {
    render(<InlineResponseComposer parentPostId="parent-1" userId="user-1" />);
    fireEvent.change(screen.getByLabelText("Add to the discussion"), { target: { value: "Needs more room." } });

    // Responses are retired. The only control is the one that posts a comment.
    expect(screen.queryByRole("button", { name: "Open editor" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(["Comment"]);
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("asks a guest to sign in without sending them to the composer", () => {
    render(<InlineResponseComposer parentPostId="parent-1" userId={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Sign in to join the discussion…" }));
    expect(mocks.requestAuth).toHaveBeenCalledWith("respond", { contentKind: "post" });
    expect(JSON.stringify(mocks.requestAuth.mock.calls)).not.toContain("/write");
  });
});
