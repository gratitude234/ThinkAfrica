import { createClient } from "@/lib/supabase/server";
import Footer from "@/components/ui/Footer";
import NavClient from "./NavClient";
import BottomNav from "./BottomNav";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile = null;
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("username, full_name")
      .eq("id", user.id)
      .single();
    profile = data;
  }

  const isAdmin = !!user && user.email === process.env.ADMIN_EMAIL;

  return (
    <div className="min-h-screen bg-gray-50">
      <NavClient user={user} profile={profile} isAdmin={isAdmin} />

      {/* Page content — extra bottom padding on mobile for BottomNav */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-20 lg:pb-8">
        {children}
      </main>

      <BottomNav
        username={profile?.username ?? null}
        userId={user?.id ?? null}
      />

      <Footer />
    </div>
  );
}
