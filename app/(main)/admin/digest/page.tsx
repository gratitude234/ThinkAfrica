import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import DigestSendButton from "./DigestSendButton";

export default async function AdminDigestPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail || user.email !== adminEmail) {
    return <div className="max-w-2xl mx-auto py-20 text-center text-gray-500">Access denied.</div>;
  }

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { data: topPosts },
    { data: topDebateRaw },
    { data: upcomingWebinars },
    { data: openFellowships },
    { data: weeklyPostsForContrib },
  ] = await Promise.all([
    supabase
      .from("posts")
      .select("id, title, slug, view_count, type, published_at, profiles!posts_author_id_fkey(full_name, username)")
      .eq("status", "published")
      .gte("published_at", weekAgo)
      .order("view_count", { ascending: false })
      .limit(5),

    supabase
      .from("debates")
      .select("id, title, status, debate_arguments(count)")
      .order("created_at", { ascending: false })
      .limit(10),

    supabase
      .from("webinars")
      .select("id, title, scheduled_at, status")
      .eq("status", "scheduled")
      .gte("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(3),

    supabase
      .from("fellowships")
      .select("id, title, sponsor_name, deadline")
      .eq("status", "open")
      .order("deadline", { ascending: true, nullsFirst: false })
      .limit(3),

    supabase
      .from("posts")
      .select("author_id, type, profiles!posts_author_id_fkey(full_name, username)")
      .eq("status", "published")
      .gte("published_at", weekAgo),
  ]);

  // Top debate (most arguments)
  const topDebate = (topDebateRaw ?? [])
    .map((d) => ({ ...d, argCount: Array.isArray(d.debate_arguments) ? d.debate_arguments.length : (d.debate_arguments as { count: number } | null)?.count ?? 0 }))
    .sort((a, b) => b.argCount - a.argCount)[0] ?? null;

  // Top contributor this week
  const POST_POINTS: Record<string, number> = { blog: 10, essay: 20, research: 50, policy_brief: 30 };
  const contribMap: Record<string, { full_name: string; username: string; pts: number }> = {};
  for (const p of weeklyPostsForContrib ?? []) {
    const profile = Array.isArray(p.profiles) ? p.profiles[0] : p.profiles;
    if (!profile) continue;
    if (!contribMap[p.author_id]) contribMap[p.author_id] = { ...profile, pts: 0 };
    contribMap[p.author_id].pts += POST_POINTS[p.type] ?? 10;
  }
  const topContrib = Object.values(contribMap).sort((a, b) => b.pts - a.pts)[0] ?? null;

  const posts = (topPosts ?? []).map((p) => ({
    ...p,
    profiles: Array.isArray(p.profiles) ? p.profiles[0] : p.profiles,
  }));

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Weekly Digest Preview</h1>
          <p className="text-gray-500 text-sm mt-1">What this week&apos;s email digest would contain</p>
        </div>
        <DigestSendButton />
      </div>

      <div className="space-y-6">
        {/* Top posts */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Top Posts This Week</h2>
          {posts.length === 0 ? (
            <p className="text-sm text-gray-400">No posts this week.</p>
          ) : (
            <div className="space-y-3">
              {posts.map((post) => (
                <Link key={post.id} href={`/post/${post.slug}`} className="flex items-center justify-between gap-3 p-3 rounded-lg hover:bg-gray-50 group">
                  <div>
                    <p className="text-sm font-medium text-gray-900 group-hover:text-emerald-brand transition-colors">{post.title}</p>
                    <p className="text-xs text-gray-400">{post.profiles?.full_name} · {post.view_count} views</p>
                  </div>
                  <span className="text-xs text-gray-400 flex-shrink-0">{formatDate(post.published_at ?? "")}</span>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Top debate */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-3">Top Debate This Week</h2>
          {topDebate ? (
            <Link href={`/debates/${topDebate.id}`} className="block p-3 rounded-lg hover:bg-gray-50 group">
              <p className="text-sm font-medium text-gray-900 group-hover:text-emerald-brand transition-colors">{topDebate.title}</p>
              <p className="text-xs text-gray-400 mt-0.5">{topDebate.argCount} arguments · {topDebate.status}</p>
            </Link>
          ) : <p className="text-sm text-gray-400">No debates this week.</p>}
        </section>

        {/* Upcoming webinars */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-3">Upcoming Webinars</h2>
          {(upcomingWebinars ?? []).length === 0 ? (
            <p className="text-sm text-gray-400">No upcoming webinars.</p>
          ) : (
            <div className="space-y-2">
              {(upcomingWebinars ?? []).map((w) => (
                <Link key={w.id} href={`/webinars/${w.id}`} className="flex items-center justify-between gap-3 p-3 rounded-lg hover:bg-gray-50 group">
                  <p className="text-sm font-medium text-gray-900 group-hover:text-emerald-brand transition-colors">{w.title}</p>
                  <span className="text-xs text-gray-400 flex-shrink-0">{formatDate(w.scheduled_at)}</span>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Fellowships */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-3">Open Fellowships</h2>
          {(openFellowships ?? []).length === 0 ? (
            <p className="text-sm text-gray-400">No open fellowships.</p>
          ) : (
            <div className="space-y-2">
              {(openFellowships ?? []).map((f) => (
                <Link key={f.id} href={`/fellowships/${f.id}`} className="flex items-center justify-between gap-3 p-3 rounded-lg hover:bg-gray-50 group">
                  <div>
                    <p className="text-sm font-medium text-gray-900 group-hover:text-emerald-brand transition-colors">{f.title}</p>
                    {f.sponsor_name && <p className="text-xs text-gray-400">by {f.sponsor_name}</p>}
                  </div>
                  {f.deadline && <span className="text-xs text-gray-400 flex-shrink-0">Due {formatDate(f.deadline)}</span>}
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Top contributor */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-3">Top Contributor This Week</h2>
          {topContrib ? (
            <Link href={`/${topContrib.username}`} className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 group">
              <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-sm flex-shrink-0">
                {topContrib.full_name?.charAt(0)?.toUpperCase() ?? "?"}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900 group-hover:text-emerald-brand transition-colors">{topContrib.full_name}</p>
                <p className="text-xs text-gray-400">{topContrib.pts} pts this week</p>
              </div>
            </Link>
          ) : <p className="text-sm text-gray-400">No activity this week.</p>}
        </section>
      </div>
    </div>
  );
}
