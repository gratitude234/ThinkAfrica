"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { RecordMetricLegend } from "@/components/profile/EvidenceLegend";
import UserAvatar from "@/components/ui/UserAvatar";
import {
  getProfileIdentityLines,
  type PublicProfileIdentity,
} from "@/lib/profileIdentity";
import { buildProfileRecordHref, type ProfileRecordSummary } from "@/lib/profileRecord";
import { getLinkedProfileRecordMetrics } from "@/lib/profileRecordMetrics";
import {
  PROFILE_HEADER_TOPIC_LIMIT,
  type DemonstratedTopic,
} from "@/lib/profileTopics";

/**
 * The identity card a visitor reads, with no knowledge of who is rendering it.
 *
 * Extracted from ProfileHeader so the Command Center's preview shows the
 * actual public presentation rather than a second implementation of it. The
 * header supplies real relationship controls through the `actions` slot and
 * the preview supplies none, which is the only difference between them.
 *
 * Everything derived here comes from the same shared helpers the public page
 * uses: `getProfileIdentityLines` for the headline and positioning,
 * `getLinkedProfileRecordMetrics` for which metrics are worth showing. A
 * change to either follows into both surfaces at once.
 */
export interface ProfileIdentityPanelProps {
  profile: PublicProfileIdentity;
  demonstratedTopics: DemonstratedTopic[];
  recordSummary: ProfileRecordSummary;
  followerCount: number;
  isOwnProfile: boolean;
  /** Relationship controls, or nothing in a preview. */
  actions?: ReactNode;
  /** Availability badge, which the header makes interactive and preview does not. */
  availability?: ReactNode;
  /**
   * A preview renders the same markup without offering anywhere to go: no
   * links, no toggles, nothing focusable. The container is also marked
   * `inert` by the caller so a keyboard never lands inside it.
   */
  interactive?: boolean;
}

function VerifiedMark({ profile }: { profile: PublicProfileIdentity }) {
  if (!profile.verified) return null;
  const label = profile.verified_type
    ? `Verified ${profile.verified_type}`
    : "Verified profile";
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-brand text-xs font-bold text-white"
    >
      ✓
    </span>
  );
}

function RecordOverview({
  username,
  summary,
  isOwnProfile,
  interactive,
  className = "",
}: {
  username: string;
  summary: ProfileRecordSummary;
  isOwnProfile: boolean;
  interactive: boolean;
  className?: string;
}) {
  const metrics = getLinkedProfileRecordMetrics(summary, username);

  if (metrics.length === 0) {
    if (!isOwnProfile) return null;
    return (
      <div className={`border-t border-card-border bg-canvas/70 px-4 py-4 sm:px-6 lg:px-0 ${className}`}>
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gold-ink">
          Intellectual Record
        </p>
        <p className="mt-2 text-sm leading-6 text-ink-soft">
          Your record fills in as you publish. Your first contribution starts it.
        </p>
        {interactive ? (
          <Link
            href="/write"
            className="tap-target focus-ring mt-1 inline-block text-sm font-semibold text-emerald-ink"
          >
            Publish your first contribution →
          </Link>
        ) : (
          <span className="mt-1 inline-block text-sm font-semibold text-emerald-ink">
            Publish your first contribution →
          </span>
        )}
      </div>
    );
  }

  const tileClass = "flex min-w-0 flex-col gap-0.5 px-3 py-1 first:pl-0 last:pr-0 sm:px-5";
  const labelClass = "truncate text-[10.5px] text-ink-muted sm:text-xs";
  const valueClass = "font-display text-xl font-semibold tabular-nums sm:text-2xl";

  return (
    <div className={`border-t border-card-border bg-canvas/70 px-4 py-4 sm:px-6 lg:px-0 ${className}`}>
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gold-ink">
          Intellectual Record
        </p>
        {interactive ? <RecordMetricLegend /> : null}
      </div>
      {/* A flex row, not an N-column grid. Two surviving metrics in
          grid-cols-2 each owned half the card, so a label and a number sat in
          about 100px of a 590px cell and the rest of the strip was empty.
          Tiles size to their content now and the row reads as one group.
          Onboarding still uses the grid helper: its preview is a full-width
          equal-column strip, which is a different job. */}
      <div className="flex flex-wrap items-start divide-x divide-card-border">
        {metrics.map((metric) => {
          const body = (
            <>
              <span className={labelClass}>{metric.label}</span>
              <span
                className={`${valueClass} ${interactive ? "text-ink group-hover:text-emerald-brand" : "text-ink"}`}
              >
                {metric.value.toLocaleString()}
              </span>
            </>
          );
          return interactive ? (
            <Link
              key={metric.key}
              href={metric.href}
              aria-label={`${metric.value} ${metric.label}. ${metric.description}`}
              className={`focus-ring group ${tileClass}`}
            >
              {body}
            </Link>
          ) : (
            <div key={metric.key} className={tileClass}>
              {body}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ProfileIdentityPanel({
  profile,
  demonstratedTopics,
  recordSummary,
  followerCount,
  isOwnProfile,
  actions = null,
  availability = null,
  interactive = true,
}: ProfileIdentityPanelProps) {
  const [aboutExpanded, setAboutExpanded] = useState(false);
  const [bioOverflows, setBioOverflows] = useState(false);
  const bioRef = useRef<HTMLParagraphElement>(null);
  const displayName = profile.full_name ?? profile.username;
  const identity = getProfileIdentityLines(profile);
  const bio = profile.bio?.trim() || null;
  const showAboutBlock = Boolean(bio) || (isOwnProfile && interactive);
  const headerTopics = demonstratedTopics.slice(0, PROFILE_HEADER_TOPIC_LIMIT);

  /**
   * Whether the bio is actually clipped, measured rather than guessed. A
   * character-count threshold only agrees with `line-clamp-3` at desktop
   * width: on a 360px phone three lines hold roughly 125 characters.
   */
  useEffect(() => {
    const node = bioRef.current;
    if (!node || aboutExpanded) return;

    const measure = () => setBioOverflows(node.scrollHeight > node.clientHeight + 1);
    measure();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [bio, aboutExpanded]);

  const showAboutToggle = interactive && (bioOverflows || aboutExpanded);

  return (
    /* Deliberately not a card. The card tokens are feed furniture: a rounded,
       bordered box says "one item among several, separable from the page",
       which is right for a Featured entry and wrong here. The header is not an
       item on the profile, it is the profile, and boxing it made the person
       read as row zero of a list. It keeps the white ground, because the
       Record and About strips below separate themselves from it with
       `bg-canvas/70`, but it gives up the radius and the side edges and
       terminates on a single rule instead. Breaking the shell gutters below
       `lg` is what lets the cover be a real band rather than a picture inset
       on three sides. Meeting the nav is the shell's job rather than this
       element's: the page's top padding has to survive when a guest banner is
       sitting above it, and only the shell can see whether one is. */
    <section className="-mx-4 flex flex-col overflow-hidden border-b border-card-border bg-card sm:-mx-6 lg:mx-0">
      {profile.cover_image_url ? (
        /* An author uploads a picture, not a strip. Inset in a card this band
           ran about 10.5:1, and widening it to 6.7:1 barely helped, because
           object-cover still kept a sliver through the middle of whatever
           arrived: a portrait lost its subject and a typographic cover came
           out as one sliced line of letters. Going full-bleed buys back the
           width the gutters were taking, so these taller heights land near
           2.7:1 on a phone and 5.3:1 at desktop. Still a band rather than a
           hero, and it survives an ordinary upload. */
        <div className="relative h-36 overflow-hidden bg-canvas sm:h-44 lg:h-56">
          <Image
            src={profile.cover_image_url}
            alt=""
            fill
            sizes="(max-width: 1180px) 100vw, 1180px"
            className="object-cover object-center"
          />
        </div>
      ) : (
        <div className="h-14 bg-[radial-gradient(circle_at_18%_0%,rgba(16,185,129,0.14),transparent_38%),linear-gradient(135deg,#FFFFFF,#FAF8F5)] sm:h-16" />
      )}

      <div className="profile-identity px-4 py-5 sm:px-6 sm:py-7 lg:px-0">
        <UserAvatar
          name={displayName}
          src={profile.avatar_url}
          size={88}
          /* Positioned, because the cover above it is. UserAvatar renders a
             bare img, and a positioned sibling paints above non-positioned
             inline content in the same stacking context, so the cover was
             covering the 48px of avatar that -mt-12 pulls up into it: the
             avatar rendered as a partial circle on every profile that has a
             cover image. It looked correct without one only because that
             fallback is an unpositioned div. */
          className="profile-identity-avatar relative z-10 -mt-12 shrink-0 border-4 border-card shadow-sm sm:-mt-14"
        />

        <div className="profile-identity-name min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-3xl font-semibold leading-tight text-ink">
              {displayName}
            </h1>
            <VerifiedMark profile={profile} />
          </div>
          <p className="mt-1 text-sm text-ink-muted">@{profile.username}</p>
          <p className="mt-3 text-[15px] font-medium text-ink-soft">{identity.headline}</p>
          {identity.affiliation ? (
            <p className="mt-1 text-sm text-ink-muted">{identity.affiliation}</p>
          ) : null}
          {/* The author's own account of what they are working on. Set larger
              than the affiliation and lighter than a title, because it is a
              position rather than a credential: no chip, no border, no badge
              treatment that would make it read as something the platform
              awarded. */}
          {identity.positioning ? (
            <p className="mt-3 max-w-[52ch] text-[15px] leading-6 text-ink">
              {identity.positioning}
            </p>
          ) : isOwnProfile && interactive ? (
            <Link
              href="/settings/profile#focus"
              className="tap-target focus-ring mt-3 inline-block text-sm font-semibold text-emerald-ink"
            >
              Add your intellectual focus →
            </Link>
          ) : null}
        </div>

        {actions ? (
          <div className="profile-identity-actions flex flex-wrap items-start gap-2 sm:max-w-[290px] sm:justify-end">
            {actions}
          </div>
        ) : null}

        <div className="profile-identity-meta min-w-0">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            {interactive ? (
              <Link
                href={`/${profile.username}/followers`}
                className="tap-target focus-ring font-medium text-ink-soft hover:text-ink"
              >
                {followerCount.toLocaleString()} follower{followerCount === 1 ? "" : "s"}
              </Link>
            ) : (
              <span className="font-medium text-ink-soft">
                {followerCount.toLocaleString()} follower{followerCount === 1 ? "" : "s"}
              </span>
            )}
            {availability}
          </div>

          {/* Every chip here resolves to at least one record entry, because
              the list is built from tags on published work rather than from
              anything the author declared. */}
          {headerTopics.length > 0 ? (
            <div className="mt-3">
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
                Demonstrated topics
              </h2>
              <ul className="mt-1.5 flex flex-wrap gap-2" aria-label="Demonstrated topics">
                {headerTopics.map((topic) => {
                  const body = (
                    <>
                      {topic.label}
                      {/* Hidden from the accessible name; the link states the
                          count in words instead, so the digit is not announced
                          bare as "Governance 4". */}
                      <span aria-hidden="true" className="tabular-nums text-emerald-brand/70">
                        {topic.count}
                      </span>
                    </>
                  );
                  const chipLabel = `${topic.label}: ${topic.count} ${
                    topic.count === 1 ? "contribution" : "contributions"
                  } in the Intellectual Record`;
                  const chipClass =
                    "inline-flex items-center gap-1.5 rounded-full bg-green-tint px-3 py-1.5 text-xs font-medium text-emerald-brand";
                  return (
                    <li key={topic.key}>
                      {interactive ? (
                        <Link
                          href={buildProfileRecordHref({
                            username: profile.username,
                            topic: topic.key,
                          })}
                          aria-label={chipLabel}
                          className={`tap-target focus-ring hover:opacity-80 ${chipClass}`}
                        >
                          {body}
                        </Link>
                      ) : (
                        // The preview renders the same chip without a
                        // destination, so the count is spelled out in text
                        // that is available to assistive tech either way.
                        <span className={chipClass}>
                          {body}
                          <span className="sr-only">{chipLabel}</span>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : isOwnProfile ? (
            <p className="mt-3 text-xs leading-5 text-ink-muted">
              Topics appear here once you publish work tagged with them.
            </p>
          ) : null}
        </div>
      </div>

      {/* On a phone the numbers come before About: they are the reason the
          page exists. From 640px they return to the foot of the header. */}
      <RecordOverview
        username={profile.username}
        summary={recordSummary}
        isOwnProfile={isOwnProfile}
        interactive={interactive}
        className="order-2 sm:order-3"
      />

      {showAboutBlock ? (
        <div className="order-3 px-4 pb-5 sm:order-2 sm:px-6 sm:pb-7 lg:px-0">
          {bio ? (
            <div className="border-t border-card-border pt-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-ink">About</h2>
                {isOwnProfile && interactive ? (
                  <Link
                    href="/settings/profile#focus"
                    className="tap-target focus-ring text-xs font-semibold text-emerald-ink"
                  >
                    Edit
                  </Link>
                ) : null}
              </div>
              <p
                ref={bioRef}
                className={`mt-2 max-w-[72ch] whitespace-pre-line text-sm leading-6 text-ink-soft ${
                  aboutExpanded || !interactive ? "" : "line-clamp-3"
                }`}
              >
                {bio}
              </p>
              {showAboutToggle ? (
                <button
                  type="button"
                  onClick={() => setAboutExpanded((current) => !current)}
                  aria-expanded={aboutExpanded}
                  className="tap-target focus-ring mt-2 text-xs font-semibold text-emerald-ink"
                >
                  {aboutExpanded ? "Show less" : "See more"}
                </button>
              ) : null}
            </div>
          ) : (
            <div className="border-t border-card-border pt-5">
              <Link
                href="/settings/profile#focus"
                className="tap-target focus-ring text-sm font-semibold text-emerald-ink"
              >
                Add an About section
              </Link>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
