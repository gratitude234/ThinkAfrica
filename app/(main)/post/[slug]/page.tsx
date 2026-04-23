import Image from "next/image";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import Badge from "@/components/ui/Badge";
import Tag from "@/components/ui/Tag";
import UserAvatar from "@/components/ui/UserAvatar";
import { formatDate, POST_POINTS, type PostType } from "@/lib/utils";
import LikeButton from "./LikeButton";
import BookmarkButton from "./BookmarkButton";
import CommentsLoader from "./CommentsLoader";
import ViewTracker from "./ViewTracker";
import ReadingProgressBar from "./ReadingProgressBar";
import ReadingBar from "./ReadingBar";
import ShareButtons from "./ShareButtons";
import AuthorBioCard from "./AuthorBioCard";
import TableOfContents from "./TableOfContents";
import HighlightShare from "./HighlightShare";
import PublishedToast from "./PublishedToast";
import CiteThis from "./CiteThis";
import AudioSummaryPlayer from "@/components/post/AudioSummaryPlayer";

interface PageProps {
  params: Promise<{ slug: string }>;
}

interface ResponsePostRow {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  published_at: string | null;
  profiles:
    | {
        username: string;
        full_name: string | null;
        avatar_url: string | null;
        verified?: boolean;
      }
    | {
        username: string;
        full_name: string | null;
        avatar_url: string | null;
        verified?: boolean;
      }[];
}

interface ParentPostRef {
  id: string;
  title: string;
  slug: string;
}

function estimateReadTime(content: string): number {
  const text = content.replace(/<[^>]*>/g, " ");
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

function countWords(content: string): number {
  return content.replace(/<[^>]*>/g, " ").trim().split(/\s+/).filter(Boolean).length;
}

function extractHeadings(content: string): { id: string; text: string; level: number }[] {
  const regex = /<h([23])[^>]*>(.*?)<\/h[23]>/gi;
  const matches: RegExpExecArray[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) matches.push(match);

  return matches.map((item, index) => ({
    id: `heading-${index}`,
    text: item[2].replace(/<[^>]*>/g, ""),
    level: parseInt(item[1], 10),
  }));
}

function injectHeadingIds(content: string): string {
  let index = 0;
  return content.replace(/<h([23])([^>]*)>(.*?)<\/h[23]>/gi, (_, level, attrs, text) => {
    const id = `heading-${index++}`;
    return `<h${level}${attrs} id="${id}">${text}</h${level}>`;
  });
}

function renderReferenceShortcodes(content: string): string {
  return content.replace(
    /\[ref:(\d+)\]/g,
    (_match, refNumber) =>
      `<sup><a href="#ref-${refNumber}" class="no-underline">[${refNumber}]</a></sup>`
  );
}

function formatReference(reference: {
  authors: string | null;
  year: number | null;
  title: string;
  source: string | null;
  url: string | null;
  doi: string | null;
}) {
  return [
    reference.authors,
    reference.year ? `(${reference.year}).` : null,
    reference.title,
    reference.source,
    reference.doi ? `DOI: ${reference.doi}` : null,
    reference.url,
  ]
    .filter(Boolean)
    .join(" ");
}

function throwPostQueryError(slug: string, stage: "metadata" | "page", error: unknown): never {
  console.error(`[post/${slug}] ${stage} query failed`, error);
  throw new Error(`Failed to load post "${slug}".`);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: post, error: postError } = await supabase
    .from("posts")
    .select(
      "title, excerpt, cover_image_url, slug, status, author_id, type, profiles!posts_author_id_fkey(full_name, university)"
    )
    .eq("slug", slug)
    .in("status", ["published", "pending", "pending_revision", "draft"])
    .maybeSingle();

  if (postError) {
    throwPostQueryError(slug, "metadata", postError);
  }

  if (!post) return { title: "Post not found - ThinkAfrica" };
  // Drafts and in-review posts are only visible to the author (and assigned reviewers/co-authors)
  if (
    (post.status === "draft" ||
      post.status === "pending" ||
      post.status === "pending_revision") &&
    user?.id !== post.author_id
  ) {
    return { title: "Post not found - ThinkAfrica" };
  }

  const author = Array.isArray(post.profiles) ? post.profiles[0] : post.profiles;
  const coverUrl = (post as { cover_image_url?: string | null }).cover_image_url;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://thinkafrika.com";
  const ogImageUrl = `${appUrl}/api/og?${new URLSearchParams({
    title: post.title,
    author: author?.full_name ?? "",
    university: author?.university ?? "",
    type: post.type ?? "essay",
  }).toString()}`;
  const ogImage = coverUrl ?? ogImageUrl;

  return {
    title: `${post.title} - ThinkAfrica`,
    description: post.excerpt ?? `Read this post by ${author?.full_name} on ThinkAfrica`,
    openGraph: {
      title: post.title,
      description: post.excerpt ?? "",
      url: `${appUrl}/post/${post.slug}`,
      siteName: "ThinkAfrica",
      images: [{ url: ogImage, width: 1200, height: 630 }],
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.excerpt ?? "",
      images: [ogImage],
    },
  };
}

export default async function PostPage({ params }: PageProps) {
  const { slug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: post, error: postError } = await supabase
    .from("posts")
    .select(
      `
      id, title, slug, content, excerpt, type, tags, status, author_id,
      created_at, published_at, view_count, cover_image_url, citation_id,
      in_response_to,
      audio_summary_url,
      parent_post:posts!posts_in_response_to_fkey(id, title, slug),
      profiles!posts_author_id_fkey (id, username, full_name, university, field_of_study, bio, avatar_url)
    `
    )
    .eq("slug", slug)
    .in("status", ["published", "pending", "pending_revision", "draft"])
    .maybeSingle();

  if (postError) {
    throwPostQueryError(slug, "page", postError);
  }

  if (!post) notFound();

  // Draft posts: only visible to the author
  if (post.status === "draft" && user?.id !== post.author_id) notFound();

  if (
    (post.status === "pending" || post.status === "pending_revision") &&
    user?.id !== post.author_id
  ) {
    const [
      { data: reviewAssignment, error: reviewAssignmentError },
      { data: coAuthorInvite, error: coAuthorInviteError },
    ] = await Promise.all([
      user
        ? supabase
            .from("post_reviews")
            .select("id")
            .eq("post_id", post.id)
            .eq("reviewer_id", user.id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      user
        ? supabase
            .from("post_authors")
            .select("user_id")
            .eq("post_id", post.id)
            .eq("user_id", user.id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (reviewAssignmentError || coAuthorInviteError) {
      console.error(`[post/${slug}] visibility query failed`, {
        reviewAssignmentError,
        coAuthorInviteError,
      });
      throw new Error(`Failed to verify access for post "${slug}".`);
    }

    if (!reviewAssignment && !coAuthorInvite) notFound();
  }

  const isPublished = post.status === "published";
  const author = Array.isArray(post.profiles) ? post.profiles[0] : post.profiles;
  const coverImageUrl = (post as { cover_image_url?: string | null }).cover_image_url;
  const audioSummaryUrl = (
    post as typeof post & { audio_summary_url?: string | null }
  ).audio_summary_url ?? null;
  const parentPostRaw = (
    post as typeof post & {
      parent_post?: ParentPostRef | ParentPostRef[] | null;
    }
  ).parent_post ?? null;
  const parentPost = Array.isArray(parentPostRaw)
    ? parentPostRaw[0] ?? null
    : parentPostRaw;

  const [
    { count: likeCount },
    { data: referencesRaw },
    { data: coAuthorsRaw },
    { data: responsePostsRaw },
  ] = await Promise.all([
    supabase
      .from("likes")
      .select("*", { count: "exact", head: true })
      .eq("post_id", post.id),
    supabase
      .from("post_references")
      .select("*")
      .eq("post_id", post.id)
      .order("display_order", { ascending: true }),
    supabase
      .from("post_authors")
      .select(
        "user_id, display_order, corresponding_author, accepted_at, profile:profiles!post_authors_user_id_fkey(username, full_name)"
      )
      .eq("post_id", post.id)
      .not("accepted_at", "is", null)
      .order("display_order", { ascending: true }),
    supabase
      .from("posts")
      .select(
        "id, title, slug, excerpt, published_at, profiles!posts_author_id_fkey(username, full_name, avatar_url, verified)"
      )
      .eq("in_response_to", post.id)
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(10),
  ]);

  let userLiked = false;
  let userBookmarked = false;
  if (user) {
    const [{ data: existingLike }, { data: existingBookmark }] = await Promise.all([
      supabase
        .from("likes")
        .select("user_id")
        .eq("post_id", post.id)
        .eq("user_id", user.id)
        .single(),
      supabase
        .from("bookmarks")
        .select("user_id")
        .eq("post_id", post.id)
        .eq("user_id", user.id)
        .single(),
    ]);
    userLiked = !!existingLike;
    userBookmarked = !!existingBookmark;
  }

  const userProfileId: string | null = user?.id ?? null;

  let relatedPosts: Array<{
    id: string;
    title: string;
    slug: string;
    type: string;
    published_at: string | null;
    created_at: string;
    profiles: { full_name: string; username: string } | null;
  }> = [];
  if (isPublished && post.tags && post.tags.length > 0) {
    const { data: relatedRaw } = await supabase
      .from("posts")
      .select(
        "id, title, slug, type, published_at, created_at, profiles!posts_author_id_fkey (full_name, username)"
      )
      .eq("status", "published")
      .neq("id", post.id)
      .overlaps("tags", post.tags)
      .order("published_at", { ascending: false })
      .limit(3);

    relatedPosts = (relatedRaw ?? []).map((item) => ({
      ...item,
      profiles: Array.isArray(item.profiles) ? item.profiles[0] : item.profiles,
    }));
  }

  let userFollowsAuthor = false;
  if (user && author) {
    const { data: followData } = await supabase
      .from("follows")
      .select("follower_id")
      .eq("follower_id", user.id)
      .eq("following_id", author.id)
      .single();
    userFollowsAuthor = !!followData;
  }

  const references = referencesRaw ?? [];
  const acceptedAuthors = (coAuthorsRaw ?? []).map((item) => ({
    ...item,
    profile: Array.isArray(item.profile) ? item.profile[0] : item.profile,
  }));
  const responsePosts = ((responsePostsRaw ?? []) as ResponsePostRow[]).map(
    (response) => ({
      ...response,
      profiles: Array.isArray(response.profiles)
        ? response.profiles[0]
        : response.profiles,
    })
  );
  const primaryAuthorRecord = acceptedAuthors.find((record) => record.user_id === author?.id) ?? null;
  const coAuthors = acceptedAuthors.filter((record) => record.user_id !== author?.id);
  const citationAuthors = (
    acceptedAuthors.length > 0
      ? acceptedAuthors.map((authorRecord) => ({
          full_name: authorRecord.profile?.full_name ?? null,
          username: authorRecord.profile?.username ?? "author",
        }))
      : author
        ? [
            {
              full_name: author.full_name ?? null,
              username: author.username,
            },
          ]
        : []
  ) as Array<{ full_name: string | null; username: string }>;

  const readTime = estimateReadTime(post.content ?? "");
  const wordCount = countWords(post.content ?? "");
  const headings = extractHeadings(post.content ?? "");
  const contentWithIds = renderReferenceShortcodes(
    injectHeadingIds(post.content ?? "")
  );
  const authorName = author?.full_name ?? author?.username ?? "Anonymous";

  return (
    <div className="relative">
      {isPublished ? (
        <>
          <ReadingBar
            postId={post.id}
            userId={user?.id ?? null}
            initialLiked={userLiked}
            initialLikeCount={likeCount ?? 0}
            initialBookmarked={userBookmarked}
            title={post.title}
            slug={post.slug}
          />
          <ReadingProgressBar />
          <ViewTracker slug={slug} />
        </>
      ) : null}

      <PublishedToast
        title={post.title}
        slug={post.slug}
        points={POST_POINTS[(post.type as PostType) ?? "blog"] ?? 10}
        username={author?.username ?? ""}
      />

      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-4">
          <div className="lg:col-span-3">
            <div className="max-w-3xl">
              {post.status === "draft" ? (
                <div className="mb-6 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
                  This post is a <strong>draft</strong> and is only visible to you.{" "}
                  <Link href={`/edit/${post.slug}`} className="font-semibold underline">
                    Edit &amp; publish
                  </Link>
                </div>
              ) : null}

              {post.status === "pending" || post.status === "pending_revision" ? (
                <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  This submission is in the editorial workflow. We&apos;ll
                  notify you when a final decision is recorded.{" "}
                  <Link href="/dashboard" className="font-semibold underline">
                    View dashboard
                  </Link>
                </div>
              ) : null}

              {coverImageUrl ? (
                <div className="relative mb-8 h-64 overflow-hidden rounded-xl sm:h-80 lg:h-[400px]">
                  <Image
                    fill
                    sizes="100vw"
                    priority={true}
                    alt={post.title}
                    src={coverImageUrl}
                    className="object-cover"
                  />
                </div>
              ) : null}

              {audioSummaryUrl ? <AudioSummaryPlayer url={audioSummaryUrl} /> : null}

              <header className="mb-8">
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <Badge type={post.type} wordCount={wordCount} />
                  {post.tags && post.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {post.tags.map((tag: string) => (
                        <Link key={tag} href={`/topics/${encodeURIComponent(tag)}`}>
                          <Tag label={tag} />
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>

                {parentPost ? (
                  <Link
                    href={`/post/${parentPost.slug}`}
                    className="mb-3 inline-flex items-center gap-1.5 text-sm text-gray-400 transition-colors hover:text-emerald-600"
                  >
                    <span aria-hidden="true">{"\u21A9"}</span>
                    <span>
                      In response to:{" "}
                      <span className="font-medium text-gray-600">
                        {parentPost.title}
                      </span>
                    </span>
                  </Link>
                ) : null}

                <h1 className="font-display mb-4 text-3xl font-bold leading-tight text-ink">
                  {post.title}
                </h1>

                {author ? (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Link
                      href={`/${author.username}`}
                      className="group flex items-center gap-3"
                    >
                      <UserAvatar
                        name={authorName}
                        src={author.avatar_url}
                        size={40}
                      />
                      <div>
                        <p className="font-medium text-gray-900 transition-colors group-hover:text-emerald-brand">
                          {authorName}
                        </p>
                        <p className="text-xs text-gray-400">
                          {author.university} · {formatDate(post.published_at ?? post.created_at)} ·{" "}
                          {readTime} min read
                        </p>
                      </div>
                    </Link>

                    {isPublished ? (
                      <div className="flex items-center gap-2">
                        <BookmarkButton
                          postId={post.id}
                          initialBookmarked={userBookmarked}
                          userId={user?.id ?? null}
                        />
                        <LikeButton
                          postId={post.id}
                          initialLiked={userLiked}
                          initialCount={likeCount ?? 0}
                          userId={user?.id ?? null}
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {coAuthors.length > 0 ? (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {coAuthors.map((coAuthor) => (
                      <Link
                        key={coAuthor.user_id}
                        href={`/${coAuthor.profile?.username}`}
                        className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-700 transition-colors hover:border-emerald-200 hover:text-emerald-brand"
                      >
                        {coAuthor.corresponding_author ? "Corresponding · " : ""}
                        {coAuthor.profile?.full_name ?? coAuthor.profile?.username}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </header>

              <hr className="mb-8 border-gray-200" />

              <div className="relative mb-8">
                <HighlightShare containerId="post-article-prose" />
                <div
                  id="post-article-prose"
                  className="prose prose-gray max-w-none prose-a:text-emerald-brand prose-headings:text-gray-900"
                  dangerouslySetInnerHTML={{ __html: contentWithIds }}
                />
              </div>

              {references.length > 0 ? (
                <section className="mb-8">
                  <h2 className="mb-4 text-xl font-semibold text-gray-900">
                    References
                  </h2>
                  <ol className="space-y-3">
                    {references.map((reference, index) => (
                      <li
                        key={reference.id}
                        id={`ref-${index + 1}`}
                        className="pl-8 -indent-8 text-sm leading-relaxed text-gray-600"
                      >
                        [{index + 1}]{" "}
                        {formatReference({
                          authors: reference.authors ?? null,
                          year: reference.year ?? null,
                          title: reference.title,
                          source: reference.source ?? null,
                          url: reference.url ?? null,
                          doi: reference.doi ?? null,
                        })}
                      </li>
                    ))}
                  </ol>
                </section>
              ) : null}

              {isPublished && post.citation_id ? (
                <div className="mb-8">
                  <CiteThis
                    citationId={post.citation_id}
                    citationPath={`/publication/${post.citation_id}`}
                    title={post.title}
                    publishedAt={post.published_at ?? post.created_at}
                    authors={citationAuthors}
                  />
                </div>
              ) : null}

              {isPublished ? (
                <>
                  <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
                    <ShareButtons
                      title={post.title}
                      slug={post.slug}
                      excerpt={post.excerpt ?? null}
                      authorName={author?.full_name ?? null}
                    />
                    <span className="text-xs text-gray-400">
                      {post.view_count} {post.view_count === 1 ? "view" : "views"}
                    </span>
                  </div>

                  {user ? (
                    <div className="mt-8 rounded-xl border border-gray-100 bg-canvas px-6 py-5">
                      <p className="text-sm font-medium text-gray-700">
                        Have a substantive pushback? Write a response post.
                      </p>
                      <p className="mt-1 text-xs text-gray-400">
                        More than a comment warrants - your argument, your byline, your post.
                      </p>
                      <Link
                        href={`/write?response_to=${post.slug}`}
                        className="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-600"
                      >
                        ↩ Write a response
                      </Link>
                    </div>
                  ) : null}

                  <hr className="mb-8 border-gray-200" />
                </>
              ) : null}

              {author ? (
                <AuthorBioCard
                  author={author}
                  userId={user?.id ?? null}
                  initialFollowing={userFollowsAuthor}
                  isCorrespondingAuthor={primaryAuthorRecord?.corresponding_author ?? false}
                  coAuthors={coAuthors
                    .filter((coAuthor) => coAuthor.profile?.username)
                    .map((coAuthor) => ({
                      user_id: coAuthor.user_id,
                      corresponding_author: coAuthor.corresponding_author,
                      profile: {
                        username: coAuthor.profile?.username ?? "",
                        full_name: coAuthor.profile?.full_name ?? null,
                      },
                    }))}
                />
              ) : null}

              <hr className="my-8 border-gray-200" />

              {relatedPosts.length > 0 ? (
                <section className="mb-8">
                  <h2 className="mb-4 text-lg font-semibold text-gray-900">
                    Related Posts
                  </h2>
                  <div className="space-y-3">
                    {relatedPosts.map((item) => (
                      <Link
                        key={item.id}
                        href={`/post/${item.slug}`}
                        className="group flex items-center justify-between gap-3 rounded-lg p-3 transition-colors hover:bg-canvas"
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-900 transition-colors group-hover:text-emerald-brand">
                            {item.title}
                          </p>
                          <p className="mt-0.5 text-xs text-gray-400">
                            {item.profiles?.full_name} · {formatDate(item.published_at ?? item.created_at)}
                          </p>
                        </div>
                        <svg
                          className="h-4 w-4 shrink-0 text-gray-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                      </Link>
                    ))}
                  </div>
                </section>
              ) : null}

              <hr className="mb-8 border-gray-200" />

              <Suspense
                fallback={
                  <div className="animate-pulse space-y-4">
                    <div className="h-5 w-24 rounded bg-gray-200" />
                    {[...Array(3)].map((_, index) => (
                      <div key={index} className="flex gap-3">
                        <div className="h-8 w-8 shrink-0 rounded-full bg-gray-200" />
                        <div className="flex-1 space-y-2">
                          <div className="h-3 w-28 rounded bg-gray-200" />
                          <div className="h-3 w-full rounded bg-gray-100" />
                          <div className="h-3 w-4/5 rounded bg-gray-100" />
                        </div>
                      </div>
                    ))}
                  </div>
                }
              >
                <CommentsLoader
                  postId={post.id}
                  userId={user?.id ?? null}
                  userProfileId={userProfileId}
                />
              </Suspense>

              {responsePosts.length > 0 ? (
                <section className="mt-10">
                  <h2 className="mb-4 text-lg font-semibold text-gray-900">
                    Responses ({responsePosts.length})
                  </h2>
                  <div className="space-y-4">
                    {responsePosts.map((response) => {
                      const responseAuthor = response.profiles;

                      return (
                        <Link
                          key={response.id}
                          href={`/post/${response.slug}`}
                          className="flex gap-4 rounded-xl border border-gray-200 bg-white p-4 transition-shadow hover:shadow-sm"
                        >
                          <div className="w-1 flex-shrink-0 self-stretch rounded-full bg-emerald-400" />
                          <div className="min-w-0 flex-1">
                            <div className="mb-1 flex items-center gap-2">
                              {responseAuthor?.avatar_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={responseAuthor.avatar_url}
                                  alt={responseAuthor.full_name ?? responseAuthor.username}
                                  className="h-5 w-5 rounded-full object-cover"
                                />
                              ) : (
                                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
                                  {(responseAuthor?.full_name ?? responseAuthor?.username ?? "?")
                                    .charAt(0)
                                    .toUpperCase()}
                                </div>
                              )}
                              <span className="text-xs text-gray-500">
                                <span className="font-medium text-gray-700">
                                  {responseAuthor?.full_name ?? responseAuthor?.username ?? "Unknown"}
                                </span>
                                {" · "}
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600 italic">
                                  Response
                                </span>
                              </span>
                            </div>
                            <p className="text-sm font-semibold leading-snug text-gray-900">
                              {response.title}
                            </p>
                            {response.excerpt ? (
                              <p className="mt-1 line-clamp-2 text-xs text-gray-500">
                                {response.excerpt}
                              </p>
                            ) : null}
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </section>
              ) : null}
            </div>
          </div>

          <aside className="hidden lg:col-span-1 lg:block">
            <TableOfContents headings={headings} />
          </aside>
        </div>
      </div>
    </div>
  );
}
