"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isPushSupported, subscribeToPush } from "@/lib/pushClient";
import Button from "@/components/ui/Button";
import Toast from "@/components/ui/Toast";

export interface NotificationPrefs {
  email_comments: boolean;
  email_follows: boolean;
  email_likes: boolean;
  email_responses: boolean;
  email_messages: boolean;
  email_published: boolean;
  email_digest: boolean;
  email_account_security: boolean;
  email_profile_reminders: boolean;
  email_review_assigned: boolean;
  email_review_started: boolean;
  email_review_reminder: boolean;
  email_co_author_invite: boolean;
  email_co_author_accepted: boolean;
  email_co_author_declined: boolean;
  email_opportunity_inquiry: boolean;
  push_published: boolean;
  push_messages: boolean;
  push_comments: boolean;
  push_likes: boolean;
  push_follows: boolean;
  push_daily_brief: boolean;
}

const EMAIL_ROWS: { key: keyof NotificationPrefs; label: string; description: string }[] = [
  { key: "email_comments", label: "New comments", description: "When someone comments on your post" },
  { key: "email_follows", label: "New followers", description: "When someone follows you" },
  { key: "email_likes", label: "New likes", description: "When someone likes your post" },
  { key: "email_responses", label: "Responses to your posts", description: "When someone writes a response to your post" },
  { key: "email_messages", label: "New messages", description: "When someone sends you a direct message" },
  { key: "email_published", label: "Post published", description: "When your submitted post is published" },
  { key: "email_digest", label: "Weekly digest", description: "A weekly summary of top content" },
  { key: "email_account_security", label: "Account and trust updates", description: "Verification, role, and account status emails" },
  { key: "email_profile_reminders", label: "Profile reminders", description: "Occasional reminders to complete your public profile" },
  { key: "email_review_assigned", label: "Review assignments", description: "When you're assigned to review a submission" },
  { key: "email_review_started", label: "Your submission is under review", description: "When your submission's first reviewer is assigned" },
  { key: "email_review_reminder", label: "Review reminders", description: "A reminder if your review has been pending for a while" },
  { key: "email_co_author_invite", label: "Co-author invitations", description: "When someone invites you to co-author a post" },
  { key: "email_co_author_accepted", label: "Co-author invitation accepted", description: "When someone accepts your co-author invitation" },
  { key: "email_co_author_declined", label: "Co-author invitation declined", description: "When someone declines your co-author invitation" },
  { key: "email_opportunity_inquiry", label: "Opportunity inquiries", description: "When an organization sends you an opportunity inquiry" },
];

const PUSH_ROWS: { key: keyof NotificationPrefs; label: string; description: string }[] = [
  { key: "push_published", label: "Submission decisions", description: "Browser push when your submission is published, rejected, or sent back for revision" },
  { key: "push_messages", label: "Direct messages", description: "Browser push when someone sends you a direct message" },
  { key: "push_comments", label: "Comments", description: "Browser push when someone comments on your post or replies to your comment" },
  { key: "push_likes", label: "Likes", description: "Browser push when someone likes your post" },
  { key: "push_follows", label: "New followers", description: "Browser push when someone follows you" },
  { key: "push_daily_brief", label: "Daily brief", description: "One browser push a day with today's top post and live debate" },
];

type PushState =
  | "checking"
  | "unsupported"
  | "default"
  | "denied"
  | "active"
  | "unsubscribed";

interface Props {
  profileId: string;
  notificationPrefs: NotificationPrefs;
  hasPushSubscription: boolean;
}

export default function NotificationsForm({
  profileId,
  notificationPrefs,
  hasPushSubscription,
}: Props) {
  const [prefs, setPrefs] = useState<NotificationPrefs>(notificationPrefs);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [pushState, setPushState] = useState<PushState>("checking");
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);

  useEffect(() => {
    if (!isPushSupported()) {
      setPushState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setPushState("denied");
      return;
    }
    if (Notification.permission === "default") {
      setPushState("default");
      return;
    }
    setPushState(hasPushSubscription ? "active" : "unsubscribed");
  }, [hasPushSubscription]);

  const handleSave = async () => {
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ notification_prefs: prefs })
      .eq("id", profileId);
    setSaving(false);

    if (error) {
      setToast(error.message);
      return;
    }
    setToast("Preferences saved.");
  };

  const handleEnablePush = async () => {
    setPushBusy(true);
    setPushError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPushState(permission === "denied" ? "denied" : "default");
        return;
      }
      const ok = await subscribeToPush(profileId);
      if (!ok) {
        setPushError("Could not finish enabling push notifications. Try again.");
        return;
      }
      setPushState("active");
    } catch {
      setPushError("Could not enable push notifications.");
    } finally {
      setPushBusy(false);
    }
  };

  const handleResubscribe = async () => {
    setPushBusy(true);
    setPushError(null);
    try {
      const ok = await subscribeToPush(profileId);
      if (!ok) {
        setPushError("Could not resubscribe. Try again.");
        return;
      }
      setPushState("active");
    } catch {
      setPushError("Could not resubscribe.");
    } finally {
      setPushBusy(false);
    }
  };

  const pushTogglesDisabled = pushState !== "active";

  function renderToggleRow(
    { key, label, description }: { key: keyof NotificationPrefs; label: string; description: string },
    disabled: boolean
  ) {
    const value = prefs[key];
    return (
      <div
        key={key}
        className={`flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3 ${
          disabled ? "opacity-50" : ""
        }`}
      >
        <div>
          <p className="text-sm font-medium text-gray-800">{label}</p>
          <p className="mt-0.5 text-xs text-gray-500">{description}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={value}
          disabled={disabled}
          onClick={() => setPrefs((p) => ({ ...p, [key]: !p[key] }))}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors ${
            disabled ? "cursor-not-allowed" : "cursor-pointer"
          } ${value ? "bg-emerald-500" : "bg-gray-200"}`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
              value ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="max-w-2xl space-y-6">
        <div>
          <h2 className="mb-4 text-base font-semibold text-gray-900">Email</h2>
          <div className="space-y-3">
            {EMAIL_ROWS.map((row) => renderToggleRow(row, false))}
          </div>
        </div>

        <div>
          <h2 className="mb-4 text-base font-semibold text-gray-900">
            Push notifications
          </h2>

          {pushState === "unsupported" ? (
            <p className="mb-3 text-xs text-gray-500">
              Your browser doesn&apos;t support push notifications, so these can&apos;t be
              turned on here.
            </p>
          ) : null}

          {pushState === "default" ? (
            <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
              <p className="text-sm text-gray-700">
                Turn on push notifications to get real-time alerts on this device.
              </p>
              <Button size="sm" loading={pushBusy} onClick={handleEnablePush}>
                Enable push
              </Button>
            </div>
          ) : null}

          {pushState === "denied" ? (
            <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Push notifications are blocked for Indegenius in your browser. Re-enable them
              from your browser or device&apos;s site settings, then refresh this page.
            </p>
          ) : null}

          {pushState === "unsubscribed" ? (
            <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
              <p className="text-sm text-gray-700">
                Notifications are allowed, but this device isn&apos;t currently subscribed.
              </p>
              <Button size="sm" loading={pushBusy} onClick={handleResubscribe}>
                Resubscribe
              </Button>
            </div>
          ) : null}

          {pushError ? (
            <p className="mb-3 text-sm text-red-600">{pushError}</p>
          ) : null}

          <div className="space-y-3">
            {PUSH_ROWS.map((row) => renderToggleRow(row, pushTogglesDisabled))}
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button loading={saving} onClick={handleSave}>
            Save preferences
          </Button>
        </div>
      </div>

      {toast ? <Toast message={toast} onDone={() => setToast(null)} /> : null}
    </>
  );
}
