import { notFound } from "next/navigation";
import Link from "next/link";
import EmptyState from "@/components/ui/EmptyState";
import UserAvatar from "@/components/ui/UserAvatar";
import { createClient } from "@/lib/supabase/server";
import { sortRelationshipProfiles, type RelationshipProfile } from "@/lib/profileRelationships";

interface PageProps {
  params: Promise<{ username: string }>;
}

export default async function FollowingPage({ params }: PageProps) {
  const { username } = await params;
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, username")
    .eq("username", username)
    .single();

  if (!profile) notFound();

  // See the note in the followers page: `follows` has no `created_at`, so the
  // ordering that used to be asked of Postgres here emptied the list instead.
  const { data: followsRaw, error } = await supabase
    .from("follows")
    .select(
      "following_id, profiles!follows_following_id_fkey(id, username, full_name, university, avatar_url)"
    )
    .eq("follower_id", profile.id);

  if (error) {
    console.error("Failed to load following list", { username, error });
    throw new Error("Following list unavailable");
  }

  const following = sortRelationshipProfiles(
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
          {displayName} is following
        </h1>
        <p className="mt-1 text-sm text-ink-muted">{following.length} following</p>
      </div>

      {following.length === 0 ? (
        <EmptyState
          title="Not following anyone yet."
          description={`People ${displayName} follows will be listed here.`}
        />
      ) : (
        <ul className="space-y-3">
          {following.map((person) => (
            <li key={person.id}>
              <Link
                href={`/${person.username}`}
                className="focus-ring flex items-center gap-3 rounded-xl border border-card-border bg-card p-4 transition-colors hover:border-card-border-hover"
              >
                <UserAvatar
                  name={person.full_name ?? person.username}
                  src={person.avatar_url}
                  size={40}
                  className="shrink-0"
                />
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">
                    {person.full_name ?? person.username}
                  </p>
                  <p className="truncate text-sm text-ink-muted">
                    @{person.username}
                    {person.university ? ` · ${person.university}` : ""}
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
