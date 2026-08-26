"use client";

import FeaturedWork from "@/components/profile/FeaturedWork";
import ProfileBackground from "@/components/profile/ProfileBackground";
import ProfileIdentityPanel from "@/components/profile/ProfileIdentityPanel";
import type { PublicProfileIdentity } from "@/lib/profileIdentity";
import type { ProfileRecordSummary } from "@/lib/profileRecord";
import type { DemonstratedTopic } from "@/lib/profileTopics";

export interface ProfilePreviewData {
  profile: PublicProfileIdentity;
  demonstratedTopics: DemonstratedTopic[];
  interests: string[];
  recordSummary: ProfileRecordSummary;
  followerCount: number;
  featured: Array<{
    id: string;
    title: string | null;
    slug: string;
    excerpt: string | null;
    type: string;
    feature_note?: string | null;
  }>;
  research: {
    headline?: string | null;
    research_interests?: string[] | null;
    methods?: string[] | null;
    orcid_url?: string | null;
    website_url?: string | null;
  } | null;
  isOpenToOpportunities: boolean;
}

/**
 * What a visitor would see, drawn with the visitor's own components.
 *
 * The identity card, the Featured rail and the Background panel are the same
 * modules the public profile renders, so this cannot drift into a flattering
 * approximation of the real page. What differs is behaviour: no relationship
 * controls, no links, nothing focusable.
 *
 * The whole thing is `inert`, which takes it out of the focus order and the
 * accessibility tree in one attribute. `aria-hidden` alone would not remove
 * its focusable children from the tab order, and a keyboard user tabbing into
 * a preview and finding dead links is worse than not reaching it at all.
 * The heading above it carries the label a screen reader needs.
 */
export default function ProfilePreview({
  data,
  hasUnsavedChanges,
}: {
  data: ProfilePreviewData;
  hasUnsavedChanges: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center rounded-full border border-card-border bg-canvas px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
          Preview
        </span>
        {/* Not colour alone: the word "Unsaved" carries the state for anyone
            who cannot distinguish the tint. */}
        {hasUnsavedChanges ? (
          <span className="inline-flex items-center rounded-full border border-gold-tint bg-gold-tint px-2.5 py-1 text-[11px] font-semibold text-gold-ink">
            Unsaved changes
          </span>
        ) : null}
      </div>

      <div
        inert
        aria-hidden="true"
        className="pointer-events-none origin-top space-y-6 rounded-xl border border-dashed border-card-border p-3"
      >
        <ProfileIdentityPanel
          profile={data.profile}
          demonstratedTopics={data.demonstratedTopics}
          recordSummary={data.recordSummary}
          followerCount={data.followerCount}
          isOwnProfile={false}
          interactive={false}
          availability={
            data.isOpenToOpportunities ? (
              <span className="inline-flex items-center rounded-full border border-green-wash-border bg-green-tint px-3 py-1 text-xs font-semibold text-emerald-ink">
                Open to opportunities
              </span>
            ) : null
          }
        />

        {data.featured.length > 0 ? (
          <FeaturedWork posts={data.featured} isOwnProfile={false} />
        ) : null}

        <ProfileBackground
          profile={data.profile}
          demonstratedTopics={data.demonstratedTopics}
          interests={data.interests}
          research={data.research}
          isOwnProfile={false}
        />
      </div>
    </div>
  );
}
