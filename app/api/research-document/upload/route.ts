import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const MAX_RESEARCH_PDF_BYTES = 20 * 1024 * 1024;
const SETUP_ERROR =
  "Research document storage is not set up yet. Apply the research document migration.";

function isPdf(buffer: Buffer) {
  return buffer.length >= 5 && buffer.subarray(0, 5).toString("utf8") === "%PDF-";
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const postId = formData.get("postId")?.toString() ?? null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!postId) {
    return NextResponse.json(
      { error: "Save the research draft before uploading a PDF." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: post } = await admin
    .from("posts")
    .select("id, author_id, slug, status, type")
    .eq("id", postId)
    .eq("type", "research")
    .single();

  if (!post || post.author_id !== user.id) {
    return NextResponse.json(
      { error: "You do not have permission to attach a PDF to this research submission." },
      { status: 403 }
    );
  }

  if (!["draft", "pending_revision"].includes(post.status)) {
    return NextResponse.json(
      { error: "This research submission cannot accept a new PDF in its current review state." },
      { status: 409 }
    );
  }

  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".doc") || lowerName.endsWith(".docx")) {
    return NextResponse.json(
      {
        error:
          "Research papers must be submitted as PDF. Word or Google Docs files are fine for drafting, but export the final paper as PDF so formatting stays stable for review, citation, and archiving.",
      },
      { status: 400 }
    );
  }

  if (file.size > MAX_RESEARCH_PDF_BYTES) {
    return NextResponse.json(
      { error: "PDF must be under 20MB. Compress the final manuscript and try again." },
      { status: 400 }
    );
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  if (!isPdf(buffer)) {
    return NextResponse.json(
      {
        error:
          "Upload a valid PDF file. PDF is required because it preserves formatting for review, citation, and archiving.",
      },
      { status: 400 }
    );
  }

  const { data: bucket } = await admin.storage.getBucket("research-documents");
  if (!bucket) {
    return NextResponse.json({ error: SETUP_ERROR }, { status: 503 });
  }

  const path = `research/${user.id}/${crypto.randomUUID()}.pdf`;
  const { error: uploadError } = await admin.storage
    .from("research-documents")
    .upload(path, buffer, {
      contentType: "application/pdf",
      upsert: false,
    });

  if (uploadError) {
    const message =
      uploadError.message.includes("Bucket not found") ||
      uploadError.message.includes("bucket")
        ? SETUP_ERROR
        : uploadError.message;
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const { error: updateError } = await admin
    .from("posts")
    .update({
      document_path: path,
      document_original_name: file.name || "research-paper.pdf",
      document_mime_type: "application/pdf",
      document_size_bytes: file.size,
    })
    .eq("id", post.id)
    .eq("author_id", user.id);

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message ?? "Unable to attach the uploaded PDF to this draft." },
      { status: 500 }
    );
  }

  revalidatePath("/dashboard");
  revalidatePath("/admin/review");
  revalidatePath(`/submit/research`);
  if (post.slug) {
    revalidatePath(`/post/${post.slug}`);
  }

  return NextResponse.json({
    documentPath: path,
    originalName: file.name || "research-paper.pdf",
    mimeType: "application/pdf",
    sizeBytes: file.size,
  });
}
