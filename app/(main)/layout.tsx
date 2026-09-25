import { cookies } from "next/headers";
import { isLiteModeServer } from "@/lib/liteMode";
import { getNavigationViewer } from "@/lib/navigationViewer";
import AppShell from "./AppShell";
import NavigationShell from "./NavigationShell";
import { AppChromeProvider } from "./AppChromeProvider";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // One row, and only for a signed-in member. See lib/navigationViewer.ts for
  // why that matters on a layout that renders on every navigation.
  const { user, profile: profileData, isAdmin } = await getNavigationViewer();
  const cookieStore = await cookies();
  const isLite = isLiteModeServer(cookieStore.toString());

  return (
    <AppChromeProvider>
      <div className={`min-h-screen bg-canvas${isLite ? " lite-mode" : ""}`}>
        <NavigationShell
          user={user}
          profile={profileData}
          isAdmin={isAdmin}
        />

        <AppShell
          showGuestBanner={!user}
          userId={user?.id ?? null}
          username={profileData?.username ?? null}
        >
          {children}
        </AppShell>
      </div>
    </AppChromeProvider>
  );
}
