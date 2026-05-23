import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const RESERVED_PROFILE_PATHS = new Set([
  "about",
  "admin",
  "alumni",
  "ambassadors",
  "bookmarks",
  "dashboard",
  "debates",
  "discover",
  "edit",
  "editorial-standards",
  "explore",
  "fellowships",
  "leaderboard",
  "me",
  "messages",
  "notifications",
  "opportunities",
  "partners",
  "policy",
  "post",
  "privacy",
  "publication",
  "review",
  "search",
  "settings",
  "stats",
  "submit",
  "talent",
  "terms",
  "topics",
  "write",
]);

function getUsableUsername(value: string | null) {
  const username = value?.trim();
  if (!username) return null;
  if (!/^[a-z0-9_]+$/.test(username)) return null;
  if (RESERVED_PROFILE_PATHS.has(username)) return null;
  return username;
}

export default async function MePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/me");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .maybeSingle();

  const username = getUsableUsername(profile?.username ?? null);

  if (!username) {
    redirect("/settings");
  }

  redirect(`/${username}`);
}
