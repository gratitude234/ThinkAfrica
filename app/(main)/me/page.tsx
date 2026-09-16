import { redirect } from "next/navigation";
import { getUsableProfileUsername } from "@/lib/profileUsername";
import { createClient } from "@/lib/supabase/server";

export default async function MeRedirect() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirectTo=/me");

  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .maybeSingle();

  const username = getUsableProfileUsername(profile?.username ?? null);
  // Temporary on purpose. The destination depends on who is signed in, and a
  // permanent redirect is one a browser may cache for the next account too.
  redirect(username ? `/${username}` : "/settings/profile");
}