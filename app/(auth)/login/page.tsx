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
import { formatAuthError, getSafeRedirect } from "../authMessages";
import { createClient } from "@/lib/supabase/client";

const PROOF_ITEMS = [
  "Return to drafts and saved reading",
  "Keep debates and replies in context",
  "Build one credible academic profile",
];

function LoginForm() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ email: "", password: "" });

  const redirectTo = getSafeRedirect(searchParams.get("redirectTo"));
  const resetComplete = searchParams.get("reset") === "1";
  const isWritingRedirect = redirectTo.startsWith("/write");
  const introCopy = isWritingRedirect
    ? "Sign in to start your draft and keep autosave tied to your profile."
    : "Sign in to continue reading, responding, and building your profile.";
  const signupHref =
    redirectTo === "/" ? "/signup" : `/signup?redirectTo=${encodeURIComponent(redirectTo)}`;

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [event.target.name]: event.target.value }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: form.email.trim(),
      password: form.password,
    });

    if (signInError) {
      setError(formatAuthError(signInError.message));
      setLoading(false);
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
      quoteSource="ThinkAfrica editorial principle"
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
