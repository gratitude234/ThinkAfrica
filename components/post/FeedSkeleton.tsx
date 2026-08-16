import { CARD_SHELL } from "./cardShell";

function Block({ className }: { className: string }) {
  return <div className={`rounded bg-divider ${className}`} />;
}

/**
 * Avatar plus a single metadata line, matching AuthorLine.
 *
 * This drew two stacked bars until the real byline collapsed onto one line --
 * name above, university below. Left alone it would have put the drift back
 * that CARD_SHELL exists to prevent: every card visibly shedding a line at the
 * moment content arrived.
 */
function SkeletonByline({ nameWidth }: { nameWidth: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="h-9 w-9 shrink-0 rounded-full bg-divider" />
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <Block className={`h-3 ${nameWidth}`} />
        <Block className="h-2.5 w-20" />
        <Block className="h-2.5 w-8" />
      </div>
    </div>
  );
}

/** Titleless Post: avatar-first, body text, no cover implied. */
function PostSkeletonCard() {
  return (
    <article className={CARD_SHELL}>
      <SkeletonByline nameWidth="w-32" />
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
      <SkeletonByline nameWidth="w-28" />
      <Block className="mt-3 h-2.5 w-24" />
      <Block className="mt-2 h-5 w-5/6" />
      <Block className="mt-2 h-3.5 w-3/5" />
      {withCover ? <div className="mt-3 aspect-[4/3] w-full rounded-[10px] bg-divider sm:aspect-[16/10]" /> : null}
    </article>
  );
}

/**
 * Research: metadata-first title/authors/abstract + manuscript line. The
 * preview column is `sm`-only, matching the real card, which drops it on
 * phones so the title can use the full width.
 */
function ResearchSkeletonCard() {
  return (
    <article className={CARD_SHELL}>
      <div className="sm:grid sm:grid-cols-[minmax(0,1fr)_170px] sm:items-start sm:gap-5">
        <div className="min-w-0">
          <Block className="h-2.5 w-16" />
          <Block className="mt-2 h-5 w-4/5" />
          <Block className="mt-2 h-3 w-2/5" />
          <Block className="mt-2.5 h-3.5 w-full" />
        </div>
        <div className="hidden aspect-[3/4] rounded-[10px] bg-divider sm:block" />
      </div>
      <div className="mt-3 h-10 rounded-lg bg-divider/60" />
    </article>
  );
}

type SkeletonVariant = "post" | "article" | "article-cover" | "research";

const SEQUENCE: SkeletonVariant[] = ["post", "article-cover", "research", "post"];

/**
 * A restrained mix of Post/Article/Research skeletons (never one repeated
 * generic card) so the Home loading state resembles the real feed and
 * doesn't imply every card has a cover image.
 *
 * Geometry comes from the same CARD_SHELL the real cards use. Holding it
 * separately is what let the two drift -- the skeleton was drawing a 16px
 * radius, a grey-200 edge and 16px padding against the cards' 18px radius,
 * warm edge and 14px padding, so every card resized and re-tinted the instant
 * real content replaced it.
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
