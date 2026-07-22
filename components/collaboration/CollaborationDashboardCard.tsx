import Link from "next/link";
import UserAvatar from "@/components/ui/UserAvatar";
import TrackedActionLink from "@/components/retention/TrackedActionLink";
import CreateTrigger from "@/app/(main)/CreateTrigger";
import type { CollaborationSuggestion } from "@/lib/collaboration";

interface PendingInvite {
  postId: string;
  title: string;
  slug: string;
  authorName: string;
}

interface RecentResponse {
  id: string;
  title: string;
  slug: string;
  authorName: string;
  avatarUrl: string | null;
}

export default function CollaborationDashboardCard({
  userId,
  pendingInvites,
  recentResponses,
  unreadMessageCount,
  suggestions,
}: {
  userId: string;
  pendingInvites: PendingInvite[];
  recentResponses: RecentResponse[];
  unreadMessageCount: number;
  suggestions: CollaborationSuggestion[];
}) {
  const hasActivity =
    pendingInvites.length > 0 ||
    recentResponses.length > 0 ||
    unreadMessageCount > 0 ||
    suggestions.length > 0;

  return (
    <section className="mb-8 rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Collaboration
          </p>
          <h2 className="mt-1 text-lg font-semibold text-gray-900">
            Build with other thinkers
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-gray-500">
            Track coauthor invites, responses to your work, messages, and people
            worth collaborating with.
          </p>
        </div>
        {unreadMessageCount > 0 ? (
          <Link
            href="/messages"
            className="rounded-lg bg-emerald-brand px-4 py-2 text-sm font-semibold text-white"
          >
            {unreadMessageCount} unread message{unreadMessageCount === 1 ? "" : "s"}
          </Link>
        ) : null}
      </div>

      {!hasActivity ? (
        <div className="rounded-lg border border-dashed border-gray-200 bg-canvas px-4 py-4">
          <p className="text-sm font-medium text-gray-700">
            No collaboration activity yet.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/?tab=latest"
              className="rounded-lg bg-emerald-brand px-4 py-2 text-sm font-medium text-white"
            >
              Read latest
            </Link>
            <CreateTrigger
              userId={userId}
              presentation="popover"
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700"
            >
              Start writing
            </CreateTrigger>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <div
            className={`rounded-lg border border-gray-100 bg-canvas p-4 ${
              recentResponses.length > 0 ? "lg:order-2" : "lg:order-1"
            }`}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-gray-900">
                Coauthor invites
              </h3>
              <Link href="/notifications" className="text-xs font-medium text-emerald-700">
                Review
              </Link>
            </div>
            {pendingInvites.length > 0 ? (
              <div className="space-y-2">
                {pendingInvites.map((invite) => (
                  <Link
                    key={invite.postId}
                    href="/notifications"
                    className="block rounded-lg bg-white px-3 py-2 text-sm hover:bg-emerald-50"
                  >
                    <span className="line-clamp-1 font-medium text-gray-900">
                      {invite.title}
                    </span>
                    <span className="text-xs text-gray-500">
                      From {invite.authorName}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">No pending invites.</p>
            )}
          </div>

          <div
            className={`rounded-lg border border-gray-100 bg-canvas p-4 ${
              recentResponses.length > 0 ? "lg:order-1" : "lg:order-2"
            }`}
          >
            <h3 className="mb-3 text-sm font-semibold text-gray-900">
              Responses to your work
            </h3>
            {recentResponses.length > 0 ? (
              <div className="space-y-2">
                {recentResponses.map((response) => (
                  <TrackedActionLink
                    key={response.id}
                    href={`/post/${response.slug}`}
                    actionKey="response_received"
                    label="Open response to your work"
                    source="dashboard_return_loop"
                    className="flex gap-2 rounded-lg bg-white px-3 py-2 text-sm hover:bg-emerald-50"
                  >
                    <UserAvatar
                      name={response.authorName}
                      src={response.avatarUrl}
                      size={28}
                    />
                    <span className="min-w-0">
                      <span className="line-clamp-1 font-medium text-gray-900">
                        {response.title}
                      </span>
                      <span className="text-xs text-gray-500">
                        {response.authorName}
                      </span>
                    </span>
                  </TrackedActionLink>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">No responses yet.</p>
            )}
          </div>

          <div className="rounded-lg border border-gray-100 bg-canvas p-4 lg:order-3">
            <h3 className="mb-3 text-sm font-semibold text-gray-900">
              Suggested collaborators
            </h3>
            {suggestions.length > 0 ? (
              <div className="space-y-2">
                {suggestions.map((suggestion) => (
                  <Link
                    key={suggestion.id}
                    href={`/${suggestion.username}`}
                    className="flex gap-2 rounded-lg bg-white px-3 py-2 text-sm hover:bg-emerald-50"
                  >
                    <UserAvatar
                      name={suggestion.full_name ?? suggestion.username}
                      src={suggestion.avatar_url}
                      size={28}
                    />
                    <span className="min-w-0">
                      <span className="line-clamp-1 font-medium text-gray-900">
                        {suggestion.full_name ?? `@${suggestion.username}`}
                      </span>
                      <span className="text-xs text-gray-500">{suggestion.reason}</span>
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">
                Suggestions will improve as you publish and follow writers.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
