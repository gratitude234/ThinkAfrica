"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AuthShell,
  INPUT_STYLES,
  PRIMARY_BUTTON_STYLES,
  SECONDARY_LINK_STYLES,
} from "../AuthShell";
import {
  formatAuthError,
  getSafeRedirect,
  isEmailNotConfirmedAuthError,
} from "../authMessages";
import { createClient } from "@/lib/supabase/client";
import { resendSignupConfirmationEmail } from "../accountEmailActions";

const PROOF_ITEMS = [
  "Return to drafts and saved reading",
  "Keep debates and replies in context",
  "Build one credible academic profile",
];

type VerificationType = "signup" | "magiclink";

const AUTH_CODE_MIN_LENGTH = 6;
const AUTH_CODE_MAX_LENGTH = 6;

function LoginForm() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canResendConfirmation, setCanResendConfirmation] = useState(false);
  const [resendNotice, setResendNotice] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationType, setVerificationType] = useState<VerificationType>("signup");
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [form, setForm] = useState({ email: "", password: "" });

  const redirectTo = getSafeRedirect(searchParams.get("redirectTo"));
  const resetComplete = searchParams.get("reset") === "1";
  const callbackFailed = searchParams.get("error") === "auth_callback_failed";
  const needsEmailConfirmation = searchParams.get("reason") === "email_unconfirmed";
  const isWritingRedirect = redirectTo.startsWith("/write");
  const introCopy = isWritingRedirect
    ? "Sign in to start your draft and keep autosave tied to your profile."
    : "Sign in to continue reading, responding, and building your profile.";
  const signupHref =
    redirectTo === "/" ? "/signup" : `/signup?redirectTo=${encodeURIComponent(redirectTo)}`;

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

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: form.email.trim(),
      password: form.password,
    });

    if (signInError) {
      setError(formatAuthError(signInError.message));
      setCanResendConfirmation(isEmailNotConfirmedAuthError(signInError.message));
      setLoading(false);
      return;
    }

    window.location.href = redirectTo;
  };

  const handleResendConfirmation = async () => {
    setResendLoading(true);
    setResendNotice(null);
    setResendError(null);

    try {
      const result = await resendSignupConfirmationEmail({
        email: form.email.trim(),
      });

      if (result.ok) {
        setVerificationType(result.type);
        setResendNotice("If an unconfirmed account exists, a verification code is on its way.");
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

  const handleVerifyCode = async () => {
    const token = verificationCode.replace(/\D/g, "");
    if (token.length < AUTH_CODE_MIN_LENGTH) {
      setResendError("Enter the full verification code from your email.");
      return;
    }

    setVerifyLoading(true);
    setResendNotice(null);
    setResendError(null);

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

    window.location.href = redirectTo;
  };

  return (
    <AuthShell
      eyebrow="Welcome back"
      title="Pick up where your ideas left off."
      subtitle={introCopy}
      proofItems={PROOF_ITEMS}
      quote="Serious ideas deserve a place where readers can find, test, and build on them."
      quoteSource="Indegenius editorial principle"
      footer={
        <>
          Don&apos;t have an account?{" "}
          <Link href={signupHref} className={SECONDARY_LINK_STYLES}>
            Create one
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {resetComplete ? (
          <div
            className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-800"
            role="status"
            aria-live="polite"
          >
            Your password has been updated. Sign in with the new password.
          </div>
        ) : null}

        {callbackFailed ? (
          <div
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700"
            role="alert"
            aria-live="assertive"
          >
            That email link is invalid or expired. Request a new link and try
            again.
          </div>
        ) : null}

        {needsEmailConfirmation ? (
          <div
            className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-900"
            role="status"
            aria-live="polite"
          >
            Confirm your email before continuing. Sign in below to get a fresh
            verification code.
          </div>
        ) : null}

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
          <div className="mb-2 flex items-center justify-between gap-3">
            <label
              htmlFor="password"
              className="block text-sm font-semibold text-gray-800"
            >
              Password
            </label>
            <Link
              href="/forgot-password"
              className="text-sm font-semibold text-emerald-700 hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <input
              id="password"
              type={passwordVisible ? "text" : "password"}
              name="password"
              value={form.password}
              onChange={handleChange}
              required
              autoComplete="current-password"
              placeholder="Your password"
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
            <div className="mt-3">
              <label
                htmlFor="loginVerificationCode"
                className="mb-2 block text-sm font-semibold text-emerald-950"
              >
                Verification code
              </label>
              <input
                id="loginVerificationCode"
                value={verificationCode}
                onChange={(event) =>
                  setVerificationCode(
                    event.target.value.replace(/\D/g, "").slice(0, AUTH_CODE_MAX_LENGTH)
                  )
                }
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                className={`${INPUT_STYLES} bg-white text-center text-lg font-semibold tracking-[0.3em]`}
              />
            </div>
            <button
              type="button"
              onClick={handleVerifyCode}
              disabled={verifyLoading || verificationCode.length < AUTH_CODE_MIN_LENGTH}
              className="mt-3 rounded-lg bg-emerald-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#0E4B37] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {verifyLoading ? "Verifying..." : "Verify code"}
            </button>
            <button
              type="button"
              onClick={handleResendConfirmation}
              disabled={resendLoading || !form.email.trim()}
              className="ml-2 mt-3 rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {resendLoading ? "Sending..." : "Resend code"}
            </button>
            {resendNotice ? (
              <p className="mt-3 text-emerald-800">{resendNotice}</p>
            ) : null}
            {resendError ? <p className="mt-3 text-red-700">{resendError}</p> : null}
          </div>
        ) : null}

        <button type="submit" disabled={loading} className={PRIMARY_BUTTON_STYLES}>
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>

      <div className="mt-7 rounded-xl border border-gray-200 bg-canvas px-4 py-3 text-xs leading-6 text-ink-muted">
        Your byline, drafts, follows, saved posts, and conversations stay tied
        to one academic profile.
      </div>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
