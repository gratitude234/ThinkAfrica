import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import NotificationsForm, { type NotificationPrefs } from "./NotificationsForm";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
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
  push_published: true,
  push_messages: true,
  push_comments: true,
  push_likes: true,
  push_follows: true,
  push_daily_brief: true,
};

describe("NotificationsForm", () => {
  it("keeps account-wide push preferences editable on an unsupported device", async () => {
    render(<NotificationsForm profileId="user-a" notificationPrefs={prefs} />);
    await waitFor(() => {
      expect(screen.getByText("This browser does not support push notifications.")).toBeInTheDocument();
    });
    for (const label of ["Submission decisions", "Direct messages", "Comments", "Likes", "New followers", "Daily brief"]) {
      expect(screen.getByRole("switch", { name: `Push: ${label}` })).toBeEnabled();
    }
  });
});
