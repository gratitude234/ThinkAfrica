import Link from "next/link";
import type { PostCardData } from "./PostCard";
import { getPostMetadataTitle } from "@/lib/postDisplay";

function getTopTopic(posts: PostCardData[]) {
  const counts = new Map<string, number>();
  for (const post of posts) {
    for (const tag of post.tags ?? []) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  const topTag = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!topTag) return null;

  return {
    tag: topTag,
    posts: posts.filter((post) => (post.tags ?? []).includes(topTag)).slice(0, 2),
  };
}

export default function TopicInterlude({ posts }: { posts: PostCardData[] }) {
  const topic = getTopTopic(posts);

  if (!topic) return null;

  /* Inset and boxed while the feed rows around it bleed and are not -- see
     PeopleInterlude for why that relationship inverted. The ground moved from
     canvas to card for the same reason the chips below moved the other way: on
     a canvas feed the old fill was the page's own colour. */
  return (
    <section className="my-5 rounded-2xl border border-card-border bg-card px-4 py-4 sm:my-6 sm:px-5 sm:py-[18px]">
      {/* Was gray-400 -- 2.8:1 on this ground, at 11px, under uppercase
          letter-spacing. The least legible combination on the page. */}
      <p className="mb-1.5 text-kicker font-semibold uppercase text-ink-muted">
        Topic spotlight
      </p>
      <Link
        href={`/topics/${encodeURIComponent(topic.tag)}`}
        className="font-display mb-2.5 block text-lede font-semibold text-ink hover:text-emerald-ink"
      >
        #{topic.tag}
      </Link>
      <div className="flex snap-x gap-2.5 overflow-x-auto pb-1 [scrollbar-width:none] sm:grid sm:grid-cols-2 sm:overflow-visible [&::-webkit-scrollbar]:hidden">
        {topic.posts.map((post) => (
          <Link
            key={post.id}
            href={`/post/${post.slug}`}
            className="block min-h-[68px] w-[230px] shrink-0 snap-start rounded-lg border border-card-border bg-canvas px-3.5 py-2.5 text-meta font-semibold text-ink-soft transition-colors hover:border-emerald-ink hover:text-emerald-ink sm:w-auto"
          >
            <span className="line-clamp-2">{getPostMetadataTitle(post, post.profiles)}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
