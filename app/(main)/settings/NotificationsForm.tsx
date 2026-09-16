"use client";

import { useCallback, useEffect, useState } from "react";
import { saveNotificationPrefs } from "./profileActions";
import { trackActivationEvent } from "@/lib/activationEvents";
import {
  getCurrentPushDeviceState,
  getPushOperationErrorMessage,
  requestPushPermission,
  subscribeCurrentDevice,
  unsubscribeCurrentDevice,
} from "@/lib/pushClient";
import Button from "@/components/ui/Button";
import Toast from "@/components/ui/Toast";
import { sendCurrentDeviceTestPush } from "./pushActions";
import {
  IN_APP_PREF_GROUPS,
  type InAppNotificationPrefs,
} from "@/lib/notificationPreferences";

interface BaseNotificationPrefs {
  email_comments: boolean;
  email_follows: boolean;
  email_likes: boolean;
  email_account_security: boolean;
  email_announcements: boolean;

  push_comments: boolean;
  push_likes: boolean;
  push_follows: boolean;

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
  { key: "email_account_security", label: "Account and security", description: "Security and account status emails" },
  { key: "email_announcements", label: "Indegenius announcements", description: "Occasional letters from the Indegenius team about the platform and what is changing" },

];

const PUSH_ROWS: { key: keyof NotificationPrefs; label: string; description: string }[] = [
  { key: "push_comments", label: "Comments", description: "Browser push when someone comments on your post or replies to your comment" },
  { key: "push_likes", label: "Likes", description: "Browser push when someone likes your post" },
  { key: "push_follows", label: "New followers", description: "Browser push when someone follows you" },

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
  const [toast, setToast] = useState<string | null>(null);
  const [pushState, setPushState] = useState<PushState>("checking");
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [endpoint, setEndpoint] = useState<string | null>(null);

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

  function trackDeviceOperation(operation: string, result: string, errorCode: string | null = null) {
    trackActivationEvent({
      event: "push_device_operation",
      source: "settings",
      metadata: { surface: "settings", operation, result, errorCode },
    });
  }

  const handleSave = async () => {
    setSaving(true);
    const result = await saveNotificationPrefs({ prefs });
    setSaving(false);
    setToast(result.ok ? "Preferences saved." : result.error);
  };

  // Switches change local state; Save preferences writes them all at once.
  const updatePreference = (key: keyof NotificationPrefs, nextValue: boolean) => {
    setPrefs((current) => ({ ...current, [key]: nextValue }));
  };

  const subscribe = async (requestPermission: boolean) => {
    setPushBusy(true);
    setPushError(null);
    try {
      if (requestPermission) {
        const permission = await requestPushPermission();
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
    return (
      <div key={key} className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3">
        <div className="min-w-0 pr-3">
          <p className="text-sm font-medium text-gray-800">{label}</p>
          <p className="mt-0.5 text-xs text-gray-500">{description}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-label={`${channel}: ${label}`}
          aria-checked={value}
          onClick={() => updatePreference(key, !value)}
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
        <div>
          <h2 className="mb-1 text-base font-semibold text-gray-900">In the app</h2>
          <p className="mb-4 text-xs text-gray-500">
            Choose which social activity appears in your notifications. Moderation,
            safety, and account notices always come through.
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
            {EMAIL_ROWS.map((row) => renderToggleRow(row, "Email"))}
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
            {PUSH_ROWS.map((row) => renderToggleRow(row, "Push"))}
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button loading={saving} onClick={handleSave}>Save preferences</Button>
        </div>
      </div>
      {toast ? <Toast message={toast} onDone={() => setToast(null)} /> : null}
    </>
  );
}
