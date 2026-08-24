import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import FeaturedWorkManager from "./FeaturedWorkManager";

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  update: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("@/app/(main)/[username]/actions", () => ({
  loadMyFeaturedWorkOptions: mocks.load,
  updateProfileFeaturedPosts: mocks.update,
}));

describe("FeaturedWorkManager", () => {
  it("loads options only when opened and restores focus after Escape", async () => {
    mocks.load.mockResolvedValueOnce({ options: [], error: null });
    const user = userEvent.setup();
    render(<FeaturedWorkManager initialPostIds={[]} />);

    expect(mocks.load).not.toHaveBeenCalled();
    const trigger = screen.getByRole("button", { name: "Add featured work" });
    await user.click(trigger);

    const dialog = await screen.findByRole("dialog", {
      name: "Manage featured work",
    });
    expect(mocks.load).toHaveBeenCalledTimes(1);
    expect(dialog).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
