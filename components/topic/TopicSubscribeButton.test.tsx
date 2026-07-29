import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TopicSubscribeButton from "./TopicSubscribeButton";
import { setTopicSubscription } from "./topicActions";

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/topics/Climate",
  useSearchParams: () => new URLSearchParams("from=explore"),
  useRouter: () => ({ push, refresh }),
}));

vi.mock("./topicActions", () => ({
  setTopicSubscription: vi.fn(),
}));

const mockedSetTopicSubscription = vi.mocked(setTopicSubscription);

describe("TopicSubscribeButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_AUTHOR_SUBSCRIPTIONS_ENABLED", "1");
    vi.stubEnv("NEXT_PUBLIC_TOPIC_SUBSCRIPTIONS_ENABLED", "1");
  });

  it("subscribes without mutating profile interests", async () => {
    mockedSetTopicSubscription.mockResolvedValue({
      error: null,
      topicKey: "climate",
      displayLabel: "Climate",
      subscribed: true,
    });

    render(
      <TopicSubscribeButton
        topic="Climate"
        initialSubscribed={false}
        currentUserId="reader"
        showConfirmation
      />
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Subscribe to Climate" })
    );

    await waitFor(() => {
      expect(mockedSetTopicSubscription).toHaveBeenCalledWith({
        topic: "Climate",
        subscribed: true,
        pathname: "/topics/Climate",
      });
    });
    expect(
      screen.getByRole("button", { name: "Unsubscribe from Climate" })
    ).toHaveTextContent("Subscribed");
    expect(screen.getByText(/delivered in-app/i)).toBeInTheDocument();
  });

  it("rolls optimistic state back when the action fails", async () => {
    mockedSetTopicSubscription.mockResolvedValue({
      error: "This topic is unavailable.",
      topicKey: "climate",
      displayLabel: "Climate",
      subscribed: false,
    });

    render(
      <TopicSubscribeButton
        topic="Climate"
        initialSubscribed={false}
        currentUserId="reader"
      />
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Subscribe to Climate" })
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "This topic is unavailable."
      );
    });
    expect(
      screen.getByRole("button", { name: "Subscribe to Climate" })
    ).toHaveTextContent("Subscribe");
  });

  it("redirects guests while preserving the full destination", async () => {
    render(
      <TopicSubscribeButton
        topic="Climate"
        initialSubscribed={false}
        currentUserId={null}
      />
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Subscribe to Climate" })
    );

    expect(push).toHaveBeenCalledWith(
      `/login?redirectTo=${encodeURIComponent(
        "/topics/Climate?from=explore"
      )}`
    );
    expect(mockedSetTopicSubscription).not.toHaveBeenCalled();
  });
});
