"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import UniversitySelect from "@/components/ui/UniversitySelect";
import Button from "@/components/ui/Button";
import { completeProfileGate } from "@/app/(main)/settings/profileActions";
import { checkUsernameAvailable } from "@/lib/composerActions";

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
  const hasFullName = Boolean(initialProfile?.full_name?.trim());
  const hasUsername = Boolean(initialProfile?.username?.trim());
  const hasUniversity = Boolean(initialProfile?.university?.trim());

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
    if (!open || hasUsername) return;

    const normalizedUsername = username.trim().toLowerCase();
    if (!normalizedUsername) {
      setUsernameError("Username is required.");
      setCheckingUsername(false);
      return;
    }

    setCheckingUsername(true);
    const timeoutId = window.setTimeout(async () => {
      const result = await checkUsernameAvailable(normalizedUsername);

      // Three outcomes, not two. A check that could not run must not read as
      // "available": the member would be sent into a submit that rejects them.
      if (!result.ok) {
        setUsernameError(
          result.reason === "unauthorized"
            ? "Sign in again to continue."
            : "Couldn't check that username. Try again."
        );
      } else {
        setUsernameError(result.data.taken ? "Username already taken." : null);
      }
      setCheckingUsername(false);
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [hasUsername, open, userId, username]);

  const canSubmit = useMemo(() => {
    if (!hasFullName && !fullName.trim()) return false;
    if (!hasUsername && (!username.trim() || Boolean(usernameError) || checkingUsername)) {
      return false;
    }
    return true;
  }, [checkingUsername, fullName, hasFullName, hasUsername, username, usernameError]);

  if (!open) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;

    setSaving(true);
    const payload = {
      full_name: hasFullName ? (initialProfile?.full_name ?? "") : fullName.trim(),
      username: hasUsername
        ? (initialProfile?.username ?? "")
        : username.trim().toLowerCase().replace(/\s+/g, ""),
      university: hasUniversity
        ? (initialProfile?.university ?? null)
        : university.trim() || null,
    };

    // The server resolves the viewer from the session, so this gate can no
    // longer be pointed at another member's row by changing a prop.
    const result = await completeProfileGate({
      fullName: payload.full_name,
      username: payload.username,
      university: payload.university,
    });

    setSaving(false);

    if (!result.ok) {
      setUsernameError(result.error);
      return;
    }

    onComplete({ ...payload, username: result.data.username });
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
          {!hasFullName ? (
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
          ) : null}

          {!hasUsername ? (
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
          ) : null}

          {!hasUniversity ? (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                University
              </label>
              <UniversitySelect value={university} onChange={setUniversity} />
            </div>
          ) : null}

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
