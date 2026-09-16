import Link from "next/link";
import CreateTrigger from "@/app/(main)/CreateTrigger";
import { BRAND_ORIGIN_STATEMENT, BRAND_PROMISE } from "@/lib/brand";

// Write goes through CreateTrigger rather than a plain link: the landing page
// (Footer's only caller) is guest-only, so userId is always null here, and the
// trigger routes the guest through sign-in with /write preserved.
const platformLinks = [
  { label: "Home", href: "/" },
  { label: "Explore", href: "/explore" },
];

const FOOTER_LINK_CLASS =
  "text-sm text-gray-400 hover:text-emerald-400 transition-colors";

const communityLinks = [{ label: "About Us", href: "/about" }];

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
              Indegenius
            </Link>
            <p className="mt-2 text-sm text-gray-400 leading-relaxed">
              {BRAND_PROMISE}
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
                  <Link href={href} className={FOOTER_LINK_CLASS}>
                    {label}
                  </Link>
                </li>
              ))}
              <li>
                <CreateTrigger userId={null} className={FOOTER_LINK_CLASS}>
                  Write
                </CreateTrigger>
              </li>
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
          &copy; {new Date().getFullYear()} Indegenius. {BRAND_ORIGIN_STATEMENT}
        </div>
      </div>
    </footer>
  );
}
