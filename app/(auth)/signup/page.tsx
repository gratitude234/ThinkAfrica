"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AuthShell,
  INPUT_STYLES,
  PRIMARY_BUTTON_STYLES,
  SECONDARY_LINK_STYLES,
} from "../AuthShell";
import {
  formatAuthError,
  isAlreadyRegisteredAuthError,
  isEmailNotConfirmedAuthError,
} from "../authMessages";
import { trackActivationEvent } from "@/lib/activationEvents";
import { createClient } from "@/lib/supabase/client";
import {
  resendSignupConfirmationEmail,
  sendSignupConfirmationEmail,
} from "../accountEmailActions";

const PROOF_ITEMS = [
  "Claim a trusted student byline",
  "Publish quick takes and long-form work",
  "Follow people, topics, and debates",
];

type VerificationType = "signup" | "magiclink";

function getPasswordHint(password: string) {
  if (!password) return "Use at least 6 characters.";
  if (password.length < 6) return "Add a few more characters.";
  if (password.length < 10) return "Good start. Longer passwords are stronger.";
  return "Strong enough to create your account.";
}

async function withSignupTimeout<T>(promise: Promise<T>) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(
        new Error(
          "Account creation is taking too long. Check your connection and try again."
        )
      );
    }, 20000);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export default function SignupPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [canResendConfirmation, setCanResendConfirmation] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendNotice, setResendNotice] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationType, setVerificationType] = useState<VerificationType>("signup");
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [externalVerifyLoading, setExternalVerifyLoading] = useState(false);
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
  });

  const passwordReady = form.password.length >= 6;

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [event.target.name]: event.target.value }));
    if (event.target.name === "email") {
      setCanResendConfirmation(false);
      setResendNotice(null);
      setResendError(null);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setCanResendConfirmation(false);
    setResendNotice(null);
    setResendError(null);

    try {
      const normalizedEmail = form.email.trim().toLowerCase();
      const fullName = form.fullName.trim();
      const result = await withSignupTimeout(
        sendSignupConfirmationEmail({
          email: normalizedEmail,
          password: form.password,
          fullName,
        })
      );

      if (!result.ok) {
        setError(formatAuthError(result.error));
        setCanResendConfirmation(isAlreadyRegisteredAuthError(result.error));
        setLoading(false);
        return;
      }

      setVerificationType(result.type);
      trackActivationEvent({ event: "signup_completed" });
      setSubmitted(true);
      setLoading(false);
    } catch (error) {
      console.error("Signup failed", error);
      setError(
        error instanceof Error
          ? formatAuthError(error.message)
          : "We could not create your account. Please try again."
      );
      setCanResendConfirmation(false);
      setLoading(false);
    }
  };

  const handleResendConfirmation = async () => {
    setResendLoading(true);
    setResendNotice(null);
    setResendError(null);

    try {
      const result = await resendSignupConfirmationEmail({
        email: form.email.trim(),
        password: form.password,
        fullName: form.fullName,
      });

      if (result.ok) {
        setVerificationType(result.type);
        setSubmitted(true);
        setResendNotice("A fresh verification code is on its way.");
      } else {
        setResendError(formatAuthError(result.error));
      }
    } catch (error) {
      setResendError(
        error instanceof Error
          ? formatAuthError(error.message)
          : "We could not resend the verification code. Please try again."
      );
    } finally {
      setResendLoading(false);
    }
  };

  const handleVerifyCode = async (event: React.FormEvent) => {
    event.preventDefault();
    const token = verificationCode.replace(/\D/g, "");
    if (token.length !== 6) {
      setResendError("Enter the 6-digit verification code from your email.");
      return;
    }

    setVerifyLoading(true);
    setResendError(null);
    setResendNotice(null);

    const supabase = createClient();
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: form.email.trim().toLowerCase(),
      token,
      type: verificationType,
    });

    setVerifyLoading(false);
    if (verifyError) {
      setResendError(formatAuthError(verifyError.message));
      return;
    }

    window.location.href = "/onboarding";
  };

  const handleVerifiedOnAnotherDevice = async () => {
    setExternalVerifyLoading(true);
    setResendError(null);
    setResendNotice(null);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: form.email.trim().toLowerCase(),
      password: form.password,
    });

    setExternalVerifyLoading(false);
    if (signInError) {
      if (isEmailNotConfirmedAuthError(signInError.message)) {
        setResendError(
          "Still waiting for verification. Enter the code or try again in a moment."
        );
        return;
      }
      setResendError(formatAuthError(signInError.message));
      return;
    }

    window.location.href = "/onboarding";
  };

  return (
    <AuthShell
      eyebrow="Create your profile"
      title="Join Africa's student intellectual network."
      subtitle="Start with your name and email. Next, pick your role, interests, and a few optional follows."
      proofItems={PROOF_ITEMS}
      quote="Turn your strongest campus ideas into work other students can read, cite, and respond to."
      quoteSource="ThinkAfrica onboarding promise"
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className={SECONDARY_LINK_STYLES}>
            Sign in
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
            We sent a 6-digit code to {form.email.trim()}. Enter it here to
            continue on this device, or use the email link on any device.
          </p>
          <form onSubmit={handleVerifyCode} className="mt-4 space-y-3">
            <div>
              <label
                htmlFor="verificationCode"
                className="mb-2 block text-sm font-semibold text-emerald-950"
              >
                Verification code
              </label>
              <input
                id="verificationCode"
                value={verificationCode}
                onChange={(event) =>
                  setVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                }
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                className={`${INPUT_STYLES} bg-white text-center text-lg font-semibold tracking-[0.3em]`}
              />
            </div>
            {resendError ? <p className="text-red-700">{resendError}</p> : null}
            {resendNotice ? <p className="text-emerald-800">{resendNotice}</p> : null}
            <button
              type="submit"
              disabled={verifyLoading || verificationCode.length !== 6}
              className={PRIMARY_BUTTON_STYLES}
            >
              {verifyLoading ? "Verifying..." : "Verify code"}
            </button>
          </form>
          <button
            type="button"
            onClick={handleResendConfirmation}
            disabled={resendLoading || !form.email.trim()}
            className="mt-3 w-full rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {resendLoading ? "Sending..." : "Resend code"}
          </button>
          <button
            type="button"
            onClick={handleVerifiedOnAnotherDevice}
            disabled={externalVerifyLoading}
            className="mt-3 w-full rounded-lg px-4 py-2 text-sm font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {externalVerifyLoading ? "Checking..." : "I've verified on another device"}
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label
            htmlFor="fullName"
            className="mb-2 block text-sm font-semibold text-gray-800"
          >
            Full name
          </label>
          <input
            id="fullName"
            type="text"
            name="fullName"
            value={form.fullName}
            onChange={handleChange}
            required
            autoComplete="name"
            placeholder="e.g. Amara Diallo"
            className={INPUT_STYLES}
          />
        </div>

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
            value={form.email}
            onChange={handleChange}
            required
            autoComplete="email"
            inputMode="email"
            placeholder="you@university.edu"
            className={INPUT_STYLES}
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="mb-2 block text-sm font-semibold text-gray-800"
          >
            Password
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
              aria-describedby="password-hint"
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
          <div className="mt-2 flex items-center gap-2" id="password-hint">
            <span
              className={`h-1.5 w-10 rounded-full transition-[background-color] duration-300 ${
                passwordReady ? "bg-emerald-brand" : "bg-gray-200"
              }`}
            />
            <p className="text-xs text-ink-muted">
              {getPasswordHint(form.password)}
            </p>
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

        {canResendConfirmation ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-900">
            <p>Need a fresh verification code?</p>
            <button
              type="button"
              onClick={handleResendConfirmation}
              disabled={resendLoading || !form.email.trim()}
              className="mt-3 rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {resendLoading ? "Sending..." : "Resend verification code"}
            </button>
            {resendNotice ? (
              <p className="mt-3 text-emerald-800">{resendNotice}</p>
            ) : null}
            {resendError ? <p className="mt-3 text-red-700">{resendError}</p> : null}
          </div>
        ) : null}

        <button type="submit" disabled={loading} className={PRIMARY_BUTTON_STYLES}>
          {loading ? "Creating account..." : "Create account"}
        </button>
        </form>
      )}

      <div className="mt-7 grid grid-cols-3 gap-3 rounded-xl border border-gray-200 bg-canvas p-2 text-center">
        {["Role", "Topics", "Follows"].map((step, index) => (
          <div key={step} className="rounded-lg bg-white px-2 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-brand">
              Step {index + 1}
            </p>
            <p className="mt-1 text-xs font-semibold text-gray-800">{step}</p>
          </div>
        ))}
      </div>
    </AuthShell>
  );
}
