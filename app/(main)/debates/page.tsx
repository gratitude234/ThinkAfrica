import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  formatDate,
  formatRelativeTime,
  formatTimeUntil,
} from "@/lib/utils";
import { type DebatePhase } from "@/lib/debatePhases";
import {
  DebateStatusPill,
  PhasePill,
  StanceMeter,
  StatTile,
  type DebateStatus,
} from "./DebatePrimitives";

export const revalidate = 30;

type DebateFilter = "live" | "open" | "closed" | "recaps";

const TABS: Array<{ label: string; value: DebateFilter; href: string }> = [
  { label: "Live", value: "live", href: "/debates" },
  { label: "Open", value: "open", href: "/debates?status=open" },
  { label: "Closed", value: "closed", href: "/debates?status=closed" },
  { label: "Recaps", value: "recaps", href: "/debates?status=recaps" },
];

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

interface DebateProfile {
  username: string | null;
  full_name: string | null;
  university: string | null;
}

interface DebateRow {
  id: string;
  title: string;
  description: string | null;
  status: DebateStatus;
  current_phase: DebatePhase | null;
  round_duration_minutes: number | null;
  tags: string[] | null;
  created_at: string;
  ends_at: string | null;
  motion_for_count: number | null;
  motion_against_count: number | null;
  recap_text?: string | null;
  recap_generated_at?: string | null;
  debate_arguments?: { count: number }[] | { count: number } | null;
  profiles: DebateProfile | DebateProfile[] | null;
}

function getFilter(status?: string): DebateFilter {
  if (status === "open" || status === "closed" || status === "recaps") {
    return status;
  }
  return "live";
}

function getArgumentCount(value: DebateRow["debate_arguments"]) {
  if (!value) return 0;
  if (Array.isArray(value)) return value[0]?.count ?? 0;
  return value.count ?? 0;
}

function getProfile(value: DebateRow["profiles"]) {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function getVoteSplit(debate: DebateRow) {
  const forCount = debate.motion_for_count ?? 0;
  const againstCount = debate.motion_against_count ?? 0;
  const total = forCount + againstCount;
  const forPct = total > 0 ? Math.round((forCount / total) * 100) : 50;

  return {
    forCount,
    againstCount,
    total,
    forPct,
    againstPct: 100 - forPct,
  };
}

function EmptyDebates({
  filter,
  signedIn,
}: {
  filter: DebateFilter;
  signedIn: boolean;
}) {
  const copy: Record<DebateFilter, { title: string; body: string }> = {
    live: {
      title: "No live debates right now.",
      body: "Open debates are waiting for moderators to start structured rounds.",
    },
    open: {
      title: "No open motions yet.",
      body: "Verified members can frame the next question for the community.",
    },
    closed: {
      title: "No closed debates yet.",
      body: "Completed debates will appear here with final voting records.",
    },
    recaps: {
      title: "No recaps available yet.",
      body: "Once a debate closes, ThinkAfrica generates a citable recap.",
    },
  };

  return (
    <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-14 text-center">
      <p className="text-base font-semibold text-gray-900">{copy[filter].title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-gray-500">
        {copy[filter].body}
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Link
          href="/debates?status=open"
          className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-canvas"
        >
          View open motions
        </Link>
        <Link
          href={signedIn ? "/debates/create" : "/login?redirectTo=/debates/create"}
          className="rounded-lg bg-emerald-brand px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600"
        >
          Start a debate
        </Link>
      </div>
    </div>
  );
}

function DebateCard({ debate }: { debate: DebateRow }) {
  const status = debate.status;
  const argCount = getArgumentCount(debate.debate_arguments);
  const moderator = getProfile(debate.profiles);
  const split = getVoteSplit(debate);
  const phase = debate.current_phase ?? "opening";
  const statusAccent =
    status === "active"
      ? "border-l-amber-400"
      : status === "open"
        ? "border-l-emerald-brand"
        : "border-l-gray-300";
  const timeLabel =
    status === "active"
      ? formatTimeUntil(debate.ends_at)
      : status === "open"
        ? `Opened ${formatRelativeTime(debate.created_at)}`
        : `Closed ${formatDate(debate.ends_at ?? debate.created_at)}`;

  return (
    <Link
      href={`/debates/${debate.id}`}
      className={`group block rounded-2xl border border-l-4 border-gray-200 bg-white p-5 transition-all hover:-translate-y-px hover:border-gray-300 hover:shadow-md ${statusAccent}`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <DebateStatusPill status={status} />
            <PhasePill phase={phase} />
            {timeLabel ? (
              <span className="text-xs font-medium text-gray-400">{timeLabel}</span>
            ) : null}
          </div>

          <h2 className="font-display text-xl font-semibold leading-tight text-ink transition-colors group-hover:text-emerald-brand">
            {debate.title}
          </h2>

          {debate.description ? (
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-gray-500">
              {debate.description}
            </p>
          ) : null}

          {debate.tags && debate.tags.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {debate.tags.slice(0, 5).map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-canvas px-2.5 py-1 text-xs font-medium text-gray-500"
                >
                  #{tag}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="w-full shrink-0 rounded-xl border border-gray-100 bg-canvas p-3 sm:w-[230px]">
          <StanceMeter
            forCount={split.forCount}
            againstCount={split.againstCount}
            compact
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-gray-100 pt-4 text-xs text-gray-400">
        <span>{argCount} {argCount === 1 ? "argument" : "arguments"}</span>
        {debate.round_duration_minutes ? (
          <span>{debate.round_duration_minutes} min phases</span>
        ) : null}
        {moderator ? (
          <span>
            Moderated by{" "}
            <span className="font-medium text-gray-600">
              {moderator.full_name ?? moderator.username}
            </span>
          </span>
        ) : null}
        {debate.recap_text ? (
          <span className="font-medium text-emerald-brand">Recap available</span>
        ) : null}
        <span className="ml-auto hidden font-semibold text-emerald-brand transition-colors group-hover:text-emerald-700 sm:inline">
          Enter room
        </span>
      </div>
    </Link>
  );
}

export default async function DebatesPage({ searchParams }: PageProps) {
  const { status } = await searchParams;
  const filter = getFilter(status);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile: { verified: boolean; role: string | null } | null = null;
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("verified, role")
      .eq("id", user.id)
      .maybeSingle();
    profile = data ?? null;
  }

  const canCreate =
    Boolean(profile?.verified) ||
    profile?.role === "editor" ||
    profile?.role === "admin";

  const [liveCount, openCount, closedCount, recapCount] = await Promise.all([
    supabase
      .from("debates")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    supabase
      .from("debates")
      .select("id", { count: "exact", head: true })
      .eq("status", "open"),
    supabase
      .from("debates")
      .select("id", { count: "exact", head: true })
      .eq("status", "closed"),
    supabase
      .from("debates")
      .select("id", { count: "exact", head: true })
      .eq("status", "closed")
      .not("recap_text", "is", null),
  ]);
  const counts: Record<DebateFilter, number> = {
    live: liveCount.count ?? 0,
    open: openCount.count ?? 0,
    closed: closedCount.count ?? 0,
    recaps: recapCount.count ?? 0,
  };

  let query = supabase
    .from("debates")
    .select(
      `
      id, title, description, status, current_phase, round_duration_minutes,
      tags, created_at, ends_at, motion_for_count, motion_against_count,
      recap_text, recap_generated_at,
      debate_arguments(count),
      profiles!debates_moderator_id_fkey(username, full_name, university)
    `
    )
    .order("created_at", { ascending: false });

  if (filter === "live") {
    query = query.eq("status", "active");
  } else if (filter === "open") {
    query = query.eq("status", "open");
  } else if (filter === "closed") {
    query = query.eq("status", "closed");
  } else {
    query = query.eq("status", "closed").not("recap_text", "is", null);
  }

  const { data: debatesRaw } = await query;
  const debates = (debatesRaw ?? []) as DebateRow[];

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-7 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-brand">
            Debate room
          </p>
          <h1 className="font-display mt-2 text-3xl font-bold leading-tight text-ink md:text-4xl">
            Argue ideas in public, with structure
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
            Pick a side, vote on the motion, and make the strongest case while
            moderators guide each room through opening, rebuttal, and closing.
          </p>
        </div>
        <div className="flex flex-col items-start gap-3 md:items-end">
          <Link
            href={user ? "/debates/create" : "/login?redirectTo=/debates/create"}
            className={`inline-flex w-fit items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              canCreate || !user
                ? "bg-emerald-brand text-white hover:bg-emerald-600"
                : "border border-gray-200 bg-white text-gray-600 hover:bg-white"
            }`}
          >
            {canCreate || !user ? "Start a debate" : "Verify to start one"}
          </Link>
          {!canCreate && user ? (
            <p className="max-w-xs text-xs leading-5 text-gray-500 md:text-right">
              Verified members, editors, and admins can moderate new motions.
            </p>
          ) : null}
        </div>
      </div>

      <div className="mb-5 grid grid-cols-3 gap-3 sm:grid-cols-4">
        <StatTile label="Live rooms" value={counts.live} tone="amber" />
        <StatTile label="Open motions" value={counts.open} tone="emerald" />
        <StatTile label="Closed" value={counts.closed} />
        <div className="hidden sm:block">
          <StatTile label="Recaps" value={counts.recaps} />
        </div>
      </div>

      <div className="mb-6 overflow-x-auto border-b border-gray-200">
        <div className="flex min-w-max gap-1">
          {TABS.map((tab) => {
            const active = filter === tab.value;
            return (
              <Link
                key={tab.value}
                href={tab.href}
                className={`mb-[-1px] inline-flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? "border-emerald-brand text-ink"
                    : "border-transparent text-gray-500 hover:text-ink"
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] ${
                    active
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-white text-gray-400"
                  }`}
                >
                  {counts[tab.value]}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      {debates.length === 0 ? (
        <EmptyDebates filter={filter} signedIn={Boolean(user)} />
      ) : (
        <div className="space-y-4">
          {debates.map((debate) => (
            <DebateCard key={debate.id} debate={debate} />
          ))}
        </div>
      )}
    </div>
  );
}
