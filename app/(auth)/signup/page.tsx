"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AuthShell,
  INPUT_STYLES,
  PRIMARY_BUTTON_STYLES,
  SECONDARY_LINK_STYLES,
} from "../AuthShell";
import { formatAuthError } from "../authMessages";
import { trackActivationEvent } from "@/lib/activationEvents";
import { createClient } from "@/lib/supabase/client";

const PROOF_ITEMS = [
  "Claim a trusted student byline",
  "Publish quick takes and long-form work",
  "Follow people, topics, and debates",
];

function getPasswordHint(password: string) {
  if (!password) return "Use at least 6 characters.";
  if (password.length < 6) return "Add a few more characters.";
  if (password.length < 10) return "Good start. Longer passwords are stronger.";
  return "Strong enough to create your account.";
}

export default function SignupPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
  });

  const passwordReady = form.password.length >= 6;

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [event.target.name]: event.target.value }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: signUpError } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password,
      options: {
        data: {
          full_name: form.fullName.trim(),
        },
      },
    });

    if (signUpError) {
      setError(formatAuthError(signUpError.message));
      setLoading(false);
      return;
    }

    trackActivationEvent({ event: "signup_completed" });
    router.push("/onboarding");
    router.refresh();
  };

  return (
    <AuthShell
      eyebrow="Create your profile"
      title="Join Africa's student intellectual network."
      subtitle="Start with your name and email. Next, we will shape your country, university, interests, and first follows."
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

        <button type="submit" disabled={loading} className={PRIMARY_BUTTON_STYLES}>
          {loading ? "Creating account..." : "Create account"}
        </button>
      </form>

      <div className="mt-7 grid grid-cols-3 gap-3 rounded-xl border border-gray-200 bg-canvas p-2 text-center">
        {["Profile", "Topics", "Follows"].map((step, index) => (
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
