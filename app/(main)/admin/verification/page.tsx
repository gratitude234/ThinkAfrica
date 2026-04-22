import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import VerificationActions from "./VerificationActions";
import type { AppRole } from "@/lib/types";

const VERIFIED_TYPE_STYLES: Record<string, string> = {
  student: "bg-emerald-50 text-emerald-700 border-emerald-200",
  researcher: "bg-purple-50 text-purple-700 border-purple-200",
  faculty: "bg-amber-50 text-amber-700 border-amber-200",
  institution: "bg-blue-50 text-blue-700 border-blue-200",
};

export default async function AdminVerificationPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isBootstrapAdmin = user.email === process.env.ADMIN_EMAIL;
  const isRoleAdmin = currentProfile?.role === "admin";

  if (!isBootstrapAdmin && !isRoleAdmin) {
    return (
      <div className="mx-auto max-w-2xl py-20 text-center text-gray-500">
        Access denied.
      </div>
    );
  }

  const { data: postCounts } = await supabase
    .from("posts")
    .select("author_id")
    .eq("status", "published");

  const authorMap: Record<string, number> = {};
  for (const post of postCounts ?? []) {
    authorMap[post.author_id] = (authorMap[post.author_id] ?? 0) + 1;
  }

  const eligibleIds = Object.entries(authorMap)
    .filter(([, count]) => count >= 3)
    .map(([id]) => id);

  let profiles: {
    id: string;
    full_name: string | null;
    username: string;
    university: string | null;
    points: number;
    verified: boolean;
    verified_type: string | null;
    role: AppRole;
  }[] = [];

  if (eligibleIds.length > 0) {
    const { data } = await supabase
      .from("profiles")
      .select(
        "id, full_name, username, university, points, verified, verified_type, role"
      )
      .in("id", eligibleIds)
      .order("points", { ascending: false });

    profiles = (data ?? []) as typeof profiles;
  }

  const alreadyVerified = profiles.filter((profile) => profile.verified);
  const notVerified = profiles.filter((profile) => !profile.verified);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          Contributor Verification
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {profiles.length} eligible contributors (3+ posts) ·{" "}
          {alreadyVerified.length} verified
        </p>
      </div>

      {profiles.length === 0 ? (
        <div className="py-16 text-center text-gray-400">
          No contributors with 3+ published posts yet.
        </div>
      ) : (
        <div className="space-y-3">
          {[...alreadyVerified, ...notVerified].map((profile) => (
            <div
              key={profile.id}
              className={`flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white p-5 ${
                !profile.verified ? "opacity-80" : ""
              }`}
            >
              <div>
                <div className="mb-0.5 flex items-center gap-2">
                  <p className="text-sm font-semibold text-gray-900">
                    {profile.full_name}
                  </p>
                  {profile.verified && profile.verified_type ? (
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${
                        VERIFIED_TYPE_STYLES[profile.verified_type] ??
                        "border-gray-200 bg-gray-100 text-gray-600"
                      }`}
                    >
                      ✓ {profile.verified_type}
                    </span>
                  ) : null}
                  {profile.role !== "student" ? (
                    <span className="rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-xs font-medium capitalize text-purple-700">
                      {profile.role}
                    </span>
                  ) : null}
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
                currentRole={profile.role}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
