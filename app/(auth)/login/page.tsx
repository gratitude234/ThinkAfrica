"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

const INPUT_STYLES =
  "w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500";

const BRAND_ITEMS = [
  { icon: "✍️", text: "Publish research, essays & policy briefs" },
  { icon: "⚡", text: "Debate the issues that shape Africa" },
  { icon: "🏆", text: "Earn points, badges and fellowships" },
];

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ email: "", password: "" });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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

    router.push("/");
    router.refresh();
  };

  return (
    <div className="fixed inset-0 z-10 grid min-h-screen grid-cols-1 bg-white md:grid-cols-2">
      <div className="hidden flex-col justify-between bg-emerald-brand p-12 text-white md:flex">
        <div>
          <img
            src="/logo.png"
            alt="ThinkAfrica"
            className="mb-12 h-10 w-auto brightness-0 invert"
          />
          <blockquote className="mb-6 text-xl font-medium italic leading-relaxed text-white/90">
            &quot;The pen is mightier than the sword - and the African intellectual is mightier still.&quot;
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
              <span className="text-lg">{item.icon}</span>
              <span>{item.text}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col justify-center bg-white px-8 py-12 sm:px-16">
        <div className="mx-auto w-full max-w-md">
          <img
            src="/logo.png"
            alt="ThinkAfrica"
            className="mb-8 h-8 w-auto md:hidden"
          />
          <h1 className="mb-1 text-2xl font-bold text-gray-900">Welcome back</h1>
          <p className="mb-8 text-sm text-gray-500">Sign in to continue</p>

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
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

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
