import Link from "next/link";
import { FEATURE_FLAGS } from "@/lib/featureFlags";

const platformLinks = [
  { label: "Home", href: "/" },
  { label: "Discover", href: "/topics" },
  { label: "Write", href: "/write" },
  { label: "Opportunities", href: "/opportunities" },
  { label: "Policy Hub", href: "/policy" },
  ...(FEATURE_FLAGS.debates ? [{ label: "Debates", href: "/debates" }] : []),
  ...(FEATURE_FLAGS.webinars ? [{ label: "Webinars", href: "/webinars" }] : []),
];

const communityLinks = [
  ...(FEATURE_FLAGS.ambassadors
    ? [{ label: "Become an Ambassador", href: "/ambassadors" }]
    : []),
  { label: "Editorial Standards", href: "/editorial-standards" },
  { label: "About Us", href: "/about" },
];

const legalLinks = [
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Terms of Use", href: "/terms" },
];

export default function Footer({ landing = false }: { landing?: boolean }) {
  return (
    <footer
      className={
        landing
          ? "bg-gray-900 text-gray-300"
          : "relative left-1/2 mt-16 -mb-24 w-screen -translate-x-1/2 bg-gray-900 text-gray-300 md:-mb-8"
      }
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="md:col-span-1">
            <Link href="/" className="text-xl font-bold text-emerald-400">
              ThinkAfrika
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
              {platformLinks.map(({ label, href }) => (
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
              {communityLinks.map(({ label, href }) => (
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
              {legalLinks.map(({ label, href }) => (
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
          &copy; 2025 ThinkAfrika. Built for Africa.
        </div>
      </div>
    </footer>
  );
}
