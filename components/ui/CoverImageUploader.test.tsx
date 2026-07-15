import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CoverImageUploader from "@/components/ui/CoverImageUploader";

const mockGetUser = vi.fn();
const mockUpload = vi.fn();
const mockGetPublicUrl = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
    storage: {
      from: () => ({
        upload: mockUpload,
        getPublicUrl: mockGetPublicUrl,
      }),
    },
  }),
}));

function makeFile(name = "cover.png", type = "image/png") {
  return new File(["fake-image-bytes"], name, { type });
}

function renderUploader(
  overrides: Partial<{
    initialUrl: string;
    onUpload: (url: string) => void;
    onRemove: () => void;
    onUploadingChange: (uploading: boolean) => void;
  }> = {}
) {
  const onUpload = overrides.onUpload ?? vi.fn();
  const onRemove = overrides.onRemove ?? vi.fn();
  const onUploadingChange = overrides.onUploadingChange ?? vi.fn();
  const utils = render(
    <CoverImageUploader
      initialUrl={overrides.initialUrl}
      onUpload={onUpload}
      onRemove={onRemove}
      onUploadingChange={onUploadingChange}
    />
  );
  const getFileInput = () =>
    utils.container.querySelector('input[type="file"]') as HTMLInputElement;
  return { ...utils, onUpload, onRemove, onUploadingChange, getFileInput };
}

describe("CoverImageUploader", () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockUpload.mockReset();
    mockGetPublicUrl.mockReset();
    URL.createObjectURL = vi.fn(() => "blob:mock-url");
    URL.revokeObjectURL = vi.fn();
  });

  it("uploads successfully and reports the persisted URL", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockUpload.mockResolvedValue({ error: null });
    mockGetPublicUrl.mockReturnValue({
      data: { publicUrl: "https://cdn.example/cover.png" },
    });

    const { onUpload, onUploadingChange, getFileInput } = renderUploader();

    await userEvent.upload(getFileInput(), makeFile());

    await waitFor(() =>
      expect(onUpload).toHaveBeenCalledWith("https://cdn.example/cover.png")
    );
    expect(onUploadingChange).toHaveBeenNthCalledWith(1, true);
    expect(onUploadingChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole("img", { name: "Cover" })).toHaveAttribute(
      "src",
      "https://cdn.example/cover.png"
    );
  });

  it("shows a visible error and restores the last known-good cover on failure", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockUpload.mockResolvedValue({ error: { message: "network down" } });

    const { onUpload, getFileInput } = renderUploader({
      initialUrl: "https://cdn.example/old.png",
    });

    await userEvent.upload(getFileInput(), makeFile());

    expect(
      await screen.findByText(/Upload failed: network down/)
    ).toBeInTheDocument();
    expect(onUpload).not.toHaveBeenCalled();
    expect(screen.getByRole("img", { name: "Cover" })).toHaveAttribute(
      "src",
      "https://cdn.example/old.png"
    );
  });

  it("rejects unsupported file types with a visible message and never calls upload", async () => {
    const { onUpload, getFileInput } = renderUploader();

    await userEvent.upload(getFileInput(), makeFile("notes.txt", "text/plain"));

    expect(await screen.findByText(/JPG, PNG, or WebP/)).toBeInTheDocument();
    expect(mockUpload).not.toHaveBeenCalled();
    expect(onUpload).not.toHaveBeenCalled();
  });

  it("clears the input and allows retrying the same file after a failure", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockUpload
      .mockResolvedValueOnce({ error: { message: "network down" } })
      .mockResolvedValueOnce({ error: null });
    mockGetPublicUrl.mockReturnValue({
      data: { publicUrl: "https://cdn.example/cover.png" },
    });

    const { onUpload, getFileInput } = renderUploader();
    const file = makeFile();

    await userEvent.upload(getFileInput(), file);
    expect(
      await screen.findByText(/Upload failed: network down/)
    ).toBeInTheDocument();
    expect(getFileInput().value).toBe("");

    // Re-selecting the identical File object must trigger a fresh attempt.
    await userEvent.upload(getFileInput(), file);

    await waitFor(() =>
      expect(onUpload).toHaveBeenCalledWith("https://cdn.example/cover.png")
    );
    expect(mockUpload).toHaveBeenCalledTimes(2);
  });

  it("removes the cover and notifies the parent", async () => {
    const { onRemove } = renderUploader({
      initialUrl: "https://cdn.example/old.png",
    });

    await userEvent.click(screen.getByRole("button", { name: "Remove" }));

    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("img", { name: "Cover" })).not.toBeInTheDocument();
  });

  it("always resets the parent uploading flag, even when the client throws", async () => {
    mockGetUser.mockRejectedValue(new Error("boom"));

    const { onUploadingChange, getFileInput } = renderUploader();

    await userEvent.upload(getFileInput(), makeFile());

    await waitFor(() =>
      expect(onUploadingChange).toHaveBeenLastCalledWith(false)
    );
    expect(
      await screen.findByText(/Upload failed\. Please try again\./)
    ).toBeInTheDocument();
  });

  it("disables Change and Remove while a replacement upload is in flight", async () => {
    let resolveGetUser: (value: { data: { user: { id: string } } }) => void = () => {};
    mockGetUser.mockReturnValue(
      new Promise((resolve) => {
        resolveGetUser = resolve;
      })
    );

    const { onRemove, getFileInput } = renderUploader({
      initialUrl: "https://cdn.example/old.png",
    });

    const uploadPromise = userEvent.upload(getFileInput(), makeFile());

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Change" })).toBeDisabled()
    );
    expect(screen.getByRole("button", { name: "Remove" })).toBeDisabled();

    // A user attempting to remove the cover mid-upload must not succeed —
    // otherwise the cover would vanish and then reappear once the in-flight
    // upload resolves, contradicting the removal.
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(onRemove).not.toHaveBeenCalled();
    expect(screen.getByRole("img", { name: "Cover" })).toBeInTheDocument();

    mockUpload.mockResolvedValue({ error: null });
    mockGetPublicUrl.mockReturnValue({
      data: { publicUrl: "https://cdn.example/new.png" },
    });
    resolveGetUser({ data: { user: { id: "user-1" } } });
    await uploadPromise;

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Remove" })).toBeEnabled()
    );
  });

  it("reflects the latest persisted cover when closed and reopened", () => {
    const { unmount } = renderUploader({
      initialUrl: "https://cdn.example/a.png",
    });
    expect(screen.getByRole("img", { name: "Cover" })).toHaveAttribute(
      "src",
      "https://cdn.example/a.png"
    );
    unmount();

    renderUploader({ initialUrl: "https://cdn.example/b.png" });
    expect(screen.getByRole("img", { name: "Cover" })).toHaveAttribute(
      "src",
      "https://cdn.example/b.png"
    );
  });
});
