import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PublishingTopicSelector from "./PublishingTopicSelector";

vi.mock("@/lib/activationEvents", () => ({
  trackActivationEvent: vi.fn(),
}));

vi.mock("@/components/ui/TagInput", () => ({
  default: () => <div data-testid="manual-topic-input">Manual topic input</div>,
}));

describe("PublishingTopicSelector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_AI_TOPIC_SUGGESTIONS_ENABLED", "1");
  });

  it("does not transmit a draft until the writer explicitly asks", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          suggestions: ["Technology", "Innovation"],
          remaining: 19,
          resetAt: "2026-07-31T00:00:00Z",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(
      <PublishingTopicSelector
        contentKind="post"
        content="A detailed post about student software innovation."
        value={[]}
        maxTopics={3}
        onChange={onChange}
      />
    );

    expect(fetchMock).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", { name: "Suggest topics with AI" })
    );
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText("Suggested for this post")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Technology" }));
    expect(onChange).toHaveBeenCalledWith(["technology"]);
  });

  it("marks suggestions stale after the analysed draft changes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            suggestions: ["Technology"],
            remaining: 18,
            resetAt: "2026-07-31T00:00:00Z",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );
    const user = userEvent.setup();
    const { rerender } = render(
      <PublishingTopicSelector
        contentKind="article"
        title="Technology policy"
        content="A detailed draft about software and universities."
        value={[]}
        maxTopics={5}
        onChange={vi.fn()}
      />
    );
    await user.click(
      screen.getByRole("button", { name: "Suggest topics with AI" })
    );

    rerender(
      <PublishingTopicSelector
        contentKind="article"
        title="Climate policy"
        content="A revised draft about agriculture and climate change."
        value={[]}
        maxTopics={5}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByText(/draft changed/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Refresh suggestions" })
    ).toBeInTheDocument();
  });

  it("keeps ordinary topic entry when the AI flag is disabled", () => {
    vi.stubEnv("NEXT_PUBLIC_AI_TOPIC_SUGGESTIONS_ENABLED", "0");
    render(
      <PublishingTopicSelector
        contentKind="research"
        title="A study"
        abstract="A detailed abstract about education systems."
        keywords={["education"]}
        value={[]}
        maxTopics={5}
        onChange={vi.fn()}
      />
    );

    expect(
      screen.queryByRole("button", { name: /Suggest topics with AI/i })
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("manual-topic-input")).toBeInTheDocument();
  });
});
