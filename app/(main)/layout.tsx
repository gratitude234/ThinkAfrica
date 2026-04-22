import { createClient } from "@/lib/supabase/server";
import GuestBanner from "@/components/ui/GuestBanner";
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

  const isAdmin =
    !!user &&
    (user.email === process.env.ADMIN_EMAIL || profileData?.role === "admin");
  const canAccessReview = !!profileData?.role && canReview(profileData.role);

  return (
    <div className="min-h-screen bg-canvas">
      <NavigationShell
        user={user}
        profile={profileData}
        isAdmin={isAdmin}
        canAccessReview={canAccessReview}
      />

      <main className="mx-auto max-w-6xl px-4 py-8 pb-24 sm:px-6 lg:px-8 md:pb-8">
        {children}
      </main>

      {!user ? <GuestBanner /> : null}
    </div>
  );
}
