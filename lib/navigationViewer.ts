import "server-only";

import type { User } from "@supabase/supabase-js";
import { canAccessAdminHubForRole } from "@/lib/adminAccess";
import { createClient } from "@/lib/supabase/server";

export interface NavigationProfile {
  username: string;
  full_name: string | null;
  role?: "student" | "reviewer" | "editor" | "admin";
  avatar_url?: string | null;
}

export interface NavigationViewer {
  user: User | null;
  profile: NavigationProfile | null;
  isAdmin: boolean;
}

/**
 * Who the app navigation is drawn for. The (main) layout and the (write)
 * layout both call this, so they cannot disagree about it.
 *
 * getSession reads the request cookie with no network round trip. getUser()
 * would validate the JWT with Supabase's auth server on every page load, and
 * for display-only navigation the session cookie is sufficient.
 *
 * A layout re-renders on every navigation, so this sits on the critical path
 * of every click. It reads one row, and only for a signed-in member, so a
 * public profile or post costs it no database work. It used to record a daily
 * activity fact as well, for the retention measurement Phase 2F retired;
 * record_user_activity_day() and user_activity_days stay in the database
 * until the cleanup phase, and nothing reads or writes them.
 */
export async function getNavigationViewer(): Promise<NavigationViewer> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user ?? null;

  const { data: profile } = user
    ? await supabase
        .from("profiles")
        .select("username, full_name, role, avatar_url")
        .eq("id", user.id)
        .single()
    : { data: null };

  const isAdmin =
    !!user &&
    canAccessAdminHubForRole(
      profile?.role,
      Boolean(process.env.ADMIN_EMAIL && user.email === process.env.ADMIN_EMAIL)
    );

  return { user, profile: (profile as NavigationProfile | null) ?? null, isAdmin };
}
