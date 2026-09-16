import { notFound, permanentRedirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

interface PageProps {
  params: Promise<{ citationId: string }>;
}

/**
 * LEGACY COMPATIBILITY -- remove after citation migration.
 *
 * Citation identity is no longer a product and this route no longer renders a
 * citation archive. Citation URLs were public, though, and may have been shared
 * or cited elsewhere, so a historical citation ID resolves to its post and the
 * reader lands on the ordinary reading page. Nothing here issues a citation.
 */
export default async function LegacyPublicationRedirect({ params }: PageProps) {
  const { citationId } = await params;
  const supabase = await createClient();

  const { data: post } = await supabase
    .from("posts")
    .select("slug")
    .eq("citation_id", citationId)
    .eq("status", "published")
    .maybeSingle();

  if (!post?.slug) notFound();

  permanentRedirect(`/post/${post.slug}`);
}
