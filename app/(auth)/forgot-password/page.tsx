"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AuthShell,
  INPUT_STYLES,
  PRIMARY_BUTTON_STYLES,
  SECONDARY_LINK_STYLES,
} from "../AuthShell";
import { formatAuthError } from "../authMessages";
import { createClient } from "@/lib/supabase/client";
import { useResendCooldown } from "../useResendCooldown";
import { sendPasswordResetEmail } from "../accountEmailActions";

const PROOF_ITEMS = [
  "Secure reset code by email",
  "Return to your saved profile",
  "Keep drafts and activity intact",
];

const AUTH_CODE_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 45;

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [resendNotice, setResendNotice] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resendCooldown = useResendCooldown(RESEND_COOLDOWN_SECONDS);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResendNotice(null);

    const result = await sendPasswordResetEmail({ email: email.trim() });

    if (!result.ok) {
      setError(formatAuthError(result.error));
      setLoading(false);
      return;
    }

    setResetCode("");
    resendCooldown.start();
    setSubmitted(true);
    setLoading(false);
  };

  const handleVerifyCode = async () => {
    if (resetCode.length !== AUTH_CODE_LENGTH || verifyLoading) return;

    setVerifyLoading(true);
    setError(null);
    setResendNotice(null);

    const supabase = createClient();
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: resetCode,
      type: "recovery",
    });

    setVerifyLoading(false);
    if (verifyError) {
      setError(formatAuthError(verifyError.message));
      return;
    }

    window.location.href = "/reset-password";
  };

  useEffect(() => {
    if (resetCode.length === AUTH_CODE_LENGTH && !verifyLoading) {
      void handleVerifyCode();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetCode]);

  const handleResendCode = async () => {
    if (resendCooldown.remaining > 0) return;

    setLoading(true);
    setError(null);
    setResendNotice(null);

    const result = await sendPasswordResetEmail({ email: email.trim() });

    setLoading(false);
    if (!result.ok) {
      setError(formatAuthError(result.error));
      return;
    }

    setResetCode("");
    resendCooldown.start();
    setResendNotice("A fresh reset code is on its way.");
  };

  return (
    <AuthShell
      eyebrow="Account recovery"
      title="Reset your password securely."
      subtitle="Enter the email tied to your Indegenius profile. If an account exists, we will send a secure reset code."
      proofItems={PROOF_ITEMS}
      quote="Your profile should be easy to return to and hard for anyone else to access."
      quoteSource="Indegenius account standard"
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
          <p>
            If an account exists for {email.trim()}, a 6-digit code is on its
            way. Enter it below to continue.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void handleVerifyCode();
            }}
            className="mt-4 space-y-3"
          >
            <div>
              <label
                htmlFor="resetCode"
                className="mb-2 block text-sm font-semibold text-emerald-950"
              >
                Reset code
              </label>
              <input
                id="resetCode"
                value={resetCode}
                onChange={(event) =>
                  setResetCode(
                    event.target.value.replace(/\D/g, "").slice(0, AUTH_CODE_LENGTH)
                  )
                }
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                autoFocus
                disabled={verifyLoading}
                className={`${INPUT_STYLES} bg-white text-center text-lg font-semibold tracking-[0.3em] disabled:opacity-70`}
              />
            </div>
            {verifyLoading ? <p className="text-emerald-800">Verifying...</p> : null}
            {error ? <p className="text-red-700">{error}</p> : null}
            {resendNotice ? <p className="text-emerald-800">{resendNotice}</p> : null}
          </form>
          <button
            type="button"
            onClick={handleResendCode}
            disabled={loading || resendCooldown.remaining > 0 || !email.trim()}
            className="mt-3 w-full rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading
              ? "Sending..."
              : resendCooldown.remaining > 0
                ? `Resend code (${resendCooldown.remaining}s)`
                : "Resend code"}
          </button>
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
            {loading ? "Sending reset code..." : "Send reset code"}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
