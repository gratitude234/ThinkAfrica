import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import NavUserMenu from "./NavUserMenu";

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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2">
              <span className="text-xl font-bold text-emerald-brand">
                ThinkAfrica
              </span>
            </Link>

            {/* Nav links */}
            <div className="flex items-center gap-6">
              <Link
                href="/"
                className="text-sm font-medium text-gray-600 hover:text-emerald-brand transition-colors"
              >
                Home
              </Link>
              {user && (
                <Link
                  href="/write"
                  className="text-sm font-medium text-gray-600 hover:text-emerald-brand transition-colors"
                >
                  Write
                </Link>
              )}
            </div>

            {/* User menu */}
            <NavUserMenu user={user} profile={profile} />
          </div>
        </div>
      </nav>

      {/* Page content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
