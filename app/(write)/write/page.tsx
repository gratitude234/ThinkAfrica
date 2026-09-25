import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseContentKind } from "@/lib/contentModel";
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

/**
 * Parameters old links still carry and the composer no longer honours.
 *
 * `kind` and `type` chose a format before there were two screens. The screen
 * is `editor=article` now, and a title still decides what is stored. `prompt`
 * attached a campus prompt, and `inResponseTo`, `response_to` and
 * `responseIntent` started a Response. The publishing reset removed both
 * paths. A link carrying any of them opens the ordinary composer, and they are
 * dropped from the sign-in destination so they are not carried forward.
 */
const RETIRED_PARAMS = new Set([
  "kind",
  "type",
  "prompt",
  "inResponseTo",
  "response_to",
  "responseIntent",
]);

export default async function WritePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const draftParam = value(params, "draft") ?? null;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const query = new URLSearchParams();
  for (const [key, raw] of Object.entries(params)) {
    const item = Array.isArray(raw) ? raw[0] : raw;
    if (item && !RETIRED_PARAMS.has(key)) query.set(key, item);
  }
  const destination = `/write${query.size ? `?${query.toString()}` : ""}`;
  if (!user) redirect(`/login?redirectTo=${encodeURIComponent(destination)}`);

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, username, university, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  let draft: Record<string, unknown> | null = null;
  let references: PostReferenceRecord[] = [];
  if (draftParam) {
    const { data } = await supabase
      .from("posts")
      .select("id, title, excerpt, content, tags, cover_image_url, content_kind, status, author_id, updated_at")
      .eq("id", draftParam)
      .eq("author_id", user.id)
      .eq("status", "draft")
      .maybeSingle();
    if (!data) notFound();
    // The legacy research refusal that stood here is gone with the rows it
    // refused: 20260915000005 normalized all five into Articles, so the three
    // research drafts among them open in the composer like any other draft.
    draft = data as Record<string, unknown>;
    const { data: referenceRows } = await supabase
      .from("post_references")
      .select("*")
      .eq("post_id", draftParam)
      .order("display_order");
    references = (referenceRows ?? []) as PostReferenceRecord[];
  }

  const starterTag = value(params, "tag");
  const initialSnapshot: ContributionSnapshot = {
    title: (draft?.title as string | null | undefined) ?? "",
    content: (draft?.content as string | null | undefined) ?? "",
    excerpt: (draft?.excerpt as string | null | undefined) ?? "",
    tags: (draft?.tags as string[] | null | undefined) ?? (starterTag ? [starterTag] : []),
    coverImageUrl: (draft?.cover_image_url as string | null | undefined) ?? "",
    references,
  };

  return (
    <UniversalComposer
      mode={draftParam ? "draft" : "new"}
      userId={user.id}
      profile={profile}
      initialSnapshot={initialSnapshot}
      initialSurface={parseContentKind(value(params, "editor"))}
      draftId={draftParam}
      draftUpdatedAt={(draft?.updated_at as string | null | undefined) ?? null}
      returnTo={safeReturnTo(value(params, "returnTo"), "/")}
    />
  );
}
