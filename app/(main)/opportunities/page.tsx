import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { FEATURE_FLAGS } from "@/lib/featureFlags";
import UserAvatar from "@/components/ui/UserAvatar";

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

export default async function OpportunitiesPage() {
  const supabase = await createClient();

  const fellowshipPromise = FEATURE_FLAGS.fellowshipsSection
    ? supabase
        .from("fellowships")
        .select("id, title, sponsor_name, deadline, status")
        .eq("status", "open")
        .order("deadline", { ascending: true, nullsFirst: false })
        .limit(6)
    : Promise.resolve({ data: [] as never[] });

  const talentPromise = supabase
    .from("talent_profiles")
    .select(`
      id, opportunity_types, skills, updated_at,
      profiles!talent_profiles_user_id_fkey (id, username, full_name, university, avatar_url)
    `)
    .eq("open_to_opportunities", true)
    .eq("visibility", "public")
    .order("updated_at", { ascending: false })
    .limit(6);

  const [{ data: fellowshipsRaw }, { data: talentRaw }] = await Promise.all([
    fellowshipPromise,
    talentPromise,
  ]);

  const fellowships = fellowshipsRaw ?? [];
  const talents = (talentRaw ?? []).map((talent) => ({
    ...talent,
    profiles: Array.isArray(talent.profiles) ? talent.profiles[0] : talent.profiles,
  }));

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-bold text-gray-900">Opportunities</h1>
        <p className="mt-2 text-lg text-gray-500">
          Discover openings and signal that you&apos;re available for the right work.
        </p>
      </div>

      {FEATURE_FLAGS.fellowshipsSection && fellowships.length > 0 ? (
        <section className="mb-10">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Open fellowships</h2>
              <p className="mt-1 text-sm text-gray-500">
                Curated funding and fellowship opportunities for student thinkers.
              </p>
            </div>
            <Link
              href="/fellowships"
              className="text-sm font-medium text-emerald-brand hover:underline"
            >
              View all
            </Link>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {fellowships.map((fellowship) => (
              <Link
                key={fellowship.id}
                href={`/fellowships/${fellowship.id}`}
                className="rounded-xl border border-gray-200 bg-white p-5 transition-shadow hover:shadow-md"
              >
                <p className="text-base font-semibold text-gray-900">
                  {fellowship.title}
                </p>
                {fellowship.sponsor_name ? (
                  <p className="mt-1 text-sm text-emerald-brand">
                    {fellowship.sponsor_name}
                  </p>
                ) : null}
                {fellowship.deadline ? (
                  <p className="mt-3 text-xs text-gray-400">
                    Deadline: {new Date(fellowship.deadline).toLocaleDateString()}
                  </p>
                ) : null}
              </Link>
            ))}
          </div>
        </section>
      ) : (
        <section className="mb-10 rounded-2xl border border-gray-200 bg-white p-6 text-center">
          <h2 className="text-xl font-semibold text-gray-900">We&apos;re curating opportunities</h2>
          <p className="mt-2 text-sm text-gray-500">
            Check back soon - or{" "}
            <Link href="/settings" className="font-medium text-emerald-brand hover:underline">
              open your profile to opportunities
            </Link>{" "}
            so recruiters can find you.
          </p>
        </section>
      )}

      <section>
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-gray-900">
            Students open to opportunities
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Writers and researchers currently visible for internships, fellowships, and projects.
          </p>
        </div>

        {talents.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-canvas p-8 text-center">
            <p className="text-sm text-gray-500">
              No public opportunity profiles yet.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {talents.map((talent) => {
              const profile = talent.profiles;
              const displayName =
                profile?.full_name ?? profile?.username ?? "ThinkAfrika member";

              return (
                <Link
                  key={talent.id}
                  href={profile?.username ? `/${profile.username}` : "/settings"}
                  className="rounded-xl border border-gray-200 bg-white p-5 transition-shadow hover:shadow-md"
                >
                  <div className="mb-4 flex items-center gap-3">
                    <UserAvatar
                      name={displayName}
                      src={profile?.avatar_url ?? null}
                      size={40}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900">
                        {displayName}
                      </p>
                      <p className="truncate text-xs text-gray-400">
                        {profile?.university ?? "University not listed"}
                      </p>
                    </div>
                  </div>

                  {talent.opportunity_types && talent.opportunity_types.length > 0 ? (
                    <div className="mb-3 flex flex-wrap gap-1.5">
                      {talent.opportunity_types.slice(0, 3).map((type: string) => (
                        <span
                          key={type}
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            OPPORTUNITY_STYLES[type] ?? "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {OPPORTUNITY_LABELS[type] ?? type}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  {talent.skills && talent.skills.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {talent.skills.slice(0, 4).map((skill: string) => (
                        <span
                          key={skill}
                          className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
