export type UploadImageResult = { ok: true; url: string } | { ok: false; error: string };

const REFUSED = "Upload failed. Check the file type and size.";
const OFFLINE = "Couldn't upload image. Check your connection and try again.";

/**
 * One image, uploaded through /api/upload-image, which checks the bytes are
 * really an image before storing them. The Article editor's inline images
 * and the Post composer's single image both come through here, so both get
 * the same checks and the same messages.
 */
export async function uploadImage(file: File): Promise<UploadImageResult> {
  const formData = new FormData();
  formData.append("file", file);

  try {
    const { createClient } = await import("@/lib/supabase/client");
    const {
      data: { session },
    } = await createClient().auth.getSession();

    const response = await fetch("/api/upload-image", {
      method: "POST",
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      body: formData,
    });
    const json = (await response.json()) as { url?: unknown; error?: unknown };
    if (typeof json.url === "string" && json.url) return { ok: true, url: json.url };
    return { ok: false, error: typeof json.error === "string" && json.error ? json.error : REFUSED };
  } catch {
    return { ok: false, error: OFFLINE };
  }
}
