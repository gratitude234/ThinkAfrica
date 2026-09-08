import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NotificationBell from "./NotificationBell";
import type { NotificationData } from "@/lib/notificationData";

vi.mock("@/lib/activationEvents", () => ({ trackActivationEvent: vi.fn() }));
vi.mock("@/lib/realtime", () => ({ shouldUseRealtime: () => false }));

// The bell no longer queries the database. It asks /api/notifications, which
// resolves the reader from the session, reads their mute preference and
// applies the same mute list to the list and to the badge. The stub client
// remains because the bell still uses it for realtime and for mark-all-read.
const storedPrefs = vi.hoisted(() => ({ value: null as unknown }));
const supabaseStub = vi.hoisted(() => ({
  rpc: () =>
    Promise.resolve({
      data: [
        {
          profile_id: "u1",
          notification_prefs: storedPrefs.value,
        },
      ],
      error: null,
    }),
  channel: () => ({
    on: () => ({ subscribe: () => ({}) }),
    subscribe: () => ({}),
  }),
  removeChannel: () => Promise.resolve(),
}));

vi.mock("@/lib/supabase/client", () => ({ createClient: () => supabaseStub }));

const data = vi.hoisted(() => ({
  fetchNotificationRows: vi.fn(),
  fetchUnreadCount: vi.fn(),
}));
const mutations = vi.hoisted(() => ({
  markAllNotificationsRead: vi.fn(),
}));
const readMutation = vi.hoisted(() => ({ markNotificationRead: vi.fn() }));

vi.mock("@/lib/notificationData", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/notificationData")>()),
  ...data,
}));
// Same move: the bell calls the server action now.
vi.mock("@/lib/notificationActions", () => ({
  markAllNotificationsReadAction: mutations.markAllNotificationsRead,
}));
vi.mock("@/lib/notificationRead", () => readMutation);

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
const revision = notification({
  id: "rev-1",
  type: "revision_requested",
  message: "Reviewer feedback is ready for Sickle Cell.",
  post_slug: "sickle-cell",
});

/**
 * The route's contract, as the bell sees it: null on either field means the
 * query failed, and the bell must leave what it already had rather than
 * clearing it.
 */
function setup({
  rows = [follow],
  count = 1,
}: { rows?: NotificationData[] | null; count?: number | null } = {}) {
  data.fetchNotificationRows.mockResolvedValue({ rows: rows ?? [], error: null });
  data.fetchUnreadCount.mockResolvedValue({ count, error: null });

  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ notifications: rows, unreadCount: count }),
    }))
  );

  return render(<NotificationBell userId="u1" />);
}

beforeEach(() => {
  vi.clearAllMocks();
  storedPrefs.value = null;
  readMutation.markNotificationRead.mockResolvedValue(undefined);
  mutations.markAllNotificationsRead.mockResolvedValue({
    error: null,
    affectedIds: ["follow-1"],
  });
});

describe("unread badge", () => {
  it("reports the true unread total, not the number of rows it fetched", async () => {
    // Regression: the count was derived from the ten fetched rows, so a reader with
    // 40 unread saw "3" whenever only three of the newest ten were unread.
    setup({ rows: [follow], count: 40 });

    expect(
      await screen.findByRole("button", { name: "Notifications, 40 unread" })
    ).toBeInTheDocument();
    expect(screen.getByText("40")).toBeInTheDocument();
  });

  it("caps the rendered badge but not the announced count", async () => {
    setup({ rows: [follow], count: 132 });

    expect(await screen.findByText("99+")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Notifications, 132 unread" })
    ).toBeInTheDocument();
  });

  it("keeps the previous badge when the count is unknown", async () => {
    // A null count means "unknown", which must not be rendered as zero. The
    // route sends null for exactly that, so the contract is unchanged; only
    // who computes it moved.
    setup({ rows: [follow], count: null });

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(
      screen.getByRole("button", { name: "Notifications" })
    ).toBeInTheDocument();
  });

  it("decrements when a single notification is opened", async () => {
    setup({ rows: [follow], count: 5 });
    await userEvent.click(await screen.findByRole("button", { name: /Notifications/ }));

    await userEvent.click(
      await screen.findByRole("link", { name: /started following your work/ })
    );

    await waitFor(() => {
      expect(readMutation.markNotificationRead).toHaveBeenCalledWith("follow-1");
    });
    expect(
      screen.getByRole("button", { name: "Notifications, 4 unread" })
    ).toBeInTheDocument();
  });

  it("restores the count when mark-all-read fails", async () => {
    mutations.markAllNotificationsRead.mockResolvedValue({
      error: "offline",
      affectedIds: [],
    });
    setup({ rows: [follow], count: 3 });

    await userEvent.click(await screen.findByRole("button", { name: /Notifications/ }));
    await userEvent.click(screen.getByRole("button", { name: "Mark all as read" }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Notifications, 3 unread" })
      ).toBeInTheDocument();
    });
  });
});

describe("dropdown accessibility", () => {
  it("describes its own state to assistive technology", async () => {
    setup();
    const trigger = await screen.findByRole("button", { name: /Notifications/ });

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");

    await userEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const panel = screen.getByRole("dialog", { name: "Notifications" });
    expect(trigger).toHaveAttribute("aria-controls", panel.id);
  });

  it("moves focus into the panel on open", async () => {
    setup();
    await userEvent.click(await screen.findByRole("button", { name: /Notifications/ }));

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "Notifications" })).toHaveFocus();
    });
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    setup();
    const trigger = await screen.findByRole("button", { name: /Notifications/ });
    await userEvent.click(trigger);

    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("closes on a pointer press outside the panel", async () => {
    // mousedown never fires for a touch tap that does not resolve to a click, so
    // the previous mousedown-only handler left the sheet stuck open on phones.
    setup();
    await userEvent.click(await screen.findByRole("button", { name: /Notifications/ }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await userEvent.click(document.body);

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("offers an explicit close control for the mobile sheet", async () => {
    setup();
    const trigger = await screen.findByRole("button", { name: /Notifications/ });
    await userEvent.click(trigger);

    await userEvent.click(
      screen.getByRole("button", { name: "Close notifications" })
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});

describe("dropdown content", () => {
  it("names the actor in fallback copy", async () => {
    // The bell's old query had no profiles join, so this read "Someone started
    // following you" while the same row on /notifications named them.
    setup();
    await userEvent.click(await screen.findByRole("button", { name: /Notifications/ }));

    expect(
      await screen.findByText("Yusuph Sebasi started following your work.")
    ).toBeInTheDocument();
  });

  it("links a notification that has no stored link", async () => {
    setup();
    await userEvent.click(await screen.findByRole("button", { name: /Notifications/ }));

    expect(
      await screen.findByRole("link", { name: /started following your work/ })
    ).toHaveAttribute("href", "/yusuph");
  });

  it("renders an actionable notification once, not in both hero and list", async () => {
    setup({ rows: [revision], count: 1 });
    await userEvent.click(await screen.findByRole("button", { name: /Notifications/ }));

    const panel = screen.getByRole("dialog");
    expect(within(panel).getByText("Needs attention")).toBeInTheDocument();
    expect(
      within(panel).getAllByText(/Reviewer feedback is ready/)
    ).toHaveLength(1);
  });

  it("exposes machine-readable timestamps", async () => {
    setup();
    await userEvent.click(await screen.findByRole("button", { name: /Notifications/ }));

    const time = screen.getByRole("dialog").querySelector("time");
    expect(time).toHaveAttribute("dateTime", follow.created_at);
  });
});

describe("polling", () => {
  it("does not poll while the tab is hidden", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      setup();
      await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

      const visibility = vi
        .spyOn(document, "visibilityState", "get")
        .mockReturnValue("hidden");

      await vi.advanceTimersByTimeAsync(90_000);
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // ...and catches up as soon as the tab comes back.
      visibility.mockReturnValue("visible");
      document.dispatchEvent(new Event("visibilitychange"));

      await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("muted notification types", () => {
  it("makes one request, because the preference is resolved on the server", async () => {
    // The bell used to read notification_prefs from the browser and wait for
    // it before fetching, or it would flash notifications the reader had
    // muted. /api/notifications reads the preference and applies it in the
    // same request, so there is nothing left to wait for and no window in
    // which muted rows can appear.
    storedPrefs.value = { inapp_likes: false };
    setup();

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith("/api/notifications");
  });

  it("renders whatever count the server computed under the mute list", async () => {
    // That the list and the badge apply the *same* mute list is now a property
    // of the route and the repository, and is asserted where it lives:
    // lib/db/notifications.neon.test.ts, "applies the same mute filter to the
    // list and the count". What the bell owes is to render what it was given.
    storedPrefs.value = { inapp_follows: false };
    setup({ rows: [], count: 7 });

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Notifications/ })
      ).toHaveTextContent("7")
    );
  });

  it("does no muting of its own, and renders every row it is given", async () => {
    // What "no stored preferences mutes nothing" means is asserted directly on
    // the pure function, in lib/notificationPreferences.test.ts. The bell's own
    // obligation is the complement: it must not re-filter server output, or a
    // reader's mute settings would be applied twice and disagree with the
    // badge.
    setup({ rows: [follow, revision], count: 2 });

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    const bell = screen.getByRole("button", { name: /Notifications/ });
    await waitFor(() => expect(bell).toHaveTextContent("2"));
  });
});
