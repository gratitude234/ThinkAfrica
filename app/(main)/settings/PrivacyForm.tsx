"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import Toast from "@/components/ui/Toast";

export interface PrivacySettings {
  profile_visibility: "public" | "members_only";
  allow_messages: "everyone" | "followers_only" | "nobody";
  show_in_directory: boolean;
}

const INPUT_STYLES =
  "w-full rounded-xl border border-gray-200 bg-canvas px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500";

interface Props {
  profileId: string;
  privacySettings: PrivacySettings;
}

export default function PrivacyForm({ profileId, privacySettings }: Props) {
  const [settings, setSettings] = useState<PrivacySettings>(privacySettings);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ privacy_settings: settings })
      .eq("id", profileId);
    setSaving(false);

    if (error) {
      setToast(error.message);
      return;
    }
    setToast("Privacy settings saved.");
  };

  return (
    <>
      <div className="max-w-2xl space-y-6">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Profile visibility
          </label>
          <select
            value={settings.profile_visibility}
            onChange={(e) =>
              setSettings((s) => ({
                ...s,
                profile_visibility: e.target.value as PrivacySettings["profile_visibility"],
              }))
            }
            className={INPUT_STYLES}
          >
            <option value="public">Public — anyone can view your profile</option>
            <option value="members_only">Members only — signed-in users only</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Who can message you
          </label>
          <select
            value={settings.allow_messages}
            onChange={(e) =>
              setSettings((s) => ({
                ...s,
                allow_messages: e.target.value as PrivacySettings["allow_messages"],
              }))
            }
            className={INPUT_STYLES}
          >
            <option value="everyone">Everyone</option>
            <option value="followers_only">Followers only</option>
            <option value="nobody">No one</option>
          </select>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-gray-800">Show in directory</p>
            <p className="mt-0.5 text-xs text-gray-500">
              Appear in member and alumni directory searches.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.show_in_directory}
            onClick={() =>
              setSettings((s) => ({ ...s, show_in_directory: !s.show_in_directory }))
            }
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
              settings.show_in_directory ? "bg-emerald-500" : "bg-gray-200"
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                settings.show_in_directory ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        <div className="flex justify-end pt-2">
          <Button loading={saving} onClick={handleSave}>
            Save privacy settings
          </Button>
        </div>
      </div>

      {toast ? <Toast message={toast} onDone={() => setToast(null)} /> : null}
    </>
  );
}
