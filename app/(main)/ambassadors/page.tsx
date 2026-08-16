import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function AmbassadorsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [ambassadorsResult, cohortsResult, applicationResult] = await Promise.all([
    supabase
      .from("campus_ambassadors")
      .select(`
        id, university, referral_count,
        profiles!campus_ambassadors_user_id_fkey (username, full_name, avatar_url)
      `)
      .eq("status", "active")
      .order("referral_count", { ascending: false }),
    supabase
      .from("campus_cohorts")
      .select("id, university, country, status")
      .in("status", ["selected", "active"])
      .order("university", { ascending: true }),
    user
      ? supabase
          .from("campus_ambassadors")
          .select("status")
          .eq("user_id", user.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const ambassadorsRaw = ambassadorsResult.data;
  const selectedCohorts = cohortsResult.data ?? [];

  const ambassadors = (ambassadorsRaw ?? []).map((a) => ({
    ...a,
    profiles: Array.isArray(a.profiles) ? a.profiles[0] : a.profiles,
  }));

  const existingApplication = applicationResult.data;

  return (
    <div className="max-w-4xl mx-auto">
      {/* Hero */}
      <div className="bg-gradient-to-r from-emerald-50 to-emerald-100 rounded-2xl p-8 mb-10 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-emerald-brand rounded-full mb-4">
          <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-3">
          Campus Ambassador Program
        </h1>
        <p className="text-gray-600 max-w-2xl mx-auto mb-6">
          Represent Indegenius at your university and help students turn ideas into lasting Intellectual Records.
        </p>

        {existingApplication?.status === "active" ? (
          <Link
            href="/ambassadors/dashboard"
            className="inline-flex min-h-11 items-center rounded-lg bg-emerald-brand px-6 text-sm font-semibold text-white transition-colors hover:bg-[#0E4B37]"
          >
            Open Ambassador Dashboard
          </Link>
        ) : existingApplication ? (
          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium ${
            existingApplication.status === "active"
              ? "bg-emerald-100 text-emerald-700"
              : existingApplication.status === "pending"
              ? "bg-amber-100 text-amber-700"
              : "bg-gray-100 text-gray-600"
          }`}>
            {existingApplication.status === "active"
              ? "You are an active ambassador"
              : existingApplication.status === "pending"
              ? "Application pending review"
              : "Application not active"}
          </div>
        ) : (
          <Link
            href={user ? "/ambassadors/apply" : "/login?redirectTo=/ambassadors/apply"}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-emerald-brand text-white font-medium rounded-lg hover:bg-[#0E4B37] transition-colors"
          >
            Apply to Become an Ambassador
          </Link>
        )}
      </div>

      {/* Benefits */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-12">
        {[
          {
            icon: "🎓",
            title: "Operate Your Campus Cohort",
            desc: "Run the shared editorial prompt and recurring programs at a selected campus.",
          },
          {
            icon: "🏆",
            title: "Develop Community Leadership",
            desc: "Practice editorial programming, discussion facilitation, and contributor support on your campus.",
          },
          {
            icon: "✨",
            title: "Build Publication Habits",
            desc: "Help contributors return for a second publication instead of stopping after their first.",
          },
          {
            icon: "🎙",
            title: "Create Response Loops",
            desc: "Connect campus ideas through questions, extensions, and evidence-backed counterpoints.",
          },
        ].map((item) => (
          <div key={item.title} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="text-2xl mb-2">{item.icon}</div>
            <h3 className="font-semibold text-gray-900 mb-1">{item.title}</h3>
            <p className="text-sm text-gray-500">{item.desc}</p>
          </div>
        ))}
      </div>

      <div className="mb-12">
        <h2 className="mb-1 text-xl font-bold text-gray-900">Selected Campus Cohorts</h2>
        <p className="mb-4 text-sm text-gray-500">
          Ambassador applications and programs are concentrated on these campuses.
        </p>
        {selectedCohorts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
            The first campus cohort has not been selected yet.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {selectedCohorts.map((cohort) => (
              <Link key={cohort.id} href="/campus" className="rounded-xl border border-gray-200 bg-white p-5 transition-colors hover:border-emerald-200">
                <p className="font-semibold text-gray-900">{cohort.university}</p>
                <p className="mt-1 text-xs text-gray-500">{cohort.country ?? "Country not set"}</p>
                <span className="mt-3 inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold capitalize text-emerald-700">{cohort.status}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Active ambassadors */}
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-4">
          Our Ambassadors ({ambassadors.length})
        </h2>
        {ambassadors.length === 0 ? (
          <div className="text-center py-10 text-gray-400 bg-white rounded-xl border border-gray-200">
            <p className="text-sm">No ambassadors yet. Be the first!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {ambassadors.map((amb) => {
              const profile = amb.profiles;
              return (
                <Link
                  key={amb.id}
                  href={profile ? `/${profile.username}` : "#"}
                  className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow text-center"
                >
                  <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-lg mx-auto mb-3">
                    {profile?.full_name?.charAt(0)?.toUpperCase() ?? "?"}
                  </div>
                  <p className="font-semibold text-gray-900">
                    {profile?.full_name ?? "Unknown"}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">{amb.university}</p>
                  <p className="text-xs text-emerald-600 mt-2 font-medium">
                    {amb.referral_count} referrals
                  </p>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
