import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NotificationsForm, { type NotificationPrefs } from "./NotificationsForm";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ rpc }),
}));
vi.mock("@/lib/activationEvents", () => ({ trackActivationEvent: vi.fn() }));
vi.mock("@/lib/pushClient", () => ({
  getCurrentPushDeviceState: vi.fn().mockResolvedValue({
    supported: false,
    permission: "unsupported",
    subscription: null,
    errorCode: null,
  }),
  getPushOperationErrorMessage: vi.fn(),
  requestPushPermission: vi.fn(),
  subscribeCurrentDevice: vi.fn(),
  unsubscribeCurrentDevice: vi.fn(),
}));
vi.mock("@/lib/pushNudgeStorage", () => ({
  loadPushNudgeState: vi.fn(),
  savePushNudgeState: vi.fn(),
  setPushNudgeDisabled: vi.fn(),
}));
vi.mock("./pushActions", () => ({ sendCurrentDeviceTestPush: vi.fn() }));

const prefs: NotificationPrefs = {
  inapp_likes: true,
  inapp_follows: true,
  inapp_debates: true,
  inapp_collaboration: true,
  email_comments: true,
  email_follows: true,
  email_likes: true,
  email_responses: true,
  email_messages: true,
  email_published: true,
  email_digest: true,
  email_account_security: true,
  email_profile_reminders: true,
  email_review_assigned: true,
  email_review_started: true,
  email_review_reminder: true,
  email_co_author_invite: true,
  email_co_author_accepted: true,
  email_co_author_declined: true,
  email_opportunity_inquiry: true,
  email_author_publications: true,
  email_debate_updates: true,
  push_published: true,
  push_messages: true,
  push_comments: true,
  push_likes: true,
  push_follows: true,
  push_daily_brief: true,
  push_author_publications: true,
  push_debate_updates: true,
};

describe("NotificationsForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    rpc.mockResolvedValue({ error: null });
  });

  it("keeps account-wide push preferences editable on an unsupported device", async () => {
    render(<NotificationsForm profileId="user-a" notificationPrefs={prefs} />);
    await waitFor(() => {
      expect(screen.getByText("This browser does not support push notifications.")).toBeInTheDocument();
    });
    for (const label of ["Submission decisions", "Direct messages", "Comments", "Likes", "New followers", "Daily brief", "Subscribed author publications", "Debate updates"]) {
      expect(screen.getByRole("switch", { name: `Push: ${label}` })).toBeEnabled();
    }
    expect(
      screen.getByRole("switch", { name: "Email: Debate updates" })
    ).toBeChecked();
  });

  it("keeps subscription delivery always on in-app and auto-saves other V2 switches", async () => {
    vi.stubEnv("NEXT_PUBLIC_AUTHOR_SUBSCRIPTIONS_ENABLED", "1");
    vi.stubEnv("NEXT_PUBLIC_TOPIC_SUBSCRIPTIONS_ENABLED", "1");
    vi.stubEnv("NEXT_PUBLIC_AUTHOR_SUBSCRIPTIONS_UX_V2_ENABLED", "1");

    render(<NotificationsForm profileId="user-a" notificationPrefs={prefs} />);

    expect(
      screen.getByText(/Always on for Posts and Articles/)
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("switch", { name: "In-app: New publications" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Save preferences" })
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("switch", { name: "In-app: Likes" })
    );
    await waitFor(() => {
      expect(rpc).toHaveBeenCalledWith("set_notification_preference", {
        p_key: "inapp_likes",
        p_enabled: false,
      });
    });
  });
});
