import { createBrowserClient } from "@supabase/ssr";
import { withAuthResilience } from "@/lib/supabase/authFetch";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    // The browser refreshes the session too, and a refresh that met a
    // Supabase 5xx used to delete the session cookies. See authFetch.ts.
    { global: { fetch: withAuthResilience() } }
  );
}
