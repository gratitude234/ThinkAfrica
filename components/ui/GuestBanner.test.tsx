import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GuestBanner from "./GuestBanner";

const navigationState = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationState.pathname,
}));

describe("GuestBanner", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => cleanup());

  it("does not render on Home -- Home renders its own inline HomeGuestNotice instead", async () => {
    navigationState.pathname = "/";
    render(<GuestBanner />);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText(/reading as a guest/i)).not.toBeInTheDocument();
  });

  it("still renders on other guest-visible routes, unchanged", async () => {
    navigationState.pathname = "/post/some-post";
    render(<GuestBanner />);

    await waitFor(() =>
      expect(screen.getByText(/reading as a guest/i)).toBeInTheDocument()
    );
  });
});
