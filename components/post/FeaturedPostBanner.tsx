import Image from "next/image";
import Link from "next/link";
import { formatDate } from "@/lib/utils";

interface FeaturedPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  type: string;
  published_at: string | null;
  cover_image_url?: string | null;
  profiles: {
    username: string;
    full_name: string | null;
    university: string | null;
    avatar_url: string | null;
  } | null;
}

interface Props {
  post: FeaturedPost;
}

export default function FeaturedPostBanner({ post }: Props) {
  const author = post.profiles;
  const displayDate = post.published_at ?? "";

  return (
    <div className="mb-6 rounded-xl border border-amber-200 border-l-4 border-l-amber-400 bg-amber-50 p-5">
      {post.cover_image_url ? (
        <div
          data-lite-hide
          className="relative mb-4 h-48 overflow-hidden rounded-lg"
        >
          <Image
            src={post.cover_image_url}
            alt={post.title}
            fill
            sizes="(max-width: 768px) 100vw, 66vw"
            className="object-cover"
            priority={true}
          />
        </div>
      ) : null}

      <p className="mb-2 text-xs font-semibold text-amber-600">
        Featured by ThinkAfrica
      </p>

      <Link href={`/post/${post.slug}`}>
        <h2 className="mb-2 text-xl font-bold leading-snug text-gray-900 transition-colors hover:text-amber-700">
          {post.title}
        </h2>
      </Link>

      {post.excerpt && (
        <p className="mb-4 line-clamp-3 text-sm leading-relaxed text-gray-600">
          {post.excerpt}
        </p>
      )}

      {author && (
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-700">
            {author.full_name?.charAt(0)?.toUpperCase() ?? "?"}
          </div>
          <Link
            href={`/${author.username}`}
            className="text-sm font-medium text-gray-700 transition-colors hover:text-amber-700"
          >
            {author.full_name ?? author.username}
          </Link>
          {author.university && (
            <span className="text-xs text-gray-400">· {author.university}</span>
          )}
          {displayDate && (
            <span className="text-xs text-gray-400">· {formatDate(displayDate)}</span>
          )}
        </div>
      )}
    </div>
  );
}
