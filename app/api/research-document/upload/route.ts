import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const MAX_RESEARCH_PDF_BYTES = 20 * 1024 * 1024;

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

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (file.size > MAX_RESEARCH_PDF_BYTES) {
    return NextResponse.json({ error: "PDF must be under 20MB" }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  if (!isPdf(buffer)) {
    return NextResponse.json({ error: "Upload a valid PDF file." }, { status: 400 });
  }

  const admin = createAdminClient();
  const path = `research/${user.id}/${crypto.randomUUID()}.pdf`;
  const { error: uploadError } = await admin.storage
    .from("research-documents")
    .upload(path, buffer, {
      contentType: "application/pdf",
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  return NextResponse.json({
    documentPath: path,
    originalName: file.name || "research-paper.pdf",
    mimeType: "application/pdf",
    sizeBytes: file.size,
  });
}
