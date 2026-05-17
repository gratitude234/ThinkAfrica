"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import Toast from "@/components/ui/Toast";

const INPUT_STYLES =
  "w-full rounded-xl border border-gray-200 bg-canvas px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500";

interface FieldErrors {
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
}

export default function AccountForm({ email }: { email: string }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [toast, setToast] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const nextErrors: FieldErrors = {};
    if (!currentPassword) nextErrors.currentPassword = "Required";
    if (!newPassword) nextErrors.newPassword = "Required";
    else if (newPassword.length < 8) nextErrors.newPassword = "Must be at least 8 characters";
    if (!confirmPassword) nextErrors.confirmPassword = "Required";
    else if (newPassword && confirmPassword !== newPassword)
      nextErrors.confirmPassword = "Passwords do not match";

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSaving(false);

    if (error) {
      setToast(error.message);
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setToast("Password updated successfully.");
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
        {/* Email — read-only */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Sign-in email
          </label>
          <input
            type="email"
            value={email}
            disabled
            className={`${INPUT_STYLES} cursor-not-allowed opacity-60`}
          />
          <p className="mt-1 text-xs text-gray-500">
            Your sign-in email cannot be changed.
          </p>
        </div>

        <hr className="border-gray-100" />

        <div>
          <h2 className="mb-4 text-base font-semibold text-gray-900">
            Change password
          </h2>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Current password
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                className={`${INPUT_STYLES} ${errors.currentPassword ? "border-red-400" : ""}`}
              />
              {errors.currentPassword && (
                <p className="mt-1 text-xs text-red-500">{errors.currentPassword}</p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                New password
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                className={`${INPUT_STYLES} ${errors.newPassword ? "border-red-400" : ""}`}
              />
              {errors.newPassword ? (
                <p className="mt-1 text-xs text-red-500">{errors.newPassword}</p>
              ) : (
                <p className="mt-1 text-xs text-gray-500">Minimum 8 characters.</p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Confirm new password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                className={`${INPUT_STYLES} ${errors.confirmPassword ? "border-red-400" : ""}`}
              />
              {errors.confirmPassword && (
                <p className="mt-1 text-xs text-red-500">{errors.confirmPassword}</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button type="submit" loading={saving}>
            Update password
          </Button>
        </div>
      </form>

      {toast ? <Toast message={toast} onDone={() => setToast(null)} /> : null}
    </>
  );
}
