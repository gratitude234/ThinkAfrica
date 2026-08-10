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

  return (
    <section className="-mx-4 my-3 border-y border-gray-200 bg-canvas px-4 py-4 sm:mx-0 sm:rounded-xl sm:border sm:px-5 sm:py-[18px]">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.15em] text-gray-400">
        Topic spotlight
      </p>
      <Link
        href={`/topics/${encodeURIComponent(topic.tag)}`}
        className="font-display mb-2.5 block text-[17px] font-semibold text-ink hover:text-emerald-brand"
      >
        #{topic.tag}
      </Link>
      <div className="flex snap-x gap-2.5 overflow-x-auto pb-1 [scrollbar-width:none] sm:grid sm:grid-cols-2 sm:overflow-visible [&::-webkit-scrollbar]:hidden">
        {topic.posts.map((post) => (
          <Link
            key={post.id}
            href={`/post/${post.slug}`}
            className="block min-h-[68px] w-[230px] shrink-0 snap-start rounded-lg border border-gray-100 bg-white px-3.5 py-2.5 text-[13px] font-semibold leading-[1.45] text-gray-700 transition-colors hover:border-emerald-100 hover:bg-emerald-50/40 sm:w-auto"
          >
            <span className="line-clamp-2">{getPostMetadataTitle(post, post.profiles)}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
