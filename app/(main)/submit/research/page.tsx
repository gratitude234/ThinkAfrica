import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ResearchSubmissionForm, {
  type ResearchDraft,
  type SubmittingAuthor,
} from "./ResearchSubmissionForm";
import type { PostReferenceRecord } from "@/lib/types";
import type { CoAuthorProfile } from "@/components/collaboration/CoAuthorPicker";
import { isAiTopicSuggestionsEnabled } from "@/lib/featureFlags";
import { splitLegacyResearchTags } from "@/lib/tags";

interface PageProps {
  searchParams: Promise<{ draft?: string }>;
}

export default async function ResearchSubmitPage({ searchParams }: PageProps) {
  const { draft: draftId } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirectTo=${encodeURIComponent("/submit/research")}`);
  }

  let draft: ResearchDraft | null = null;
  let references: PostReferenceRecord[] = [];
  let coAuthors: CoAuthorProfile[] = [];

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, full_name, university")
    .eq("id", user.id)
    .single();
  const author: SubmittingAuthor | null = profile
    ? {
        username: profile.username as string,
        fullName: (profile.full_name as string | null) ?? null,
        university: (profile.university as string | null) ?? null,
      }
    : null;

  if (draftId) {
    const separateResearchKeywords = isAiTopicSuggestionsEnabled();
    const { data: postData } = await supabase
      .from("posts")
      .select(
        separateResearchKeywords
          ? "id, title, excerpt, tags, research_keywords, status, current_round, document_path, document_original_name, document_mime_type, document_size_bytes"
          : "id, title, excerpt, tags, status, current_round, document_path, document_original_name, document_mime_type, document_size_bytes"
      )
      .eq("id", draftId)
      .eq("author_id", user.id)
      .eq("type", "research")
      .single();
    const post = postData as unknown as {
      id: string;
      title: string;
      excerpt: string | null;
      tags: string[] | null;
      research_keywords?: string[] | null;
      status: string;
      current_round: number | null;
      document_path?: string | null;
      document_original_name?: string | null;
      document_mime_type?: string | null;
      document_size_bytes?: number | null;
    } | null;

    if (post) {
      const legacyFields = splitLegacyResearchTags(
        (post.tags as string[] | null) ?? []
      );
      const storedKeywords = (
        post as { research_keywords?: string[] | null }
      ).research_keywords;
      const hasSeparatedKeywords =
        separateResearchKeywords && Array.isArray(storedKeywords);
      draft = {
        id: post.id,
        title: post.title,
        abstract: post.excerpt ?? "",
        topics: hasSeparatedKeywords
          ? ((post.tags as string[] | null) ?? [])
          : legacyFields.topics,
        keywords: hasSeparatedKeywords
          ? (storedKeywords ?? [])
          : legacyFields.keywords,
        status: post.status,
        currentRound: post.current_round ?? 1,
        document: {
          documentPath:
            (post as { document_path?: string | null }).document_path ?? null,
          originalName:
            (post as { document_original_name?: string | null })
              .document_original_name ?? null,
          mimeType:
            (post as { document_mime_type?: string | null }).document_mime_type ??
            null,
          sizeBytes:
            (post as { document_size_bytes?: number | null })
              .document_size_bytes ?? null,
        },
      };

      const [{ data: referenceRows }, { data: authorRows }] = await Promise.all([
        supabase
          .from("post_references")
          .select("*")
          .eq("post_id", draftId)
          .order("display_order", { ascending: true }),
        supabase
          .from("post_authors")
          .select(
            "user_id, profile:profiles!post_authors_user_id_fkey(id, username, full_name, university, field_of_study)"
          )
          .eq("post_id", draftId)
          .neq("user_id", user.id)
          .order("display_order", { ascending: true }),
      ]);

      references = (referenceRows ?? []) as PostReferenceRecord[];
      coAuthors = ((authorRows ?? []) as Array<Record<string, unknown>>)
        .map((row) => {
          const profile = Array.isArray(row.profile)
            ? row.profile[0]
            : row.profile;
          return profile as CoAuthorProfile | null;
        })
        .filter((profile): profile is CoAuthorProfile => Boolean(profile));
    }
  }

  return (
    <ResearchSubmissionForm
      userId={user.id}
      author={author}
      initialDraft={draft}
      initialReferences={references}
      initialCoAuthors={coAuthors}
    />
  );
}
