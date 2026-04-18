"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import UniversitySelect from "@/components/ui/UniversitySelect";
import Button from "@/components/ui/Button";

interface ProfileGateProfile {
  full_name: string | null;
  username: string | null;
  university: string | null;
}

interface ProfileGateProps {
  open: boolean;
  userId: string;
  initialProfile: ProfileGateProfile | null;
  onClose: () => void;
  onComplete: (profile: {
    full_name: string;
    username: string;
    university: string | null;
  }) => void;
}

const INPUT_STYLES =
  "w-full rounded-xl border border-gray-200 bg-canvas px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500";

export default function ProfileGate({
  open,
  userId,
  initialProfile,
  onClose,
  onComplete,
}: ProfileGateProps) {
  const [fullName, setFullName] = useState(initialProfile?.full_name ?? "");
  const [username, setUsername] = useState(initialProfile?.username ?? "");
  const [university, setUniversity] = useState(initialProfile?.university ?? "");
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFullName(initialProfile?.full_name ?? "");
    setUsername(initialProfile?.username ?? "");
    setUniversity(initialProfile?.university ?? "");
    setUsernameError(null);
  }, [initialProfile, open]);

  useEffect(() => {
    if (!open) return;

    const normalizedUsername = username.trim().toLowerCase();
    if (!normalizedUsername) {
      setUsernameError("Username is required.");
      setCheckingUsername(false);
      return;
    }

    if (normalizedUsername === (initialProfile?.username ?? "")) {
      setUsernameError(null);
      setCheckingUsername(false);
      return;
    }

    setCheckingUsername(true);
    const timeoutId = window.setTimeout(async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", normalizedUsername)
        .neq("id", userId)
        .maybeSingle();

      setUsernameError(data ? "Username already taken." : null);
      setCheckingUsername(false);
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [initialProfile?.username, open, userId, username]);

  const canSubmit = useMemo(() => {
    return (
      fullName.trim().length > 0 &&
      username.trim().length > 0 &&
      !usernameError &&
      !checkingUsername
    );
  }, [checkingUsername, fullName, username, usernameError]);

  if (!open) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;

    setSaving(true);
    const normalizedUsername = username.trim().toLowerCase().replace(/\s+/g, "");
    const payload = {
      full_name: fullName.trim(),
      username: normalizedUsername,
      university: university.trim() || null,
      onboarding_completed: true,
    };

    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update(payload)
      .eq("id", userId);

    setSaving(false);

    if (error) {
      setUsernameError(error.message);
      return;
    }

    onComplete(payload);
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 px-4 py-8">
      <div className="mx-auto max-w-lg rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-gray-100 px-6 py-5">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              One moment - finish your profile
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Add the essentials so your writing and comments can carry your name.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-2xl leading-none text-gray-400 transition-colors hover:text-gray-600"
            aria-label="Close profile gate"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Full name
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              className={INPUT_STYLES}
              placeholder="Your full name"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(event) =>
                setUsername(event.target.value.toLowerCase().replace(/\s+/g, ""))
              }
              className={`${INPUT_STYLES} ${usernameError ? "border-red-300" : ""}`}
              placeholder="yourhandle"
            />
            <p className="mt-1 text-xs text-gray-400">
              This becomes your public @handle.
            </p>
            {checkingUsername ? (
              <p className="mt-1 text-xs text-gray-400">Checking availability…</p>
            ) : null}
            {usernameError ? (
              <p className="mt-1 text-xs text-red-500">{usernameError}</p>
            ) : null}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              University
            </label>
            <UniversitySelect value={university} onChange={setUniversity} />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={saving} disabled={!canSubmit}>
              Save and continue
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
