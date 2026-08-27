import { NextRequest, NextResponse } from "next/server";
import { getCronAuthorizationError } from "@/lib/cronAuth";
import { processPendingPublicationEvents } from "@/lib/publicationDistribution";
import { createAdminClient } from "@/lib/supabase/admin";

const PUBLICATION_EVENT_BATCH_LIMIT = 10;

export async function GET(request: NextRequest) {
  const authorizationError = getCronAuthorizationError(request);
  if (authorizationError) return authorizationError;

  try {
    if (request.nextUrl.searchParams.get("dryRun") === "1") {
      const admin = createAdminClient();
      const now = new Date().toISOString();
      const [pendingResult, unexpiredResult] = await Promise.all([
        admin
          .from("publication_events")
          .select("*", { count: "exact", head: true })
          .eq("status", "pending"),
        admin
          .from("publication_events")
          .select("*", { count: "exact", head: true })
          .eq("status", "pending")
          .gt("expires_at", now),
      ]);

      const countError = pendingResult.error ?? unexpiredResult.error;
      if (countError) throw new Error(countError.message);

      return NextResponse.json({
        dryRun: true,
        pending: pendingResult.count ?? 0,
        pendingUnexpired: unexpiredResult.count ?? 0,
      });
    }

    const result = await processPendingPublicationEvents(
      PUBLICATION_EVENT_BATCH_LIMIT
    );
    return NextResponse.json({ dryRun: false, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[publication-delivery-cron] processing failed", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
