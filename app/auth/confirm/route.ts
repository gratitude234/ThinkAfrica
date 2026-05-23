import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

const APP_ORIGIN = "https://www.thinkafrica.africa";
const ALLOWED_OTP_TYPES = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

function getSafeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

function getOtpType(value: string | null): EmailOtpType | null {
  if (!value) return null;
  return ALLOWED_OTP_TYPES.has(value as EmailOtpType) ? (value as EmailOtpType) : null;
}

function getRedirectOrigin() {
  const configuredUrl = process.env.EMAIL_APP_URL || process.env.NEXT_PUBLIC_APP_URL;

  if (configuredUrl) {
    try {
      const origin = new URL(configuredUrl).origin;
      if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
        return origin;
      }
    } catch {
      // Fall back to the production origin.
    }
  }

  return APP_ORIGIN;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = getOtpType(searchParams.get("type"));
  const next = getSafeNextPath(searchParams.get("next"));
  const redirectOrigin = getRedirectOrigin();

  if (!tokenHash || !type) {
    const loginUrl = new URL("/login", redirectOrigin);
    loginUrl.searchParams.set("error", "auth_callback_failed");
    return NextResponse.redirect(loginUrl);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type,
  });

  if (error) {
    const loginUrl = new URL("/login", redirectOrigin);
    loginUrl.searchParams.set("error", "auth_callback_failed");
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.redirect(new URL(next, redirectOrigin));
}
