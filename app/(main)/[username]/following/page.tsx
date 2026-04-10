import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

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

  const { data: followsRaw } = await supabase
    .from("follows")
    .select("following_id, profiles!follows_following_id_fkey(id, username, full_name, university, avatar_url)")
    .eq("follower_id", profile.id)
    .order("created_at", { ascending: false });

  const following = (followsRaw ?? []).map((f) => {
    const p = Array.isArray(f.profiles) ? f.profiles[0] : f.profiles;
    return p;
  }).filter(Boolean);

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <Link href={`/${username}`} className="text-sm text-emerald-600 hover:text-emerald-700 mb-2 block">
          ← Back to profile
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">
          {profile.full_name ?? profile.username} is following
        </h1>
        <p className="text-gray-500 text-sm mt-1">{following.length} following</p>
      </div>

      {following.length === 0 ? (
        <div className="text-center py-12 text-gray-400">Not following anyone yet.</div>
      ) : (
        <div className="space-y-3">
          {following.map((person) => (
            <Link
              key={person!.id}
              href={`/${person!.username}`}
              className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl p-4 hover:shadow-sm transition-shadow"
            >
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold flex-shrink-0">
                {person!.full_name?.charAt(0)?.toUpperCase() ?? "?"}
              </div>
              <div>
                <p className="font-medium text-gray-900">{person!.full_name}</p>
                <p className="text-sm text-gray-400">
                  @{person!.username}
                  {person!.university && ` · ${person!.university}`}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
