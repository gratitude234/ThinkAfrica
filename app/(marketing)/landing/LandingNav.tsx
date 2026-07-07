"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";

export default function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const navLinks = [
    { label: "Explore", href: "/explore" },
    { label: "Debates", href: "/debates" },
    { label: "Opportunities", href: "/opportunities" },
    { label: "About", href: "/about" },
  ];

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="sticky top-0 z-50">
      <div className="bg-emerald-brand py-1.5 text-center">
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gold sm:text-[10.5px]">
          Africa&apos;s intellectual social network
        </span>
      </div>
      <nav
        className={`border-b border-gray-200 bg-white transition-shadow duration-300 ${
          scrolled ? "shadow-[0_1px_12px_rgb(0,0,0,0.08)]" : ""
        }`}
      >
      <div className="mx-auto flex h-[60px] max-w-6xl items-center gap-8 px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link href="/" className="flex-shrink-0" aria-label="Indegenius home">
          <Image
            src="/brand/indegenius-icon-wordmark-color.svg"
            alt="Indegenius"
            width={139}
            height={107}
            priority
            className="h-7 w-auto"
          />
        </Link>

        {/* Nav links */}
        <div className="hidden items-center gap-1 md:flex">
          {navLinks.map(({ label, href }) => (
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
            className="rounded-lg bg-emerald-brand px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[#0E4B37]"
          >
            Join free
          </Link>
        </div>
      </div>
      <div className="border-t border-gray-100 md:hidden">
        <div className="mx-auto flex max-w-6xl gap-2 overflow-x-auto px-4 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {navLinks.map(({ label, href }) => (
            <Link
              key={label}
              href={href}
              className="shrink-0 rounded-full border border-gray-200 bg-white px-3.5 py-1.5 text-[12px] font-semibold text-gray-600"
            >
              {label}
            </Link>
          ))}
        </div>
      </div>
      </nav>
    </div>
  );
}
