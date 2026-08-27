import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCronAuthorizationError } from "@/lib/cronAuth";

const DEFAULT_BATCH_LIMIT = 50;

export async function GET(request: NextRequest) {
  const authorizationError = getCronAuthorizationError(request);
  if (authorizationError) return authorizationError;

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("advance_due_debate_rounds_v2", {
    p_limit: DEFAULT_BATCH_LIMIT,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    data ?? { processed: 0, started: 0, advanced: 0, skipped: 0, errors: [] }
  );
}
