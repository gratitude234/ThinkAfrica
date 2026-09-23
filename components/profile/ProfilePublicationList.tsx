import Link from "next/link";
import PostCover from "@/components/post/PostCover";
import ProfileWorkLink from "@/components/profile/ProfileWorkLink";
import type { ProfileViewerState } from "@/lib/profileFunnel";
import { profileTabHref } from "@/lib/profileTabs";
import type { ProfilePublicationPage } from "@/lib/profileViewData";
import { formatDate } from "@/lib/utils";

export default function ProfilePublicationList({ username, profileId, tab, publications, isOwnProfile, viewerState, preview = false }: {
  username: string; profileId: string; tab: "posts" | "articles";
  publications: ProfilePublicationPage; isOwnProfile: boolean;
  viewerState: ProfileViewerState; preview?: boolean;
}) {
  const { kind, items, page, hasNextPage, hasPreviousPage } = publications;
  if (!items.length) return <div className="profile-empty">
    <p>{page > 1 ? "Nothing more to show." : kind === "post" ? "No posts yet." : "No articles yet."}</p>
    {page > 1 ? <Link className="focus-ring" href={profileTabHref(username, tab)}>Back to the newest</Link>
      : isOwnProfile ? <Link className="focus-ring" href="/write">Write your first Post or Article</Link> : null}
  </div>;
  const tracking = { profileId, viewerState, surface: kind === "post" ? "profile_posts" as const : "profile_articles" as const };
  const Heading = preview ? "h3" : "h2";
  return <section aria-label={kind === "post" ? "Posts" : "Articles"}>
    <ul className={`profile-publications ${preview ? "profile-publications-preview" : ""}`}>
      {items.map(item => {
        const date = item.publishedAt ?? item.createdAt;
        const article = kind === "article";
        const content = article ? item.title?.trim() || "Untitled Article" : item.excerpt || "View post";
        const work = <ProfileWorkLink href={`/post/${item.slug}`} workId={item.id} workKind={kind} tracking={tracking}
          className="stretch-target focus-ring after:z-10">{content}</ProfileWorkLink>;
        return <li key={item.id}><article className={`profile-publication ${article ? "is-article" : "is-post"}`}>
          <div className="min-w-0 flex-1">
            {article ? <Heading className="profile-article-title">{work}</Heading> : <p className="profile-post-text">{work}</p>}
            {article && item.excerpt ? <p className="profile-standfirst">{item.excerpt}</p> : null}
            <p className="profile-publication-meta"><time dateTime={date}>{formatDate(date)}</time>
              {article && item.wordCount && item.wordCount > 0 ? ` · ${Math.max(1, Math.ceil(item.wordCount / 200))} min read` : null}
            </p>
          </div>
          {item.coverImageUrl ? <PostCover src={item.coverImageUrl} alt="" content_kind={kind}
            sizes={article ? (preview ? "88px" : "112px") : (preview ? "56px" : "64px")}
            className="profile-publication-cover" imageClassName="object-cover" /> : null}
        </article></li>;
      })}
    </ul>
    {!preview && (hasPreviousPage || hasNextPage) ? <nav aria-label="Pages" className="profile-pagination">
      {hasPreviousPage ? <Link href={profileTabHref(username, tab, page - 1)} className="focus-ring">Newer</Link> : <span />}
      {hasNextPage ? <Link href={profileTabHref(username, tab, page + 1)} className="focus-ring">Older</Link> : null}
    </nav> : null}
  </section>;
}
