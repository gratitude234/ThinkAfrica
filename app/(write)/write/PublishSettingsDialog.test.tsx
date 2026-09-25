import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PublishSettingsDialog from "./PublishSettingsDialog";

vi.mock("@/components/ui/TagInput", () => ({ default: () => <input aria-label="Topics" /> }));
vi.mock("@/components/ui/UserAvatar", () => ({ default: () => null }));
vi.mock("@/components/ui/CoverImageUploader", () => ({
  default: ({ emptyTitle, initialUrl, onRemove }: { emptyTitle?: string; initialUrl?: string; onRemove: () => void }) =>
    initialUrl ? (
      <button type="button" onClick={onRemove}>
        Remove cover
      </button>
    ) : (
      <button type="button">{emptyTitle}</button>
    ),
}));

const OPENING = "Solar microgrids are changing how Jos keeps its lights on.";

function open(overrides: Partial<Parameters<typeof PublishSettingsDialog>[0]> = {}) {
  const props = {
    open: true,
    onClose: vi.fn(),
    title: "Power to the people",
    authorName: "Ada",
    avatarUrl: null,
    summary: "",
    openingLines: OPENING,
    onSummaryChange: vi.fn(),
    coverImageUrl: "",
    onCoverChange: vi.fn(),
    onCoverUploadingChange: vi.fn(),
    tags: ["energy"],
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
  it("shows the card as the feed will, then what changes it", () => {
    open();

    const card = screen.getByRole("group", { name: "In the feed" });
    expect(within(card).getByText("Article · 7 min")).toBeInTheDocument();
    expect(within(card).getByText("Power to the people")).toBeInTheDocument();
    expect(within(card).getByText(OPENING)).toBeInTheDocument();
    expect(within(card).getByText("#energy")).toBeInTheDocument();
    expect(within(card).queryByRole("img", { name: "Cover" })).not.toBeInTheDocument();
    expect(within(card).queryByRole("button")).not.toBeInTheDocument();
    expect(within(card).queryByRole("link")).not.toBeInTheDocument();

    expect(screen.getByRole("button", { name: "Add cover" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Summary/)).toBeInTheDocument();
    expect(screen.getByLabelText("Topics")).toBeInTheDocument();
    expect(screen.getByText("1,240 words · 7 min read")).toBeInTheDocument();
  });

  it("puts the cover on the card, and takes it off", () => {
    const props = open({ coverImageUrl: "https://cdn.example/cover.png" });

    const card = screen.getByRole("group", { name: "In the feed" });
    expect(within(card).getByRole("img", { name: "Cover" })).toHaveAttribute("src", "https://cdn.example/cover.png");

    fireEvent.click(screen.getByRole("button", { name: "Remove cover" }));
    expect(props.onCoverChange).toHaveBeenCalledWith("");
  });

  it("starts the summary as the opening lines, and stores nothing until it is changed", () => {
    const props = open();

    const field = screen.getByLabelText(/Summary/);
    expect(field).toHaveValue(OPENING);
    expect(screen.getByText("From your opening lines. Edit it to write your own.")).toBeInTheDocument();
    expect(props.onSummaryChange).not.toHaveBeenCalled();

    fireEvent.change(field, { target: { value: "Why a city of a million now runs on sunlight." } });
    expect(props.onSummaryChange).toHaveBeenLastCalledWith("Why a city of a million now runs on sunlight.");
  });

  it("goes back to following the body when the summary is the opening again, or empty", () => {
    const props = open({ summary: "Something else." });
    const field = screen.getByLabelText(/Summary/);

    fireEvent.change(field, { target: { value: OPENING } });
    expect(props.onSummaryChange).toHaveBeenLastCalledWith("");

    fireEvent.change(field, { target: { value: "" } });
    expect(props.onSummaryChange).toHaveBeenLastCalledWith("");
    // An emptied field stays empty rather than filling itself back in.
    expect(field).toHaveValue("");
  });

  it("shows a written summary on the card, and offers the opening lines back", () => {
    const props = open({ summary: "Why a city of a million now runs on sunlight." });

    const card = screen.getByRole("group", { name: "In the feed" });
    expect(within(card).getByText("Why a city of a million now runs on sunlight.")).toBeInTheDocument();
    expect(within(card).queryByText(OPENING)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Summary/)).toHaveValue("Why a city of a million now runs on sunlight.");
    expect(screen.getByText("Shown under the title, in the feed and on the page.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Use the opening lines" }));
    expect(props.onSummaryChange).toHaveBeenLastCalledWith("");
  });

  it("does not promise the page a summary that only trims the opening", () => {
    open({ summary: "Solar microgrids are changing how Jos" });

    expect(screen.getByText("Shown under the title in the feed.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use the opening lines" })).toBeInTheDocument();
  });

  it("keeps a summary to one paragraph", () => {
    const props = open();
    const field = screen.getByLabelText(/Summary/);

    expect(fireEvent.keyDown(field, { key: "Enter" })).toBe(false);
    fireEvent.change(field, { target: { value: "Line one\nLine two" } });
    expect(props.onSummaryChange).toHaveBeenLastCalledWith("Line one Line two");
  });

  it("publishes on Cmd+Enter from the summary", () => {
    const props = open();

    fireEvent.keyDown(screen.getByLabelText(/Summary/), { key: "Enter", metaKey: true });

    expect(props.onPublish).toHaveBeenCalled();
  });

  it("publishes from its button", () => {
    const props = open();

    fireEvent.click(screen.getByRole("button", { name: "Publish now" }));

    expect(props.onPublish).toHaveBeenCalled();
  });

  it("cancels from its footer", () => {
    const props = open();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(props.onClose).toHaveBeenCalled();
  });

  it("says Update for a piece that is already published", () => {
    open({ isUpdate: true });

    expect(screen.getByRole("button", { name: "Update now" })).toBeInTheDocument();
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
