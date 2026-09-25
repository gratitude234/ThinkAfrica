import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ComposerMenu, { type ComposerMenuProps } from "./ComposerMenu";

function openMenu(overrides: Partial<ComposerMenuProps> = {}) {
  const props: ComposerMenuProps = {
    canSaveDraft: true,
    onSaveDraft: vi.fn(),
    discardLabel: "Discard",
    canDiscard: true,
    onDiscard: vi.fn(),
    ...overrides,
  };
  const view = render(<ComposerMenu {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "More options" }));
  return { props, ...view };
}

describe("ComposerMenu", () => {
  it("opens from the ••• button", () => {
    openMenu();

    expect(screen.getByRole("button", { name: "More options" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menu", { name: "More options" })).toBeInTheDocument();
  });

  it("offers the preview first when there is one", () => {
    const { props, unmount } = openMenu({ onPreview: vi.fn() });
    expect(screen.getAllByRole("menuitem")[0]).toHaveAccessibleName("Preview");
    fireEvent.click(screen.getByRole("menuitem", { name: "Preview" }));
    expect(props.onPreview).toHaveBeenCalled();
    unmount();

    openMenu();
    expect(screen.queryByRole("menuitem", { name: "Preview" })).not.toBeInTheDocument();
  });

  it("offers a cover only when there is a way to add one", () => {
    const { props, unmount } = openMenu({ onPreview: vi.fn(), onAddCover: vi.fn() });
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Preview", "Add cover", "Save draft", "Discard",
    ]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Add cover" }));
    expect(props.onAddCover).toHaveBeenCalled();
    unmount();

    openMenu();
    expect(screen.queryByRole("menuitem", { name: "Add cover" })).not.toBeInTheDocument();
  });

  it("offers sources with their count, then hands focus back to the button", () => {
    const { props } = openMenu({ sourcesCount: 2, onOpenSources: vi.fn(), onOpenHistory: vi.fn() });

    fireEvent.click(screen.getByRole("menuitem", { name: "Sources, 2 added" }));

    expect(props.onOpenSources).toHaveBeenCalled();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "More options" })).toHaveFocus();
  });

  it("offers version history only when there is a saved draft to have one", () => {
    const { props, unmount } = openMenu({ onOpenHistory: vi.fn() });
    fireEvent.click(screen.getByRole("menuitem", { name: "Version history" }));
    expect(props.onOpenHistory).toHaveBeenCalled();
    unmount();

    openMenu();
    expect(screen.queryByRole("menuitem", { name: "Version history" })).not.toBeInTheDocument();
  });

  it("leaves sources and version history out of a Post's menu", () => {
    openMenu();

    expect(screen.queryByRole("menuitem", { name: /Sources/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Version history" })).not.toBeInTheDocument();
  });

  it("goes to the drafts list only when there is one to go to", () => {
    const { props, unmount } = openMenu({ onOpenDrafts: vi.fn() });
    fireEvent.click(screen.getByRole("menuitem", { name: "Drafts" }));
    expect(props.onOpenDrafts).toHaveBeenCalled();
    unmount();

    openMenu();
    expect(screen.queryByRole("menuitem", { name: "Drafts" })).not.toBeInTheDocument();
  });

  it("saves a draft on request, once there is something to save", () => {
    const { props } = openMenu({ canSaveDraft: false });
    const save = screen.getByRole("menuitem", { name: "Save draft" });

    expect(save).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(save);
    expect(props.onSaveDraft).not.toHaveBeenCalled();
  });

  it("names the discard for a published piece, and hides it when there is nothing to discard", () => {
    const { props, unmount } = openMenu({ discardLabel: "Discard changes" });
    fireEvent.click(screen.getByRole("menuitem", { name: "Discard changes" }));
    expect(props.onDiscard).toHaveBeenCalled();
    unmount();

    openMenu({ canDiscard: false });
    expect(screen.queryByRole("menuitem", { name: /Discard/ })).not.toBeInTheDocument();
  });

  it("closes on Escape and hands focus back", () => {
    openMenu();

    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "More options" })).toHaveFocus();
  });
});
