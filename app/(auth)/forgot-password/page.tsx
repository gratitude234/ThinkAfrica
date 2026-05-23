"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AuthShell,
  INPUT_STYLES,
  PRIMARY_BUTTON_STYLES,
  SECONDARY_LINK_STYLES,
} from "../AuthShell";
import { formatAuthError } from "../authMessages";
import { sendPasswordResetEmail } from "../accountEmailActions";

const PROOF_ITEMS = [
  "Secure reset link by email",
  "Return to your saved profile",
  "Keep drafts and activity intact",
];

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const result = await sendPasswordResetEmail({ email: email.trim() });

    if (!result.ok) {
      setError(formatAuthError(result.error));
      setLoading(false);
      return;
    }

    setSubmitted(true);
    setLoading(false);
  };

  return (
    <AuthShell
      eyebrow="Account recovery"
      title="Reset your password securely."
      subtitle="Enter the email tied to your ThinkAfrica profile. If an account exists, we will send a secure reset link."
      proofItems={PROOF_ITEMS}
      quote="Your profile should be easy to return to and hard for anyone else to access."
      quoteSource="ThinkAfrica account standard"
      footer={
        <>
          Remembered it?{" "}
          <Link href="/login" className={SECONDARY_LINK_STYLES}>
            Back to sign in
          </Link>
        </>
      }
    >
      {submitted ? (
        <div
          className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-5 text-sm leading-6 text-emerald-900"
          role="status"
          aria-live="polite"
        >
          If an account exists for that email, a reset link is on its way.
          Check your inbox and open the link on this device.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label
              htmlFor="email"
              className="mb-2 block text-sm font-semibold text-gray-800"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              name="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
              inputMode="email"
              placeholder="you@university.edu"
              className={INPUT_STYLES}
            />
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

          <button
            type="submit"
            disabled={loading}
            className={PRIMARY_BUTTON_STYLES}
          >
            {loading ? "Sending reset link..." : "Send reset link"}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
