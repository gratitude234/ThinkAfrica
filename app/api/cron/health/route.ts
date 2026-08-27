import { NextRequest, NextResponse } from "next/server";
import { getCronAuthorizationError } from "@/lib/cronAuth";

export async function GET(request: NextRequest) {
  const authorizationError = getCronAuthorizationError(request);
  if (authorizationError) return authorizationError;

  return NextResponse.json({ ok: true, service: "indegenius-cron" });
}
