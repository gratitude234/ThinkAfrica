import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import InlineResponseComposer from "./InlineResponseComposer";

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn(), ensure: vi.fn(), submit: vi.fn(), requestAuth: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh, push: mocks.push }) }));
vi.mock("@/app/(write)/write/actions", () => ({ ensureContributionDraft: (input: unknown) => mocks.ensure(input) }));
vi.mock("./commentActions", () => ({ submitComment: (input: unknown) => mocks.submit(input) }));
vi.mock("@/components/ui/GuestAuthGateProvider", () => ({ useGuestAuthGate: () => ({ requestAuth: mocks.requestAuth }) }));

describe("InlineResponseComposer", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.ensure.mockResolvedValue({ error: null, draftId: "draft-22" });
    mocks.submit.mockResolvedValue({ error: null, comment: { id: "c1" } });
  });

  it("keeps comments inline", async () => {
    render(<InlineResponseComposer parentPostId="parent-1" userId="user-1" />);
    fireEvent.change(screen.getByLabelText("Write a comment"), { target: { value: "A comment." } });
    fireEvent.click(screen.getByRole("button", { name: "Comment" }));
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledWith({ postId: "parent-1", content: "A comment." }));
  });

  it("opens the universal editor directly when empty", () => {
    render(<InlineResponseComposer parentPostId="parent-1" userId="user-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Open editor" }));
    expect(mocks.push).toHaveBeenCalledWith("/write?inResponseTo=parent-1");
  });

  it("saves typed text before handing off to the editor", async () => {
    render(<InlineResponseComposer parentPostId="parent-1" userId="user-1" />);
    fireEvent.change(screen.getByLabelText("Write a comment"), { target: { value: "Needs more room." } });
    fireEvent.click(screen.getByRole("button", { name: "Open editor" }));
    await waitFor(() => expect(mocks.ensure).toHaveBeenCalled());
    expect(mocks.ensure.mock.calls[0][0].snapshot).toMatchObject({ title: "", inResponseToId: "parent-1" });
    expect(mocks.push).toHaveBeenCalledWith("/write?draft=draft-22");
  });

  it("gates guests to the contextual universal editor", () => {
    render(<InlineResponseComposer parentPostId="parent-1" userId={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Sign in to reply" }));
    expect(mocks.requestAuth).toHaveBeenCalledWith("respond", { destination: "/write?inResponseTo=parent-1" });
  });
});
