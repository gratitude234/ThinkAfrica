import { redirect } from "next/navigation";
import Link from "next/link";
import RetentionEventTracker from "@/components/retention/RetentionEventTracker";
import { createAdminActionClient } from "@/lib/adminAccess";
import { AdminAccessError, createAdminClient } from "@/lib/supabase/admin";
import { formatDate } from "@/lib/utils";
import DigestSendButton from "./DigestSendButton";

export default async function AdminDigestPage() {
  let supabase: ReturnType<typeof createAdminClient> | null = null;
  try {
    const result = await createAdminActionClient("digest.manage");
    supabase = result.admin;
  } catch (error) {
    if (error instanceof AdminAccessError && error.status === 401) redirect("/login");
    return <div className="max-w-2xl mx-auto py-20 text-center text-gray-500">Access denied.</div>;
  }

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { data: topPosts },
    { data: topDebateRaw },
    { data: openFellowships },
    { data: campusPromptsRaw },
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
      .from("fellowships")
      .select("id, title, sponsor_name, deadline")
      .eq("status", "open")
      .order("deadline", { ascending: true, nullsFirst: false })
      .limit(3),

    supabase
      .from("campus_editorial_prompts")
      .select(
        "id, title, prompt_text, response_question, campus_cohorts!inner(university, status)"
      )
      .eq("active", true)
      .lte("starts_at", new Date().toISOString())
      .or(`ends_at.is.null,ends_at.gt.${new Date().toISOString()}`)
      .in("campus_cohorts.status", ["selected", "active"])
      .order("starts_at", { ascending: false }),

  ]);

  // Top debate (most arguments)
  const topDebate = (topDebateRaw ?? [])
    .map((d) => ({ ...d, argCount: Array.isArray(d.debate_arguments) ? d.debate_arguments.length : (d.debate_arguments as { count: number } | null)?.count ?? 0 }))
    .sort((a, b) => b.argCount - a.argCount)[0] ?? null;

  const posts = (topPosts ?? []).map((p) => ({
    ...p,
    profiles: Array.isArray(p.profiles) ? p.profiles[0] : p.profiles,
  }));

  const campusPrompts: Array<
    (NonNullable<typeof campusPromptsRaw>[number]) & {
      campus: { university: string; status: string } | null;
    }
  > = [];
  const campusPromptKeys = new Set<string>();
  for (const prompt of campusPromptsRaw ?? []) {
    const campus = Array.isArray(prompt.campus_cohorts)
      ? prompt.campus_cohorts[0] ?? null
      : prompt.campus_cohorts;
    const campusKey = campus?.university?.trim().toLocaleLowerCase();
    if (!campusKey || campusPromptKeys.has(campusKey)) continue;
    campusPromptKeys.add(campusKey);
    campusPrompts.push({ ...prompt, campus });
  }

  return (
    <div className="max-w-3xl mx-auto">
      <RetentionEventTracker event="weekly_digest_previewed" metadata={{ source: "admin_digest" }} />

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Weekly Digest Preview</h1>
          <p className="text-gray-500 text-sm mt-1">
            Review the weekly digest, then send it to members with digest email enabled.
          </p>
        </div>
        <DigestSendButton />
      </div>

      <div className="space-y-6">
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-6">
          <h2 className="font-semibold text-gray-900">Campus-specific prompt sections</h2>
          <p className="mt-1 text-sm text-gray-500">
            Each item is sent only to digest recipients whose profile university matches that selected campus.
          </p>
          {campusPrompts.length === 0 ? (
            <p className="mt-4 text-sm text-gray-400">No campus prompt will be included.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {campusPrompts.map((prompt) => (
                <article key={prompt.id} className="rounded-lg border border-emerald-100 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                    {prompt.campus?.university ?? "Unknown campus"}
                  </p>
                  <h3 className="mt-1 text-sm font-semibold text-gray-900">{prompt.title}</h3>
                  <p className="mt-1 text-sm leading-5 text-gray-500">{prompt.prompt_text}</p>
                  {prompt.response_question ? <p className="mt-2 text-xs font-medium text-gray-700">Response question: {prompt.response_question}</p> : null}
                </article>
              ))}
            </div>
          )}
        </section>

        {/* Publications */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Publications Worth Reading</h2>
          {posts.length === 0 ? (
            <p className="text-sm text-gray-400">No new publications this week.</p>
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

        {/* Featured debate */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-3">Featured Debate</h2>
          {topDebate ? (
            <Link href={`/debates/${topDebate.id}`} className="block p-3 rounded-lg hover:bg-gray-50 group">
              <p className="text-sm font-medium text-gray-900 group-hover:text-emerald-brand transition-colors">{topDebate.title}</p>
              <p className="text-xs text-gray-400 mt-0.5">{topDebate.argCount} arguments · {topDebate.status}</p>
            </Link>
          ) : <p className="text-sm text-gray-400">No debate to feature right now.</p>}
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

      </div>
    </div>
  );
}
