import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

interface RouteProps {
  params: Promise<{ postId: string }>;
}

async function canAccessDocument({
  postId,
  userId,
}: {
  postId: string;
  userId: string | null;
}) {
  const admin = createAdminClient();
  const { data: post } = await admin
    .from("posts")
    .select("id, author_id, status, document_path")
    .eq("id", postId)
    .eq("type", "research")
    .single();

  if (!post?.document_path) {
    return { allowed: false, path: null as string | null, reason: "Document not found." };
  }

  if (post.status === "published") {
    return { allowed: true, path: post.document_path as string, reason: null };
  }

  if (!userId) {
    return { allowed: false, path: null, reason: "Authentication required." };
  }

  if (post.author_id === userId) {
    return { allowed: true, path: post.document_path as string, reason: null };
  }

  const [{ data: profile }, { data: coAuthor }, { data: review }] = await Promise.all([
    admin.from("profiles").select("role").eq("id", userId).single(),
    admin
      .from("post_authors")
      .select("user_id")
      .eq("post_id", postId)
      .eq("user_id", userId)
      .maybeSingle(),
    admin
      .from("post_reviews")
      .select("reviewer_id")
      .eq("post_id", postId)
      .eq("reviewer_id", userId)
      .maybeSingle(),
  ]);

  const role = profile?.role;
  const elevated = role === "editor" || role === "admin";

  if (elevated || coAuthor || review) {
    return { allowed: true, path: post.document_path as string, reason: null };
  }

  return { allowed: false, path: null, reason: "You do not have access to this document." };
}

export async function GET(_request: NextRequest, { params }: RouteProps) {
  const { postId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const access = await canAccessDocument({ postId, userId: user?.id ?? null });

  if (!access.allowed || !access.path) {
    return NextResponse.json(
      { error: access.reason ?? "Not allowed." },
      { status: access.reason === "Authentication required." ? 401 : 403 }
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from("research-documents")
    .createSignedUrl(access.path, 60 * 10);

  if (error || !data?.signedUrl) {
    return NextResponse.json(
      { error: error?.message ?? "Unable to create document link." },
      { status: 500 }
    );
  }

  return NextResponse.redirect(data.signedUrl);
}
