import Link from "next/link";
import PostCover from "@/components/post/PostCover";
import ProfileWorkLink from "@/components/profile/ProfileWorkLink";
import type { ProfileViewerState } from "@/lib/profileFunnel";
import { profileTabHref, type ProfileTab } from "@/lib/profileTabs";
import type { ProfilePublicationPage } from "@/lib/profileViewData";
import { formatDate } from "@/lib/utils";

const EMPTY_COPY = {
  post: "No posts yet.",
  article: "No articles yet.",
} as const;

const PAGE_LINK =
  "focus-ring inline-flex min-h-11 items-center rounded-lg border border-card-border bg-card px-4 text-sm font-semibold text-ink-soft hover:text-ink";

/**
 * One page of a writer's Posts or Articles, newest first.
 *
 * A row is a title, a line of the piece, and a date, with the cover as a
 * thumbnail when there is one. Nothing on it grades the work: no evidence
 * chips, no citation or source counts, no quality labels.
 */
export default function ProfilePublicationList({
  username,
  profileId,
  tab,
  publications,
  isOwnProfile,
  viewerState,
}: {
  username: string;
  profileId: string;
  tab: Exclude<ProfileTab, "about">;
  publications: ProfilePublicationPage;
  isOwnProfile: boolean;
  viewerState: ProfileViewerState;
}) {
  const { kind, items, page, hasNextPage, hasPreviousPage } = publications;

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-card-border bg-card px-6 py-10 text-center">
        <p className="text-sm text-ink-muted">
          {page > 1 ? "Nothing more to show." : EMPTY_COPY[kind]}
        </p>
        {page > 1 ? (
          <Link
            href={profileTabHref(username, tab)}
            className="tap-target focus-ring mt-3 inline-block text-sm font-semibold text-emerald-ink"
          >
            Back to the newest
          </Link>
        ) : isOwnProfile ? (
          <Link
            href="/write"
            className="tap-target focus-ring mt-3 inline-block text-sm font-semibold text-emerald-ink"
          >
            Write your first Post or Article.
          </Link>
        ) : null}
      </div>
    );
  }

  const tracking = {
    profileId,
    viewerState,
    surface: kind === "post" ? ("profile_posts" as const) : ("profile_articles" as const),
  };

  return (
    <section aria-label={kind === "post" ? "Posts" : "Articles"}>
      <ul className="-mx-3 divide-y divide-card-border">
        {items.map((item) => {
          const title = item.title?.trim() || null;
          // An untitled Post leads with its own text, so repeating the excerpt
          // below the heading would print it twice.
          const headline = title ?? item.excerpt ?? "View post";
          const date = item.publishedAt ?? item.createdAt;
          return (
            <li key={item.id}>
              <article className="group relative flex items-start gap-4 px-3 py-5 transition-colors duration-150 ease-out hover:bg-card motion-reduce:transition-none sm:gap-5">
                <div className="min-w-0 flex-1">
                  <h2
                    className={
                      title
                        ? "font-display line-clamp-2 text-[18px] font-semibold leading-snug text-ink sm:text-[19px]"
                        : "line-clamp-3 text-[15px] font-medium leading-6 text-ink"
                    }
                  >
                    <ProfileWorkLink
                      href={`/post/${item.slug}`}
                      workId={item.id}
                      workKind={kind}
                      tracking={tracking}
                      className="stretch-target focus-ring after:z-10 group-hover:text-emerald-brand"
                    >
                      {headline}
                    </ProfileWorkLink>
                  </h2>
                  {title && item.excerpt ? (
                    <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-ink-soft">
                      {item.excerpt}
                    </p>
                  ) : null}
                  <p className="mt-2 text-xs text-ink-muted">
                    <time dateTime={date}>{formatDate(date)}</time>
                  </p>
                </div>
                {item.coverImageUrl ? (
                  <PostCover
                    src={item.coverImageUrl}
                    alt={title ?? "Cover image"}
                    content_kind={kind}
                    sizes="(max-width: 640px) 84px, 112px"
                    className="aspect-[4/3] w-[84px] shrink-0 overflow-hidden rounded-lg border border-card-border bg-canvas sm:w-[112px]"
                    imageClassName="object-cover"
                  />
                ) : null}
              </article>
            </li>
          );
        })}
      </ul>

      {hasPreviousPage || hasNextPage ? (
        <nav aria-label="Pages" className="mt-6 flex items-center justify-between gap-3">
          {hasPreviousPage ? (
            <Link href={profileTabHref(username, tab, page - 1)} className={PAGE_LINK}>
              Newer
            </Link>
          ) : (
            <span />
          )}
          {hasNextPage ? (
            <Link href={profileTabHref(username, tab, page + 1)} className={PAGE_LINK}>
              Older
            </Link>
          ) : null}
        </nav>
      ) : null}
    </section>
  );
}
