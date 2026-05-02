import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import GuestBanner from "@/components/ui/GuestBanner";
import { isLiteModeServer } from "@/lib/liteMode";
import NavigationShell from "./NavigationShell";
import { canReview } from "@/lib/roles";

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

  const { data: profileData } = user
    ? await supabase
        .from("profiles")
        .select("points, username, full_name, role")
        .eq("id", user.id)
        .single()
    : { data: null };

  const { count: activeDebateCount } = await supabase
    .from("debates")
    .select("id", { count: "exact", head: true })
    .eq("status", "active");

  const isAdmin =
    !!user &&
    (user.email === process.env.ADMIN_EMAIL || profileData?.role === "admin");
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

      <main className="mx-auto max-w-[1152px] px-5 pb-24 pt-6 md:pb-16">
        {children}
      </main>

      {!user ? <GuestBanner /> : null}
    </div>
  );
}
