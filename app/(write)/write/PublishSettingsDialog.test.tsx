import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PublishSettingsDialog from "./PublishSettingsDialog";

vi.mock("@/components/ui/TagInput", () => ({ default: () => <input aria-label="Topics" /> }));

function open(overrides: Partial<Parameters<typeof PublishSettingsDialog>[0]> = {}) {
  const props = {
    open: true,
    onClose: vi.fn(),
    tags: [],
    onTagsChange: vi.fn(),
    wordCount: 1240,
    error: null,
    publishing: false,
    isUpdate: false,
    canPublish: true,
    onPublish: vi.fn(),
    ...overrides,
  };
  render(<PublishSettingsDialog {...props} />);
  return props;
}

describe("PublishSettingsDialog", () => {
  it("asks for topics and states the length, and nothing about the feed", () => {
    open();

    expect(screen.getByRole("dialog", { name: "Publish settings" })).toBeInTheDocument();
    expect(screen.getByLabelText("Topics")).toBeInTheDocument();
    expect(screen.getByText("1,240 words · 7 min read")).toBeInTheDocument();
    expect(screen.queryByText(/In the feed/)).not.toBeInTheDocument();
  });

  it("publishes from its button", () => {
    const props = open();

    fireEvent.click(screen.getByRole("button", { name: "Publish" }));

    expect(props.onPublish).toHaveBeenCalled();
  });

  it("cancels from its footer", () => {
    const props = open();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(props.onClose).toHaveBeenCalled();
  });

  it("says Update for a piece that is already published", () => {
    open({ isUpdate: true });

    expect(screen.getByRole("button", { name: "Update" })).toBeInTheDocument();
  });

  it("publishes on Cmd+Enter", () => {
    const props = open();

    fireEvent.keyDown(screen.getByRole("dialog", { name: "Publish settings" }), { key: "Enter", metaKey: true });

    expect(props.onPublish).toHaveBeenCalled();
  });

  it("does not publish on a bare Enter, which belongs to the topic field", () => {
    const props = open();

    fireEvent.keyDown(screen.getByRole("dialog", { name: "Publish settings" }), { key: "Enter" });

    expect(props.onPublish).not.toHaveBeenCalled();
  });

  it("closes on Escape", () => {
    const props = open();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(props.onClose).toHaveBeenCalled();
  });

  it("stays open on Escape while publishing", () => {
    const props = open({ publishing: true });

    fireEvent.keyDown(document, { key: "Escape" });

    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("says why a publish failed", () => {
    open({ error: "Each source needs a title." });

    expect(screen.getByRole("alert")).toHaveTextContent("Each source needs a title.");
  });
});
