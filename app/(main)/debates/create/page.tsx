"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import {
  DebateStatusPill,
  PhasePill,
  PhaseStepper,
  StanceMeter,
  StatTile,
} from "../DebatePrimitives";

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

function AccessCard({
  eyebrow,
  title,
  body,
  actions,
}: {
  eyebrow: string;
  title: string;
  body: string;
  actions: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-brand">
          {eyebrow}
        </p>
        <h1 className="font-display mt-2 text-2xl font-bold text-ink">
          {title}
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-gray-500">
          {body}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">{actions}</div>
      </div>
    </div>
  );
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
  const titleCount = title.trim().length;
  const contextCount = description.trim().length;

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
      <div className="mx-auto max-w-5xl animate-pulse">
        <div className="mb-6 space-y-2">
          <div className="h-4 w-32 rounded bg-gray-200" />
          <div className="h-9 w-72 rounded bg-gray-200" />
          <div className="h-4 w-96 max-w-full rounded bg-gray-100" />
        </div>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <div className="space-y-5">
              {[0, 1, 2].map((item) => (
                <div key={item} className="space-y-2">
                  <div className="h-4 w-32 rounded bg-gray-200" />
                  <div className="h-11 rounded-lg bg-gray-100" />
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="h-5 w-24 rounded bg-gray-200" />
            <div className="mt-4 h-20 rounded bg-gray-100" />
          </div>
        </div>
      </div>
    );
  }

  if (access.status === "guest") {
    return (
      <AccessCard
        eyebrow="Start a debate"
        title="Sign in to frame a motion"
        body="Debate moderators need an account so they can start rounds, guide the room, and close the final verdict."
        actions={
          <Link
            href="/login?redirectTo=/debates/create"
            className="rounded-lg bg-emerald-brand px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600"
          >
            Sign in
          </Link>
        }
      />
    );
  }

  if (access.status === "blocked") {
    return (
      <AccessCard
        eyebrow="Verified moderators"
        title="Get verified to start debates"
        body={access.reason}
        actions={
          <>
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
          </>
        }
      />
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-7 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-brand">
            Debate motion
          </p>
          <h1 className="font-display mt-2 text-3xl font-bold leading-tight text-ink md:text-4xl">
            Start a structured debate
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
            Frame a clear claim, set the room tempo, then guide participants
            from opening statements to a final verdict.
          </p>
        </div>
        <Link
          href="/debates"
          className="inline-flex w-fit rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-canvas"
        >
          Browse debates
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-gray-200 bg-white p-6"
        >
          <div className="border-b border-gray-100 pb-5">
            <h2 className="text-base font-semibold text-ink">Motion details</h2>
            <p className="mt-1 text-sm leading-6 text-gray-500">
              Write the motion as one debatable claim. The room can handle nuance
              later; the title should make the sides obvious.
            </p>
          </div>

          <div className="space-y-5 pt-5">
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <label className="block text-sm font-semibold text-gray-800">
                  Motion <span className="text-red-500">*</span>
                </label>
                <span className="text-xs text-gray-500">{titleCount}/160</span>
              </div>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                maxLength={160}
                placeholder="e.g. African universities should prioritize entrepreneurship over employability"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <p className="mt-1 text-xs text-gray-500">
                Use a claim people can clearly argue for or against.
              </p>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <label className="block text-sm font-semibold text-gray-800">
                  Context
                </label>
                <span className="text-xs text-gray-500">{contextCount}/900</span>
              </div>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={6}
                maxLength={900}
                placeholder="Explain why this motion matters, what assumptions are allowed, and what participants should focus on."
                className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2.5 text-sm leading-6 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
              <p className="mt-1 text-xs text-gray-500">
                Up to 6 comma-separated tags.
              </p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-800">
                Phase duration
              </label>
              <div className="grid grid-cols-3 gap-2">
                {DURATION_OPTIONS.map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => setDuration(mins)}
                    className={`rounded-xl border px-3 py-3 text-left text-sm transition-colors ${
                      duration === mins
                        ? "border-emerald-brand bg-emerald-50 text-emerald-800 ring-2 ring-emerald-100"
                        : "border-gray-200 text-gray-600 hover:border-emerald-brand hover:text-emerald-brand"
                    }`}
                  >
                    <span className="block text-base font-bold">{mins}</span>
                    <span className="block text-xs">min phases</span>
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Moderators can manually advance phases when the room is ready.
              </p>
            </div>

            {error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-5">
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
          </div>
        </form>

        <aside className="space-y-4 lg:sticky lg:top-[76px] lg:self-start">
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <DebateStatusPill status="open" />
              <PhasePill phase="opening" />
            </div>
            <h2 className="font-display text-lg font-semibold leading-tight text-ink">
              {title.trim() || "Your debate motion will appear here"}
            </h2>
            {description.trim() ? (
              <p className="mt-2 line-clamp-5 text-sm leading-6 text-gray-500">
                {description.trim()}
              </p>
            ) : (
              <p className="mt-2 text-sm leading-6 text-gray-500">
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
            <div className="mt-5">
              <StanceMeter forCount={0} againstCount={0} compact />
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
              Lifecycle
            </p>
            <div className="mt-4">
              <PhaseStepper currentPhase="opening" status="open" />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <StatTile label="Room opens as" value="Open" tone="emerald" />
              <StatTile label="Phase length" value={`${duration}m`} tone="amber" />
            </div>
            <p className="mt-4 text-xs leading-5 text-gray-500">
              Participants can vote and choose sides while the motion is open.
              Argument submission starts when you start the debate.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
