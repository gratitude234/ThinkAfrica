import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { withSupabaseTimeout } from "@/lib/supabase/fetchTimeout";

export class AdminAccessError extends Error {
  status: 401 | 403;

  constructor(message: string, status: 401 | 403) {
    super(message);
    this.name = "AdminAccessError";
    this.status = status;
  }
}

export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase admin client is not configured.");
  }

  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    // The same deadline the request-scoped client has carried since the
    // outage that motivated it. Its absence here was not a decision: this
    // client runs the cron routes, the broadcast sender and the cached
    // landing-data read, which is to say the calls with no reader waiting and
    // therefore nobody to notice them hanging. One of them held a Vercel
    // *build* open for 60 seconds three times over and failed a deployment.
    //
    // Storage needs no exemption here. `withSupabaseTimeout` applies only to
    // `/rest/v1/` and `/auth/v1/`, so uploads and downloads are passed through
    // untouched by construction rather than by a caller remembering to.
    global: { fetch: withSupabaseTimeout() },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function requireAdmin() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new AdminAccessError("You must be signed in.", 401);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const isAdmin =
    user.email === process.env.ADMIN_EMAIL || profile?.role === "admin";

  if (!isAdmin) {
    throw new AdminAccessError("You do not have admin access.", 403);
  }

  return { user, profile };
}

export async function createCheckedAdminClient() {
  await requireAdmin();
  return createAdminClient();
}
