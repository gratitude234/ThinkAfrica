import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { recordActivationEvent } from "@/lib/activationServer";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isResearchEnabled } from "@/lib/featureFlags";

const BUCKET = "research-project-assets";
const MAX_BYTES = 50 * 1024 * 1024;
const MAX_UPLOADS_PER_HOUR = 20;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const FILE_TYPES: Record<
  string,
  { assetType: "image" | "audio" | "video" | "dataset" | "document"; extension: string }
> = {
  "image/jpeg": { assetType: "image", extension: "jpg" },
  "image/png": { assetType: "image", extension: "png" },
  "image/webp": { assetType: "image", extension: "webp" },
  "image/gif": { assetType: "image", extension: "gif" },
  "audio/mpeg": { assetType: "audio", extension: "mp3" },
  "audio/mp4": { assetType: "audio", extension: "m4a" },
  "audio/ogg": { assetType: "audio", extension: "ogg" },
  "audio/wav": { assetType: "audio", extension: "wav" },
  "video/mp4": { assetType: "video", extension: "mp4" },
  "video/webm": { assetType: "video", extension: "webm" },
  "application/pdf": { assetType: "document", extension: "pdf" },
  "text/csv": { assetType: "dataset", extension: "csv" },
  "application/json": { assetType: "dataset", extension: "json" },
  "application/zip": { assetType: "dataset", extension: "zip" },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
    assetType: "dataset",
    extension: "xlsx",
  },
};

interface UploadTicketInput {
  projectId?: string;
  title?: string;
  description?: string;
  visibility?: string;
  mimeType?: string;
  sizeBytes?: number;
}

type AdminClient = ReturnType<typeof createAdminClient>;

function hasExpectedSignature(buffer: Buffer, mimeType: string) {
  if (mimeType === "image/jpeg") return buffer[0] === 0xff && buffer[1] === 0xd8;
  if (mimeType === "image/png") return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mimeType === "image/gif") return ["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString("ascii"));
  if (mimeType === "image/webp") return buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  if (mimeType === "application/pdf") return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
  if (mimeType === "audio/ogg") return buffer.subarray(0, 4).toString("ascii") === "OggS";
  if (mimeType === "audio/wav") return buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WAVE";
  if (mimeType === "audio/mpeg") {
    return buffer.subarray(0, 3).toString("ascii") === "ID3" || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0);
  }
  if (mimeType === "video/mp4" || mimeType === "audio/mp4") return buffer.subarray(4, 8).toString("ascii") === "ftyp";
  if (mimeType === "video/webm") return buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  if (mimeType === "application/zip" || mimeType.includes("spreadsheetml")) {
    return buffer[0] === 0x50 && buffer[1] === 0x4b;
  }
  if (mimeType === "application/json") {
    const firstCharacter = buffer.toString("utf8").trimStart()[0];
    return firstCharacter === "{" || firstCharacter === "[";
  }
  return mimeType === "text/csv" && !buffer.includes(0);
}

async function authenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

async function writableProject(admin: AdminClient, projectId: string, userId: string) {
  const [{ data: project }, { data: membership }] = await Promise.all([
    admin
      .from("research_projects")
      .select("id, slug, owner_id, status")
      .eq("id", projectId)
      .maybeSingle(),
    admin
      .from("research_project_members")
      .select("user_id")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle(),
  ]);
  if (!project || (!membership && project.owner_id !== userId)) return null;
  return project;
}

async function removePendingAsset(
  admin: AdminClient,
  asset: { id: string; storage_path: string | null }
) {
  if (asset.storage_path) {
    await admin.storage.from(BUCKET).remove([asset.storage_path]);
  }
  await admin.from("research_project_assets").delete().eq("id", asset.id);
}

async function readFileHeader(admin: AdminClient, storagePath: string) {
  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 60);
  if (error || !data?.signedUrl) return null;

  const response = await fetch(data.signedUrl, {
    headers: { Range: "bytes=0-63" },
    cache: "no-store",
  });
  if (!response.ok || !response.body) return null;
  const reader = response.body.getReader();
  const firstChunk = await reader.read();
  await reader.cancel();
  return firstChunk.value ? Buffer.from(firstChunk.value.subarray(0, 64)) : null;
}

export async function POST(request: NextRequest) {
  if (!isResearchEnabled()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const { user } = await authenticatedUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as UploadTicketInput | null;
  const projectId = body?.projectId ?? "";
  const title = body?.title?.trim() ?? "";
  const description = body?.description?.trim() ?? "";
  const visibility = body?.visibility ?? "public";
  const mimeType = body?.mimeType ?? "";
  const sizeBytes = Number(body?.sizeBytes ?? 0);
  const fileType = FILE_TYPES[mimeType];

  if (!UUID_PATTERN.test(projectId)) {
    return NextResponse.json({ error: "Choose a valid research project." }, { status: 400 });
  }
  if (title.length < 3 || title.length > 160 || description.length > 1000) {
    return NextResponse.json({ error: "Add a valid asset title and description." }, { status: 400 });
  }
  if (!fileType) {
    return NextResponse.json(
      { error: "Use an image, audio, MP4/WebM video, PDF, CSV, JSON, ZIP, or XLSX file." },
      { status: 415 }
    );
  }
  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_BYTES) {
    return NextResponse.json({ error: "Research assets must be between 1 byte and 50MB." }, { status: 413 });
  }
  if (!["public", "members"].includes(visibility)) {
    return NextResponse.json({ error: "Choose a valid asset visibility." }, { status: 400 });
  }

  const admin = createAdminClient();
  const project = await writableProject(admin, projectId, user.id);
  if (!project) {
    return NextResponse.json({ error: "You do not have access to this research project." }, { status: 403 });
  }
  if (["completed", "archived"].includes(project.status)) {
    return NextResponse.json({ error: "This project no longer accepts new assets." }, { status: 409 });
  }

  const staleBefore = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  const { data: staleAssets } = await admin
    .from("research_project_assets")
    .select("id, storage_path")
    .eq("uploaded_by", user.id)
    .eq("upload_status", "pending")
    .lt("created_at", staleBefore)
    .limit(50);
  if (staleAssets?.length) {
    const stalePaths = staleAssets
      .map((asset) => asset.storage_path)
      .filter((path): path is string => Boolean(path));
    if (stalePaths.length) await admin.storage.from(BUCKET).remove(stalePaths);
    await admin
      .from("research_project_assets")
      .delete()
      .in("id", staleAssets.map((asset) => asset.id));
  }

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("research_project_assets")
    .select("id", { count: "exact", head: true })
    .eq("uploaded_by", user.id)
    .gte("created_at", oneHourAgo);
  if ((count ?? 0) >= MAX_UPLOADS_PER_HOUR) {
    return NextResponse.json({ error: "Too many research uploads. Try again later." }, { status: 429 });
  }

  const { data: bucket } = await admin.storage.getBucket(BUCKET);
  if (!bucket) {
    return NextResponse.json(
      { error: "Research project storage is not ready. Apply the Phase 4 migration." },
      { status: 503 }
    );
  }

  const storagePath = `projects/${projectId}/${user.id}/${crypto.randomUUID()}.${fileType.extension}`;
  const { data: asset, error: assetError } = await admin
    .from("research_project_assets")
    .insert({
      project_id: projectId,
      uploaded_by: user.id,
      asset_type: fileType.assetType,
      title,
      description: description || null,
      storage_path: storagePath,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      visibility,
      upload_status: "pending",
    })
    .select("id")
    .single();
  if (assetError || !asset) {
    console.error("[research-assets] failed to create pending asset", assetError);
    return NextResponse.json({ error: assetError?.message ?? "Unable to prepare the upload." }, { status: 500 });
  }

  const { data: ticket, error: ticketError } = await admin.storage
    .from(BUCKET)
    .createSignedUploadUrl(storagePath, { upsert: false });
  if (ticketError || !ticket?.token) {
    console.error("[research-assets] failed to create signed upload", ticketError);
    await removePendingAsset(admin, { id: asset.id, storage_path: storagePath });
    return NextResponse.json({ error: ticketError?.message ?? "Unable to prepare the upload." }, { status: 500 });
  }

  return NextResponse.json({
    assetId: asset.id,
    storagePath,
    token: ticket.token,
  });
}

export async function PATCH(request: NextRequest) {
  if (!isResearchEnabled()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const { supabase, user } = await authenticatedUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { assetId?: string } | null;
  if (!body?.assetId || !UUID_PATTERN.test(body.assetId)) {
    return NextResponse.json({ error: "Invalid research asset." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: asset } = await admin
    .from("research_project_assets")
    .select("id, project_id, uploaded_by, storage_path, mime_type, size_bytes, upload_status, asset_type")
    .eq("id", body.assetId)
    .eq("uploaded_by", user.id)
    .maybeSingle();
  if (!asset?.storage_path || asset.upload_status !== "pending") {
    return NextResponse.json({ error: "Pending research asset not found." }, { status: 404 });
  }

  const project = await writableProject(admin, asset.project_id, user.id);
  if (!project || ["completed", "archived"].includes(project.status)) {
    await removePendingAsset(admin, asset);
    return NextResponse.json({ error: "This project no longer accepts new assets." }, { status: 409 });
  }

  const { data: info, error: infoError } = await admin.storage
    .from(BUCKET)
    .info(asset.storage_path);
  const actualSize = Number(info?.size ?? info?.metadata?.size ?? 0);
  const actualMime = info?.contentType ?? info?.metadata?.mimetype ?? "";
  if (infoError || !info || actualSize <= 0 || actualSize > MAX_BYTES) {
    console.error("[research-assets] uploaded object metadata is invalid", infoError);
    await removePendingAsset(admin, asset);
    return NextResponse.json({ error: "The uploaded file could not be verified." }, { status: 400 });
  }
  if (actualMime !== asset.mime_type || actualSize !== Number(asset.size_bytes)) {
    await removePendingAsset(admin, asset);
    return NextResponse.json({ error: "The uploaded file does not match its upload ticket." }, { status: 400 });
  }

  const header = await readFileHeader(admin, asset.storage_path);
  if (!header || !hasExpectedSignature(header, asset.mime_type)) {
    await removePendingAsset(admin, asset);
    return NextResponse.json({ error: "The file contents do not match the selected file type." }, { status: 400 });
  }

  const { error: updateError } = await admin
    .from("research_project_assets")
    .update({ upload_status: "ready", size_bytes: actualSize, mime_type: actualMime })
    .eq("id", asset.id)
    .eq("upload_status", "pending");
  if (updateError) {
    console.error("[research-assets] failed to finalize asset", updateError);
    await removePendingAsset(admin, asset);
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await recordActivationEvent({
    supabase,
    event: "research_asset_added",
    userId: user.id,
    source: "route_handler",
    route: `/research/projects/${project.slug}`,
    metadata: { projectId: project.id, assetId: asset.id, assetType: asset.asset_type, storage: true },
  });
  revalidatePath("/research");
  revalidatePath(`/research/projects/${project.slug}`);
  return NextResponse.json({ id: asset.id });
}

export async function DELETE(request: NextRequest) {
  if (!isResearchEnabled()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const { user } = await authenticatedUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { assetId?: string } | null;
  if (!body?.assetId || !UUID_PATTERN.test(body.assetId)) {
    return NextResponse.json({ error: "Invalid research asset." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: asset } = await admin
    .from("research_project_assets")
    .select("id, storage_path")
    .eq("id", body.assetId)
    .eq("uploaded_by", user.id)
    .eq("upload_status", "pending")
    .maybeSingle();
  if (asset) await removePendingAsset(admin, asset);
  return NextResponse.json({ ok: true });
}
