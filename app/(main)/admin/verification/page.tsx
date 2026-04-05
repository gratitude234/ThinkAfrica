import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import VerificationActions from "./VerificationActions";

const VERIFIED_TYPE_STYLES: Record<string, string> = {
  student: "bg-emerald-50 text-emerald-700 border-emerald-200",
  researcher: "bg-purple-50 text-purple-700 border-purple-200",
  faculty: "bg-amber-50 text-amber-700 border-amber-200",
  institution: "bg-blue-50 text-blue-700 border-blue-200",
};

export default async function AdminVerificationPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail || user.email !== adminEmail) {
    return <div className="max-w-2xl mx-auto py-20 text-center text-gray-500">Access denied.</div>;
  }

  // Get users with 3+ published posts
  const { data: postCounts } = await supabase
    .from("posts")
    .select("author_id")
    .eq("status", "published");

  const authorMap: Record<string, number> = {};
  for (const p of postCounts ?? []) {
    authorMap[p.author_id] = (authorMap[p.author_id] ?? 0) + 1;
  }
  const eligibleIds = Object.entries(authorMap)
    .filter(([, count]) => count >= 3)
    .map(([id]) => id);

  let profiles: {
    id: string; full_name: string | null; username: string; university: string | null;
    points: number; verified: boolean; verified_type: string | null;
  }[] = [];

  if (eligibleIds.length > 0) {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, username, university, points, verified, verified_type")
      .in("id", eligibleIds)
      .order("points", { ascending: false });
    profiles = data ?? [];
  }

  const alreadyVerified = profiles.filter((p) => p.verified);
  const notVerified = profiles.filter((p) => !p.verified);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Contributor Verification</h1>
        <p className="text-gray-500 text-sm mt-1">
          {profiles.length} eligible contributors (3+ posts) · {alreadyVerified.length} verified
        </p>
      </div>

      {profiles.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          No contributors with 3+ published posts yet.
        </div>
      ) : (
        <div className="space-y-3">
          {[...alreadyVerified, ...notVerified].map((profile) => (
            <div
              key={profile.id}
              className={`bg-white rounded-xl border border-gray-200 p-5 flex items-center justify-between gap-4 ${!profile.verified ? "opacity-80" : ""}`}
            >
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="font-semibold text-gray-900 text-sm">{profile.full_name}</p>
                  {profile.verified && profile.verified_type && (
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border capitalize ${VERIFIED_TYPE_STYLES[profile.verified_type] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
                      ✓ {profile.verified_type}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400">
                  @{profile.username} · {profile.university} ·{" "}
                  {authorMap[profile.id]} posts · {profile.points} pts
                </p>
              </div>
              <VerificationActions
                userId={profile.id}
                verified={profile.verified}
                verifiedType={profile.verified_type}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
