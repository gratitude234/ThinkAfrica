import { createClient } from "@/lib/supabase/server";
import NavClient from "./NavClient";
import BottomNav from "./BottomNav";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  // getSession reads from the request cookie — no network round-trip.
  // getUser() would validate the JWT with Supabase's auth server on every page load.
  // For display-only nav rendering, the session cookie is sufficient.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user ?? null;

  const { data: profileData } = user
    ? await supabase
        .from("profiles")
        .select("points, username, full_name")
        .eq("id", user.id)
        .single()
    : { data: null };

  const isAdmin = !!user && user.email === process.env.ADMIN_EMAIL;

  return (
    <div className="min-h-screen bg-gray-50">
      <NavClient
        user={user}
        profile={profileData}
        isAdmin={isAdmin}
      />

      {/* Page content — extra bottom padding on mobile for BottomNav */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24 md:pb-8">
        {children}
      </main>

      <BottomNav
        username={profileData?.username ?? null}
        userId={user?.id ?? null}
      />
    </div>
  );
}
