import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NotificationsForm, { type NotificationPrefs } from "./NotificationsForm";

/** The form saves every preference at once through saveNotificationPrefs, which
 *  resolves the acting member from the session. */
const savePrefs = vi.hoisted(() => vi.fn());
vi.mock("./profileActions", () => ({
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
vi.mock("./pushActions", () => ({ sendCurrentDeviceTestPush: vi.fn() }));

const prefs: NotificationPrefs = {
  inapp_likes: true,
  inapp_comments: true,
  inapp_follows: true,
  inapp_collaboration: true,

  email_comments: true,
  email_follows: true,
  email_likes: true,
  email_responses: true,
  email_published: true,
  email_account_security: true,
  email_announcements: true,
  email_review_assigned: true,
  email_review_started: true,
  email_review_reminder: true,
  email_co_author_invite: true,
  email_co_author_accepted: true,
  email_co_author_declined: true,

  push_published: true,
  push_comments: true,
  push_likes: true,
  push_follows: true,
};

describe("NotificationsForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    savePrefs.mockResolvedValue({ ok: true, data: null });
  });

  it("keeps account-wide push preferences editable on an unsupported device", async () => {
    render(<NotificationsForm profileId="user-a" notificationPrefs={prefs} />);
    await waitFor(() => {
      expect(screen.getByText("This browser does not support push notifications.")).toBeInTheDocument();
    });
    for (const label of ["Submission decisions", "Comments", "Likes", "New followers"]) {
      expect(screen.getByRole("switch", { name: `Push: ${label}` })).toBeEnabled();
    }
  });

  it("offers no publication subscription delivery on any channel", () => {
    render(<NotificationsForm profileId="user-a" notificationPrefs={prefs} />);

    expect(screen.queryByText(/Publication subscriptions/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Subscribed author publications/i)).not.toBeInTheDocument();
    for (const name of ["Email: Email", "Push: Push"]) {
      expect(screen.queryByRole("switch", { name })).not.toBeInTheDocument();
    }
  });

  it("saves every switch at once, and sends no member id", async () => {
    render(<NotificationsForm profileId="user-a" notificationPrefs={prefs} />);

    await userEvent.click(screen.getByRole("switch", { name: "In-app: Likes" }));
    await userEvent.click(screen.getByRole("button", { name: "Save preferences" }));

    await waitFor(() => expect(savePrefs).toHaveBeenCalledTimes(1));
    // profileId is still a prop, for the device push subscription. It is
    // deliberately not part of what the save sends.
    expect(Object.keys(savePrefs.mock.calls[0][0])).toEqual(["prefs"]);
    expect(savePrefs.mock.calls[0][0].prefs).toMatchObject({ inapp_likes: false });
  });
});

describe("the announcements preference", () => {
  beforeEach(() => {
    savePrefs.mockReset();
    savePrefs.mockResolvedValue({ ok: true, data: null });
  });

  it("is offered as its own switch, and the retired digest and reminder switches are not", async () => {
    // Broadcasts are their own opt-out category. The weekly digest, profile
    // reminders and the daily brief were retired in Phase 2F, so none is
    // offered; a stored value for any of them is carried by the save, not shown.
    render(<NotificationsForm profileId="user-a" notificationPrefs={prefs} />);

    expect(
      screen.getByRole("switch", { name: "Email: Indegenius announcements" })
    ).toBeChecked();
    for (const retired of ["Email: Weekly digest", "Email: Profile reminders", "Push: Daily brief"]) {
      expect(screen.queryByRole("switch", { name: retired })).not.toBeInTheDocument();
    }
  });

  it("saves under the key the broadcast eligibility rule reads", async () => {
    render(<NotificationsForm profileId="user-a" notificationPrefs={prefs} />);

    await userEvent.click(
      screen.getByRole("switch", { name: "Email: Indegenius announcements" })
    );
    await userEvent.click(screen.getByRole("button", { name: "Save preferences" }));

    await waitFor(() => {
      expect(savePrefs).toHaveBeenCalledWith({
        prefs: expect.objectContaining({ email_announcements: false }),
      });
    });
  });
});
