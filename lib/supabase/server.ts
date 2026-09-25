import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { withAuthResilience } from "@/lib/supabase/authFetch";
import { withSupabaseTimeout } from "@/lib/supabase/fetchTimeout";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // A database that has stopped answering must not be able to hold a
      // Vercel function open until the 300-second ceiling. See
      // lib/supabase/fetchTimeout.ts: PostgREST and Auth get a deadline,
      // storage transfers do not, and nothing is retried. Outside that,
      // lib/supabase/authFetch.ts keeps a slow or failing Auth server from
      // reading as a signed-out visitor.
      global: { fetch: withAuthResilience(withSupabaseTimeout()) },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll called from a Server Component — cookies can't be modified
          }
        },
      },
    }
  );
}
