import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPostMetadataTitle } from "@/lib/postDisplay";
import PostComposerForm from "./PostComposerForm";

interface PageProps {
  searchParams: Promise<{ inResponseTo?: string; prompt?: string }>;
}

export default async function CreatePostPage({ searchParams }: PageProps) {
  const { inResponseTo, prompt } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // The middleware (proxy.ts) already protects /create and preserves the
    // full path+query on its own login redirect -- this inline check is a
    // defense-in-depth fallback, so it mirrors that same full-destination
    // behavior rather than dropping the response's parent id.
    const destinationParams = new URLSearchParams();
    if (inResponseTo) destinationParams.set("inResponseTo", inResponseTo);
    if (prompt) destinationParams.set("prompt", prompt);
    const destinationQuery = destinationParams.toString();
    const destination = destinationQuery
      ? `/create/post?${destinationQuery}`
      : "/create/post";
    redirect(`/login?redirectTo=${encodeURIComponent(destination)}`);
  }

  // The server -- never the client -- resolves and validates the claimed
  // parent post. An invalid/unavailable parent degrades gracefully to a
  // plain Post composer (no banner) rather than erroring the whole page;
  // createPost() independently re-validates at publish time regardless
  // (see lib/responsePost.ts), so this resolution is display-only.
  let parentPost: { id: string; displayTitle: string } | null = null;
  if (inResponseTo) {
    const { data: parent } = await supabase
      .from("posts")
      .select("id, title, profiles!posts_author_id_fkey(username, full_name)")
      .eq("id", inResponseTo)
      .eq("status", "published")
      .maybeSingle();

    if (parent) {
      const author = Array.isArray(parent.profiles) ? parent.profiles[0] : parent.profiles;
      parentPost = { id: parent.id, displayTitle: getPostMetadataTitle(parent, author) };
    }
  }

  let editorialPrompt: {
    id: string;
    title: string;
    promptText: string;
    responseQuestion: string | null;
    topic: string | null;
  } | null = null;
  if (prompt) {
    const [
      { data: cohortMembership },
      { data: ambassadorAssignment },
      { data: promptRow },
    ] = await Promise.all([
      supabase
        .from("campus_cohort_memberships")
        .select("cohort_id")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("campus_ambassadors")
        .select("campus_cohort_id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle(),
      supabase
        .from("campus_editorial_prompts")
        .select(
          "id, cohort_id, title, prompt_text, response_question, topic, starts_at, ends_at, active, campus_cohorts!inner(status)"
        )
        .eq("id", prompt)
        .maybeSingle(),
    ]);
    const cohort = promptRow
      ? Array.isArray(promptRow.campus_cohorts)
        ? promptRow.campus_cohorts[0] ?? null
        : promptRow.campus_cohorts
      : null;
    const now = Date.now();
    const startsAt = promptRow?.starts_at ? new Date(promptRow.starts_at).getTime() : NaN;
    const endsAt = promptRow?.ends_at ? new Date(promptRow.ends_at).getTime() : null;
    const matchesCampus = Boolean(
      promptRow?.cohort_id &&
        (cohortMembership?.cohort_id === promptRow.cohort_id ||
          ambassadorAssignment?.campus_cohort_id === promptRow.cohort_id)
    );
    if (
      promptRow?.active &&
      cohort &&
      ["selected", "active"].includes(cohort.status) &&
      matchesCampus &&
      Number.isFinite(startsAt) &&
      startsAt <= now &&
      (endsAt === null || endsAt > now)
    ) {
      editorialPrompt = {
        id: promptRow.id,
        title: promptRow.title,
        promptText: promptRow.prompt_text,
        responseQuestion: promptRow.response_question,
        topic: promptRow.topic,
      };
    }
  }

  return (
    <div className="min-h-dvh bg-gray-100 md:flex md:justify-center md:px-6 md:pb-8 md:pt-[clamp(3rem,8vh,6rem)]">
      <div className="flex min-h-dvh w-full flex-col overflow-hidden bg-white md:min-h-0 md:max-w-[720px] md:rounded-2xl md:border md:border-gray-200 md:shadow-[0_12px_32px_rgb(17_24_39/0.08)]">
        <PostComposerForm
          userId={user.id}
          parentPost={parentPost}
          editorialPrompt={editorialPrompt}
        />
      </div>
    </div>
  );
}
