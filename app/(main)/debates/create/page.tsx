"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";

const DURATION_OPTIONS = [5, 10, 15];

type AccessState =
  | { status: "checking" }
  | { status: "guest" }
  | { status: "blocked"; reason: string }
  | { status: "allowed"; userId: string };

function parseTags(input: string) {
  return input
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 6);
}

export default function CreateDebatePage() {
  const router = useRouter();
  const [access, setAccess] = useState<AccessState>({ status: "checking" });
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [duration, setDuration] = useState(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedTags = useMemo(() => parseTags(tags), [tags]);

  useEffect(() => {
    let mounted = true;

    async function loadAccess() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!mounted) return;

      if (!user) {
        setAccess({ status: "guest" });
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("verified, role")
        .eq("id", user.id)
        .maybeSingle();

      const canCreate =
        Boolean(profile?.verified) ||
        profile?.role === "editor" ||
        profile?.role === "admin";

      setAccess(
        canCreate
          ? { status: "allowed", userId: user.id }
          : {
              status: "blocked",
              reason:
                "Debates are started by verified contributors so each motion has a clear moderator.",
            }
      );
    }

    void loadAccess();

    return () => {
      mounted = false;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (access.status !== "allowed" || !title.trim()) return;

    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("debates")
      .insert({
        title: title.trim(),
        description: description.trim() || null,
        tags: parsedTags,
        round_duration_minutes: duration,
        moderator_id: access.userId,
        status: "open",
        current_phase: "opening",
      })
      .select("id")
      .single();

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }

    router.push(`/debates/${data.id}`);
  }

  if (access.status === "checking") {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          Checking debate access...
        </div>
      </div>
    );
  }

  if (access.status === "guest") {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-brand">
            Start a debate
          </p>
          <h1 className="font-display mt-2 text-2xl font-bold text-ink">
            Sign in to frame a motion
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-gray-500">
            Debate moderators need an account so they can start rounds, guide the
            room, and close the final verdict.
          </p>
          <Link
            href="/login?redirectTo=/debates/create"
            className="mt-5 inline-flex rounded-lg bg-emerald-brand px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600"
          >
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  if (access.status === "blocked") {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="rounded-2xl border border-gray-200 bg-white p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-brand">
            Verified moderators
          </p>
          <h1 className="font-display mt-2 text-2xl font-bold text-ink">
            Get verified to start debates
          </h1>
          <p className="mt-2 text-sm leading-6 text-gray-500">{access.reason}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              href="/settings"
              className="rounded-lg bg-emerald-brand px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600"
            >
              Complete profile
            </Link>
            <Link
              href="/debates"
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-canvas"
            >
              Browse debates
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <div className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-brand">
              Debate motion
            </p>
            <h1 className="font-display mt-2 text-3xl font-bold text-ink">
              Start a structured debate
            </h1>
            <p className="mt-2 text-sm leading-6 text-gray-500">
              Frame one motion, provide enough context, then moderate the room
              through opening, rebuttal, and closing phases.
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="space-y-5 rounded-2xl border border-gray-200 bg-white p-6"
          >
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-gray-800">
                Motion <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                maxLength={160}
                placeholder="e.g. African universities should prioritize entrepreneurship over employability"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <p className="mt-1 text-xs text-gray-400">
                Write this as a debatable claim, not a broad topic.
              </p>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-semibold text-gray-800">
                Context
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                maxLength={900}
                placeholder="Explain why this motion matters, what assumptions are allowed, and what participants should focus on."
                className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-semibold text-gray-800">
                Tags
              </label>
              <input
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="education, policy, entrepreneurship"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <p className="mt-1 text-xs text-gray-400">
                Up to 6 comma-separated tags.
              </p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-800">
                Phase duration
              </label>
              <div className="flex flex-wrap gap-2">
                {DURATION_OPTIONS.map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => setDuration(mins)}
                    className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                      duration === mins
                        ? "border-emerald-brand bg-emerald-brand text-white"
                        : "border-gray-300 text-gray-600 hover:border-emerald-brand hover:text-emerald-brand"
                    }`}
                  >
                    {mins} min
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-gray-400">
                Moderators can manually advance phases when the room is ready.
              </p>
            </div>

            {error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button type="submit" loading={loading} disabled={!title.trim()}>
                Create open motion
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => router.back()}
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-[76px]">
          <section className="rounded-2xl border border-gray-200 bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
              Preview
            </p>
            <h2 className="font-display mt-3 text-lg font-semibold leading-tight text-ink">
              {title.trim() || "Your debate motion will appear here"}
            </h2>
            {description.trim() ? (
              <p className="mt-2 line-clamp-4 text-sm leading-6 text-gray-500">
                {description.trim()}
              </p>
            ) : (
              <p className="mt-2 text-sm leading-6 text-gray-400">
                Add context so students know what counts as a strong argument.
              </p>
            )}
            {parsedTags.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {parsedTags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-canvas px-2.5 py-1 text-xs font-medium text-gray-500"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            ) : null}
          </section>

          <section className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
            <p className="text-sm font-semibold text-emerald-900">
              Debate lifecycle
            </p>
            <ol className="mt-3 space-y-2 text-sm text-emerald-800">
              <li>1. Create the motion as open.</li>
              <li>2. Participants choose FOR or AGAINST.</li>
              <li>3. Start the debate when ready.</li>
              <li>4. Advance through opening, rebuttal, and closing.</li>
              <li>5. Close the debate to generate a recap.</li>
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}
