import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import CoverImageDialog from "./CoverImageDialog";

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    storage: { from: () => ({ upload: vi.fn(), getPublicUrl: vi.fn() }) },
  }),
}));

function renderDialog(overrides: Partial<React.ComponentProps<typeof CoverImageDialog>> = {}) {
  const onClose = overrides.onClose ?? vi.fn();
  const onUpload = overrides.onUpload ?? vi.fn();
  const onRemove = overrides.onRemove ?? vi.fn();
  const onUploadingChange = overrides.onUploadingChange ?? vi.fn();
  const utils = render(
    <CoverImageDialog
      open={overrides.open ?? true}
      onClose={onClose}
      coverImageUrl={overrides.coverImageUrl ?? ""}
      onUpload={onUpload}
      onRemove={onRemove}
      onUploadingChange={onUploadingChange}
    />
  );
  return { ...utils, onClose, onUpload, onRemove, onUploadingChange };
}

describe("CoverImageDialog", () => {
  it("renders nothing when closed", () => {
    renderDialog({ open: false });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("exposes an accessible, labeled dialog with the required copy", () => {
    renderDialog();

    const dialog = screen.getByRole("dialog", { name: "Cover image" });
    expect(dialog).toHaveAttribute("aria-modal", "true");

    const description = document.getElementById("cover-image-dialog-description");
    expect(description).toHaveTextContent(/Optional, but recommended/);
    expect(description).toHaveTextContent(/16:9/);
    expect(description).toHaveTextContent(/JPG, PNG, or WebP/);
  });

  it("moves focus to the close button when it opens", () => {
    renderDialog();
    expect(screen.getByRole("button", { name: "Close cover image dialog" })).toHaveFocus();
  });

  it("closes on Escape", async () => {
    const { onClose } = renderDialog();

    await userEvent.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes when the backdrop is clicked", async () => {
    const { onClose } = renderDialog();

    await userEvent.click(
      screen.getByRole("button", { name: "Close cover image dialog backdrop" })
    );

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes via the visible close button", async () => {
    const { onClose } = renderDialog();

    await userEvent.click(screen.getByRole("button", { name: "Close cover image dialog" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows the current cover and exposes Change/Remove instead of the empty dropzone", () => {
    renderDialog({ coverImageUrl: "https://cdn.example/cover.png" });

    expect(screen.getByRole("img", { name: "Cover" })).toHaveAttribute(
      "src",
      "https://cdn.example/cover.png"
    );
    expect(screen.getByRole("button", { name: "Change" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
  });
});
