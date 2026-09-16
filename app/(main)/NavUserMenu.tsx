"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import Button from "@/components/ui/Button";
import UserAvatar from "@/components/ui/UserAvatar";
import { getUsableProfileUsername } from "@/lib/profileUsername";
import { useSignOut } from "@/lib/useSignOut";

interface NavUserMenuProps {
  user: User | null;
  profile: {
    username: string;
    full_name: string | null;
    avatar_url?: string | null;
    role?: "student" | "reviewer" | "editor" | "admin";
  } | null;
  isAdmin?: boolean;
}

const ITEM_CLASS =
  "flex min-h-11 items-center gap-2.5 px-4 py-3 text-sm text-gray-700 transition-colors hover:bg-canvas";

export default function NavUserMenu({ user, profile, isAdmin }: NavUserMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const displayName = profile?.full_name ?? user?.email?.split("@")[0] ?? "Account";
  const profileUsername = getUsableProfileUsername(profile?.username ?? null);
  const { signOut, isSigningOut: signOutBusy, error: signOutError } = useSignOut();

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  if (!user) {
    return (
      <div className="hidden items-center gap-2 sm:flex">
        <Link href="/login"><Button variant="ghost" size="sm">Sign in</Button></Link>
        <Link href="/signup"><Button size="sm">Get started</Button></Link>
      </div>
    );
  }

  async function handleSignOut() {
    const signedOut = await signOut();
    if (signedOut) setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label="Open account menu"
        aria-expanded={open}
        aria-haspopup="menu"
        className="focus-ring rounded-full"
      >
        <UserAvatar name={displayName} src={profile?.avatar_url} size={32} className="overflow-hidden rounded-full" />
      </button>

      {open ? (
        <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
          <div className="border-b border-gray-100 bg-canvas px-4 py-3">
            <p className="truncate text-sm font-semibold text-gray-900">{displayName}</p>
            {profileUsername ? <p className="truncate text-xs text-gray-500">@{profileUsername}</p> : null}
          </div>
          <Link role="menuitem" href="/bookmarks" onClick={() => setOpen(false)} className={ITEM_CLASS}>Bookmarks</Link>
          <Link role="menuitem" href="/settings" onClick={() => setOpen(false)} className={ITEM_CLASS}>Settings</Link>
          {isAdmin ? (
            <Link role="menuitem" href="/admin" onClick={() => setOpen(false)} className={ITEM_CLASS}>Admin</Link>
          ) : null}
          <div className="border-t border-gray-100" />
          <button
            role="menuitem"
            type="button"
            onClick={() => void handleSignOut()}
            disabled={signOutBusy}
            className="flex min-h-11 w-full items-center px-4 py-3 text-sm text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60"
          >
            {signOutBusy ? "Signing out…" : "Sign out"}
          </button>
          {signOutError ? <p className="px-4 pb-3 text-xs leading-5 text-red-600" role="alert">{signOutError}</p> : null}
        </div>
      ) : null}
    </div>
  );
}