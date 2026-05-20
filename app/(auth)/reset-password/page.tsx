"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AuthShell,
  INPUT_STYLES,
  PRIMARY_BUTTON_STYLES,
  SECONDARY_LINK_STYLES,
} from "../AuthShell";
import { formatAuthError } from "../authMessages";
import { createClient } from "@/lib/supabase/client";
import { sendPasswordChangedEmail } from "../accountEmailActions";

const PROOF_ITEMS = [
  "Choose a fresh password",
  "Protect drafts and messages",
  "Return to the same profile",
];

export default function ResetPasswordPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    password: "",
    confirmPassword: "",
  });

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [event.target.name]: event.target.value }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (form.password.length < 6) {
      setError("Use at least 6 characters for your new password.");
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError("Both password fields must match.");
      return;
    }

    setLoading(true);

    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({
      password: form.password,
    });

    if (updateError) {
      setError(formatAuthError(updateError.message));
      setLoading(false);
      return;
    }

    void sendPasswordChangedEmail();
    router.push("/login?reset=1");
    router.refresh();
  };

  return (
    <AuthShell
      eyebrow="New password"
      title="Set a new password."
      subtitle="Choose a password you have not used before. You will return to sign in when the update is complete."
      proofItems={PROOF_ITEMS}
      quote="A credible academic profile needs a login flow that feels calm, clear, and secure."
      quoteSource="ThinkAfrica account standard"
      footer={
        <>
          Need a new link?{" "}
          <Link href="/forgot-password" className={SECONDARY_LINK_STYLES}>
            Request another reset
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label
            htmlFor="password"
            className="mb-2 block text-sm font-semibold text-gray-800"
          >
            New password
          </label>
          <div className="relative">
            <input
              id="password"
              type={passwordVisible ? "text" : "password"}
              name="password"
              value={form.password}
              onChange={handleChange}
              required
              minLength={6}
              autoComplete="new-password"
              placeholder="At least 6 characters"
              className={`${INPUT_STYLES} pr-20`}
            />
            <button
              type="button"
              onClick={() => setPasswordVisible((current) => !current)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-3 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              aria-label={passwordVisible ? "Hide password" : "Show password"}
            >
              {passwordVisible ? "Hide" : "Show"}
            </button>
          </div>
        </div>

        <div>
          <label
            htmlFor="confirmPassword"
            className="mb-2 block text-sm font-semibold text-gray-800"
          >
            Confirm password
          </label>
          <div className="relative">
            <input
              id="confirmPassword"
              type={confirmVisible ? "text" : "password"}
              name="confirmPassword"
              value={form.confirmPassword}
              onChange={handleChange}
              required
              minLength={6}
              autoComplete="new-password"
              placeholder="Repeat new password"
              className={`${INPUT_STYLES} pr-20`}
            />
            <button
              type="button"
              onClick={() => setConfirmVisible((current) => !current)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-3 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              aria-label={
                confirmVisible
                  ? "Hide confirmed password"
                  : "Show confirmed password"
              }
            >
              {confirmVisible ? "Hide" : "Show"}
            </button>
          </div>
        </div>

        {error ? (
          <div
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700"
            role="alert"
            aria-live="assertive"
          >
            {error}
          </div>
        ) : null}

        <button type="submit" disabled={loading} className={PRIMARY_BUTTON_STYLES}>
          {loading ? "Updating password..." : "Update password"}
        </button>
      </form>
    </AuthShell>
  );
}
