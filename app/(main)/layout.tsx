import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import NavUserMenu from "./NavUserMenu";
import MobileNav from "./MobileNav";
import NotificationBell from "@/components/ui/NotificationBell";

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

  const isAdmin =
    !!user && user.email === process.env.ADMIN_EMAIL;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2 flex-shrink-0">
              <span className="text-xl font-bold text-emerald-brand">
                ThinkAfrica
              </span>
            </Link>

            {/* Center nav links — desktop */}
            <div className="hidden md:flex items-center gap-1">
              <Link
                href="/"
                className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-emerald-brand hover:bg-gray-50 rounded-lg transition-colors"
              >
                Feed
              </Link>
              <Link
                href="/debates"
                className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-emerald-brand hover:bg-gray-50 rounded-lg transition-colors"
              >
                Debates
              </Link>
              <Link
                href="/leaderboard"
                className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-emerald-brand hover:bg-gray-50 rounded-lg transition-colors"
              >
                Leaderboard
              </Link>
            </div>

            {/* Right side */}
            <div className="flex items-center gap-2">
              {/* Search icon */}
              <Link
                href="/search"
                className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="Search"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </Link>

              {/* Notification bell (auth only) */}
              {user && <NotificationBell userId={user.id} />}

              {/* User menu */}
              <NavUserMenu user={user} profile={profile} isAdmin={isAdmin} />

              {/* Mobile hamburger */}
              <MobileNav user={user} profile={profile} isAdmin={isAdmin} />
            </div>
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
