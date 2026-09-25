import { getNavigationViewer } from "@/lib/navigationViewer";
import WriteChrome from "./WriteChrome";

/**
 * The write screens sit under the app navigation on a desktop, and fill the
 * screen on a phone. /edit/[slug] lives in (main) and stays full screen.
 */
export default async function WriteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile, isAdmin } = await getNavigationViewer();

  return (
    <WriteChrome user={user} profile={profile} isAdmin={isAdmin}>
      {children}
    </WriteChrome>
  );
}
