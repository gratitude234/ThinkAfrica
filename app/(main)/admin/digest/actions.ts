"use server";

import {
  createAdminActionClient,
  recordAdminAuditEvent,
} from "@/lib/adminAccess";

export async function recordDigestPreviewReviewed() {
  try {
    const { admin, context } = await createAdminActionClient("digest.manage");
    await recordAdminAuditEvent({
      admin,
      context,
      action: "digest.preview_reviewed",
      targetTable: null,
      targetId: null,
      metadata: { source: "admin_digest_button" },
    });

    return { error: null };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to record digest review.",
    };
  }
}
