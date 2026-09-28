import PostCover from "@/components/post/PostCover";
import UserAvatar from "@/components/ui/UserAvatar";
import { formatTagLabel } from "@/lib/tags";
import { readingMinutes } from "./ArticlePreview";

interface FeedCardPreviewProps {
  title: string;
  summary: string;
  coverImageUrl: string;
  tags: string[];
  wordCount: number;
  authorName: string;
  avatarUrl: string | null;
}

/** Non-interactive preview matching the headline-led Article feed card. */
export default function FeedCardPreview({
  title,
  summary,
  coverImageUrl,
  tags,
  wordCount,
  authorName,
  avatarUrl,
}: FeedCardPreviewProps) {
  const minutes = readingMinutes(wordCount);
  const topics = tags
    .map((tag) => formatTagLabel(tag))
    .filter(Boolean)
    .slice(0, 2);

  return (
    <div className="rounded-xl border border-card-border bg-canvas p-3.5 font-ui">
      <div className="flex min-w-0 items-center gap-2">
        <span aria-hidden="true" className="shrink-0">
          <UserAvatar name={authorName} src={avatarUrl} size={30} />
        </span>
        <span className="truncate text-feed-byline font-semibold text-ink">{authorName}</span>
      </div>
      <div className="mt-3 flex items-start gap-3 sm:gap-5">
        <div className="min-w-0 flex-1">
          <p className="text-feed-kicker font-semibold uppercase text-gold-ink">
            Article{minutes ? ` · ${minutes} min` : ""}
          </p>
          <p className="mt-1.5 font-editorial line-clamp-3 text-feed-article-title font-semibold text-ink">{title}</p>
          {summary ? <p className="mt-2 line-clamp-2 text-feed-excerpt text-ink-soft sm:line-clamp-3">{summary}</p> : null}
        </div>
        {coverImageUrl.trim() ? (
          <div className="mt-1 w-24 shrink-0 overflow-hidden rounded-xl border border-card-border/60 bg-surface sm:w-40">
            <PostCover
              src={coverImageUrl}
              alt="Cover"
              content_kind="article"
              fit="cover"
              sizes="(max-width: 639px) 96px, 160px"
              className="aspect-square w-full sm:aspect-[4/3]"
              fallbackClassName="bg-surface text-ink-muted"
              fallbackLabel="Image unavailable"
            />
          </div>
        ) : null}
      </div>
      {topics.length ? (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {topics.map((topic) => (
            <span
              key={topic}
              className="inline-flex h-7 items-center rounded-full border border-card-border bg-card px-2.5 text-feed-meta font-semibold text-ink-soft"
            >
              #{topic}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
