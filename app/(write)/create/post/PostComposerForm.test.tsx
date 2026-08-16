import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PostComposerForm from "./PostComposerForm";

const mocks = vi.hoisted(() => ({
  back: vi.fn(),
  createPost: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: mocks.back, push: mocks.push }),
}));

vi.mock("./actions", () => ({
  createPost: mocks.createPost,
}));

vi.mock("@/components/ui/CoverImageUploader", () => ({
  default: ({
    onUploadingChange,
  }: {
    onUploadingChange?: (uploading: boolean) => void;
  }) => (
    <div>
      <button type="button">Add image</button>
      <button type="button" onClick={() => onUploadingChange?.(true)}>
        Start upload
      </button>
      <button type="button" onClick={() => onUploadingChange?.(false)}>
        Finish upload
      </button>
    </div>
  ),
}));

vi.mock("@/components/topic/PublishingTopicSelector", () => ({
  default: () => <div>Topic selector</div>,
}));

function renderComposer() {
  render(<PostComposerForm userId="user-1" />);
  return {
    postButton: screen.getByRole("button", { name: "Post" }),
    textarea: screen.getByRole("textbox", { name: "Quick take text" }),
  };
}

describe("PostComposerForm", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mocks.back.mockReset();
    mocks.createPost.mockReset();
    mocks.push.mockReset();
    mocks.createPost.mockResolvedValue({ error: null, slug: "published-take" });
  });

  it("expands and collapses the topic selector with an accessible relationship", () => {
    renderComposer();
    const topicsButton = screen.getByRole("button", { name: /Add topics/ });

    expect(topicsButton).toHaveAttribute("aria-expanded", "false");
    expect(topicsButton).toHaveAttribute("aria-controls", "post-topics-panel");
    expect(screen.queryByText("Topic selector")).not.toBeInTheDocument();

    fireEvent.click(topicsButton);

    expect(topicsButton).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Topic selector")).toBeInTheDocument();

    fireEvent.click(topicsButton);
    expect(topicsButton).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Topic selector")).not.toBeInTheDocument();
  });

  it("enables posting only for valid content and blocks over-limit content", () => {
    const { postButton, textarea } = renderComposer();

    expect(postButton).toBeDisabled();

    fireEvent.change(textarea, { target: { value: "A concise thought." } });
    expect(postButton).toBeEnabled();

    fireEvent.change(textarea, { target: { value: "a".repeat(2001) } });
    expect(postButton).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("trim 1 more");
  });

  it("disables posting while an image is uploading", () => {
    const { postButton, textarea } = renderComposer();
    fireEvent.change(textarea, { target: { value: "A take with an image." } });

    expect(postButton).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Start upload" }));
    expect(postButton).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Finish upload" }));
    expect(postButton).toBeEnabled();
  });

  it("shows the submitting state and prevents a second submission", async () => {
    mocks.createPost.mockImplementation(() => new Promise(() => undefined));
    const { postButton, textarea } = renderComposer();
    fireEvent.change(textarea, { target: { value: "Publish this once." } });

    fireEvent.click(postButton);

    expect(await screen.findByRole("button", { name: "Posting..." })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Posting..." }));
    expect(mocks.createPost).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["Control", { ctrlKey: true }],
    ["Meta", { metaKey: true }],
  ])("submits with %s + Enter", async (_modifier, modifier) => {
    const { textarea } = renderComposer();
    fireEvent.change(textarea, { target: { value: "Publish from the keyboard." } });

    fireEvent.keyDown(textarea, { key: "Enter", ...modifier });

    await waitFor(() => expect(mocks.createPost).toHaveBeenCalledTimes(1));
    expect(mocks.createPost).toHaveBeenCalledWith({
      body: "Publish from the keyboard.",
      imageUrl: null,
      inResponseTo: null,
      promptId: null,
      topics: [],
    });
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith(
        "/post/published-take?justPublished=1&live=1"
      )
    );
  });

  it("keeps the longer-form destinations available as secondary actions", () => {
    renderComposer();

    expect(screen.getByRole("link", { name: "Write an article" })).toHaveAttribute(
      "href",
      "/write?kind=article"
    );
    expect(screen.getByRole("link", { name: "Submit research" })).toHaveAttribute(
      "href",
      "/submit/research"
    );
  });

  it("carries a verified campus prompt into publication without writing copy for the user", async () => {
    render(
      <PostComposerForm
        userId="user-1"
        editorialPrompt={{
          id: "prompt-1",
          title: "The cost of getting to class",
          promptText: "Describe one transport constraint your campus should address.",
          responseQuestion: "Which proposed solution would work in practice?",
          topic: "Campus transport",
        }}
      />
    );

    expect(screen.getByText("The cost of getting to class")).toBeInTheDocument();
    const textarea = screen.getByRole("textbox", { name: "Quick take text" });
    expect(textarea).toHaveValue("");

    fireEvent.change(textarea, { target: { value: "A shuttle schedule should be published." } });
    fireEvent.click(screen.getByRole("button", { name: "Post" }));

    await waitFor(() =>
      expect(mocks.createPost).toHaveBeenCalledWith({
        body: "A shuttle schedule should be published.",
        imageUrl: null,
        inResponseTo: null,
        promptId: "prompt-1",
        topics: ["Campus transport"],
      })
    );
  });

  it("uses one responsive toolbar and a bounded desktop editor", () => {
    const { textarea } = renderComposer();
    const toolbar = screen.getByTestId("post-composer-toolbar");
    const footer = screen.getByTestId("post-composer-footer");

    expect(toolbar).toHaveClass("flex-col", "md:flex-row", "md:flex-wrap");
    expect(textarea).toHaveClass(
      "flex-1",
      "md:flex-none",
      "md:h-[clamp(220px,30vh,300px)]"
    );
    expect(footer).toHaveClass("md:flex", "md:items-center", "md:justify-between");
    expect(screen.getAllByRole("button", { name: /Add image/ })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /Add topics/ })).toHaveLength(1);
  });
});
