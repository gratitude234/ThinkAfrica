import Link from "next/link";
import type { ReactNode } from "react";
import type { DebateInterludeData } from "@/components/post/DebateInterlude";
import type { ActivationState } from "@/lib/activation";
import { formatDate, formatRelativeTime, formatTimeUntil } from "@/lib/utils";
import FollowButton from "@/components/ui/FollowButton";
import UserAvatar from "@/components/ui/UserAvatar";

interface NewVoice {
  count: number;
  totalPosts?: number;
  firstPublishedAt?: string | null;
  profile: {
    username: string | null;
    full_name: string | null;
    university: string | null;
    avatar_url: string | null;
  } | null;
}

interface UpcomingWebinar {
  id: string;
  title: string;
  status: string;
  scheduled_at: string;
  attendee_count: number | null;
  tags: string[] | null;
  profiles: {
    username: string | null;
    full_name: string | null;
    university: string | null;
    avatar_url: string | null;
  } | null;
}

interface RecentDraft {
  id: string;
  title: string | null;
  updated_at: string;
}

interface SuggestedPerson {
  id: string;
  username: string;
  full_name: string | null;
  university: string | null;
  avatar_url: string | null;
}

interface Props {
  activeDebate: DebateInterludeData | null;
  newVoice: NewVoice | null;
  upcomingWebinar: UpcomingWebinar | null;
  recentDraft: RecentDraft | null;
  activationState: ActivationState | null;
  peopleSuggestions: SuggestedPerson[];
  currentUserId: string | null;
}

function SideKicker({
  children,
  className = "mb-2.5",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={`${className} flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-muted`}
    >
      {children}
    </p>
  );
}

function SideCard({ children }: { children: ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      {children}
    </section>
  );
}

function getDebateShare(debate: DebateInterludeData) {
  const forCount = debate.motionForCount ?? 0;
  const againstCount = debate.motionAgainstCount ?? 0;
  const total = forCount + againstCount;
  const forPct = total > 0 ? Math.round((forCount / total) * 100) : 50;

  return {
    forPct,
    againstPct: 100 - forPct,
    total,
  };
}

function PromptCard({
  kicker,
  title,
  body,
  href,
  cta,
}: {
  kicker: string;
  title: string;
  body: string;
  href: string;
  cta: string;
}) {
  return (
    <SideCard>
      <SideKicker>{kicker}</SideKicker>
      <p className="text-sm font-semibold leading-snug text-ink">{title}</p>
      <p className="mt-1.5 text-xs leading-5 text-ink-muted">{body}</p>
      <Link
        href={href}
        className="mt-3 inline-flex rounded-lg border border-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-brand transition-colors hover:bg-emerald-50"
      >
        {cta}
      </Link>
    </SideCard>
  );
}

function ActivationCard({ state }: { state: ActivationState }) {
  if (state.activated) return null;

  const doneCount = state.tasks.filter((task) => task.done).length;
  const pct = Math.round((doneCount / state.tasks.length) * 100);

  return (
    <section className="rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-4">
      <div className="mb-3">
        <h2 className="text-[13px] font-semibold text-ink">Complete your profile</h2>
        <p className="mt-1 text-xs leading-5 text-ink-muted">
          Unlock your full intellectual profile on ThinkAfrica.
        </p>
      </div>
      <div className="flex justify-between text-[11px] text-ink-muted">
        <span>
          {doneCount} of {state.tasks.length} complete
        </span>
        <span>{pct}%</span>
      </div>
      <div className="my-2.5 h-1 overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full rounded-full bg-emerald-brand transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-2.5 space-y-1.5">
        {state.tasks.map((task) => (
          <Link
            key={task.key}
            href={task.href}
            className="flex items-center gap-2 text-xs"
          >
            <span
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[8px] font-bold ${
                task.done
                  ? "border-emerald-brand bg-emerald-brand text-white"
                  : "border-gray-300 text-transparent"
              }`}
            >
              {"\u2713"}
            </span>
            <span
              className={
                task.done
                  ? "text-ink line-through decoration-gray-300"
                  : "text-ink-muted"
              }
            >
              {task.label}
            </span>
          </Link>
        ))}
      </div>
      {state.nextTask ? (
        <Link
          href={state.nextTask.href}
          className="mt-3 inline-flex w-full items-center justify-center rounded-lg bg-emerald-brand px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-emerald-600"
        >
          Continue setup
        </Link>
      ) : null}
    </section>
  );
}

export default function HomeSidebar({
  activeDebate,
  newVoice,
  upcomingWebinar,
  recentDraft,
  activationState,
  peopleSuggestions,
  currentUserId,
}: Props) {
  const debateShare = activeDebate ? getDebateShare(activeDebate) : null;
  const debateRemaining = activeDebate
    ? formatTimeUntil(activeDebate.endsAt ?? null)
    : null;
  const webinarHost = upcomingWebinar?.profiles;
  const webinarTiming = upcomingWebinar
    ? upcomingWebinar.status === "live"
      ? "Live now"
      : formatTimeUntil(upcomingWebinar.scheduled_at)
    : null;

  return (
    <div className="flex flex-col gap-4">
      {activationState ? <ActivationCard state={activationState} /> : null}

      {recentDraft ? (
        <SideCard>
          <SideKicker>Continue writing</SideKicker>
          <Link
            href={`/write?draft=${recentDraft.id}`}
            className="flex items-center gap-2.5 rounded-[9px] bg-canvas p-3 transition-colors hover:bg-[#F5F3EE]"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-sm text-ink-muted">
              {"\u270E"}
            </span>
            <span className="min-w-0">
              <span className="line-clamp-2 text-[13px] font-medium leading-snug text-ink">
                {recentDraft.title?.trim() || "Untitled draft"}
              </span>
              <span className="mt-0.5 block text-[11px] text-ink-muted">
                Saved {formatRelativeTime(recentDraft.updated_at)}
              </span>
            </span>
          </Link>
        </SideCard>
      ) : null}

      {activeDebate ? (
        <section className="rounded-xl border border-gray-900 bg-gray-900 p-4 text-white shadow-sm">
          <SideKicker>
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            <span className="text-emerald-300">Happening now</span>
          </SideKicker>
          <Link href={`/debates/${activeDebate.id}`}>
            <h3 className="font-display mb-2 text-sm font-semibold leading-snug text-white transition-colors hover:text-emerald-100">
              {activeDebate.title}
            </h3>
          </Link>
          <p className="mb-3 text-xs text-gray-400">
            {activeDebate.argumentCount.toLocaleString()} arguments
            {debateRemaining ? ` - ${debateRemaining}` : ""}
          </p>
          <div className="mb-2 flex h-1.5 overflow-hidden rounded-full bg-gray-700">
            <span
              className="h-full rounded-full bg-emerald-brand"
              style={{ width: `${debateShare?.forPct ?? 50}%` }}
            />
            <span
              className="h-full rounded-full bg-purple-accent"
              style={{ width: `${debateShare?.againstPct ?? 50}%` }}
            />
          </div>
          <div className="mb-2.5 flex justify-between text-[11px] font-medium">
            <span className="text-emerald-300">For - {debateShare?.forPct ?? 50}%</span>
            <span className="text-purple-300">
              Against - {debateShare?.againstPct ?? 50}%
            </span>
          </div>
          {debateShare && debateShare.total === 0 ? (
            <p className="mb-2.5 text-[11px] text-gray-400">
              No motion votes yet. Be one of the first voices in.
            </p>
          ) : null}
          <Link
            href={`/debates/${activeDebate.id}`}
            className="inline-flex rounded-lg bg-emerald-brand px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-600"
          >
            Join the debate -&gt;
          </Link>
        </section>
      ) : (
        <PromptCard
          kicker="Debate desk"
          title="No live motion yet"
          body="Start a focused argument and invite the network to take a side."
          href="/debates/create"
          cta="Start a debate"
        />
      )}

      {newVoice?.profile?.username ? (
        <SideCard>
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <SideKicker className="mb-0">New voice this week</SideKicker>
            {newVoice.totalPosts && newVoice.totalPosts <= 2 ? (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                New
              </span>
            ) : null}
          </div>
          <Link
            href={`/${newVoice.profile.username}`}
            className="group flex items-center gap-3"
          >
            <UserAvatar
              name={newVoice.profile.full_name ?? newVoice.profile.username}
              src={newVoice.profile.avatar_url}
              size={42}
            />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-ink group-hover:text-gray-700">
                {newVoice.profile.full_name ?? newVoice.profile.username}
              </span>
              <span className="mt-0.5 block truncate text-[11px] text-ink-muted">
                {newVoice.count} recent {newVoice.count === 1 ? "piece" : "pieces"}
                {newVoice.profile.university ? ` - ${newVoice.profile.university}` : ""}
              </span>
            </span>
          </Link>
          <p className="mt-3 rounded-lg bg-canvas px-3 py-2 text-[11px] leading-5 text-ink-muted">
            {newVoice.totalPosts && newVoice.totalPosts <= 1
              ? "First publication on ThinkAfrica. Worth catching early."
              : `${newVoice.totalPosts ?? newVoice.count} total publications, newly active this month.`}
          </p>
        </SideCard>
      ) : null}

      {upcomingWebinar ? (
        <SideCard>
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <SideKicker className="mb-0">
              {upcomingWebinar.status === "live" ? (
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
              ) : null}
              Upcoming webinar
            </SideKicker>
            {webinarTiming ? (
              <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                {webinarTiming}
              </span>
            ) : null}
          </div>
          <p className="mb-1 text-[11px] font-medium text-emerald-brand">
            {formatDate(upcomingWebinar.scheduled_at)}
          </p>
          <Link href={`/webinars/${upcomingWebinar.id}`}>
            <p className="font-display text-sm font-semibold leading-snug text-ink transition-colors hover:text-gray-700">
              {upcomingWebinar.title}
            </p>
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-muted">
            {webinarHost ? (
              <span className="truncate">
                Hosted by {webinarHost.full_name ?? webinarHost.username}
              </span>
            ) : null}
            <span>{upcomingWebinar.attendee_count ?? 0} registered</span>
          </div>
          {upcomingWebinar.tags && upcomingWebinar.tags.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {upcomingWebinar.tags.slice(0, 2).map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
          <Link
            href={`/webinars/${upcomingWebinar.id}`}
            className="mt-2.5 inline-flex rounded-md border border-emerald-100 px-3 py-1.5 text-xs font-medium text-emerald-brand hover:bg-emerald-50"
          >
            Register free
          </Link>
        </SideCard>
      ) : (
        <PromptCard
          kicker="Events"
          title="No session scheduled"
          body="Host a focused webinar, workshop, or reading session for the network."
          href="/webinars/create"
          cta="Host a webinar"
        />
      )}

      {peopleSuggestions.length > 0 ? (
        <SideCard>
          <div className="mb-2.5 flex items-center justify-between">
            <SideKicker className="mb-0">Writers to follow</SideKicker>
            <Link
              href="/leaderboard"
              className="text-[11px] font-semibold text-emerald-brand hover:underline"
            >
              See all -&gt;
            </Link>
          </div>
          <div>
            {peopleSuggestions.map((person) => (
              <div
                key={person.id}
                className="flex items-center gap-2.5 border-b border-gray-100 py-2 last:border-b-0 last:pb-0"
              >
                <Link href={`/${person.username}`} className="shrink-0">
                  <UserAvatar
                    name={person.full_name ?? person.username}
                    src={person.avatar_url}
                    size={34}
                  />
                </Link>
                <div className="min-w-0 flex-1">
                  <Link href={`/${person.username}`}>
                    <p className="truncate text-[13px] font-medium text-ink hover:text-emerald-brand">
                      {person.full_name ?? person.username}
                    </p>
                  </Link>
                  {person.university ? (
                    <p className="mt-0.5 truncate text-[11px] text-ink-muted">
                      {person.university}
                    </p>
                  ) : null}
                </div>
                {currentUserId ? (
                  <FollowButton
                    followerId={currentUserId}
                    followingId={person.id}
                  />
                ) : (
                  <Link
                    href={`/${person.username}`}
                    className="rounded-full border border-gray-200 px-3 py-1 text-[11px] font-medium text-gray-600 hover:border-emerald-brand hover:text-emerald-brand"
                  >
                    View
                  </Link>
                )}
              </div>
            ))}
          </div>
        </SideCard>
      ) : null}
    </div>
  );
}
