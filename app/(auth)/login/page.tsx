"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

const INPUT_STYLES =
  "w-full rounded-xl border border-gray-200 bg-canvas px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500";

const BRAND_ITEMS = [
  { marker: "01", text: "Return to drafts, responses, and saved reading" },
  { marker: "02", text: "Follow writers and keep your feed focused" },
  { marker: "03", text: "Build a public profile around your ideas" },
];

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ email: "", password: "" });
  const redirectParam = searchParams.get("redirectTo");
  const redirectTo =
    redirectParam?.startsWith("/") && !redirectParam.startsWith("//")
      ? redirectParam
      : "/";
  const isWritingRedirect = redirectTo.startsWith("/write");
  const introCopy = isWritingRedirect
    ? "Sign in to start your draft and keep autosave tied to your profile."
    : "Sign in to continue reading, responding, and building your profile.";

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [event.target.name]: event.target.value }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: form.email,
      password: form.password,
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    router.push(redirectTo);
    router.refresh();
  };

  return (
    <div className="fixed inset-0 z-10 grid min-h-dvh grid-cols-1 overflow-y-auto bg-white md:grid-cols-2">
      <div className="hidden flex-col justify-between bg-emerald-brand p-12 text-white md:flex">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="ThinkAfrica"
            className="mb-12 h-10 w-auto brightness-0 invert"
          />
          <blockquote className="mb-6 text-xl font-medium italic leading-relaxed text-white/90">
            &quot;Serious ideas deserve a place where readers can find, test, and build on them.&quot;
          </blockquote>
          <p className="text-sm text-white/60">
            ThinkAfrica · Africa&apos;s Intellectual Network
          </p>
        </div>
        <div className="space-y-4">
          {BRAND_ITEMS.map((item) => (
            <div
              key={item.text}
              className="flex items-center gap-3 text-sm text-white/80"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15 text-xs font-semibold">
                {item.marker}
              </span>
              <span>{item.text}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col justify-center bg-white px-6 py-10 sm:px-16">
        <div className="mx-auto w-full max-w-md">
          <Link
            href="/landing"
            className="mb-8 inline-flex font-display text-[24px] font-bold leading-none md:hidden"
          >
            <span className="text-emerald-brand">Think</span>
            <span className="text-purple-accent">Africa</span>
          </Link>
          <h1 className="font-display mb-1 text-2xl font-bold text-ink">
            Welcome back
          </h1>
          <p className="mb-8 text-sm leading-relaxed text-gray-500">
            {introCopy}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Email
              </label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                required
                placeholder="you@university.edu"
                className={INPUT_STYLES}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Password
              </label>
              <input
                type="password"
                name="password"
                value={form.password}
                onChange={handleChange}
                required
                placeholder="Your password"
                className={INPUT_STYLES}
              />
            </div>

            {error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-emerald-brand py-3 font-semibold text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <div className="mt-7 rounded-xl border border-gray-200 bg-canvas px-4 py-3 text-xs leading-relaxed text-gray-500">
            ThinkAfrica keeps your byline, drafts, follows, and saved posts in one academic profile.
          </div>

          <p className="mt-6 text-center text-sm text-gray-500">
            Don&apos;t have an account?{" "}
            <Link
              href="/signup"
              className="font-medium text-emerald-600 hover:underline"
            >
              Sign up free
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
