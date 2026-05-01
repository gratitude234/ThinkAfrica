"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function LandingNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={`sticky top-0 z-50 h-[60px] border-b border-gray-200 bg-white/92 backdrop-blur-md transition-shadow duration-300 ${
        scrolled ? "shadow-[0_1px_12px_rgb(0,0,0,0.08)]" : ""
      }`}
    >
      <div className="mx-auto flex h-full max-w-6xl items-center gap-8 px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link href="/" className="flex-shrink-0 font-display text-[22px] font-bold">
          <span className="text-emerald-500">Think</span>
          <span className="text-purple-600">Africa</span>
        </Link>

        {/* Nav links */}
        <div className="hidden items-center gap-1 md:flex">
          {[
            { label: "Discover", href: "/?guest=1" },
            { label: "Debates",  href: "/debates" },
            { label: "Opportunities", href: "/opportunities" },
            { label: "About",    href: "/about" },
          ].map(({ label, href }) => (
            <Link
              key={label}
              href={href}
              className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
            >
              {label}
            </Link>
          ))}
        </div>

        {/* Actions */}
        <div className="ml-auto flex items-center gap-2.5">
          <Link
            href="/login"
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="rounded-lg bg-emerald-500 px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-600"
          >
            Join free
          </Link>
        </div>
      </div>
    </nav>
  );
}
