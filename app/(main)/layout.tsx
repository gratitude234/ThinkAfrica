import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { isLiteModeServer } from "@/lib/liteMode";
import AppShell from "./AppShell";
import NavigationShell from "./NavigationShell";
import { canAccessAdminHubForRole } from "@/lib/adminAccess";
import { AppChromeProvider } from "./AppChromeProvider";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  // getSession reads from the request cookie with no network round-trip.
  // getUser() would validate the JWT with Supabase's auth server on every page load.
  // For display-only nav rendering, the session cookie is sufficient.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user ?? null;

  // This layout re-renders on every navigation inside the app shell, so its
  // queries sit on the critical path of every click. It reads one row, and
  // only for a signed-in member, so a public profile or post costs this layout
  // no database work.
  //
  // It used to record a daily activity fact on every navigation as well, for
  // the retention measurement the publishing reset (Phase 2F) retired.
  // `record_user_activity_day()` and `user_activity_days` stay in the database
  // until the cleanup phase; nothing in the application writes or reads them.
  const { data: profileData } = user
    ? await supabase
        .from("profiles")
        .select("username, full_name, role, avatar_url")
        .eq("id", user.id)
        .single()
    : { data: null };

  const isAdmin =
    !!user &&
    canAccessAdminHubForRole(
      profileData?.role,
      Boolean(process.env.ADMIN_EMAIL && user.email === process.env.ADMIN_EMAIL)
    );
  const cookieStore = await cookies();
  const isLite = isLiteModeServer(cookieStore.toString());

  return (
    <AppChromeProvider>
      <div className={`min-h-screen bg-canvas${isLite ? " lite-mode" : ""}`}>
        <NavigationShell
          user={user}
          profile={profileData}
          isAdmin={isAdmin}
        />

        <AppShell
          showGuestBanner={!user}
          userId={user?.id ?? null}
          username={profileData?.username ?? null}
        >
          {children}
        </AppShell>
      </div>
    </AppChromeProvider>
  );
}
