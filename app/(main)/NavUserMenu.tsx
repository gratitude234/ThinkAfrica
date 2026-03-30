"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";

interface NavUserMenuProps {
  user: User | null;
  profile: { username: string; full_name: string } | null;
}

export default function NavUserMenu({ user, profile }: NavUserMenuProps) {
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  if (!user) {
    return (
      <div className="flex items-center gap-3">
        <Link href="/login">
          <Button variant="ghost" size="sm">
            Sign in
          </Button>
        </Link>
        <Link href="/signup">
          <Button size="sm">Get started</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      {profile && (
        <Link
          href={`/${profile.username}`}
          className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-emerald-brand transition-colors"
        >
          <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 text-sm font-bold">
            {profile.full_name?.charAt(0)?.toUpperCase() ?? "?"}
          </div>
          <span className="hidden sm:block">{profile.full_name}</span>
        </Link>
      )}
      <Button variant="ghost" size="sm" onClick={handleSignOut}>
        Sign out
      </Button>
    </div>
  );
}
