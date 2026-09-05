import { notFound } from "next/navigation";
import Link from "next/link";
import EmptyState from "@/components/ui/EmptyState";
import UserAvatar from "@/components/ui/UserAvatar";
import { createClient } from "@/lib/supabase/server";
import { sortRelationshipProfiles, type RelationshipProfile } from "@/lib/profileRelationships";

interface PageProps {
  params: Promise<{ username: string }>;
}

export default async function FollowersPage({ params }: PageProps) {
  const { username } = await params;
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, username")
    .eq("username", username)
    .single();

  if (!profile) notFound();

  /**
   * No ordering is asked of the database. `follows` records the relationship
   * and nothing else: it has no `created_at`, so the `.order("created_at")`
   * that used to sit here failed the whole request, and because the error was
   * destructured away every profile reported zero followers. Ordering happens
   * below, on the rows we already hold.
   */
  const { data: followsRaw, error } = await supabase
    .from("follows")
    .select(
      "follower_id, profiles!follows_follower_id_fkey(id, username, full_name, university, avatar_url)"
    )
    .eq("following_id", profile.id);

  if (error) {
    // The real cause goes to the server log. The reader gets the route's
    // error boundary, which offers a retry and says nothing about Postgres.
    console.error("Failed to load followers", { username, error });
    throw new Error("Follower list unavailable");
  }

  /**
   * A row whose embedded profile came back empty is one RLS declined to show.
   * Dropping it is the point: the list can be shorter than the follower count
   * on the profile, and that is the private profile staying private.
   */
  const followers = sortRelationshipProfiles(
    (followsRaw ?? [])
      .map((row) => (Array.isArray(row.profiles) ? row.profiles[0] : row.profiles))
      .filter(Boolean) as RelationshipProfile[]
  );

  const displayName = profile.full_name ?? profile.username;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <Link
          href={`/${username}`}
          className="focus-ring mb-2 block text-sm font-medium text-emerald-ink hover:text-emerald-brand"
        >
          ← Back to profile
        </Link>
        <h1 className="font-display text-2xl font-semibold text-ink">
          Followers of {displayName}
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          {followers.length} follower{followers.length === 1 ? "" : "s"}
        </p>
      </div>

      {followers.length === 0 ? (
        <EmptyState
          title="No followers yet."
          description={`Work published by ${displayName} will reach readers here first.`}
        />
      ) : (
        <ul className="space-y-3">
          {followers.map((follower) => (
            <li key={follower.id}>
              <Link
                href={`/${follower.username}`}
                className="focus-ring flex items-center gap-3 rounded-xl border border-card-border bg-card p-4 transition-colors hover:border-card-border-hover"
              >
                <UserAvatar
                  name={follower.full_name ?? follower.username}
                  src={follower.avatar_url}
                  size={40}
                  className="shrink-0"
                />
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">
                    {follower.full_name ?? follower.username}
                  </p>
                  <p className="truncate text-sm text-ink-muted">
                    @{follower.username}
                    {follower.university ? ` · ${follower.university}` : ""}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
