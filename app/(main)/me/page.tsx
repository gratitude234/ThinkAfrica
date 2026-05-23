import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUsableProfileUsername } from "@/lib/profileUsername";

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

  const username = getUsableProfileUsername(profile?.username ?? null);

  if (!username) {
    redirect("/settings");
  }

  redirect(`/${username}`);
}
