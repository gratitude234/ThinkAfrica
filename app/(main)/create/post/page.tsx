import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPostMetadataTitle } from "@/lib/postDisplay";
import PostComposerForm from "./PostComposerForm";

interface PageProps {
  searchParams: Promise<{ inResponseTo?: string }>;
}

export default async function CreatePostPage({ searchParams }: PageProps) {
  const { inResponseTo } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // The middleware (proxy.ts) already protects /create and preserves the
    // full path+query on its own login redirect -- this inline check is a
    // defense-in-depth fallback, so it mirrors that same full-destination
    // behavior rather than dropping the response's parent id.
    const destination = inResponseTo
      ? `/create/post?inResponseTo=${encodeURIComponent(inResponseTo)}`
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

  return (
    <div className="-mx-4 -mb-32 -mt-6 min-h-[calc(100dvh-87px)] bg-white px-5 py-5 sm:mx-auto sm:mb-0 sm:mt-0 sm:min-h-[600px] sm:max-w-[640px] sm:rounded-xl sm:border sm:border-gray-200 sm:p-6 sm:shadow-[0_12px_32px_rgb(17_24_39/0.08)]">
      <PostComposerForm userId={user.id} parentPost={parentPost} />
    </div>
  );
}
