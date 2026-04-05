import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function AmbassadorsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Fetch active ambassadors with profile info
  const { data: ambassadorsRaw } = await supabase
    .from("campus_ambassadors")
    .select(`
      id, university, referral_count,
      profiles!campus_ambassadors_user_id_fkey (username, full_name, avatar_url)
    `)
    .eq("status", "active")
    .order("referral_count", { ascending: false });

  const ambassadors = (ambassadorsRaw ?? []).map((a) => ({
    ...a,
    profiles: Array.isArray(a.profiles) ? a.profiles[0] : a.profiles,
  }));

  // Check if user is already an ambassador
  let existingApplication = null;
  if (user) {
    const { data } = await supabase
      .from("campus_ambassadors")
      .select("status")
      .eq("user_id", user.id)
      .single();
    existingApplication = data;
  }

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
          Represent ThinkAfrica at your university and help grow Africa&apos;s largest student intellectual community.
        </p>

        {existingApplication ? (
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
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-emerald-brand text-white font-medium rounded-lg hover:bg-emerald-600 transition-colors"
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
            title: "Represent Your University",
            desc: "Be the official ThinkAfrica voice at your campus and connect students to the platform.",
          },
          {
            icon: "🏆",
            title: "Earn Bonus Points",
            desc: "Get extra points for every student you refer who publishes their first post.",
          },
          {
            icon: "✨",
            title: "Get Featured",
            desc: "Your profile is highlighted across the platform as a community leader.",
          },
          {
            icon: "🎙",
            title: "Exclusive Access",
            desc: "Access private webinars, mentor sessions, and early platform features.",
          },
        ].map((item) => (
          <div key={item.title} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="text-2xl mb-2">{item.icon}</div>
            <h3 className="font-semibold text-gray-900 mb-1">{item.title}</h3>
            <p className="text-sm text-gray-500">{item.desc}</p>
          </div>
        ))}
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
