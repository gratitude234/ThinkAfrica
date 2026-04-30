import Link from "next/link";
import type { PostCardData } from "./PostCard";

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
    <section className="my-2 rounded-xl border border-gray-200 bg-canvas px-5 py-[18px]">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.15em] text-gray-400">
        Topic spotlight
      </p>
      <Link
        href={`/topics/${encodeURIComponent(topic.tag)}`}
        className="font-display mb-2.5 block text-[17px] font-semibold text-ink hover:text-emerald-brand"
      >
        #{topic.tag}
      </Link>
      <div>
        {topic.posts.map((post) => (
          <Link
            key={post.id}
            href={`/post/${post.slug}`}
            className="mb-1.5 block rounded-lg bg-white px-3.5 py-2.5 text-[13px] font-medium text-gray-700 transition-colors last:mb-0 hover:bg-gray-50"
          >
            <span className="line-clamp-2">{post.title}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
