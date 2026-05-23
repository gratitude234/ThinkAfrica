import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

function getSafeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

function isLocalhostOrigin(origin: string) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
}

function getAuthRedirectOrigin(request: NextRequest) {
  const configuredUrl = process.env.EMAIL_APP_URL || process.env.NEXT_PUBLIC_APP_URL;

  if (configuredUrl) {
    try {
      const origin = new URL(configuredUrl).origin;
      if (!isLocalhostOrigin(origin)) return origin;
    } catch {
      // Fall through to request-derived origin.
    }
  }

  const requestOrigin = request.nextUrl.origin;
  if (!isLocalhostOrigin(requestOrigin)) return requestOrigin;

  return "https://www.thinkafrica.africa";
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const next = getSafeNextPath(searchParams.get("next"));
  const redirectOrigin = getAuthRedirectOrigin(request);

  if (!code) {
    return NextResponse.redirect(new URL("/login", redirectOrigin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const loginUrl = new URL("/login", redirectOrigin);
    loginUrl.searchParams.set("error", "auth_callback_failed");
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.redirect(new URL(next, redirectOrigin));
}
