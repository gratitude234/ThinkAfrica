import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { isLiteModeServer } from "@/lib/liteMode";
import AppShell from "./AppShell";
import NavigationShell from "./NavigationShell";
import { canReview } from "@/lib/roles";
import { canAccessAdminHubForRole } from "@/lib/adminAccess";

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
  // queries sit on the critical path of every click. They're independent of
  // each other -- running them sequentially made each navigation pay both
  // round trips back to back.
  const [{ data: profileData }, { count: activeDebateCount }] =
    await Promise.all([
      user
        ? supabase
            .from("profiles")
            .select("points, username, full_name, role, avatar_url")
            .eq("id", user.id)
            .single()
        : Promise.resolve({ data: null }),
      supabase
        .from("debates")
        .select("id", { count: "exact", head: true })
        .eq("status", "active"),
    ]);

  const isAdmin =
    !!user &&
    canAccessAdminHubForRole(
      profileData?.role,
      Boolean(process.env.ADMIN_EMAIL && user.email === process.env.ADMIN_EMAIL)
    );
  const canAccessReview = !!profileData?.role && canReview(profileData.role);
  const cookieStore = await cookies();
  const isLite = isLiteModeServer(cookieStore.toString());

  return (
    <div className={`min-h-screen bg-canvas${isLite ? " lite-mode" : ""}`}>
      <NavigationShell
        user={user}
        profile={profileData}
        isAdmin={isAdmin}
        canAccessReview={canAccessReview}
        hasActiveDebate={(activeDebateCount ?? 0) > 0}
      />

      <AppShell
        showGuestBanner={!user}
        userId={user?.id ?? null}
        username={profileData?.username ?? null}
        hasActiveDebate={(activeDebateCount ?? 0) > 0}
      >
        {children}
      </AppShell>
    </div>
  );
}
