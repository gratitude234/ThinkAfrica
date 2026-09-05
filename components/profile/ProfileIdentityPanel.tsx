"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { RecordMetricLegend } from "@/components/profile/EvidenceLegend";
import ImageLightbox from "@/components/ui/ImageLightbox";
import UserAvatar from "@/components/ui/UserAvatar";
import {
  getProfileIdentityLines,
  type PublicProfileIdentity,
} from "@/lib/profileIdentity";
import { buildProfileRecordHref, type ProfileRecordSummary } from "@/lib/profileRecord";
import { getLinkedProfileRecordMetrics } from "@/lib/profileRecordMetrics";
import {
  formatInterestLabel,
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
  /**
   * Optional because the Command Center preview does not load it: that model
   * is built for the owner's own editing surface and adding a second
   * relationship count to it would mean a query the preview has no use for.
   * Omitted, the row simply reads one number instead of two.
   */
  followingCount?: number | null;
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

/**
 * The separator between meta items. Decorative: the items either side are
 * already distinct elements, and a screen reader announcing "middle dot"
 * between every one of them is noise.
 */
function Dot() {
  return (
    <span aria-hidden="true" className="text-card-border-hover">
      ·
    </span>
  );
}

/**
 * One line of identity metadata with separators placed between the items that
 * actually rendered. Built from a list rather than written inline because
 * affiliation is optional, and a hand-written `·` before it prints a leading
 * dot on every profile that has no institution.
 *
 * The separator trails its item rather than leading the next one. Both read
 * identically while the line fits, and they differ entirely when it wraps: a
 * leading dot starts the new line looking like a bullet, which is what a
 * 320px phone showed for "· 64 following" and "· Political Science student".
 * Trailing, the dot stays on the line it finishes.
 */
function MetaLine({
  items,
  className = "",
}: {
  items: Array<{ key: string; node: ReactNode }>;
  className?: string;
}) {
  if (items.length === 0) return null;

  return (
    <p className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${className}`}>
      {items.map((item, index) => (
        <span key={item.key} className="inline-flex items-center gap-x-2">
          {item.node}
          {index < items.length - 1 ? <Dot /> : null}
        </span>
      ))}
    </p>
  );
}

function VerifiedMark({ profile }: { profile: PublicProfileIdentity }) {
  if (!profile.verified) return null;
  const label = profile.verified_type
    ? `Verified ${profile.verified_type}`
    : "Verified profile";
  /**
   * The name of the state is the accessible name, and it is on the element
   * itself. The mockup explains verification in a hover card; a hover card is
   * unreachable by touch and by keyboard, so the meaning stays where every
   * input method can get at it and `title` is only a pointer convenience on
   * top of it.
   */
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-brand text-[11px] font-bold leading-none text-white"
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

const COVER_BAND = "relative h-36 overflow-hidden bg-canvas sm:h-44 lg:h-56";

const COVER_BUTTON =
  COVER_BAND +
  " block w-full cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-inset";

/**
 * The cover, and the one way to see what the crop cut off.
 *
 * An author uploads a picture, not a strip, so some of it is always going to
 * be cut. Two things narrow that gap from opposite ends. The band itself is
 * full-bleed rather than inset in a card, which buys back the width the
 * gutters were taking and drops the crop from about 10.5:1 to nearer 2.7:1 on
 * a phone and 5.3:1 at desktop: enough that a portrait keeps its subject and a
 * typographic cover is no longer one sliced line of letters. The mockup insets
 * the band and rounds its corners; doing that here would hand back the width
 * this deliberately reclaimed, so the production band wins. And tapping shows
 * the rest, which is the gesture a reader already makes at a cropped image and
 * which did nothing here. It opens the same viewer post images use, so the
 * back gesture, swipe-to-dismiss and Escape all behave the way they do
 * everywhere else in the app.
 *
 * The avatar sits above this with its own z-index, so the corner it covers
 * belongs to the avatar rather than to the viewer.
 */
function CoverBand({
  src,
  displayName,
  interactive,
}: {
  src: string;
  displayName: string;
  interactive: boolean;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const handleClose = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  const image = (
    <Image
      src={src}
      alt=""
      fill
      sizes="(max-width: 1180px) 100vw, 1180px"
      className="object-cover object-center"
    />
  );

  // The Command Center preview renders the same band with nothing to click.
  if (!interactive) return <div className={COVER_BAND}>{image}</div>;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label="View cover image full screen"
        className={COVER_BUTTON}
      >
        {image}
      </button>
      <ImageLightbox
        src={src}
        alt={displayName + " cover image"}
        open={open}
        onClose={handleClose}
      />
    </>
  );
}

export default function ProfileIdentityPanel({
  profile,
  demonstratedTopics,
  recordSummary,
  followerCount,
  followingCount = null,
  isOwnProfile,
  actions = null,
  availability = null,
  interactive = true,
}: ProfileIdentityPanelProps) {
  const [aboutExpanded, setAboutExpanded] = useState(false);
  const [bioOverflows, setBioOverflows] = useState(false);
  const bioRef = useRef<HTMLParagraphElement>(null);
  const topicsHeadingId = useId();
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

  /**
   * Affiliation, then the two relationship counts, on one line. Both counts
   * are single text nodes rather than an emphasised number beside a label:
   * an element whose whole text is "0" reads as a metric of zero to anything
   * scanning the page, which is exactly what the record strip below is
   * careful never to print.
   */
  const countLinkClass =
    "tap-target focus-ring font-medium text-ink-soft hover:text-ink";
  const metaItems: Array<{ key: string; node: ReactNode }> = [];
  if (identity.affiliation) {
    metaItems.push({ key: "affiliation", node: <span>{identity.affiliation}</span> });
  }
  metaItems.push({
    key: "followers",
    node: interactive ? (
      <Link href={`/${profile.username}/followers`} className={countLinkClass}>
        {followerCount.toLocaleString()} follower{followerCount === 1 ? "" : "s"}
      </Link>
    ) : (
      <span className="font-medium text-ink-soft">
        {followerCount.toLocaleString()} follower{followerCount === 1 ? "" : "s"}
      </span>
    ),
  });
  if (typeof followingCount === "number") {
    metaItems.push({
      key: "following",
      node: interactive ? (
        <Link href={`/${profile.username}/following`} className={countLinkClass}>
          {followingCount.toLocaleString()} following
        </Link>
      ) : (
        <span className="font-medium text-ink-soft">
          {followingCount.toLocaleString()} following
        </span>
      ),
    });
  }

  return (
    /* Deliberately not a card. The card tokens are feed furniture: a rounded,
       bordered box says "one item among several, separable from the page",
       which is right for a Featured entry and wrong here. The header is not an
       item on the profile, it is the profile, and boxing it made the person
       read as row zero of a list. It keeps the white ground, because the
       Record strip below separates itself from it with `bg-canvas/70`, but it
       gives up the radius and the side edges and terminates on a single rule
       instead. Breaking the shell gutters below `lg` is what lets the cover be
       a real band rather than a picture inset on three sides. Meeting the nav
       is the shell's job rather than this element's: the page's top padding
       has to survive when a guest banner is sitting above it, and only the
       shell can see whether one is. */
    <section className="-mx-4 flex flex-col overflow-hidden border-b border-card-border bg-card sm:-mx-6 lg:mx-0">
      {profile.cover_image_url ? (
        <CoverBand
          src={profile.cover_image_url}
          displayName={displayName}
          interactive={interactive}
        />
      ) : (
        /* Deep enough to read as a band the avatar sits on rather than as a
           printing error. The previous mix bottomed out near #FFFFFF, so on a
           white card there was nothing to see and the avatar appeared to float
           above a seam. */
        <div className="h-14 bg-[radial-gradient(circle_at_18%_0%,rgba(7,57,41,0.16),transparent_46%),linear-gradient(135deg,#F1EEE8,#E9E5DE)] sm:h-16" />
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
          /* rounded-full belongs here rather than only inside UserAvatar: the
             fallback path renders a circular SVG inside a plain div, so the
             4px card-coloured border this call site adds was painting a white
             square around every avatar-less profile. */
          className="profile-identity-avatar relative z-10 -mt-12 shrink-0 overflow-hidden rounded-full border-4 border-card shadow-sm sm:-mt-14"
        />

        <div className="profile-identity-name min-w-0">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <h1 className="font-display text-[28px] font-semibold leading-[1.06] tracking-[-0.015em] text-ink [overflow-wrap:anywhere] sm:text-[32px]">
              {displayName}
            </h1>
            <VerifiedMark profile={profile} />
          </div>
          {/* The handle and what this person is, on one line. Routed through
              MetaLine rather than written inline so the separator follows the
              same trailing rule as the line below it: a long handle wraps, and
              the dot has to stay with the handle rather than open a new line
              in front of the descriptor. */}
          <MetaLine
            className="mt-1.5 text-sm"
            items={[
              {
                key: "handle",
                node: (
                  <span className="text-ink-muted [overflow-wrap:anywhere]">
                    @{profile.username}
                  </span>
                ),
              },
              {
                key: "headline",
                node: (
                  <span className="font-semibold text-ink-soft">
                    {identity.headline}
                  </span>
                ),
              },
            ]}
          />
        </div>

        <div className="profile-identity-meta min-w-0">
          <MetaLine items={metaItems} className="text-[13.5px] text-ink-muted" />

          {availability ? <div className="mt-3">{availability}</div> : null}

          {showAboutBlock ? (
            <div className="mt-4">
              {bio ? (
                <>
                  <p
                    ref={bioRef}
                    className={`max-w-measure whitespace-pre-line text-[15.5px] leading-[1.62] text-ink-soft ${
                      aboutExpanded || !interactive ? "" : "line-clamp-3"
                    }`}
                  >
                    {bio}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-4">
                    {showAboutToggle ? (
                      <button
                        type="button"
                        onClick={() => setAboutExpanded((current) => !current)}
                        aria-expanded={aboutExpanded}
                        className="tap-target focus-ring text-sm font-semibold text-emerald-ink"
                      >
                        {aboutExpanded ? "Show less" : "More"}
                      </button>
                    ) : null}
                    {isOwnProfile && interactive ? (
                      <Link
                        href="/settings/profile#focus"
                        className="tap-target focus-ring text-xs font-semibold text-ink-muted hover:text-ink"
                      >
                        Edit
                      </Link>
                    ) : null}
                  </div>
                </>
              ) : (
                <Link
                  href="/settings/profile#focus"
                  className="tap-target focus-ring text-sm font-semibold text-emerald-ink"
                >
                  Add an About section
                </Link>
              )}
            </div>
          ) : null}

          {/* The author's own account of what they are working on. Secondary
              to the bio and the work below it by design: it is set quieter and
              smaller than the biography rather than above it, so it reads as a
              footnote to the identity instead of competing with the name for
              the top of the page. No chip, no border, no badge treatment that
              would make it look like something the platform awarded. */}
          {identity.positioning ? (
            <p className="mt-3 max-w-measure text-[13.5px] leading-6 text-ink-muted">
              {identity.positioning}
            </p>
          ) : isOwnProfile && interactive ? (
            /* Set at the weight of the Edit affordance above it, not at the
               weight of a primary call to action. Rendering the owner's empty
               focus prompt in brand green put the loudest thing on the page
               directly under the biography, which is the one comparison this
               statement is not allowed to win. */
            <Link
              href="/settings/profile#focus"
              className="tap-target focus-ring mt-3 inline-block text-xs font-semibold text-ink-muted hover:text-ink"
            >
              Add your intellectual focus
            </Link>
          ) : null}
        </div>

        {/* Below 640px the grid stacks in source order, so the mandated
            reading order and the focus order are the same sequence: the
            actions come after the bio and before the topics. From 640px the
            grid lifts this into the column beside the name without the markup
            moving. */}
        {actions ? (
          <div className="profile-identity-actions flex flex-wrap items-start gap-2 sm:max-w-[290px] sm:justify-end">
            {actions}
          </div>
        ) : null}

        {/* Its own area, after the actions, because the mandated reading order
            ends "bio, actions, Writes about". Every entry resolves to at least
            one record entry: the list is built from tags on published work
            rather than from anything the author declared.

            Set as text rather than as chips. A row of tinted pills reads as
            metadata the platform attached; the same words in the display face,
            at reading size, read as the subjects this person writes about,
            which is the one claim this block exists to make. */}
        {headerTopics.length > 0 ? (
          <div className="profile-identity-topics min-w-0">
            <h2
              id={topicsHeadingId}
              className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted"
            >
              Writes about
            </h2>
            {/* Labelled by the heading rather than by a separate aria-label,
                so the name assistive tech announces is the words on screen.
                The two used to differ: the group was called "Demonstrated
                topics" while nothing on the page said that. */}
            <ul
              className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-2"
              aria-labelledby={topicsHeadingId}
            >
              {headerTopics.map((topic) => {
                /* Tags arrive as the author typed them, which on real
                   profiles means "education policy" and "nigeria" set in the
                   display face beside each other. The same rule the interest
                   chips already use: anything carrying a capital is left
                   alone, so "pan-African" survives. */
                const label = formatInterestLabel(topic.label);
                const body = (
                  <>
                    <span className="font-display text-[17px] font-semibold leading-tight">
                      {label}
                    </span>
                    {/* Hidden from the accessible name; the link states the
                        count in words instead, so the digit is not announced
                        bare as "Governance 4". */}
                    <span
                      aria-hidden="true"
                      className="text-[11px] font-medium tabular-nums text-ink-muted"
                    >
                      {topic.count}
                    </span>
                  </>
                );
                const topicLabel = `${label}: ${topic.count} ${
                  topic.count === 1 ? "contribution" : "contributions"
                } in the Intellectual Record`;
                return (
                  <li key={topic.key}>
                    {interactive ? (
                      <Link
                        href={buildProfileRecordHref({
                          username: profile.username,
                          topic: topic.key,
                        })}
                        aria-label={topicLabel}
                        className="tap-target focus-ring inline-flex items-baseline gap-1.5 text-ink transition-colors hover:text-emerald-brand"
                      >
                        {body}
                      </Link>
                    ) : (
                      // The preview renders the same entry without a
                      // destination, so the count is spelled out in text
                      // that is available to assistive tech either way.
                      <span className="inline-flex items-baseline gap-1.5 text-ink">
                        {body}
                        <span className="sr-only">{topicLabel}</span>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : isOwnProfile ? (
          <p className="profile-identity-topics text-xs leading-5 text-ink-muted">
            Topics appear here once you publish work tagged with them.
          </p>
        ) : null}
      </div>

      <RecordOverview
        username={profile.username}
        summary={recordSummary}
        isOwnProfile={isOwnProfile}
        interactive={interactive}
      />
    </section>
  );
}
