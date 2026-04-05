import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

const OPPORTUNITY_LABELS: Record<string, string> = {
  internship: "Internship",
  research: "Research",
  fellowship: "Fellowship",
  job: "Job",
};

const OPPORTUNITY_STYLES: Record<string, string> = {
  internship: "bg-blue-50 text-blue-700",
  research: "bg-purple-50 text-purple-700",
  fellowship: "bg-amber-50 text-amber-700",
  job: "bg-emerald-50 text-emerald-700",
};

export default async function TalentPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // public profiles visible to all; partners_only visible to authenticated only
  let query = supabase
    .from("talent_profiles")
    .select(`
      id, open_to_opportunities, opportunity_types, skills, visibility, updated_at,
      profiles!talent_profiles_user_id_fkey (id, username, full_name, university, avatar_url)
    `)
    .eq("open_to_opportunities", true)
    .neq("visibility", "private")
    .order("updated_at", { ascending: false });

  if (!user) {
    query = query.eq("visibility", "public");
  }

  const { data: talentsRaw } = await query;

  const talents = (talentsRaw ?? []).map((t) => ({
    ...t,
    profiles: Array.isArray(t.profiles) ? t.profiles[0] : t.profiles,
  }));

  return (
    <div className="max-w-4xl mx-auto">
      {/* Hero */}
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Talent Directory</h1>
        <p className="text-gray-500 text-lg">
          Discover Africa&apos;s Brightest Student Minds
        </p>
        {!user && (
          <p className="text-xs text-gray-400 mt-2">
            <Link href="/login" className="text-emerald-brand hover:underline">Sign in</Link> to see all talent profiles
          </p>
        )}
      </div>

      {talents.length === 0 ? (
        <div className="text-center py-16 text-gray-400 bg-white rounded-xl border border-gray-200">
          <div className="text-3xl mb-2">🌟</div>
          <p className="font-medium text-gray-600">No talent profiles yet.</p>
          <p className="text-sm mt-1">
            <Link href="/login" className="text-emerald-brand hover:underline">
              Create your profile
            </Link>{" "}
            to be discovered.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {talents.map((t) => {
            const profile = t.profiles;
            return (
              <Link
                key={t.id}
                href={profile ? `/${profile.username}?tab=opportunities` : "#"}
                className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow flex flex-col"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-sm flex-shrink-0">
                    {profile?.full_name?.charAt(0)?.toUpperCase() ?? "?"}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 text-sm truncate">
                      {profile?.full_name}
                    </p>
                    <p className="text-xs text-gray-400 truncate">
                      {profile?.university}
                    </p>
                  </div>
                </div>

                {t.opportunity_types && t.opportunity_types.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {t.opportunity_types.slice(0, 3).map((type: string) => (
                      <span
                        key={type}
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          OPPORTUNITY_STYLES[type] ?? "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {OPPORTUNITY_LABELS[type] ?? type}
                      </span>
                    ))}
                  </div>
                )}

                {t.skills && t.skills.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-auto">
                    {t.skills.slice(0, 4).map((skill: string) => (
                      <span
                        key={skill}
                        className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full"
                      >
                        {skill}
                      </span>
                    ))}
                    {t.skills.length > 4 && (
                      <span className="text-xs text-gray-400">+{t.skills.length - 4}</span>
                    )}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
