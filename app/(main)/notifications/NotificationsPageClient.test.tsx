import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NotificationsPageClient from "./NotificationsPageClient";
import type { NotificationData } from "@/lib/notificationData";

vi.mock("@/lib/activationEvents", () => ({ trackActivationEvent: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));

const mutations = vi.hoisted(() => ({
  markAllNotificationsRead: vi.fn(),
  restoreUnread: vi.fn(),
  dismissNotification: vi.fn(),
  undismissNotification: vi.fn(),
}));
const readMutation = vi.hoisted(() => ({ markNotificationRead: vi.fn() }));

// The writes moved to server actions, which resolve the viewer themselves.
// The stub names are unchanged so every assertion below still reads the same.
vi.mock("@/lib/notificationActions", () => ({
  markAllNotificationsReadAction: mutations.markAllNotificationsRead,
  restoreUnreadAction: mutations.restoreUnread,
  dismissNotificationAction: mutations.dismissNotification,
  undismissNotificationAction: mutations.undismissNotification,
}));
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
/** A historic editorial notification. The review workflow is retired, so the
 *  row is ordinary activity and its stored review copy never renders. */
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

describe("the filter row", () => {
  it("offers All and Unread, and nothing else", () => {
    render(<NotificationsPageClient notifications={[follow, publication, revision]} />);

    const group = screen.getByRole("group", { name: "Filter notifications" });
    expect(
      within(group)
        .getAllByRole("button")
        .map((button) => button.textContent)
    ).toEqual(["All", "Unread (3)"]);

    for (const retired of [/^Review/, /^Activity/, /Subscriptions/, /Needs attention/]) {
      expect(screen.queryByRole("button", { name: retired })).not.toBeInTheDocument();
    }
  });

  it("opens on All", () => {
    render(<NotificationsPageClient notifications={[follow, publication]} />);

    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^Unread/ })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  it("counts unread on the Unread chip and follows it as rows are read", async () => {
    render(
      <NotificationsPageClient
        notifications={[follow, publication, notification({ id: "read-1", read: true })]}
      />
    );

    expect(screen.getByRole("button", { name: "Unread (2)" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("link", { name: /published a new Article/ }));

    expect(screen.getByRole("button", { name: "Unread (1)" })).toBeInTheDocument();
  });

  it("marks the active chip for assistive technology, and filters to unread rows", async () => {
    render(
      <NotificationsPageClient
        notifications={[follow, notification({ id: "read-1", read: true, message: "An old one" })]}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /^Unread/ }));

    expect(screen.getByRole("button", { name: /^Unread/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText(/started following your work/)).toBeInTheDocument();
    expect(screen.queryByText("An old one")).not.toBeInTheDocument();
  });
});

describe("follow and publication notifications", () => {
  it("renders both as activity rows, each with its own destination", () => {
    render(<NotificationsPageClient notifications={[follow, publication]} />);

    expect(screen.getByText(/started following your work/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /published a new Article/ })).toHaveAttribute(
      "href",
      "/post/sickle-cell"
    );
  });

  it("files a historic review notification as ordinary activity, once, with no hero", () => {
    render(<NotificationsPageClient notifications={[revision, follow, publication]} />);

    expect(screen.queryByText("Needs attention")).not.toBeInTheDocument();
    expect(screen.queryByText(/Reviewer feedback/)).not.toBeInTheDocument();
    expect(
      screen.getAllByText(/There is an update related to The Burden Of Sickle Cell Disease/)
    ).toHaveLength(1);
    expect(screen.getByText(/started following your work/)).toBeInTheDocument();
    expect(screen.getByText(/published a new Article/)).toBeInTheDocument();
  });
});

describe("the header", () => {
  it("links to notification settings", () => {
    render(<NotificationsPageClient notifications={[follow]} />);

    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute(
      "href",
      "/settings?tab=notifications"
    );
  });

  it("offers Mark all read only while something is unread", () => {
    const { unmount } = render(<NotificationsPageClient notifications={[follow]} />);
    expect(screen.getByRole("button", { name: "Mark all read" })).toBeInTheDocument();
    unmount();

    render(<NotificationsPageClient notifications={[notification({ id: "read-1", read: true })]} />);
    expect(screen.queryByRole("button", { name: "Mark all read" })).not.toBeInTheDocument();
  });
});

describe("marking a single notification read", () => {
  it("persists the read and updates the unread count", async () => {
    render(<NotificationsPageClient notifications={[follow, publication]} />);

    expect(screen.getByText("2 unread notifications")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("link", { name: /published a new Article/ }));

    await waitFor(() => {
      expect(readMutation.markNotificationRead).toHaveBeenCalledWith("pub-1");
    });
    // Singular, not "1 unread notifications".
    expect(screen.getByText("1 unread notification")).toBeInTheDocument();
  });

  it("restores the unread state when the write fails", async () => {
    readMutation.markNotificationRead.mockRejectedValue(new Error("denied"));

    render(<NotificationsPageClient notifications={[follow, publication]} />);

    await userEvent.click(screen.getByRole("link", { name: /published a new Article/ }));

    await waitFor(() => {
      expect(screen.getByText("2 unread notifications")).toBeInTheDocument();
    });
  });
});

describe("dismissing a notification", () => {
  it("removes the row and offers an undo", async () => {
    render(<NotificationsPageClient notifications={[follow, publication]} />);

    await userEvent.click(
      screen.getByRole("button", { name: /Dismiss notification: Yusuph Sebasi published/ })
    );

    await waitFor(() => {
      expect(screen.queryByText(/published a new Article/)).not.toBeInTheDocument();
    });
    // The viewer is no longer an argument: the action resolves it from the
    // session. What the browser still names is which row it means.
    expect(mutations.dismissNotification).toHaveBeenCalledWith("pub-1");

    const toast = screen.getByRole("status");
    expect(within(toast).getByText("Notification dismissed")).toBeInTheDocument();

    await userEvent.click(within(toast).getByRole("button", { name: "Undo" }));

    await waitFor(() => {
      expect(mutations.undismissNotification).toHaveBeenCalledWith("pub-1");
    });
  });

  it("puts the row back when the dismiss write fails", async () => {
    mutations.dismissNotification.mockResolvedValue({ error: "offline" });

    render(<NotificationsPageClient notifications={[follow, publication]} />);

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
    render(<NotificationsPageClient notifications={[follow, publication]} />);

    await userEvent.click(screen.getByRole("button", { name: "Mark all read" }));

    await waitFor(() => {
      expect(screen.getByText("You are all caught up.")).toBeInTheDocument();
    });

    const toast = screen.getByRole("status");
    expect(toast).toHaveTextContent("Marked 2 notifications read");

    await userEvent.click(within(toast).getByRole("button", { name: "Undo" }));

    await waitFor(() => {
      expect(mutations.restoreUnread).toHaveBeenCalledWith(["follow-1", "pub-1"]);
    });
  });

  it("explains a unique-violation conflict rather than failing silently", async () => {
    mutations.restoreUnread.mockResolvedValue({
      error: "duplicate key",
      conflict: true,
    });

    render(<NotificationsPageClient notifications={[follow, publication]} />);

    await userEvent.click(screen.getByRole("button", { name: "Mark all read" }));
    const toast = await screen.findByRole("status");
    await userEvent.click(within(toast).getByRole("button", { name: "Undo" }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(
        /some of those notifications have newer activity/
      );
    });
    expect(screen.getByRole("status")).not.toHaveTextContent(/duplicate key/);
  });

  it("restores the unread state when the bulk write fails", async () => {
    mutations.markAllNotificationsRead.mockResolvedValue({
      error: "offline",
      affectedIds: [],
    });

    render(<NotificationsPageClient notifications={[follow, publication]} />);

    await userEvent.click(screen.getByRole("button", { name: "Mark all read" }));

    await waitFor(() => {
      expect(screen.getByText("2 unread notifications")).toBeInTheDocument();
    });
    expect(screen.getByRole("status")).toHaveTextContent(/Failed to mark/);
  });
});

describe("refreshing", () => {
  it("catches up when the reader returns to the tab", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ notifications: [publication] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      render(<NotificationsPageClient notifications={[follow]} />);

      await act(async () => {
        fireEvent(document, new Event("visibilitychange"));
      });

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith("/api/notifications?limit=50");
      });
      await waitFor(() => {
        expect(screen.getByText(/published a new Article/)).toBeInTheDocument();
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("the empty and caught-up states", () => {
  it("says there is nothing yet when the inbox is empty", () => {
    render(<NotificationsPageClient notifications={[]} />);

    expect(screen.getByText("No notifications yet")).toBeInTheDocument();
    expect(screen.getByText("You are all caught up.")).toBeInTheDocument();
  });

  it("opens on everything rather than on unread", () => {
    // Defaulting to unread meant a fully-read inbox opened on an empty state while
    // its notifications sat in the database, unreachable by any filter.
    render(
      <NotificationsPageClient
        notifications={[notification({ id: "read-1", read: true, message: "An old one" })]}
      />
    );

    expect(screen.getByText("An old one")).toBeInTheDocument();
    expect(screen.queryByText("No notifications yet")).not.toBeInTheDocument();
  });

  it("still shows the inbox after marking everything read", async () => {
    render(<NotificationsPageClient notifications={[follow, publication]} />);

    await userEvent.click(screen.getByRole("button", { name: "Mark all read" }));

    await waitFor(() => {
      expect(screen.getByText("You are all caught up.")).toBeInTheDocument();
    });
    // The rows are still on screen -- they are read, not gone.
    expect(screen.getByText(/started following your work/)).toBeInTheDocument();
    expect(screen.getByText(/published a new Article/)).toBeInTheDocument();
  });

  it("says caught up rather than empty when only unread is filtered out, and All brings the inbox back", async () => {
    render(
      <NotificationsPageClient
        notifications={[notification({ id: "read-1", read: true, message: "An old one" })]}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /^Unread/ }));

    expect(screen.getByText("No unread notifications")).toBeInTheDocument();
    expect(screen.getByText("You are all caught up.")).toBeInTheDocument();
    expect(screen.queryByText("No notifications yet")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "All" }));

    expect(screen.getByText("An old one")).toBeInTheDocument();
  });
});
