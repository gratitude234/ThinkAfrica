import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

interface RouteProps {
  params: Promise<{ assetId: string }>;
}

export async function GET(_request: Request, { params }: RouteProps) {
  const { assetId } = await params;
  const admin = createAdminClient();
  const { data: asset } = await admin
    .from("research_project_assets")
    .select("id, project_id, title, storage_path, visibility, upload_status")
    .eq("id", assetId)
    .maybeSingle();
  if (!asset?.storage_path || asset.upload_status !== "ready") {
    return NextResponse.json({ error: "Research asset not found." }, { status: 404 });
  }

  const { data: project } = await admin
    .from("research_projects")
    .select("owner_id, visibility, status")
    .eq("id", asset.project_id)
    .maybeSingle();
  if (!project) return NextResponse.json({ error: "Research project not found." }, { status: 404 });

  let allowed =
    asset.visibility === "public" &&
    project.visibility === "public" &&
    project.status !== "archived";

  if (!allowed) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const { data: member } = await admin
      .from("research_project_members")
      .select("user_id")
      .eq("project_id", asset.project_id)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    allowed = project.owner_id === user.id || Boolean(member);
  }

  if (!allowed) return NextResponse.json({ error: "You do not have access to this asset." }, { status: 403 });

  const { data, error } = await admin.storage
    .from("research-project-assets")
    .createSignedUrl(asset.storage_path, 60 * 10, { download: asset.title });
  if (error || !data?.signedUrl) {
    console.error("[research-assets] failed to sign asset download", error);
    return NextResponse.json({ error: error?.message ?? "Unable to open the research asset." }, { status: 500 });
  }
  return NextResponse.redirect(data.signedUrl);
}
