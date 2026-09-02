"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { trackActivationEvent } from "@/lib/activationEvents";
import {
  getCurrentPushDeviceState,
  getPushOperationErrorMessage,
  requestPushPermission,
  subscribeCurrentDevice,
  unsubscribeCurrentDevice,
} from "@/lib/pushClient";
import {
  recordPushPermissionDenied,
  recordPushPermissionRestored,
  type PushPermissionState,
} from "@/lib/pushPromptPolicy";
import {
  loadPushNudgeState,
  savePushNudgeState,
  setPushNudgeDisabled,
} from "@/lib/pushNudgeStorage";
import Button from "@/components/ui/Button";
import Toast from "@/components/ui/Toast";
import { sendCurrentDeviceTestPush } from "./pushActions";
import {
  IN_APP_PREF_GROUPS,
  type InAppNotificationPrefs,
} from "@/lib/notificationPreferences";
import { isAuthorSubscriptionsUxV2Enabled } from "@/lib/featureFlags";
import type { NotificationPreferenceKey } from "@/lib/publicationDelivery";
export type { NotificationPreferenceKey } from "@/lib/publicationDelivery";

interface BaseNotificationPrefs {
  email_comments: boolean;
  email_follows: boolean;
  email_likes: boolean;
  email_responses: boolean;
  email_messages: boolean;
  email_published: boolean;
  email_digest: boolean;
  email_account_security: boolean;
  email_profile_reminders: boolean;
  email_announcements: boolean;
  email_review_assigned: boolean;
  email_review_started: boolean;
  email_review_reminder: boolean;
  email_co_author_invite: boolean;
  email_co_author_accepted: boolean;
  email_co_author_declined: boolean;
  email_opportunity_inquiry: boolean;
  email_author_publications: boolean;
  email_debate_updates: boolean;
  push_published: boolean;
  push_messages: boolean;
  push_comments: boolean;
  push_likes: boolean;
  push_follows: boolean;
  push_daily_brief: boolean;
  push_author_publications: boolean;
  push_debate_updates: boolean;
}

/**
 * In-app preferences share the profile's notification_prefs blob with email and
 * push, so they need no schema change -- but they are the only channel a reader
 * could not previously control at all.
 */
export type NotificationPrefs = BaseNotificationPrefs & InAppNotificationPrefs;

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
  { key: "email_announcements", label: "Indegenius announcements", description: "Occasional letters from the Indegenius team about the platform and what is changing" },
  { key: "email_review_assigned", label: "Review assignments", description: "When you're assigned to review a submission" },
  { key: "email_review_started", label: "Your submission is under review", description: "When your submission's first reviewer is assigned" },
  { key: "email_review_reminder", label: "Review reminders", description: "A reminder if your review has been pending for a while" },
  { key: "email_co_author_invite", label: "Co-author invitations", description: "When someone invites you to co-author a post" },
  { key: "email_co_author_accepted", label: "Co-author invitation accepted", description: "When someone accepts your co-author invitation" },
  { key: "email_co_author_declined", label: "Co-author invitation declined", description: "When someone declines your co-author invitation" },
  { key: "email_opportunity_inquiry", label: "Opportunity inquiries", description: "When an organization sends you an opportunity inquiry" },
  { key: "email_author_publications", label: "Subscribed author publications", description: "Articles from authors you explicitly subscribe to" },
  { key: "email_debate_updates", label: "Debate updates", description: "Invitations, participant responses, stage openings, and cancellations" },
];

const PUSH_ROWS: { key: keyof NotificationPrefs; label: string; description: string }[] = [
  { key: "push_published", label: "Submission decisions", description: "Browser push when your submission is published, rejected, or sent back for revision" },
  { key: "push_messages", label: "Direct messages", description: "Browser push when someone sends you a direct message" },
  { key: "push_comments", label: "Comments", description: "Browser push when someone comments on your post or replies to your comment" },
  { key: "push_likes", label: "Likes", description: "Browser push when someone likes your post" },
  { key: "push_follows", label: "New followers", description: "Browser push when someone follows you" },
  { key: "push_daily_brief", label: "Daily brief", description: "One browser push a day with today's top post and live debate" },
  { key: "push_author_publications", label: "Subscribed author publications", description: "Browser push for Articles from subscribed authors" },
  { key: "push_debate_updates", label: "Debate updates", description: "Browser push for important debate invitations and lifecycle changes" },
];

type PushState = "checking" | "unsupported" | "default" | "denied" | "active" | "unsubscribed";

interface Props {
  profileId: string;
  notificationPrefs: NotificationPrefs;
}

const TEST_ERROR_MESSAGES = {
  missing_configuration: "Test notifications are not configured right now.",
  not_found: "This device subscription could not be found. Try resubscribing.",
  expired_subscription: "This device subscription expired. Resubscribe and try again.",
  delivery_failed: "The test notification could not be delivered.",
} as const;

export default function NotificationsForm({ profileId, notificationPrefs }: Props) {
  const [prefs, setPrefs] = useState<NotificationPrefs>(notificationPrefs);
  const [saving, setSaving] = useState(false);
  const [switchStatus, setSwitchStatus] = useState<
    Partial<Record<NotificationPreferenceKey, "saving" | "saved" | "error">>
  >({});
  const switchRequestRef = useRef<
    Partial<Record<NotificationPreferenceKey, number>>
  >({});
  const [toast, setToast] = useState<string | null>(null);
  const [pushState, setPushState] = useState<PushState>("checking");
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const autoSave = isAuthorSubscriptionsUxV2Enabled();

  const refreshDeviceState = useCallback(async () => {
    setPushState("checking");
    const device = await getCurrentPushDeviceState();
    if (!device.supported) {
      setPushState("unsupported");
      return;
    }
    if (device.permission === "denied") {
      setPushState("denied");
      return;
    }
    if (device.subscription) {
      setEndpoint(device.subscription.endpoint);
      setPushState("active");
      return;
    }
    setEndpoint(null);
    setPushState(device.permission === "default" ? "default" : "unsubscribed");
    if (device.errorCode) setPushError(getPushOperationErrorMessage(device.errorCode));
  }, []);

  useEffect(() => {
    void refreshDeviceState();
  }, [refreshDeviceState]);

  function syncNudgePermission(permission: PushPermissionState) {
    const current = loadPushNudgeState(profileId, null, permission);
    savePushNudgeState(
      profileId,
      permission === "denied"
        ? recordPushPermissionDenied(current)
        : recordPushPermissionRestored(current)
    );
  }

  function trackDeviceOperation(operation: string, result: string, errorCode: string | null = null) {
    trackActivationEvent({
      event: "push_device_operation",
      source: "settings",
      metadata: { surface: "settings", operation, result, errorCode },
    });
  }

  const handleSave = async () => {
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ notification_prefs: prefs })
      .eq("id", profileId);
    setSaving(false);
    setToast(error ? error.message : "Preferences saved.");
  };

  const updatePreference = async (
    key: NotificationPreferenceKey,
    nextValue: boolean
  ) => {
    if (!autoSave) {
      setPrefs((current) => ({ ...current, [key]: nextValue }));
      return;
    }

    const previousValue = prefs[key];
    const requestId = (switchRequestRef.current[key] ?? 0) + 1;
    switchRequestRef.current[key] = requestId;
    setPrefs((current) => ({ ...current, [key]: nextValue }));
    setSwitchStatus((current) => ({ ...current, [key]: "saving" }));

    const supabase = createClient();
    const { error } = await supabase.rpc("set_notification_preference", {
      p_key: key,
      p_enabled: nextValue,
    });
    if (switchRequestRef.current[key] !== requestId) return;

    if (error) {
      setPrefs((current) => ({ ...current, [key]: previousValue }));
      setSwitchStatus((current) => ({ ...current, [key]: "error" }));
      return;
    }
    setSwitchStatus((current) => ({ ...current, [key]: "saved" }));
  };

  const subscribe = async (requestPermission: boolean) => {
    setPushBusy(true);
    setPushError(null);
    try {
      if (requestPermission) {
        const permission = await requestPushPermission();
        syncNudgePermission(permission);
        trackActivationEvent({
          event: "push_permission_resolved",
          source: "settings",
          metadata: { surface: "settings", result: permission },
        });
        if (permission !== "granted") {
          setPushState(permission === "denied" ? "denied" : "default");
          return;
        }
      }

      const result = await subscribeCurrentDevice(profileId);
      trackDeviceOperation("subscribe", result.ok ? "success" : "failure", result.ok ? null : result.code);
      if (!result.ok) {
        setPushError(getPushOperationErrorMessage(result.code));
        return;
      }
      syncNudgePermission("granted");
      setPushNudgeDisabled(profileId, false);
      setEndpoint(result.endpoint);
      setPushState("active");
      setToast("Push notifications enabled on this device.");
    } catch {
      setPushError("Could not enable push notifications.");
      trackDeviceOperation("subscribe", "failure", "unexpected");
    } finally {
      setPushBusy(false);
    }
  };

  const handleDisable = async () => {
    setPushBusy(true);
    setPushError(null);
    try {
      const result = await unsubscribeCurrentDevice(profileId);
      const locallyOff = result.ok || result.localUnsubscribed;
      trackDeviceOperation("unsubscribe", result.ok ? "success" : locallyOff ? "partial" : "failure", result.ok ? null : result.code);
      if (!result.ok && !result.localUnsubscribed) {
        setPushError(getPushOperationErrorMessage(result.code));
        return;
      }
      const current = loadPushNudgeState(profileId, null, Notification.permission);
      savePushNudgeState(profileId, { ...current, disabledByUser: true });
      setEndpoint(null);
      setPushState(Notification.permission === "denied" ? "denied" : Notification.permission === "default" ? "default" : "unsubscribed");
      if (!result.ok) setPushError(getPushOperationErrorMessage(result.code));
      else setToast("Push notifications disabled on this device.");
    } finally {
      setPushBusy(false);
    }
  };

  const handleTest = async () => {
    if (!endpoint) return;
    setPushBusy(true);
    setPushError(null);
    try {
      const result = await sendCurrentDeviceTestPush(endpoint);
      trackDeviceOperation("test", result.ok ? "success" : "failure", result.ok ? null : result.code);
      if (!result.ok) {
        setPushError(TEST_ERROR_MESSAGES[result.code]);
        if (result.code === "expired_subscription" || result.code === "not_found") {
          await refreshDeviceState();
        }
        return;
      }
      setToast("Test notification sent.");
    } finally {
      setPushBusy(false);
    }
  };

  function renderToggleRow(
    { key, label, description }: { key: keyof NotificationPrefs; label: string; description: string },
    channel: "Email" | "Push" | "In-app"
  ) {
    const value = prefs[key];
    const preferenceKey = key as NotificationPreferenceKey;
    const status = switchStatus[preferenceKey];
    return (
      <div key={key} className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3">
        <div className="min-w-0 pr-3">
          <p className="text-sm font-medium text-gray-800">{label}</p>
          <p className="mt-0.5 text-xs text-gray-500">{description}</p>
          {autoSave && status ? (
            <p
              className={`mt-1 text-xs ${
                status === "error" ? "text-red-600" : "text-gray-500"
              }`}
              role={status === "error" ? "alert" : "status"}
              aria-live="polite"
            >
              {status === "saving"
                ? "Saving…"
                : status === "saved"
                  ? "Saved"
                  : "Could not save. Restored."}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          role="switch"
          aria-label={`${channel}: ${label}`}
          aria-checked={value}
          aria-busy={status === "saving" || undefined}
          onClick={() => void updatePreference(preferenceKey, !value)}
          className="relative inline-flex h-11 w-12 shrink-0 cursor-pointer items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          <span
            className={`relative inline-flex h-6 w-11 rounded-full transition-colors ${
              value ? "bg-emerald-500" : "bg-gray-200"
            }`}
            aria-hidden="true"
          >
            <span className={`inline-block h-5 w-5 translate-y-0.5 transform rounded-full bg-white shadow transition-transform motion-reduce:transition-none ${value ? "translate-x-5" : "translate-x-0.5"}`} />
          </span>
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="max-w-2xl space-y-6">
        {autoSave ? (
          <section
            id="publication-subscriptions"
            className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
              Publication subscriptions
            </p>
            <h2 className="mt-1 text-base font-semibold text-gray-900">
              How new work reaches you
            </h2>
            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-emerald-100 bg-white px-4 py-3">
                <p className="text-sm font-medium text-gray-800">In-app</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  Always on for Posts and Articles from your
                  subscriptions.
                </p>
              </div>
              {renderToggleRow(
                {
                  key: "email_author_publications",
                  label: "Email",
                  description: "Articles from subscribed writers",
                },
                "Email"
              )}
              {renderToggleRow(
                {
                  key: "push_author_publications",
                  label: "Push",
                  description: `Articles · ${
                    pushState === "active"
                      ? "enabled on this device"
                      : pushState === "unsupported"
                        ? "unsupported on this device"
                        : "this device is not enabled"
                  }`,
                },
                "Push"
              )}
            </div>
          </section>
        ) : null}

        <div>
          <h2 className="mb-1 text-base font-semibold text-gray-900">In the app</h2>
          <p className="mb-4 text-xs text-gray-500">
            What shows up in your notifications inbox and the bell. Anything that
            needs a response from you (review requests, invitations, editorial and
            account decisions) always comes through and is not listed here.
          </p>
          <div className="space-y-3">
            {IN_APP_PREF_GROUPS.map((group) =>
              renderToggleRow(
                { key: group.key, label: group.label, description: group.description },
                "In-app"
              )
            )}
          </div>
        </div>

        <div>
          <h2 className="mb-4 text-base font-semibold text-gray-900">Email</h2>
          <div className="space-y-3">
            {EMAIL_ROWS.filter(
              (row) => !autoSave || row.key !== "email_author_publications"
            ).map((row) => renderToggleRow(row, "Email"))}
          </div>
        </div>

        <div>
          <h2 className="mb-1 text-base font-semibold text-gray-900">Push notifications</h2>
          <p className="mb-4 text-xs text-gray-500">
            Device enrollment applies to this browser. The preferences below apply to every subscribed device.
          </p>

          <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
            {pushState === "checking" ? <p className="text-sm text-gray-600">Checking this device...</p> : null}
            {pushState === "unsupported" ? <p className="text-sm text-gray-700">This browser does not support push notifications.</p> : null}
            {pushState === "default" ? (
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-gray-700">Push notifications are not enabled on this device.</p>
                <Button size="sm" loading={pushBusy} onClick={() => subscribe(true)}>Enable push</Button>
              </div>
            ) : null}
            {pushState === "denied" ? (
              <p className="text-sm text-amber-800">
                Notifications are blocked for Indegenius. Re-enable them in your browser or device site settings, then refresh this page.
              </p>
            ) : null}
            {pushState === "unsubscribed" ? (
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-gray-700">Permission is allowed, but this device is not subscribed.</p>
                <Button size="sm" loading={pushBusy} onClick={() => subscribe(false)}>Resubscribe</Button>
              </div>
            ) : null}
            {pushState === "active" ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-emerald-800">Enabled on this device</p>
                  <p className="mt-0.5 text-xs text-gray-500">You can verify delivery or disable only this browser.</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" loading={pushBusy} onClick={handleTest}>Send test</Button>
                  <Button size="sm" variant="danger" loading={pushBusy} onClick={handleDisable}>Disable</Button>
                </div>
              </div>
            ) : null}
          </div>

          {pushError ? <p className="mb-3 text-sm text-red-600" role="alert">{pushError}</p> : null}
          <div className="space-y-3">
            {PUSH_ROWS.filter(
              (row) => !autoSave || row.key !== "push_author_publications"
            ).map((row) => renderToggleRow(row, "Push"))}
          </div>
        </div>

        {!autoSave ? (
          <div className="flex justify-end pt-2">
            <Button loading={saving} onClick={handleSave}>Save preferences</Button>
          </div>
        ) : null}
      </div>
      {toast ? <Toast message={toast} onDone={() => setToast(null)} /> : null}
    </>
  );
}
