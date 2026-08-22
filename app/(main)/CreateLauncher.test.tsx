import { cleanup, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CreateLauncher from "./CreateLauncher";

const mocks = vi.hoisted(() => ({ requestAuth: vi.fn(), push: vi.fn() }));

// Defaults to "no resumable draft" so the format-only assertions below are
// unaffected; the resume tests set rows explicitly.
const draftRows = vi.hoisted(() => ({ current: [] as Array<Record<string, unknown>> }));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      order: () => builder,
      limit: () => builder,
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: draftRows.current, error: null }).then(resolve),
    };
    return { from: () => builder };
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@/components/ui/GuestAuthGateProvider", () => ({
  useGuestAuthGate: () => ({ requestAuth: mocks.requestAuth }),
}));

describe("CreateLauncher -- contribution chooser", () => {
  beforeEach(() => {
    mocks.requestAuth.mockReset();
    mocks.push.mockReset();
    draftRows.current = [];
  });

  afterEach(() => cleanup());

  it("opens the mobile contribution chooser with all three canonical formats", () => {
    render(<CreateLauncher userId="user-1" variant="mobileFab" />);

    fireEvent.click(
      screen.getByRole("button", { name: "Create a contribution" })
    );

    expect(screen.getByRole("dialog", { name: "Create a contribution" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Post/ })).toHaveAttribute("href", "/create/post");
    expect(screen.getByRole("link", { name: /^Article/ })).toHaveAttribute(
      "href",
      "/write?kind=article"
    );
    expect(screen.getByRole("link", { name: /^Research/ })).toHaveAttribute(
      "href",
      "/submit/research"
    );
  });

  it("opens the chooser from the desktop Contribute button", () => {
    render(<CreateLauncher userId="user-1" variant="desktop" />);

    fireEvent.click(screen.getByRole("button", { name: "Contribute" }));

    expect(screen.getByRole("dialog", { name: "Create a contribution" })).toBeInTheDocument();
  });

  it("lets a guest choose first and preserves that exact destination for sign-in", () => {
    render(<CreateLauncher userId={null} variant="mobileFab" />);

    fireEvent.click(
      screen.getByRole("button", { name: "Create a contribution" })
    );
    fireEvent.click(screen.getByRole("button", { name: /^Article/ }));

    expect(mocks.requestAuth).toHaveBeenCalledWith("create", {
      contentKind: "article",
      destination: "/write?kind=article",
    });
    expect(mocks.push).not.toHaveBeenCalled();
  });


  it("offers the latest draft above the formats, so resuming beats starting over", async () => {
    draftRows.current = [
      {
        id: "draft-1",
        title: "Land tenure reform",
        type: "essay",
        content_kind: "article",
        updated_at: new Date().toISOString(),
      },
    ];

    render(<CreateLauncher userId="user-1" variant="desktop" />);
    fireEvent.click(screen.getByRole("button", { name: "Contribute" }));

    const dialog = screen.getByRole("dialog", { name: "Create a contribution" });
    await waitFor(() =>
      expect(
        within(dialog).getByRole("link", { name: /Continue latest draft/ })
      ).toBeInTheDocument()
    );

    // Order is the point: the resume row has to precede the three formats.
    const hrefs = within(dialog)
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));
    expect(hrefs).toEqual([
      "/write?draft=draft-1",
      "/create/post",
      "/write?kind=article",
      "/submit/research",
    ]);
  });

  it("shows only the three formats when there is nothing worth resuming", async () => {
    render(<CreateLauncher userId="user-1" variant="desktop" />);
    fireEvent.click(screen.getByRole("button", { name: "Contribute" }));

    const dialog = screen.getByRole("dialog", { name: "Create a contribution" });
    await waitFor(() =>
      expect(within(dialog).getAllByRole("link")).toHaveLength(3)
    );
    expect(
      within(dialog).queryByText(/Continue latest draft/)
    ).not.toBeInTheDocument();
  });

  it("never offers a guest someone else's draft", async () => {
    draftRows.current = [
      {
        id: "draft-1",
        title: "Land tenure reform",
        type: "essay",
        content_kind: "article",
        updated_at: new Date().toISOString(),
      },
    ];

    render(<CreateLauncher userId={null} variant="mobileFab" />);
    fireEvent.click(
      screen.getByRole("button", { name: "Create a contribution" })
    );

    const dialog = screen.getByRole("dialog", { name: "Create a contribution" });
    await waitFor(() =>
      expect(within(dialog).getAllByRole("button")).not.toHaveLength(0)
    );
    expect(
      within(dialog).queryByText(/Continue latest draft/)
    ).not.toBeInTheDocument();
  });

  it("gives the desktop trigger and mobile trigger distinct accessible names", () => {
    render(
      <>
        <CreateLauncher userId="user-1" variant="desktop" />
        <CreateLauncher userId="user-1" variant="mobileFab" />
      </>
    );

    expect(screen.getByRole("button", { name: "Contribute" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create a contribution" })
    ).toBeInTheDocument();
  });

  // jsdom has no real layout/media-query engine, so this can't be proven by
  // resizing a viewport -- it asserts on the Tailwind breakpoint utilities
  // that *are* the visibility contract, the same way the rest of NavClient's
  // responsive chrome (search bar, desktop nav links, BottomNav)
  // switches at `md`. Both Create controls must flip at that identical
  // token, or there is a window (previously 640-767px, `sm` vs `md`) where
  // both are visible at once.
  it("flips the desktop and mobile controls at the identical `md` breakpoint, with no `sm` gap between them", () => {
    render(
      <>
        <CreateLauncher userId="user-1" variant="desktop" />
        <CreateLauncher userId="user-1" variant="mobileFab" />
      </>
    );

    const desktopWrapper = screen.getByRole("button", { name: "Contribute" }).parentElement;
    const mobileWrapper = screen.getByRole("button", {
      name: "Create a contribution",
    }).parentElement;

    // Desktop control: hidden by default, appears only from `md` up.
    expect(desktopWrapper).toHaveClass("hidden", "md:inline-flex");
    expect(desktopWrapper?.className).not.toMatch(/\bsm:/);

    // Mobile control: visible by default, disappears at that same `md` token
    // -- so there is no breakpoint at which both wrappers are unhidden.
    expect(mobileWrapper).toHaveClass("md:hidden");
  });

  it("clears the mobile tab bar, with no post-page special case left to keep in step", () => {
    render(<CreateLauncher userId="user-1" variant="mobileFab" />);
    const fab = screen.getByRole("button", { name: "Create a contribution" });

    expect(fab).toHaveAttribute("data-app-compose-fab");
    expect(fab).toHaveAttribute("data-app-chrome-motion");
    // The 112px post-page variant is gone with the post-page FAB itself. It
    // existed only to clear the ReadingBar, and it was a second offset that had
    // to be re-tuned by hand whenever the bar moved.
    expect(fab).toHaveStyle({
      bottom:
        "calc(72px + env(safe-area-inset-bottom) + var(--mobile-visual-viewport-bottom, 0px))",
    });
  });
});
