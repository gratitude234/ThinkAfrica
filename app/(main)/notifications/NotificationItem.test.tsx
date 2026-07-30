import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import NotificationItem, { buildNotificationMessage } from "./NotificationItem";

vi.mock("@/lib/activationEvents", () => ({ trackActivationEvent: vi.fn() }));
vi.mock("./actions", () => ({ respondToCoAuthorInvite: vi.fn() }));

const publicationNotification = {
  id: "delivery-id",
  type: "author_published",
  read: false,
  created_at: "2026-07-29T12:00:00.000Z",
  message: "Ama published a new Article: Designing Lagos",
  link: "/r/p/123e4567-e89b-42d3-a456-426614174000",
  post_id: "post-id",
  actor: {
    full_name: "Ama Mensah",
    username: "ama",
    avatar_url: null,
  },
  post_title: "Designing Lagos",
  post_slug: "designing-lagos",
  actor_username: "ama",
};

// Fallback copy is now standardised as full sentences by lib/notificationCatalog.ts,
// which is why these expectations gained terminal punctuation.
describe("author publication notifications", () => {
  it("uses author-specific fallback copy", () => {
    expect(
      buildNotificationMessage({
        ...publicationNotification,
        message: null,
      })
    ).toBe("Ama Mensah published new work: Designing Lagos.");
  });

  it("uses topic-specific fallback copy", () => {
    expect(
      buildNotificationMessage({
        ...publicationNotification,
        type: "topic_published",
        message: null,
      })
    ).toBe(
      "New work was published in a topic you subscribe to: Designing Lagos."
    );
  });

  it("renders the durable tracked delivery link", () => {
    render(<NotificationItem notification={publicationNotification} />);
    expect(
      screen.getByRole("link", {
        name: /Ama published a new Article: Designing Lagos/i,
      })
    ).toHaveAttribute(
      "href",
      "/r/p/123e4567-e89b-42d3-a456-426614174000"
    );
  });
});

describe("author subscriber notifications", () => {
  const subscriberNotification = {
    ...publicationNotification,
    id: "subscription-id",
    type: "author_subscribed",
    message: null as string | null,
    link: null as string | null,
    post_id: null,
    post_title: null,
    post_slug: null,
  };

  it("says subscribed rather than followed", () => {
    expect(buildNotificationMessage(subscriberNotification)).toBe(
      "Ama Mensah subscribed to your work."
    );
  });

  it("links to the subscriber's profile", () => {
    render(<NotificationItem notification={subscriberNotification} />);
    expect(
      screen.getByRole("link", { name: /subscribed to your work/i })
    ).toHaveAttribute("href", "/ama");
  });
});

describe("read state and dismissal", () => {
  const followNotification = {
    ...publicationNotification,
    id: "follow-id",
    type: "follow",
    message: null as string | null,
    link: null as string | null,
  };

  it("reports the open to the parent instead of tracking read state locally", async () => {
    const onOpen = vi.fn();
    render(
      <NotificationItem notification={followNotification} onOpen={onOpen} />
    );

    await userEvent.click(screen.getByRole("link", { name: /following/i }));

    expect(onOpen).toHaveBeenCalledWith("follow-id");
  });

  it("reflects the read flag from props", () => {
    const { rerender } = render(
      <NotificationItem notification={followNotification} />
    );
    expect(screen.getByText("Unread")).toBeInTheDocument();

    rerender(
      <NotificationItem
        notification={{ ...followNotification, read: true }}
      />
    );
    expect(screen.queryByText("Unread")).not.toBeInTheDocument();
  });

  it("offers a dismiss control outside the link when the parent can handle it", async () => {
    const onDismiss = vi.fn();
    render(
      <NotificationItem notification={followNotification} onDismiss={onDismiss} />
    );

    const dismiss = screen.getByRole("button", { name: /^Dismiss notification:/i });
    // A <button> nested inside an <a> is invalid markup and unreachable by
    // keyboard, so the control must be a sibling of the link.
    expect(dismiss.closest("a")).toBeNull();

    await userEvent.click(dismiss);
    expect(onDismiss).toHaveBeenCalledWith("follow-id");
  });

  it("omits the dismiss control when no handler is supplied", () => {
    render(<NotificationItem notification={followNotification} />);
    expect(
      screen.queryByRole("button", { name: /^Dismiss notification:/i })
    ).not.toBeInTheDocument();
  });

  it("exposes a machine-readable timestamp", () => {
    render(<NotificationItem notification={followNotification} />);
    const time = document.querySelector("time");
    expect(time).toHaveAttribute("dateTime", followNotification.created_at);
  });
});
