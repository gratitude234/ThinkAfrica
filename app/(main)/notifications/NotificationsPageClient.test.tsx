import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NotificationsPageClient from "./NotificationsPageClient";
import type { NotificationData } from "@/lib/notificationData";

vi.mock("@/lib/activationEvents", () => ({ trackActivationEvent: vi.fn() }));
vi.mock("./actions", () => ({ respondToCoAuthorInvite: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));

const mutations = vi.hoisted(() => ({
  markAllNotificationsRead: vi.fn(),
  restoreUnread: vi.fn(),
  dismissNotification: vi.fn(),
  undismissNotification: vi.fn(),
}));
const readMutation = vi.hoisted(() => ({ markNotificationRead: vi.fn() }));

vi.mock("@/lib/notificationMutations", () => mutations);
vi.mock("@/lib/notificationRead", () => readMutation);

vi.mock("@/lib/notificationData", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/notificationData")>()),
  fetchNotificationRows: vi.fn().mockResolvedValue({ rows: [], error: null }),
}));

function notification(overrides: Partial<NotificationData>): NotificationData {
  return {
    id: "id",
    type: "follow",
    read: false,
    created_at: new Date().toISOString(),
    message: null,
    link: null,
    post_id: null,
    actor: { full_name: "Yusuph Sebasi", username: "yusuph", avatar_url: null },
    actor_username: "yusuph",
    post_title: null,
    post_slug: null,
    ...overrides,
  };
}

const follow = notification({ id: "follow-1" });
const publication = notification({
  id: "pub-1",
  type: "author_published",
  message: "Yusuph Sebasi published a new Article: The Burden Of Sickle Cell Disease",
  link: "/post/sickle-cell",
});
const revision = notification({
  id: "rev-1",
  type: "revision_requested",
  message: "Reviewer feedback is ready for The Burden Of Sickle Cell Disease.",
  post_title: "The Burden Of Sickle Cell Disease",
  post_slug: "sickle-cell",
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  readMutation.markNotificationRead.mockResolvedValue(undefined);
  mutations.markAllNotificationsRead.mockResolvedValue({
    error: null,
    affectedIds: ["follow-1", "pub-1"],
  });
  mutations.restoreUnread.mockResolvedValue({ error: null, conflict: false });
  mutations.dismissNotification.mockResolvedValue({ error: null });
  mutations.undismissNotification.mockResolvedValue({ error: null });
});

describe("subscription UX V2 defaults", () => {
  function enableV2() {
    vi.stubEnv("NEXT_PUBLIC_AUTHOR_SUBSCRIPTIONS_ENABLED", "1");
    vi.stubEnv("NEXT_PUBLIC_TOPIC_SUBSCRIPTIONS_ENABLED", "1");
    vi.stubEnv("NEXT_PUBLIC_AUTHOR_SUBSCRIPTIONS_UX_V2_ENABLED", "1");
  }

  it("opens on Subscriptions when publication alerts exist and no task is pending", () => {
    enableV2();
    render(
      <NotificationsPageClient
        userId="u1"
        mutedTypes={[]}
        notifications={[follow, publication]}
      />
    );

    expect(screen.getByRole("button", { name: /Subscriptions/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByText(/published a new Article/)).toBeInTheDocument();
    expect(screen.queryByText(/started following your work/)).not.toBeInTheDocument();
  });

  it("opens on Needs attention when a real task is pending", () => {
    enableV2();
    render(
      <NotificationsPageClient
        userId="u1"
        mutedTypes={[]}
        notifications={[revision, publication]}
      />
    );

    expect(
      screen.getByRole("button", { name: /Needs attention/ })
    ).toHaveAttribute("aria-pressed", "true");
  });
});

describe("needs-attention hero", () => {
  it("does not promote passive activity into a Needs attention banner", () => {
    // The reported bug: a single new follower rendered as a full-width
    // "NEEDS ATTENTION / New follower" hero with a primary CTA.
    render(
      <NotificationsPageClient userId="u1" mutedTypes={[]} notifications={[follow, publication]} />
    );

    expect(screen.queryByText("Needs attention")).not.toBeInTheDocument();
  });

  it("renders an actionable notification exactly once", async () => {
    render(
      <NotificationsPageClient
        userId="u1"
        mutedTypes={[]}
        notifications={[revision, follow, publication]}
      />
    );

    expect(screen.getByText("Needs attention")).toBeInTheDocument();

    // Previously the same notification appeared in the hero *and* again in the
    // list below, so the page read as a duplicate of itself.
    expect(screen.getAllByText(/Reviewer feedback is ready/)).toHaveLength(1);
  });

  it("keeps the rest of the inbox in the list below the hero", () => {
    render(
      <NotificationsPageClient
        userId="u1"
        mutedTypes={[]}
        notifications={[revision, follow, publication]}
      />
    );

    expect(screen.getByText(/started following your work/)).toBeInTheDocument();
    expect(screen.getByText(/published a new Article/)).toBeInTheDocument();
  });

  it("does not contradict the hero with an all-caught-up panel", () => {
    render(<NotificationsPageClient userId="u1" mutedTypes={[]} notifications={[revision]} />);

    expect(screen.getByText("Needs attention")).toBeInTheDocument();
    expect(screen.queryByText("No notifications yet")).not.toBeInTheDocument();
    expect(screen.queryByText("Nothing in this view.")).not.toBeInTheDocument();
  });
});

describe("marking a single notification read", () => {
  it("persists the read and updates the unread count", async () => {
    render(
      <NotificationsPageClient userId="u1" mutedTypes={[]} notifications={[follow, publication]} />
    );

    expect(screen.getByText("2 new notifications")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("link", { name: /published a new Article/ }));

    await waitFor(() => {
      expect(readMutation.markNotificationRead).toHaveBeenCalledWith("pub-1");
    });
    // Singular, not "1 new notifications".
    expect(screen.getByText("1 new notification")).toBeInTheDocument();
  });

  it("restores the unread state when the write fails", async () => {
    readMutation.markNotificationRead.mockRejectedValue(new Error("denied"));

    render(
      <NotificationsPageClient userId="u1" mutedTypes={[]} notifications={[follow, publication]} />
    );

    await userEvent.click(screen.getByRole("link", { name: /published a new Article/ }));

    await waitFor(() => {
      expect(screen.getByText("2 new notifications")).toBeInTheDocument();
    });
  });
});

describe("dismissing a notification", () => {
  it("removes the row and offers an undo", async () => {
    render(
      <NotificationsPageClient userId="u1" mutedTypes={[]} notifications={[follow, publication]} />
    );

    await userEvent.click(
      screen.getByRole("button", { name: /Dismiss notification: Yusuph Sebasi published/ })
    );

    await waitFor(() => {
      expect(screen.queryByText(/published a new Article/)).not.toBeInTheDocument();
    });
    expect(mutations.dismissNotification).toHaveBeenCalledWith({}, "u1", "pub-1");

    const toast = screen.getByRole("status");
    expect(within(toast).getByText("Notification dismissed")).toBeInTheDocument();

    await userEvent.click(within(toast).getByRole("button", { name: "Undo" }));

    await waitFor(() => {
      expect(mutations.undismissNotification).toHaveBeenCalledWith({}, "u1", "pub-1");
    });
  });

  it("puts the row back when the dismiss write fails", async () => {
    mutations.dismissNotification.mockResolvedValue({ error: "offline" });

    render(
      <NotificationsPageClient userId="u1" mutedTypes={[]} notifications={[follow, publication]} />
    );

    await userEvent.click(
      screen.getByRole("button", { name: /Dismiss notification: Yusuph Sebasi published/ })
    );

    await waitFor(() => {
      expect(screen.getByText(/published a new Article/)).toBeInTheDocument();
    });
    expect(screen.getByRole("status")).toHaveTextContent(/Could not dismiss/);
  });
});

describe("mark all read", () => {
  it("offers an undo scoped to the rows the database actually changed", async () => {
    render(
      <NotificationsPageClient userId="u1" mutedTypes={[]} notifications={[follow, publication]} />
    );

    await userEvent.click(screen.getByRole("button", { name: "Mark all read" }));

    await waitFor(() => {
      expect(screen.getByText("All caught up")).toBeInTheDocument();
    });

    const toast = screen.getByRole("status");
    expect(toast).toHaveTextContent("Marked 2 notifications read");

    await userEvent.click(within(toast).getByRole("button", { name: "Undo" }));

    await waitFor(() => {
      expect(mutations.restoreUnread).toHaveBeenCalledWith({}, "u1", [
        "follow-1",
        "pub-1",
      ]);
    });
  });

  it("explains a unique-violation conflict rather than failing silently", async () => {
    mutations.restoreUnread.mockResolvedValue({
      error: "duplicate key",
      conflict: true,
    });

    render(
      <NotificationsPageClient userId="u1" mutedTypes={[]} notifications={[follow, publication]} />
    );

    await userEvent.click(screen.getByRole("button", { name: "Mark all read" }));
    const toast = await screen.findByRole("status");
    await userEvent.click(within(toast).getByRole("button", { name: "Undo" }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(
        /some of those notifications have newer activity/
      );
    });
  });

  it("restores the unread state when the bulk write fails", async () => {
    mutations.markAllNotificationsRead.mockResolvedValue({
      error: "offline",
      affectedIds: [],
    });

    render(
      <NotificationsPageClient userId="u1" mutedTypes={[]} notifications={[follow, publication]} />
    );

    await userEvent.click(screen.getByRole("button", { name: "Mark all read" }));

    await waitFor(() => {
      expect(screen.getByText("2 new notifications")).toBeInTheDocument();
    });
    expect(screen.getByRole("status")).toHaveTextContent(/Failed to mark/);
  });
});

describe("filter chips", () => {
  it("only advertises counts for items the list can actually show", async () => {
    render(
      <NotificationsPageClient
        userId="u1"
        mutedTypes={[]}
        notifications={[revision, follow, publication]}
      />
    );

    // `revision` is in the hero, so the Review chip must not claim it.
    expect(screen.getByRole("button", { name: "Review" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Unread (2)" })
    ).toBeInTheDocument();
  });

  it("counts every chip by the same rule", async () => {
    // "Needs attention" used to count unread only while the category chips counted
    // read and unread alike, so the same items were advertised twice by two rules.
    render(
      <NotificationsPageClient
        userId="u1"
        mutedTypes={[]}
        notifications={[follow, publication, notification({ id: "read-1", read: true })]}
      />
    );

    expect(screen.getByRole("button", { name: "All (3)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unread (2)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Activity (3)" })).toBeInTheDocument();
  });

  it("marks the active chip for assistive technology", async () => {
    render(
      <NotificationsPageClient userId="u1" mutedTypes={[]} notifications={[follow, publication]} />
    );

    expect(screen.getByRole("button", { name: /^All/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    await userEvent.click(screen.getByRole("button", { name: /Activity/ }));

    expect(screen.getByRole("button", { name: /Activity/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: /^All/ })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });
});

describe("the caught-up dead end", () => {
  it("opens on everything rather than on unread", () => {
    // Defaulting to unread meant a fully-read inbox opened on an empty state while
    // its notifications sat in the database, unreachable by any filter.
    render(
      <NotificationsPageClient
        userId="u1"
        mutedTypes={[]}
        notifications={[notification({ id: "read-1", read: true, message: "An old one" })]}
      />
    );

    expect(screen.getByText("An old one")).toBeInTheDocument();
    expect(screen.queryByText("Nothing in this view.")).not.toBeInTheDocument();
  });

  it("still shows the inbox after marking everything read", async () => {
    render(
      <NotificationsPageClient userId="u1" mutedTypes={[]} notifications={[follow, publication]} />
    );

    await userEvent.click(screen.getByRole("button", { name: "Mark all read" }));

    await waitFor(() => {
      expect(screen.getByText("All caught up")).toBeInTheDocument();
    });
    // The rows are still on screen -- they are read, not gone.
    expect(screen.getByText(/started following your work/)).toBeInTheDocument();
    expect(screen.getByText(/published a new Article/)).toBeInTheDocument();
  });

  it("offers a way out of an empty filter", async () => {
    render(
      <NotificationsPageClient userId="u1" mutedTypes={[]} notifications={[follow, publication]} />
    );

    await userEvent.click(screen.getByRole("button", { name: /Responses/ }));
    expect(screen.getByText("Nothing in this view.")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Show all notifications" })
    );

    expect(screen.getByText(/started following your work/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^All/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("says caught up rather than empty when only unread is filtered out", async () => {
    render(
      <NotificationsPageClient
        userId="u1"
        mutedTypes={[]}
        notifications={[notification({ id: "read-1", read: true })]}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /^Unread/ }));

    expect(screen.getByText("You are all caught up.")).toBeInTheDocument();
    expect(
      screen.getByText(/Your inbox still has 1 notification\./)
    ).toBeInTheDocument();
  });
});
