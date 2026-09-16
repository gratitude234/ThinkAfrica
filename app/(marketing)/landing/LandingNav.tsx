"use client";

import Link from "next/link";
import BrandWordmark from "@/components/ui/BrandWordmark";
import { useHasScrolled } from "@/lib/useHasScrolled";

export default function LandingNav() {
  const scrolled = useHasScrolled();

  return (
    <nav
      className={`sticky top-0 z-50 border-b border-gray-200 bg-white transition-shadow ${
        scrolled ? "shadow-[0_1px_12px_rgb(0,0,0,0.08)]" : ""
      }`}
      aria-label="Landing navigation"
    >
      <div className="mx-auto flex h-[60px] max-w-6xl items-center gap-6 px-4 sm:px-6 lg:px-8">
        <Link href="/" aria-label="Indegenius home">
          <BrandWordmark iconClassName="hidden h-6 w-6 md:block" textClassName="text-[18px] md:text-[19px]" />
        </Link>
        <div className="hidden items-center gap-1 md:flex">
          <Link href="/explore" className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">Explore</Link>
          <Link href="/about" className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">About</Link>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">Sign in</Link>
          <Link href="/signup" className="rounded-lg bg-emerald-brand px-4 py-2 text-sm font-semibold text-white hover:bg-[#0E4B37]">Join free</Link>
        </div>
      </div>
    </nav>
  );
}