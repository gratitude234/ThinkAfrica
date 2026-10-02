import "@/components/profile/profile.css";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ProfilePageContent from "@/components/profile/ProfilePageContent";
import {
  getProfileDisplayName,
  getProfileMetaDescription,
  getProfileTitle,
} from "@/lib/profileIdentity";
import {
  profileTabHref,
  resolveProfilePage,
  resolveProfileTab,
} from "@/lib/profileTabs";
import { loadProfileIdentity, loadProfileView } from "@/lib/profileViewData";
import { createClient } from "@/lib/supabase/server";

interface PageProps {
  params: Promise<{ username: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
  params,
  searchParams,
}: PageProps): Promise<Metadata> {
  const [{ username }, query] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  // Throws on a query failure, exactly as the page does. Answering "Profile
  // not found" because the database was unreachable would put that claim in
  // the page title and in every link preview of it.
  const profile = await loadProfileIdentity(supabase, username);
  if (!profile) return { title: "Profile not found - Indegenius" };

  const name = getProfileDisplayName(profile);
  const title = getProfileTitle(profile);
  const description = getProfileMetaDescription(profile, name);

  return {
    title,
    description,
    alternates: {
      canonical: profileTabHref(
        profile.username,
        resolveProfileTab(query) === "drafts"
          ? "posts"
          : resolveProfileTab(query),
      ),
    },
    openGraph: {
      type: "profile",
      title,
      description,
      images: [profile.avatar_url ?? "/logo.png"],
    },
    twitter: {
      card: "summary",
      title,
      description,
      images: [profile.avatar_url ?? "/logo.png"],
    },
  };
}

/** A writer profile: one header and one tab navigation. */
export default async function UserProfilePage({
  params,
  searchParams,
}: PageProps) {
  const [{ username }, query] = await Promise.all([params, searchParams]);
  const requestedTab = resolveProfileTab(query);
  const page =
    requestedTab === "about" || requestedTab === "drafts"
      ? 1
      : resolveProfilePage(query.page);
  const supabase = await createClient();

  const data = await loadProfileView({
    supabase,
    username,
    tab: requestedTab,
    page,
  });

  /**
   * Null means the database answered and had nothing to show: no such
   * username, or a row the profiles policy declined to reveal. A failed query
   * never reaches here, because `loadProfileView` throws and the segment's
   * error boundary takes it. A 404 during an outage would tell every visitor
   * that every member's profile did not exist.
   */
  if (!data) notFound();

  return <ProfilePageContent data={data} />;
}
