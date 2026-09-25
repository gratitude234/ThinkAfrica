import UserAvatar from "@/components/ui/UserAvatar";
import { formatTagLabel } from "@/lib/tags";
import { readingMinutes } from "./ArticlePreview";

interface FeedCardPreviewProps {
  title: string;
  /** What the card prints under the headline: the summary, or the opening lines. */
  summary: string;
  coverImageUrl: string;
  tags: string[];
  wordCount: number;
  authorName: string;
  avatarUrl: string | null;
}

/**
 * An Article's card as the feed will show it, for Publish settings. It follows
 * ArticleFeedCard in components/post/HomeFeedCard.tsx: the byline, the ARTICLE
 * kicker with the reading time, the headline, three lines of summary, two
 * topics, then the cover at 16:9. Change one and change the other.
 *
 * Nothing in it is a link or a button. It is a picture of the card, and the
 * fields under it are what change it.
 */
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
    <div className="rounded-xl border border-card-border bg-canvas p-3.5">
      <div className="flex min-w-0 items-center gap-2">
        <span aria-hidden="true" className="shrink-0">
          <UserAvatar name={authorName} src={avatarUrl} size={30} />
        </span>
        <span className="truncate text-[13.5px] font-semibold leading-[1.35] text-ink">{authorName}</span>
      </div>
      <p className="mt-2.5 text-[10.5px] font-bold uppercase leading-[1.45] tracking-[0.13em] text-gold-ink">
        Article{minutes ? ` · ${minutes} min` : ""}
      </p>
      <p className="mt-1.5 font-display line-clamp-4 text-[21px] font-semibold leading-[1.22] text-ink">{title}</p>
      {summary ? <p className="mt-2 line-clamp-3 text-[14.5px] leading-[1.55] text-ink-soft">{summary}</p> : null}
      {topics.length ? (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {topics.map((topic) => (
            <span
              key={topic}
              className="inline-flex h-7 items-center rounded-full border border-card-border bg-card px-2.5 text-[12.5px] font-semibold text-ink-soft"
            >
              #{topic}
            </span>
          ))}
        </div>
      ) : null}
      {coverImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={coverImageUrl}
          alt="Cover"
          className="mt-2.5 aspect-[16/9] w-full rounded-xl bg-green-tint object-cover"
        />
      ) : null}
    </div>
  );
}
