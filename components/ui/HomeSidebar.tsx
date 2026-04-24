import Link from "next/link";
import type { ReactNode } from "react";
import type { DebateInterludeData } from "@/components/post/DebateInterlude";
import { formatDate } from "@/lib/utils";

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

interface Props {
  activeDebate: DebateInterludeData | null;
  newVoice: NewVoice | null;
  upcomingWebinar: UpcomingWebinar | null;
  recentDraft: RecentDraft | null;
}

function SideKicker({ children }: { children: ReactNode }) {
  return (
    <p className="mb-3 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.2em] text-ink-muted">
      {children}
    </p>
  );
}

function SideCard({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-gray-200 bg-white p-4">{children}</div>;
}

export default function HomeSidebar({
  activeDebate,
  newVoice,
  upcomingWebinar,
  recentDraft,
}: Props) {
  if (!activeDebate && !newVoice?.profile?.username && !upcomingWebinar && !recentDraft) {
    return null;
  }

  return (
    <div className="space-y-6">
      {activeDebate ? (
        <div>
          <SideKicker>
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-brand" />
            Happening now
          </SideKicker>
          <SideCard>
            <Link href={`/debates/${activeDebate.id}`}>
              <h3 className="font-display mb-2 text-sm font-semibold leading-snug text-ink transition-colors hover:text-gray-700">
                {activeDebate.title}
              </h3>
            </Link>
            <p className="mb-3 text-xs text-ink-muted">
              {activeDebate.argumentCount.toLocaleString()} arguments · live
            </p>
            <div className="h-1 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-gray-400"
                style={{
                  width: `${Math.min(100, (activeDebate.argumentCount / 300) * 100)}%`,
                }}
              />
            </div>
            <Link
              href={`/debates/${activeDebate.id}`}
              className="mt-3 inline-block text-xs font-medium text-ink hover:underline"
            >
              Join the debate →
            </Link>
          </SideCard>
        </div>
      ) : null}

      {newVoice?.profile?.username ? (
        <div>
          <SideKicker>New voice this week</SideKicker>
          <SideCard>
            <Link
              href={`/${newVoice.profile.username}`}
              className="group flex items-center gap-3"
            >
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-amber-100 text-sm font-medium text-amber-700">
                {(newVoice.profile.full_name ?? newVoice.profile.username)
                  .charAt(0)
                  .toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink transition-colors group-hover:text-gray-700">
                  {newVoice.profile.full_name ?? newVoice.profile.username}
                </p>
                <p className="mt-0.5 truncate text-xs text-ink-muted">
                  {newVoice.count} {newVoice.count === 1 ? "essay" : "essays"} this month
                  {newVoice.profile.university ? ` · ${newVoice.profile.university}` : ""}
                </p>
              </div>
            </Link>
          </SideCard>
        </div>
      ) : null}

      {upcomingWebinar ? (
        <div>
          <SideKicker>Upcoming</SideKicker>
          <SideCard>
            <p className="mb-1 text-xs font-medium text-emerald-brand">
              {formatDate(upcomingWebinar.scheduled_at)} · Webinar
            </p>
            <Link href="/webinars">
              <p className="font-display text-sm font-semibold leading-snug text-ink transition-colors hover:text-gray-700">
                {upcomingWebinar.title}
              </p>
            </Link>
          </SideCard>
        </div>
      ) : null}

      {recentDraft ? (
        <div>
          <SideKicker>Continue writing</SideKicker>
          <SideCard>
            <Link href={`/write?draft=${recentDraft.id}`} className="group block">
              <p className="line-clamp-2 text-sm font-medium text-ink transition-colors group-hover:text-gray-700">
                {recentDraft.title?.trim() || "Untitled draft"}
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                Saved {formatDate(recentDraft.updated_at)}
              </p>
            </Link>
          </SideCard>
        </div>
      ) : null}
    </div>
  );
}
