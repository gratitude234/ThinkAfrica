import "@/components/profile/profile.css";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ProfileRecordList from "@/components/profile/ProfileRecordList";
import { getProfileViewerState } from "@/lib/profileFunnel";
import { getProfileDisplayName } from "@/lib/profileIdentity";
import { PROFILE_SHELL } from "@/lib/profileLayout";
import { profileRecordHref, resolveProfilePage } from "@/lib/profileTabs";
import { loadProfileIdentity, loadProfileRecordView } from "@/lib/profileViewData";
import { createClient } from "@/lib/supabase/server";

interface PageProps {
  params: Promise<{ username: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const [{ username }, query] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const profile = await loadProfileIdentity(supabase, username);
  if (!profile) return { title: "Profile not found - Indegenius" };

  const name = getProfileDisplayName(profile);
  const page = resolveProfilePage(query.page);
  const title = `Intellectual Record · ${name} - Indegenius`;
  const description = `Published Posts and Articles by ${name} on Indegenius.`;

  return {
    title,
    description,
    alternates: { canonical: profileRecordHref(profile.username, page) },
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

export default async function ProfileRecordPage({ params, searchParams }: PageProps) {
  const [{ username }, query] = await Promise.all([params, searchParams]);
  const page = resolveProfilePage(query.page);
  const supabase = await createClient();
  const data = await loadProfileRecordView({ supabase, username, page });
  if (!data) notFound();

  const displayName = getProfileDisplayName(data.profile);
  const viewerState = getProfileViewerState({
    viewerId: data.viewerId,
    profileId: data.profile.id,
  });

  return (
    <div className={`${PROFILE_SHELL} profile-record-shell`}>
      <ProfileRecordList
        username={data.profile.username}
        displayName={displayName}
        profileId={data.profile.id}
        record={data.record}
        viewerState={viewerState}
        isOwnProfile={data.isOwnProfile}
      />
    </div>
  );
}
