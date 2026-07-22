import Link from "next/link";
import type { ReactNode } from "react";
import type { DebateInterludeData } from "@/components/post/DebateInterlude";
import FollowButton from "@/components/ui/FollowButton";
import UserAvatar from "@/components/ui/UserAvatar";
import type { ActivationState } from "@/lib/activation";
import { resolveContentKind } from "@/lib/contentModel";
import { formatRelativeTime, formatTimeUntil } from "@/lib/utils";

interface RecentDraft {
  id: string;
  title: string | null;
  updated_at: string;
  type: string;
  content_kind?: string | null;
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
  recentDraft: RecentDraft | null;
  activationState: ActivationState | null;
  peopleSuggestions: SuggestedPerson[];
  currentUserId: string | null;
  topics: string[];
}

function SideCard({ children }: { children: ReactNode }) {
  return <section className="rounded-xl border border-gray-200 bg-white p-4">{children}</section>;
}

function Kicker({ children }: { children: ReactNode }) {
  return <p className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.16em] text-gray-500">{children}</p>;
}

export function draftHref(draft: RecentDraft) {
  return resolveContentKind(draft) === "research"
    ? `/submit/research?draft=${draft.id}`
    : `/write?draft=${draft.id}`;
}

function PersonalAction({
  recentDraft,
  activationState,
}: {
  recentDraft: RecentDraft | null;
  activationState: ActivationState | null;
}) {
  if (recentDraft) {
    return (
      <SideCard>
        <Kicker>Continue writing</Kicker>
        <Link href={draftHref(recentDraft)} className="group block rounded-lg bg-canvas p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-brand">
          <p className="font-display line-clamp-2 text-[14px] font-semibold leading-snug text-ink group-hover:text-emerald-800">{recentDraft.title?.trim() || "Untitled draft"}</p>
          <p className="mt-1 text-[11.5px] text-gray-500">Saved {formatRelativeTime(recentDraft.updated_at)}</p>
        </Link>
      </SideCard>
    );
  }

  if (!activationState || activationState.activated || !activationState.nextTask) return null;
  const done = activationState.tasks.filter((task) => task.done).length;
  const progress = Math.round((done / activationState.tasks.length) * 100);

  return (
    <SideCard>
      <Kicker>Complete your setup</Kicker>
      <p className="text-[13px] font-semibold text-ink">{activationState.nextTask.label}</p>
      <p className="mt-1 text-xs leading-5 text-gray-500">{activationState.nextTask.description}</p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-100" aria-label={`${progress}% complete`} role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-emerald-brand" style={{ width: `${progress}%` }} />
      </div>
      <Link href={activationState.nextTask.href} className="mt-3 inline-flex min-h-11 items-center text-xs font-semibold text-emerald-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2">Continue setup →</Link>
    </SideCard>
  );
}

function DebateCard({ debate }: { debate: DebateInterludeData }) {
  const forCount = debate.motionForCount ?? 0;
  const againstCount = debate.motionAgainstCount ?? 0;
  const total = forCount + againstCount;
  const forPct = total > 0 ? Math.round((forCount / total) * 100) : 50;
  const remaining = formatTimeUntil(debate.endsAt ?? null);

  return (
    <section className="rounded-xl bg-gray-900 p-4 text-white">
      <p className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.16em] text-emerald-300">Live debate</p>
      <Link href={`/debates/${debate.id}`}><h2 className="font-display line-clamp-3 text-[16px] font-semibold leading-[1.25] hover:text-emerald-100">{debate.title}</h2></Link>
      <p className="mt-1.5 text-[11.5px] text-gray-400">{debate.argumentCount} arguments{remaining ? ` · ${remaining}` : ""}</p>
      <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-gray-700" aria-label={`${forPct}% for, ${100 - forPct}% against`}>
        <span className="bg-emerald-500" style={{ width: `${forPct}%` }} />
        <span className="bg-purple-500" style={{ width: `${100 - forPct}%` }} />
      </div>
      <Link href={`/debates/${debate.id}`} className="mt-3 inline-flex min-h-11 items-center text-xs font-semibold text-emerald-300 hover:text-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900">Join the debate →</Link>
    </section>
  );
}

function PeopleCard({ people, currentUserId }: { people: SuggestedPerson[]; currentUserId: string | null }) {
  if (people.length === 0) return null;
  return (
    <SideCard>
      <div className="mb-2 flex items-center justify-between gap-2">
        <Kicker>Writers to follow</Kicker>
        <Link href="/leaderboard" className="mb-2 text-[11px] font-semibold text-emerald-700 hover:underline">See all</Link>
      </div>
      <div className="space-y-3">
        {people.slice(0, 3).map((person) => (
          <div key={person.id} className="flex items-center gap-2.5">
            <Link href={`/${person.username}`} className="shrink-0"><UserAvatar name={person.full_name ?? person.username} src={person.avatar_url} size={36} /></Link>
            <div className="min-w-0 flex-1">
              <Link href={`/${person.username}`} className="block truncate text-[12.5px] font-semibold text-ink hover:text-emerald-700">{person.full_name ?? person.username}</Link>
              {person.university ? <p className="truncate text-[10.5px] text-gray-500">{person.university}</p> : null}
            </div>
            {currentUserId ? <FollowButton followerId={currentUserId} followingId={person.id} /> : <Link href={`/${person.username}`} className="text-[11px] font-semibold text-emerald-700">View</Link>}
          </div>
        ))}
      </div>
    </SideCard>
  );
}

export default function HomeSidebar({ activeDebate, recentDraft, activationState, peopleSuggestions, currentUserId, topics }: Props) {
  return (
    <div className="flex flex-col gap-3.5">
      <PersonalAction recentDraft={recentDraft} activationState={activationState} />
      {activeDebate ? <DebateCard debate={activeDebate} /> : null}
      <PeopleCard people={peopleSuggestions} currentUserId={currentUserId} />
      {topics.length > 0 ? (
        <nav aria-label="Browse popular topics" className="flex flex-wrap gap-x-3 gap-y-2 px-1 text-[11.5px] text-gray-500">
          {topics.slice(0, 7).map((topic) => <Link key={topic} href={`/topics/${encodeURIComponent(topic)}`} className="hover:text-emerald-700">{topic}</Link>)}
        </nav>
      ) : null}
    </div>
  );
}
