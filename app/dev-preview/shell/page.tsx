import { notFound } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { AppChromeProvider } from "@/app/(main)/AppChromeProvider";
import NavigationShell from "@/app/(main)/NavigationShell";
import AppShell from "@/app/(main)/AppShell";

/** Development-only shell harness; no credentials or mutation fixtures. */
export default async function ShellPreview({ searchParams }: { searchParams: Promise<{ guest?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const guest = (await searchParams).guest === "1";
  const user = guest ? null : { id: "shell-preview", email: "preview@example.test" } as User;
  const profile = guest ? null : { username: "amara", full_name: "Amara Okafor", avatar_url: null };
  return <AppChromeProvider>
    <NavigationShell user={user} profile={profile} isAdmin={false} />
    <AppShell showGuestBanner={false} userId={user?.id ?? null} username={profile?.username ?? null}>
      <div style={{ maxWidth: 740, margin: "0 auto", minHeight: 2400 }}>
        <h1>Shell verification</h1>
        <p>Development fixture using the production navigation components.</p>
        <label>Interaction check <input aria-label="Interaction check" /></label>
      </div>
    </AppShell>
  </AppChromeProvider>;
}
