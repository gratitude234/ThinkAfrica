import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NotificationsForm, { type NotificationPrefs } from "./NotificationsForm";

/** The per-switch autosave is still one RPC per switch, but the form no longer
 *  calls it: setNotificationPreference resolves the acting member from the
 *  session and then calls it. The assertions below are unchanged in substance,
 *  and now read the action's argument rather than PostgREST's. */
const setPreference = vi.hoisted(() => vi.fn());
const savePrefs = vi.hoisted(() => vi.fn());
vi.mock("./profileActions", () => ({
  setNotificationPreference: setPreference,
  saveNotificationPrefs: savePrefs,
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
  email_announcements: true,
  email_review_assigned: true,
  email_review_started: true,
  email_review_reminder: true,
  email_co_author_invite: true,
  email_co_author_accepted: true,
  email_co_author_declined: true,
  email_opportunity_inquiry: true,
  email_author_publications: true,

  push_published: true,
  push_messages: true,
  push_comments: true,
  push_likes: true,
  push_follows: true,
  push_daily_brief: true,
  push_author_publications: true,

};

describe("NotificationsForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    setPreference.mockResolvedValue({ ok: true, data: null });
    savePrefs.mockResolvedValue({ ok: true, data: null });
  });

  it("keeps account-wide push preferences editable on an unsupported device", async () => {
    render(<NotificationsForm profileId="user-a" notificationPrefs={prefs} />);
    await waitFor(() => {
      expect(screen.getByText("This browser does not support push notifications.")).toBeInTheDocument();
    });
    for (const label of ["Submission decisions", "Direct messages", "Comments", "Likes", "New followers", "Daily brief", "Subscribed author publications"]) {
      expect(screen.getByRole("switch", { name: `Push: ${label}` })).toBeEnabled();
    }
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
      expect(setPreference).toHaveBeenCalledWith({
        key: "inapp_likes",
        enabled: false,
      });
    });
  });

  it("sends no member id, so a switch cannot be flipped on another account", () => {
    // profileId is still a prop, for the push-nudge storage key. It is
    // deliberately not part of what the save sends.
    for (const call of setPreference.mock.calls) {
      expect(Object.keys(call[0])).toEqual(["key", "enabled"]);
    }
  });
});

describe("the announcements preference", () => {
  beforeEach(() => {
    setPreference.mockReset();
    setPreference.mockResolvedValue({ ok: true, data: null });
  });

  it("is offered as its own switch, separate from the weekly digest", async () => {
    // Broadcasts are their own opt-out category. Muting the digest must not
    // silently mute founder correspondence, so the reader needs both switches.
    render(<NotificationsForm profileId="user-a" notificationPrefs={prefs} />);

    expect(
      screen.getByRole("switch", { name: "Email: Indegenius announcements" })
    ).toBeChecked();
    expect(
      screen.getByRole("switch", { name: "Email: Weekly digest" })
    ).toBeInTheDocument();
  });

  it("saves under the key the broadcast eligibility rule reads", async () => {
    // set_notification_preference validates against a hardcoded allowlist, so
    // a key the function does not know about throws rather than saving.
    //
    // All three flags, because isAuthorSubscriptionsUxV2Enabled() reads all
    // three and the per-switch autosave only exists under V2. This used to
    // stub one and rely on the other two leaking from the previous describe's
    // last test, which made it pass for a reason unrelated to what it checks.
    vi.stubEnv("NEXT_PUBLIC_AUTHOR_SUBSCRIPTIONS_ENABLED", "1");
    vi.stubEnv("NEXT_PUBLIC_TOPIC_SUBSCRIPTIONS_ENABLED", "1");
    vi.stubEnv("NEXT_PUBLIC_AUTHOR_SUBSCRIPTIONS_UX_V2_ENABLED", "1");

    render(<NotificationsForm profileId="user-a" notificationPrefs={prefs} />);

    await userEvent.click(
      screen.getByRole("switch", { name: "Email: Indegenius announcements" })
    );

    await waitFor(() => {
      expect(setPreference).toHaveBeenCalledWith({
        key: "email_announcements",
        enabled: false,
      });
    });
  });
});
