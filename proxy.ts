import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { APP_DOMAIN } from "@/lib/site";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host")?.toLowerCase();

  // TODO(gratitude): confirm production domain — APP_DOMAIN is a placeholder until then.
  if (host === APP_DOMAIN) {
    const canonicalUrl = request.nextUrl.clone();
    canonicalUrl.hostname = `www.${APP_DOMAIN}`;
    return NextResponse.redirect(canonicalUrl, 308);
  }

  const protectedPaths = [
    "/write",
    "/admin",
    "/debates/create",
    "/onboarding",
    "/stats",
    "/dashboard",
    "/settings",
    "/bookmarks",
    "/notifications",
    "/edit",
  ];
  const isProtected = protectedPaths.some((path) => pathname.startsWith(path));
  const isGuestHome = pathname === "/";

  if (!isProtected && !isGuestHome) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options: CookieOptions;
          }[]
        ) {
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && isGuestHome) {
    const landingUrl = request.nextUrl.clone();
    landingUrl.pathname = "/landing";
    return NextResponse.redirect(landingUrl);
  }

  if (!user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
