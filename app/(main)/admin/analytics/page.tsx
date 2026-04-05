import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AnalyticsCharts from "./AnalyticsCharts";

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-xs text-gray-500 font-medium mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value.toLocaleString()}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export default async function AdminAnalyticsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail || user.email !== adminEmail) {
    return <div className="max-w-2xl mx-auto py-20 text-center text-gray-500">Access denied.</div>;
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Parallel data fetches
  const [
    { count: totalUsers },
    { data: postsByTypeRaw },
    { count: totalDebates },
    { count: totalWebinars },
    { count: totalApplications },
    { data: viewsData },
    { data: signupsRaw },
  ] = await Promise.all([
    supabase.from("profiles").select("*", { count: "exact", head: true }),

    supabase
      .from("posts")
      .select("type")
      .eq("status", "published"),

    supabase.from("debates").select("*", { count: "exact", head: true }),

    supabase.from("webinars").select("*", { count: "exact", head: true }),

    supabase.from("fellowship_applications").select("*", { count: "exact", head: true }),

    supabase.from("posts").select("view_count").eq("status", "published"),

    supabase
      .from("profiles")
      .select("created_at")
      .gte("created_at", thirtyDaysAgo)
      .order("created_at", { ascending: true }),
  ]);

  // Total page views
  const totalViews = (viewsData ?? []).reduce((sum, p) => sum + (p.view_count ?? 0), 0);

  // Posts by type
  const typeMap: Record<string, number> = {};
  for (const p of postsByTypeRaw ?? []) {
    typeMap[p.type] = (typeMap[p.type] ?? 0) + 1;
  }
  const postsByType = Object.entries(typeMap).map(([type, count]) => ({ type, count }));
  const totalPosts = (postsByTypeRaw ?? []).length;

  // Signups by day (last 30 days)
  const dayMap: Record<string, number> = {};
  // prefill all 30 days
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    dayMap[key] = 0;
  }
  for (const row of signupsRaw ?? []) {
    const key = row.created_at.slice(0, 10);
    if (key in dayMap) dayMap[key]++;
  }
  const signupsByDay = Object.entries(dayMap).map(([date, count]) => ({ date, count }));

  // Top universities (from profiles who have published posts)
  const { data: uniData } = await supabase
    .from("profiles")
    .select("university")
    .not("university", "is", null);

  const uniMap: Record<string, number> = {};
  for (const p of uniData ?? []) {
    if (!p.university) continue;
    uniMap[p.university] = (uniMap[p.university] ?? 0) + 1;
  }
  const topUniversities = Object.entries(uniMap)
    .map(([university, count]) => ({ university, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <p className="text-gray-500 text-sm mt-1">Platform-wide metrics</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <StatCard label="Registered Users" value={totalUsers ?? 0} />
        <StatCard label="Published Posts" value={totalPosts}
          sub={postsByType.map(p => `${p.count} ${p.type === "policy_brief" ? "briefs" : p.type + "s"}`).join(" · ")} />
        <StatCard label="Debates Created" value={totalDebates ?? 0} />
        <StatCard label="Webinars Hosted" value={totalWebinars ?? 0} />
        <StatCard label="Fellowship Applications" value={totalApplications ?? 0} />
        <StatCard label="Total Page Views" value={totalViews} />
      </div>

      <AnalyticsCharts
        signupsByDay={signupsByDay}
        postsByType={postsByType}
        topUniversities={topUniversities}
      />
    </div>
  );
}
