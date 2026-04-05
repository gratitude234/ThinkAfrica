import Link from "next/link";

export default function Footer() {
  return (
    <footer className="bg-gray-900 text-gray-300 mt-16">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="md:col-span-1">
            <Link href="/" className="text-xl font-bold text-emerald-400">
              ThinkAfrica
            </Link>
            <p className="mt-2 text-sm text-gray-400 leading-relaxed">
              Where Africa&apos;s Ideas Connect
            </p>
          </div>

          {/* Platform */}
          <div>
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">
              Platform
            </h3>
            <ul className="space-y-2">
              {[
                { label: "Feed", href: "/" },
                { label: "Debates", href: "/debates" },
                { label: "Webinars", href: "/webinars" },
                { label: "Leaderboard", href: "/leaderboard" },
                { label: "Policy Hub", href: "/policy" },
              ].map(({ label, href }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="text-sm text-gray-400 hover:text-emerald-400 transition-colors"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Community */}
          <div>
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">
              Community
            </h3>
            <ul className="space-y-2">
              {[
                { label: "Become an Ambassador", href: "/ambassadors" },
                { label: "Write for ThinkAfrica", href: "/write" },
                { label: "Editorial Standards", href: "/editorial-standards" },
                { label: "About Us", href: "/about" },
              ].map(({ label, href }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="text-sm text-gray-400 hover:text-emerald-400 transition-colors"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">
              Legal
            </h3>
            <ul className="space-y-2">
              {[
                { label: "Privacy Policy", href: "/privacy" },
                { label: "Terms of Use", href: "/terms" },
              ].map(({ label, href }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="text-sm text-gray-400 hover:text-emerald-400 transition-colors"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-gray-800 text-center text-xs text-gray-500">
          &copy; 2025 ThinkAfrica. Built for Africa.
        </div>
      </div>
    </footer>
  );
}
