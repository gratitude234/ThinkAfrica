import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatRelativeTime, formatTimeUntil } from "@/lib/utils";
import { type DebatePhase, PHASE_LABELS } from "@/lib/debatePhases";
import {
  DebateStatusPill,
  PhasePill,
  StanceMeter,
  StatTile,
  type DebateStatus,
} from "./DebatePrimitives";
import {
  DEFAULT_OG_IMAGE,
  SITE_NAME,
  absoluteUrl,
  canonicalPath,
} from "@/lib/site";

export const revalidate = 30;

export const metadata: Metadata = {
  title: "Student Debates on Africa, Education and Society",
  description:
    "Join structured Indegenius debates where students argue motions, vote on positions, and build stronger public ideas.",
  alternates: { canonical: canonicalPath("/debates") },
  openGraph: {
    title: "Student Debates on Africa, Education and Society",
    description:
      "Join structured Indegenius debates where students argue motions, vote on positions, and build stronger public ideas.",
    url: absoluteUrl("/debates"),
    siteName: SITE_NAME,
    images: [
      { url: absoluteUrl(DEFAULT_OG_IMAGE), width: 1200, height: 630 },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Student Debates on Africa, Education and Society",
    description:
      "Join structured Indegenius debates where students argue motions, vote on positions, and build stronger public ideas.",
    images: [absoluteUrl(DEFAULT_OG_IMAGE)],
  },
};

type DebateFilter =
  | "active"
  | "recruiting"
  | "completed"
  | "cancelled"
  | "recaps";

const TABS: Array<{ label: string; value: DebateFilter; href: string }> = [
  { label: "Active", value: "active", href: "/debates" },
  {
    label: "Recruiting",
    value: "recruiting",
    href: "/debates?status=recruiting",
  },
  {
    label: "Completed",
    value: "completed",
    href: "/debates?status=completed",
  },
  {
    label: "Cancelled",
    value: "cancelled",
    href: "/debates?status=cancelled",
  },
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

type DebateVariant = "legacy" | "v1_5";
type RecapStatus = "none" | "pending" | "generating" | "ready" | "failed";

interface DebateRow {
  id: string;
  title: string;
  description: string | null;
  status: DebateStatus;
  current_phase: DebatePhase | null;
  debate_variant: DebateVariant | null;
  round_duration_minutes: number | null;
  tags: string[] | null;
  created_at: string;
  ends_at: string | null;
  recruiting_deadline: string | null;
  opening_deadline: string | null;
  rebuttal_deadline: string | null;
  voting_deadline: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  motion_for_count: number | null;
  motion_against_count: number | null;
  recap_text: string | null;
  recap_status: RecapStatus | null;
  debate_arguments?: { count: number }[] | { count: number } | null;
  profiles: DebateProfile | DebateProfile[] | null;
}

const EMPTY_COPY: Record<DebateFilter, { title: string; body: string }> = {
  active: {
    title: "No debate is active right now.",
    body: "Recruiting debates are assembling one confirmed voice for each side.",
  },
  recruiting: {
    title: "No debates are recruiting.",
    body: "Verified members can frame a motion and personally invite both sides.",
  },
  completed: {
    title: "No completed debates yet.",
    body: "Finished debates will remain here as durable records of the reasoning and vote.",
  },
  cancelled: {
    title: "No cancelled debates.",
    body: "Debates that cannot continue are labelled honestly and kept readable here.",
  },
  recaps: {
    title: "No AI-assisted recaps yet.",
    body: "A recap appears after a completed debate has been summarised.",
  },
};

function getFilter(status?: string): DebateFilter {
  if (
    status === "recruiting" ||
    status === "completed" ||
    status === "cancelled" ||
    status === "recaps"
  ) {
    return status;
  }
  // Preserve old links that used ?status=open and ?status=closed.
  if (status === "open") return "recruiting";
  if (status === "closed") return "completed";
  return "active";
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
  const forPct = total ? Math.round((forCount / total) * 100) : 0;
  return {
    forCount,
    againstCount,
    total,
    forPct,
    againstPct: total ? 100 - forPct : 0,
  };
}

function getPhaseDeadline(debate: DebateRow) {
  if (debate.debate_variant !== "v1_5") return debate.ends_at;

  if (debate.current_phase === "recruiting") {
    return debate.recruiting_deadline;
  }
  if (debate.current_phase === "opening") return debate.opening_deadline;
  if (debate.current_phase === "rebuttal") return debate.rebuttal_deadline;
  if (debate.current_phase === "voting") return debate.voting_deadline;
  return null;
}

function getTimeLabel(debate: DebateRow) {
  if (debate.status === "cancelled") {
    return `Cancelled ${formatDate(debate.cancelled_at ?? debate.created_at)}`;
  }
  if (debate.status === "closed") {
    return `Completed ${formatDate(debate.ends_at ?? debate.created_at)}`;
  }

  const deadline = getPhaseDeadline(debate);
  if (!deadline) {
    return debate.status === "open"
      ? `Opened ${formatRelativeTime(debate.created_at)}`
      : null;
  }

  const phaseLabel = debate.current_phase
    ? PHASE_LABELS[debate.current_phase]
    : "Stage";
  if (new Date(deadline).getTime() <= Date.now()) {
    return `${phaseLabel} deadline passed`;
  }
  return `${phaseLabel} closes ${formatTimeUntil(deadline)}`;
}

function EmptyDebates({
  filter,
  signedIn,
}: {
  filter: DebateFilter;
  signedIn: boolean;
}) {
  const copy = EMPTY_COPY[filter];
  return (
    <div className="rounded-xl border border-dashed border-gray-200 bg-surface px-6 py-14 text-center">
      <p className="text-base font-semibold text-ink">{copy.title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-ink-muted">
        {copy.body}
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {filter !== "recruiting" ? (
          <Link
            href="/debates?status=recruiting"
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-ink hover:bg-canvas"
          >
            View recruiting debates
          </Link>
        ) : null}
        <Link
          href={signedIn ? "/debates/create" : "/login?redirectTo=/debates/create"}
          className="rounded-lg bg-emerald-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Start a debate
        </Link>
      </div>
    </div>
  );
}

function DebateCard({
  debate,
  featured = false,
}: {
  debate: DebateRow;
  featured?: boolean;
}) {
  const moderator = getProfile(debate.profiles);
  const argumentCount = getArgumentCount(debate.debate_arguments);
  const split = getVoteSplit(debate);
  const phase =
    debate.current_phase ??
    (debate.status === "closed" ? "completed" : "opening");
  const timeLabel = getTimeLabel(debate);
  const deadline = getPhaseDeadline(debate);
  const hasRecap =
    Boolean(debate.recap_text) || debate.recap_status === "ready";

  const accent =
    debate.status === "cancelled"
      ? "border-l-red-400"
      : phase === "recruiting"
        ? "border-l-gold"
        : phase === "voting"
          ? "border-l-purple-accent"
          : debate.status === "closed"
            ? "border-l-gray-300"
            : "border-l-emerald-brand";

  return (
    <Link
      href={`/debates/${debate.id}`}
      className={`group block rounded-xl border border-l-4 border-gray-200 bg-surface p-5 transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-lg ${accent} ${
        featured ? "sm:p-6" : ""
      }`}
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <DebateStatusPill status={debate.status} />
            <PhasePill phase={phase} />
            {debate.debate_variant === "v1_5" ? (
              <span className="rounded-full bg-green-tint px-2.5 py-1 text-xs font-semibold text-emerald-brand">
                Curated 1v1
              </span>
            ) : null}
          </div>

          <h2
            className={`font-display font-semibold leading-tight text-ink transition-colors group-hover:text-emerald-brand ${
              featured ? "text-2xl" : "text-xl"
            }`}
          >
            {debate.title}
          </h2>
          {debate.description ? (
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-ink-muted">
              {debate.description}
            </p>
          ) : null}

          {debate.status === "cancelled" && debate.cancellation_reason ? (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              Cancelled: {debate.cancellation_reason}
            </p>
          ) : null}

          {debate.tags?.length ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {debate.tags.slice(0, 5).map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-canvas px-2.5 py-1 text-xs font-medium text-ink-muted"
                >
                  #{tag}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="w-full shrink-0 rounded-xl border border-gray-100 bg-canvas p-3 sm:w-[220px]">
          <StanceMeter
            forCount={split.forCount}
            againstCount={split.againstCount}
            compact
          />
          {debate.debate_variant === "v1_5" &&
          debate.status !== "closed" &&
          debate.status !== "cancelled" ? (
            <p
              className="mt-3 border-t border-gray-200 pt-3 text-xs font-medium text-ink-muted"
              title={deadline ? new Date(deadline).toLocaleString() : undefined}
            >
              {timeLabel}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-gray-100 pt-4 text-xs text-ink-muted">
        {timeLabel &&
        !(
          debate.debate_variant === "v1_5" &&
          debate.status !== "closed" &&
          debate.status !== "cancelled"
        ) ? (
          <span>{timeLabel}</span>
        ) : null}
        <span>
          {argumentCount} {argumentCount === 1 ? "argument" : "arguments"}
        </span>
        {moderator ? (
          <span>
            Moderated by{" "}
            <span className="font-medium text-ink">
              {moderator.full_name ?? moderator.username ?? "Indegenius"}
            </span>
          </span>
        ) : null}
        {hasRecap ? (
          <span className="font-semibold text-emerald-brand">
            AI-assisted recap ready
          </span>
        ) : null}
        <span className="ml-auto hidden font-semibold text-emerald-brand sm:inline">
          Open debate →
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

  const [activeCount, recruitingCount, completedCount, cancelledCount, recapCount] =
    await Promise.all([
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
        .eq("status", "cancelled"),
      supabase
        .from("debates")
        .select("id", { count: "exact", head: true })
        .eq("status", "closed")
        .or("recap_text.not.is.null,recap_status.eq.ready"),
    ]);

  const counts: Record<DebateFilter, number> = {
    active: activeCount.count ?? 0,
    recruiting: recruitingCount.count ?? 0,
    completed: completedCount.count ?? 0,
    cancelled: cancelledCount.count ?? 0,
    recaps: recapCount.count ?? 0,
  };

  let query = supabase
    .from("debates")
    .select(
      `
      id, title, description, status, current_phase, debate_variant,
      round_duration_minutes, tags, created_at, ends_at,
      recruiting_deadline, opening_deadline, rebuttal_deadline, voting_deadline,
      cancelled_at, cancellation_reason,
      motion_for_count, motion_against_count, recap_text, recap_status,
      debate_arguments(count),
      profiles!debates_moderator_id_fkey(username, full_name, university)
    `
    )
    .order("created_at", { ascending: false });

  if (filter === "active") query = query.eq("status", "active");
  if (filter === "recruiting") query = query.eq("status", "open");
  if (filter === "completed") query = query.eq("status", "closed");
  if (filter === "cancelled") query = query.eq("status", "cancelled");
  if (filter === "recaps") {
    query = query
      .eq("status", "closed")
      .or("recap_text.not.is.null,recap_status.eq.ready");
  }

  const { data: debatesRaw } = await query;
  const debates = (debatesRaw ?? []) as DebateRow[];

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-7 flex flex-col gap-5 rounded-xl border border-gray-200 bg-surface p-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-brand">
            Debate room
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold leading-tight text-ink md:text-4xl">
            Ideas tested in public.
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">
            Follow curated 1v1 debates from recruitment through opening,
            rebuttal, the community vote, and a durable recap.
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 md:items-end">
          <Link
            href={user ? "/debates/create" : "/login?redirectTo=/debates/create"}
            className={`inline-flex rounded-lg px-4 py-2 text-sm font-semibold ${
              canCreate || !user
                ? "bg-emerald-brand text-white hover:opacity-90"
                : "border border-gray-200 bg-canvas text-ink-muted hover:bg-surface"
            }`}
          >
            {canCreate || !user ? "Start a curated debate" : "Verify to start one"}
          </Link>
          {!canCreate && user ? (
            <p className="text-xs text-ink-muted">
              Verified members, editors, and admins can moderate.
            </p>
          ) : null}
        </div>
      </header>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label="Active stages"
          value={counts.active}
          tone="amber"
          pulse={counts.active > 0}
        />
        <StatTile
          label="Recruiting"
          value={counts.recruiting}
          tone="emerald"
        />
        <StatTile label="Completed" value={counts.completed} />
        <StatTile label="Recaps ready" value={counts.recaps} />
      </div>

      <nav
        aria-label="Debate filters"
        className="mb-6 overflow-x-auto border-b border-gray-200 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="flex min-w-max gap-1">
          {TABS.map((tab) => {
            const active = filter === tab.value;
            return (
              <Link
                key={tab.value}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`mb-[-1px] inline-flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm font-medium ${
                  active
                    ? "border-emerald-brand text-ink"
                    : "border-transparent text-ink-muted hover:text-ink"
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] ${
                    active
                      ? "bg-green-tint text-emerald-brand"
                      : "bg-surface text-ink-muted"
                  }`}
                >
                  {counts[tab.value]}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>

      {debates.length === 0 ? (
        <EmptyDebates filter={filter} signedIn={Boolean(user)} />
      ) : (
        <div className="space-y-3">
          {debates.map((debate, index) => (
            <DebateCard
              key={debate.id}
              debate={debate}
              featured={index === 0 && filter === "active"}
            />
          ))}
        </div>
      )}
    </div>
  );
}
