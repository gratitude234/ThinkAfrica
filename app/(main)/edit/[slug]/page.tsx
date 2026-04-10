import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import EditForm from "./EditForm";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function EditPage({ params }: PageProps) {
  const { slug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(`/login?redirectTo=/edit/${slug}`);

  const { data: post } = await supabase
    .from("posts")
    .select("id, title, excerpt, content, type, status, tags, cover_image_url, author_id")
    .eq("slug", slug)
    .single();

  if (!post) notFound();

  if (post.author_id !== user.id) {
    return (
      <div className="max-w-3xl mx-auto py-20 text-center">
        <p className="text-2xl font-bold text-gray-900 mb-2">Access denied</p>
        <p className="text-gray-500">You don&apos;t have permission to edit this post.</p>
      </div>
    );
  }

  return (
    <EditForm
      post={{
        id: post.id,
        title: post.title,
        excerpt: post.excerpt ?? null,
        content: post.content ?? null,
        type: post.type,
        status: post.status,
        tags: post.tags as string[] | null,
        cover_image_url: (post as { cover_image_url?: string | null }).cover_image_url ?? null,
      }}
      userId={user.id}
    />
  );
}
