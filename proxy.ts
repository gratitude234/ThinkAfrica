import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { APP_DOMAIN } from "@/lib/site";
import { withSupabaseTimeout } from "@/lib/supabase/fetchTimeout";
import { FREEZE_RESPONSE, shouldRefuseWrite } from "@/lib/writeFreeze";

type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

function hasSupabaseAuthCookie(request: NextRequest) {
  return request.cookies
    .getAll()
    .some(({ name }) => /^sb-.+-auth-token(?:\.\d+)?$/.test(name));
}

function isRetryableAuthFailure(error: unknown) {
  const source = error as { name?: unknown; status?: unknown; message?: unknown } | null;
  const name = typeof source?.name === "string" ? source.name : "";
  const message = typeof source?.message === "string" ? source.message : "";
  return (
    source?.status === 0 ||
    source?.status === 409 ||
    name.includes("Retryable") ||
    name.includes("Timeout") ||
    message.includes("did not respond within") ||
    message.includes("concurrent token refresh")
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host")?.toLowerCase();

  // The migration write freeze, checked before anything else so that no code
  // path reaches a database during it. Off unless MIGRATION_WRITE_FREEZE says
  // otherwise, which production does not set. See lib/writeFreeze.ts.
  if (shouldRefuseWrite(request.method, pathname)) {
    return NextResponse.json(FREEZE_RESPONSE.body, {
      status: FREEZE_RESPONSE.status,
      headers: FREEZE_RESPONSE.headers,
    });
  }

  // TODO(gratitude): confirm production domain — APP_DOMAIN is a placeholder until then.
  if (host === APP_DOMAIN) {
    const canonicalUrl = request.nextUrl.clone();
    canonicalUrl.hostname = `www.${APP_DOMAIN}`;
    return NextResponse.redirect(canonicalUrl, 308);
  }

  const protectedPaths = [
    "/write",
    "/create",
    "/admin",
    "/onboarding",
    "/dashboard",
    "/settings",
    "/bookmarks",
    "/notifications",
    "/edit",
  ];
  const isProtected = protectedPaths.some((path) => pathname.startsWith(path));
  const isGuestHome = pathname === "/";
  const isExplicitGuestHome =
    isGuestHome && request.nextUrl.searchParams.get("guest") === "1";
  const hasAuthCookie = hasSupabaseAuthCookie(request);

  const loginRedirect = () => {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirectTo", pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  };

  // Avoid an Auth round trip for requests that are certainly anonymous. Once a
  // session cookie exists, however, every dynamic application request passes
  // through this refresh boundary. That prevents Server Components and API
  // routes from racing one another with the same refresh token.
  if (!hasAuthCookie) {
    if (isGuestHome && isExplicitGuestHome) return NextResponse.next({ request });
    if (isGuestHome) {
      const landingUrl = request.nextUrl.clone();
      landingUrl.pathname = "/landing";
      return NextResponse.redirect(landingUrl);
    }
    if (isProtected) return loginRedirect();
    return NextResponse.next({ request });
  }

  let refreshedCookies: CookieToSet[] = [];
  let supabaseResponse = NextResponse.next({ request });

  const applyRefreshedCookies = <T extends NextResponse>(response: T): T => {
    refreshedCookies.forEach(({ name, value, options }) =>
      response.cookies.set(name, value, options)
    );
    return response;
  };

  const redirectWithRefreshedCookies = (url: URL | string, status?: 307 | 308) =>
    applyRefreshedCookies(NextResponse.redirect(url, status));

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: withSupabaseTimeout() },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          refreshedCookies = cookiesToSet;
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  let claims: Record<string, unknown> | null = null;
  try {
    const result = await supabase.auth.getClaims();
    if (result.error) {
      if (isRetryableAuthFailure(result.error)) {
        console.warn("[auth-proxy] transient claims validation failure", result.error);
        return supabaseResponse;
      }
    } else {
      claims = (result.data.claims ?? null) as Record<string, unknown> | null;
    }
  } catch (error) {
    if (isRetryableAuthFailure(error)) {
      console.warn("[auth-proxy] transient claims validation failure", error);
      return supabaseResponse;
    }
    throw error;
  }

  const userId = typeof claims?.sub === "string" ? claims.sub : null;

  if (!userId && isGuestHome && !isExplicitGuestHome) {
    const landingUrl = request.nextUrl.clone();
    landingUrl.pathname = "/landing";
    return redirectWithRefreshedCookies(landingUrl);
  }

  if (!userId && isExplicitGuestHome) {
    return supabaseResponse;
  }

  if (!userId && isProtected) {
    return applyRefreshedCookies(loginRedirect());
  }

  if (!userId) {
    return supabaseResponse;
  }

  if (isGuestHome) {
    // Keep the existing email-confirmation behaviour exact. This is now the
    // only `getUser()` in the Home request path, and it runs after `getClaims()`
    // has already refreshed/persisted the session, so it cannot race the feed,
    // activation and page render with the same refresh token.
    try {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();
      if (error && isRetryableAuthFailure(error)) {
        console.warn("[auth-proxy] transient user verification failure", error);
        return supabaseResponse;
      }
      if (!user) {
        const landingUrl = request.nextUrl.clone();
        landingUrl.pathname = "/landing";
        return redirectWithRefreshedCookies(landingUrl);
      }
      if (!user.email_confirmed_at) {
        const loginUrl = request.nextUrl.clone();
        loginUrl.pathname = "/login";
        loginUrl.searchParams.set("reason", "email_unconfirmed");
        return redirectWithRefreshedCookies(loginUrl);
      }
    } catch (error) {
      if (isRetryableAuthFailure(error)) {
        console.warn("[auth-proxy] transient user verification failure", error);
        return supabaseResponse;
      }
      throw error;
    }

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("onboarding_completed")
      .eq("id", userId)
      .single();

    if (error) {
      console.warn("[auth-proxy] onboarding lookup failed; continuing request", error);
      return supabaseResponse;
    }

    if (profile && !profile.onboarding_completed) {
      const onboardingUrl = request.nextUrl.clone();
      onboardingUrl.pathname = "/onboarding";
      return redirectWithRefreshedCookies(onboardingUrl);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
