import { render, screen } from "@testing-library/react";
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

describe("author publication notifications", () => {
  it("uses author-specific fallback copy", () => {
    expect(
      buildNotificationMessage({
        ...publicationNotification,
        message: null,
      })
    ).toBe("Ama Mensah published new work: Designing Lagos");
  });

  it("uses topic-specific fallback copy", () => {
    expect(
      buildNotificationMessage({
        ...publicationNotification,
        type: "topic_published",
        message: null,
      })
    ).toBe(
      "New work was published in a topic you subscribe to: Designing Lagos"
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
