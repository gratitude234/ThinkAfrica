"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
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
  push_published: boolean;
}

const TOGGLE_ROWS: { key: keyof NotificationPrefs; label: string; description: string }[] = [
  { key: "email_comments", label: "New comments", description: "When someone comments on your post" },
  { key: "email_follows", label: "New followers", description: "When someone follows you" },
  { key: "email_likes", label: "New likes", description: "When someone likes your post" },
  { key: "email_responses", label: "Responses to your posts", description: "When someone writes a response to your post" },
  { key: "email_messages", label: "New messages", description: "When someone sends you a direct message" },
  { key: "email_published", label: "Post published", description: "When your submitted post is published" },
  { key: "email_digest", label: "Weekly digest", description: "A weekly summary of top content" },
  { key: "email_account_security", label: "Account and trust updates", description: "Verification, role, and account status emails" },
  { key: "email_profile_reminders", label: "Profile reminders", description: "Occasional reminders to complete your public profile" },
  { key: "push_published", label: "Push: submission decisions", description: "Browser push when your submission is published, rejected, or sent back for revision (requires enabling notifications)" },
];

interface Props {
  profileId: string;
  notificationPrefs: NotificationPrefs;
}

export default function NotificationsForm({ profileId, notificationPrefs }: Props) {
  const [prefs, setPrefs] = useState<NotificationPrefs>(notificationPrefs);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

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

  return (
    <>
      <div className="max-w-2xl space-y-6">
        <div>
          <h2 className="mb-4 text-base font-semibold text-gray-900">
            Notifications
          </h2>
          <div className="space-y-3">
            {TOGGLE_ROWS.map(({ key, label, description }) => {
              const value = prefs[key];
              return (
                <div
                  key={key}
                  className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-800">{label}</p>
                    <p className="mt-0.5 text-xs text-gray-500">{description}</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={value}
                    onClick={() => setPrefs((p) => ({ ...p, [key]: !p[key] }))}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                      value ? "bg-emerald-500" : "bg-gray-200"
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                        value ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              );
            })}
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
