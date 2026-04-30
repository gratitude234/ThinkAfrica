import Link from "next/link";
import type { ReactNode } from "react";
import type { DebateInterludeData } from "@/components/post/DebateInterlude";
import type { ActivationState } from "@/lib/activation";
import { formatDate, formatRelativeTime } from "@/lib/utils";
import FollowButton from "@/components/ui/FollowButton";
import UserAvatar from "@/components/ui/UserAvatar";

interface NewVoice {
  count: number;
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
  scheduled_at: string;
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

function SideKicker({ children }: { children: ReactNode }) {
  return (
    <p className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-muted">
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
  const hasAnyCard =
    (activationState && !activationState.activated) ||
    recentDraft ||
    activeDebate ||
    newVoice?.profile?.username ||
    upcomingWebinar ||
    peopleSuggestions.length > 0;

  if (!hasAnyCard) return null;

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
        <SideCard>
          <SideKicker>
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-brand" />
            Happening now
          </SideKicker>
          <Link href={`/debates/${activeDebate.id}`}>
            <h3 className="font-display mb-1.5 text-sm font-semibold leading-snug text-ink transition-colors hover:text-gray-700">
              {activeDebate.title}
            </h3>
          </Link>
          <p className="mb-2 text-xs text-ink-muted">
            {activeDebate.argumentCount.toLocaleString()} arguments - live
          </p>
          <div className="mb-2 flex h-1 overflow-hidden rounded-full bg-gray-100">
            <span className="h-full rounded-full bg-emerald-brand" style={{ width: "58%" }} />
            <span className="h-full rounded-full bg-purple-accent" style={{ width: "42%" }} />
          </div>
          <div className="mb-2.5 flex justify-between text-[11px] font-medium">
            <span className="text-emerald-brand">For - 58%</span>
            <span className="text-purple-accent">Against - 42%</span>
          </div>
          <Link
            href={`/debates/${activeDebate.id}`}
            className="text-xs font-medium text-ink hover:underline"
          >
            Join the debate -&gt;
          </Link>
        </SideCard>
      ) : null}

      {newVoice?.profile?.username ? (
        <SideCard>
          <SideKicker>New voice this week</SideKicker>
          <Link
            href={`/${newVoice.profile.username}`}
            className="group flex items-center gap-2.5"
          >
            <UserAvatar
              name={newVoice.profile.full_name ?? newVoice.profile.username}
              src={newVoice.profile.avatar_url}
              size={40}
            />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-ink group-hover:text-gray-700">
                {newVoice.profile.full_name ?? newVoice.profile.username}
              </span>
              <span className="mt-0.5 block truncate text-[11px] text-ink-muted">
                {newVoice.count} {newVoice.count === 1 ? "essay" : "essays"} this month
                {newVoice.profile.university ? ` - ${newVoice.profile.university}` : ""}
              </span>
            </span>
          </Link>
        </SideCard>
      ) : null}

      {upcomingWebinar ? (
        <SideCard>
          <SideKicker>Upcoming</SideKicker>
          <p className="mb-1 text-[11px] font-medium text-emerald-brand">
            {formatDate(upcomingWebinar.scheduled_at)} - Webinar
          </p>
          <Link href="/webinars">
            <p className="font-display text-sm font-semibold leading-snug text-ink transition-colors hover:text-gray-700">
              {upcomingWebinar.title}
            </p>
          </Link>
          <Link
            href={`/webinars/${upcomingWebinar.id}`}
            className="mt-2.5 inline-flex rounded-md border border-emerald-100 px-3 py-1.5 text-xs font-medium text-emerald-brand hover:bg-emerald-50"
          >
            Register free
          </Link>
        </SideCard>
      ) : null}

      {peopleSuggestions.length > 0 ? (
        <SideCard>
          <div className="mb-2.5 flex items-center justify-between">
            <SideKicker>Writers to follow</SideKicker>
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
