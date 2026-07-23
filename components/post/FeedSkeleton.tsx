const CARD_SHELL =
  "mb-3 overflow-hidden rounded-xl border border-gray-200 bg-white px-4 py-4 sm:px-[18px] sm:py-[18px]";

function Block({ className }: { className: string }) {
  return <div className={`rounded bg-gray-100 ${className}`} />;
}

/** Titleless Post: avatar-first, body text, no cover implied. */
function PostSkeletonCard() {
  return (
    <article className={CARD_SHELL}>
      <div className="flex items-center gap-2.5">
        <div className="h-9 w-9 shrink-0 rounded-full bg-gray-100" />
        <div className="flex-1 space-y-1.5">
          <Block className="h-3 w-32" />
          <Block className="h-2.5 w-24" />
        </div>
      </div>
      <div className="mt-3 space-y-2">
        <Block className="h-3.5 w-full" />
        <Block className="h-3.5 w-4/5" />
      </div>
    </article>
  );
}

/** Article: label + title + excerpt, optional 16:9 cover -- not every card gets one. */
function ArticleSkeletonCard({ withCover = false }: { withCover?: boolean }) {
  return (
    <article className={CARD_SHELL}>
      <div className="flex items-center gap-2.5">
        <div className="h-9 w-9 shrink-0 rounded-full bg-gray-100" />
        <div className="flex-1 space-y-1.5">
          <Block className="h-3 w-28" />
          <Block className="h-2.5 w-20" />
        </div>
      </div>
      <Block className="mt-3 h-2.5 w-24" />
      <Block className="mt-2 h-5 w-5/6" />
      <Block className="mt-2 h-3.5 w-3/5" />
      {withCover ? <div className="mt-3 aspect-[16/9] w-full rounded-[10px] bg-gray-100" /> : null}
    </article>
  );
}

/** Research: metadata-first title/authors/abstract + manuscript line. */
function ResearchSkeletonCard() {
  return (
    <article className={`${CARD_SHELL} border-purple-100`}>
      <Block className="h-2.5 w-16" />
      <Block className="mt-2 h-5 w-4/5" />
      <Block className="mt-2 h-3 w-2/5" />
      <Block className="mt-2.5 h-3.5 w-full" />
      <div className="mt-3 h-14 rounded-lg bg-purple-tint/25" />
    </article>
  );
}

type SkeletonVariant = "post" | "article" | "article-cover" | "research";

const SEQUENCE: SkeletonVariant[] = ["post", "article-cover", "research", "post"];

/**
 * A restrained mix of Post/Article/Research skeletons (never one repeated
 * generic card) so the Home loading state resembles the real feed and
 * doesn't imply every card has a cover image.
 */
export default function FeedSkeleton({ count = 4 }: { count?: number }) {
  const items = Array.from({ length: count }, (_, index) => SEQUENCE[index % SEQUENCE.length]);

  return (
    <div aria-hidden="true" className="animate-pulse motion-reduce:animate-none">
      {items.map((variant, index) => {
        if (variant === "post") return <PostSkeletonCard key={index} />;
        if (variant === "research") return <ResearchSkeletonCard key={index} />;
        return <ArticleSkeletonCard key={index} withCover={variant === "article-cover"} />;
      })}
    </div>
  );
}
