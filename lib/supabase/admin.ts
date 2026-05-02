import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

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
