import { NextRequest, NextResponse } from "next/server";
import { getCronAuthorizationError } from "@/lib/cronAuth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const authorizationError = getCronAuthorizationError(request);
  if (authorizationError) return authorizationError;

  return NextResponse.json({ ok: true, service: "indegenius-cron" });
}

// Temporary cutover-only bootstrap. The final deployment removes this method
// together with its service-role-only database RPC after Vault is provisioned.
export async function POST(request: NextRequest) {
  const authorizationError = getCronAuthorizationError(request);
  if (authorizationError) return authorizationError;

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc("__temporary_provision_indegenius_cron", {
    p_base_url: request.nextUrl.origin,
    p_cron_secret: cronSecret,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, vaultProvisioned: true });
}
