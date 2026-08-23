import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPostMetadataTitle } from "@/lib/postDisplay";
import type { ContributionSnapshot } from "@/lib/contribution";
import type { PostReferenceRecord } from "@/lib/types";
import UniversalComposer from "./UniversalComposer";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function value(params: Record<string, string | string[] | undefined>, key: string) {
  const candidate = params[key];
  return Array.isArray(candidate) ? candidate[0] : candidate;
}

function safeReturnTo(candidate: string | undefined, fallback: string) {
  return candidate?.startsWith("/") && !candidate.startsWith("//") ? candidate : fallback;
}

export default async function WritePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const draftParam = value(params, "draft") ?? null;
  const promptParam = value(params, "prompt") ?? null;
  if (value(params, "kind") === "research" || value(params, "type") === "research") {
    redirect(draftParam ? `/submit/research?draft=${encodeURIComponent(draftParam)}` : "/submit/research");
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const query = new URLSearchParams();
  for (const [key, raw] of Object.entries(params)) {
    const item = Array.isArray(raw) ? raw[0] : raw;
    if (item && key !== "kind" && key !== "type") query.set(key, item);
  }
  const destination = `/write${query.size ? `?${query.toString()}` : ""}`;
  if (!user) redirect(`/login?redirectTo=${encodeURIComponent(destination)}`);

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, username, university")
    .eq("id", user.id)
    .maybeSingle();

  let draft: Record<string, unknown> | null = null;
  let references: PostReferenceRecord[] = [];
  let collaborators: ContributionSnapshot["collaborators"] = [];
  if (draftParam) {
    const { data } = await supabase
      .from("posts")
      .select("id, title, excerpt, content, tags, cover_image_url, in_response_to, type, content_kind, status, author_id, updated_at")
      .eq("id", draftParam)
      .eq("author_id", user.id)
      .eq("status", "draft")
      .maybeSingle();
    if (!data) notFound();
    if (data.type === "research" || data.content_kind === "research") {
      redirect(`/submit/research?draft=${encodeURIComponent(draftParam)}`);
    }
    draft = data as Record<string, unknown>;
    const [{ data: referenceRows }, { data: authorRows }] = await Promise.all([
      supabase.from("post_references").select("*").eq("post_id", draftParam).order("display_order"),
      supabase
        .from("post_authors")
        .select("user_id, profile:profiles!post_authors_user_id_fkey(id, username, full_name, university, field_of_study)")
        .eq("post_id", draftParam)
        .neq("user_id", user.id)
        .order("display_order"),
    ]);
    references = (referenceRows ?? []) as PostReferenceRecord[];
    collaborators = ((authorRows ?? []) as Array<Record<string, unknown>>).flatMap((row) => {
      const item = Array.isArray(row.profile) ? row.profile[0] : row.profile;
      return item ? [item as ContributionSnapshot["collaborators"][number]] : [];
    });
  }

  let parentId = (draft?.in_response_to as string | null | undefined) ?? value(params, "inResponseTo") ?? null;
  const parentSlugParam = value(params, "response_to");
  if (!parentId && parentSlugParam) {
    const { data: parentBySlug } = await supabase
      .from("posts")
      .select("id")
      .eq("slug", parentSlugParam)
      .eq("status", "published")
      .maybeSingle();
    parentId = parentBySlug?.id ?? null;
  }

  let parent: { id: string; displayTitle: string; slug: string } | null = null;
  if (parentId) {
    const { data: row } = await supabase
      .from("posts")
      .select("id, title, slug, profiles!posts_author_id_fkey(username, full_name)")
      .eq("id", parentId)
      .eq("status", "published")
      .maybeSingle();
    if (row) {
      const author = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      parent = { id: row.id, slug: row.slug, displayTitle: getPostMetadataTitle(row, author) };
    }
  }

  let prompt: { id: string; title: string; promptText: string; responseQuestion: string | null } | null = null;
  if (promptParam) {
    const [{ data: membership }, { data: ambassador }, { data: promptRow }] = await Promise.all([
      supabase.from("campus_cohort_memberships").select("cohort_id").eq("user_id", user.id).maybeSingle(),
      supabase.from("campus_ambassadors").select("campus_cohort_id").eq("user_id", user.id).eq("status", "active").maybeSingle(),
      supabase
        .from("campus_editorial_prompts")
        .select("id, cohort_id, title, prompt_text, response_question, starts_at, ends_at, active, campus_cohorts!inner(status)")
        .eq("id", promptParam)
        .maybeSingle(),
    ]);
    const cohort = promptRow ? (Array.isArray(promptRow.campus_cohorts) ? promptRow.campus_cohorts[0] : promptRow.campus_cohorts) : null;
    const now = Date.now();
    const startsAt = promptRow?.starts_at ? Date.parse(promptRow.starts_at) : Number.NaN;
    const endsAt = promptRow?.ends_at ? Date.parse(promptRow.ends_at) : null;
    if (
      promptRow?.active && cohort && ["selected", "active"].includes(cohort.status) &&
      (membership?.cohort_id === promptRow.cohort_id || ambassador?.campus_cohort_id === promptRow.cohort_id) &&
      Number.isFinite(startsAt) && startsAt <= now && (endsAt === null || endsAt > now)
    ) {
      prompt = { id: promptRow.id, title: promptRow.title, promptText: promptRow.prompt_text, responseQuestion: promptRow.response_question };
    }
  }

  const starterTag = value(params, "tag");
  const initialSnapshot: ContributionSnapshot = {
    title: (draft?.title as string | null | undefined) ?? "",
    content: (draft?.content as string | null | undefined) ?? "",
    excerpt: (draft?.excerpt as string | null | undefined) ?? "",
    tags: (draft?.tags as string[] | null | undefined) ?? (starterTag ? [starterTag] : []),
    coverImageUrl: (draft?.cover_image_url as string | null | undefined) ?? "",
    references,
    collaborators,
    inResponseToId: parent?.id ?? null,
    promptId: prompt?.id ?? null,
  };
  const fallback = parent ? `/post/${parent.slug}` : "/";

  return (
    <UniversalComposer
      mode={draftParam ? "draft" : "new"}
      userId={user.id}
      profile={profile}
      initialSnapshot={initialSnapshot}
      draftId={draftParam}
      draftUpdatedAt={(draft?.updated_at as string | null | undefined) ?? null}
      returnTo={safeReturnTo(value(params, "returnTo"), fallback)}
      parent={parent}
      prompt={prompt}
    />
  );
}
