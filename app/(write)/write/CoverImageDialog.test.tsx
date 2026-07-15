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
  const onContinue = overrides.onContinue ?? vi.fn();
  const onReviewPublish = overrides.onReviewPublish ?? vi.fn();
  const props: React.ComponentProps<typeof CoverImageDialog> = {
    open: overrides.open ?? true,
    onClose,
    coverImageUrl: overrides.coverImageUrl ?? "",
    onUpload,
    onRemove,
    onUploadingChange,
    uploading: overrides.uploading ?? false,
    canReviewPublish: overrides.canReviewPublish ?? false,
    onContinue,
    onReviewPublish,
  };
  const utils = render(<CoverImageDialog {...props} />);
  return { ...utils, onClose, onUpload, onRemove, onUploadingChange, onContinue, onReviewPublish };
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

  it("shows no success footer when there is no cover yet", () => {
    renderDialog({ coverImageUrl: "", canReviewPublish: true });

    expect(screen.queryByText("Cover added ✓")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue writing" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Review & publish" })).not.toBeInTheDocument();
  });

  it("displays the success confirmation once a cover exists", () => {
    renderDialog({ coverImageUrl: "https://cdn.example/cover.png" });

    expect(screen.getByText("Cover added ✓")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Your image has been uploaded and will appear at the top of your article."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue writing" })).toBeInTheDocument();
  });

  it("calls onContinue when Continue writing is clicked", async () => {
    const { onContinue, onClose } = renderDialog({
      coverImageUrl: "https://cdn.example/cover.png",
    });

    await userEvent.click(screen.getByRole("button", { name: "Continue writing" }));

    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("only shows Review & publish when the draft is eligible and a cover exists", () => {
    const { rerender } = render(
      <CoverImageDialog
        open
        onClose={vi.fn()}
        coverImageUrl="https://cdn.example/cover.png"
        onUpload={vi.fn()}
        onRemove={vi.fn()}
        onUploadingChange={vi.fn()}
        uploading={false}
        canReviewPublish={false}
        onContinue={vi.fn()}
        onReviewPublish={vi.fn()}
      />
    );
    expect(screen.queryByRole("button", { name: "Review & publish" })).not.toBeInTheDocument();

    rerender(
      <CoverImageDialog
        open
        onClose={vi.fn()}
        coverImageUrl="https://cdn.example/cover.png"
        onUpload={vi.fn()}
        onRemove={vi.fn()}
        onUploadingChange={vi.fn()}
        uploading={false}
        canReviewPublish
        onContinue={vi.fn()}
        onReviewPublish={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "Review & publish" })).toBeInTheDocument();
  });

  it("invokes onReviewPublish exactly once per click", async () => {
    const { onReviewPublish } = renderDialog({
      coverImageUrl: "https://cdn.example/cover.png",
      canReviewPublish: true,
    });

    await userEvent.click(screen.getByRole("button", { name: "Review & publish" }));

    expect(onReviewPublish).toHaveBeenCalledTimes(1);
  });

  it("disables the footer actions while an upload is in progress and reports it accessibly", () => {
    renderDialog({
      coverImageUrl: "https://cdn.example/cover.png",
      canReviewPublish: true,
      uploading: true,
    });

    expect(screen.getByRole("button", { name: "Continue writing" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Review & publish" })).toBeDisabled();
    expect(screen.getByText("Uploading…")).toBeInTheDocument();
    expect(screen.queryByText("Cover added ✓")).not.toBeInTheDocument();
  });

  it("removes the success state when the cover is removed", () => {
    const { rerender } = render(
      <CoverImageDialog
        open
        onClose={vi.fn()}
        coverImageUrl="https://cdn.example/cover.png"
        onUpload={vi.fn()}
        onRemove={vi.fn()}
        onUploadingChange={vi.fn()}
        uploading={false}
        canReviewPublish
        onContinue={vi.fn()}
        onReviewPublish={vi.fn()}
      />
    );
    expect(screen.getByText("Cover added ✓")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review & publish" })).toBeInTheDocument();

    // Simulates the parent (write/page.tsx) responding to onRemove by clearing
    // its owned coverImageUrl and passing the updated value back down.
    rerender(
      <CoverImageDialog
        open
        onClose={vi.fn()}
        coverImageUrl=""
        onUpload={vi.fn()}
        onRemove={vi.fn()}
        onUploadingChange={vi.fn()}
        uploading={false}
        canReviewPublish
        onContinue={vi.fn()}
        onReviewPublish={vi.fn()}
      />
    );

    expect(screen.queryByText("Cover added ✓")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue writing" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Review & publish" })).not.toBeInTheDocument();
  });

  it("never auto-closes or auto-advances when an upload finishes", () => {
    const onClose = vi.fn();
    const onContinue = vi.fn();
    const onReviewPublish = vi.fn();
    const { rerender } = render(
      <CoverImageDialog
        open
        onClose={onClose}
        coverImageUrl=""
        onUpload={vi.fn()}
        onRemove={vi.fn()}
        onUploadingChange={vi.fn()}
        uploading
        canReviewPublish
        onContinue={onContinue}
        onReviewPublish={onReviewPublish}
      />
    );

    // Simulates the parent updating coverImageUrl/uploading once the upload succeeds.
    rerender(
      <CoverImageDialog
        open
        onClose={onClose}
        coverImageUrl="https://cdn.example/cover.png"
        onUpload={vi.fn()}
        onRemove={vi.fn()}
        onUploadingChange={vi.fn()}
        uploading={false}
        canReviewPublish
        onContinue={onContinue}
        onReviewPublish={onReviewPublish}
      />
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Cover added ✓")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(onContinue).not.toHaveBeenCalled();
    expect(onReviewPublish).not.toHaveBeenCalled();
  });
});
