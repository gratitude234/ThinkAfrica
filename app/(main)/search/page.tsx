"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Badge from "@/components/ui/Badge";
import UserAvatar from "@/components/ui/UserAvatar";

interface PostResult {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  type: string;
  published_at: string | null;
  profiles: {
    username: string;
    full_name: string | null;
    university: string | null;
  } | null;
}

interface PersonResult {
  id: string;
  username: string;
  full_name: string | null;
  university: string | null;
  points: number;
  avatar_url: string | null;
}

interface TopicResult {
  tag: string;
  count: number;
}

type RawPostResult = Omit<PostResult, "profiles"> & {
  profiles: PostResult["profiles"] | PostResult["profiles"][];
};

type TrendingRow = {
  tags: string[] | null;
};

function ResultSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(3)].map((_, index) => (
        <div
          key={index}
          className="animate-pulse rounded-2xl border border-gray-200 bg-white p-4"
        >
          <div className="h-5 w-20 rounded-full bg-gray-100" />
          <div className="mt-3 h-4 w-3/4 rounded bg-gray-200" />
          <div className="mt-2 h-3 w-1/2 rounded bg-gray-100" />
        </div>
      ))}
    </div>
  );
}

function TrendingButtons({
  tags,
  onSelect,
}: {
  tags: string[];
  onSelect: (tag: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag) => (
        <button
          key={tag}
          type="button"
          onClick={() => onSelect(tag)}
          className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 shadow-sm transition-colors hover:border-emerald-400 hover:text-emerald-700"
        >
          #{tag}
        </button>
      ))}
    </div>
  );
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [posts, setPosts] = useState<PostResult[]>([]);
  const [people, setPeople] = useState<PersonResult[]>([]);
  const [topics, setTopics] = useState<TopicResult[]>([]);
  const [allTopics, setAllTopics] = useState<TopicResult[]>([]);
  const [trending, setTrending] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  const runSearch = useCallback(
    async (q: string) => {
      const trimmed = q.trim();

      if (trimmed.length < 2) {
        requestIdRef.current += 1;
        setPosts([]);
        setPeople([]);
        setTopics([]);
        setLoading(false);
        return;
      }

      const requestId = ++requestIdRef.current;
      setLoading(true);
      const supabase = createClient();

      const [{ data: postResults }, { data: peopleResults }] = await Promise.all([
        supabase
          .from("posts")
          .select(
            "id, title, slug, excerpt, type, published_at, profiles!posts_author_id_fkey(username, full_name, university)"
          )
          .eq("status", "published")
          .or(`title.ilike.%${trimmed}%,excerpt.ilike.%${trimmed}%`)
          .order("published_at", { ascending: false })
          .limit(15),
        supabase
          .from("profiles")
          .select("id, username, full_name, university, points, avatar_url")
          .or(
            `username.ilike.%${trimmed}%,full_name.ilike.%${trimmed}%,university.ilike.%${trimmed}%`
          )
          .limit(8),
      ]);

      if (requestId !== requestIdRef.current) {
        return;
      }

      const normalizedPosts = ((postResults ?? []) as RawPostResult[]).map((post) => ({
        ...post,
        profiles: Array.isArray(post.profiles) ? post.profiles[0] ?? null : post.profiles,
      }));
      const normalizedTopics = allTopics
        .filter((topic) => topic.tag.toLowerCase().includes(trimmed.toLowerCase()))
        .slice(0, 12);

      setPosts(normalizedPosts);
      setPeople((peopleResults ?? []) as PersonResult[]);
      setTopics(normalizedTopics);
      setLoading(false);
    },
    [allTopics]
  );

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      void runSearch(query);
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, runSearch]);

  useEffect(() => {
    const supabase = createClient();

    supabase
      .from("posts")
      .select("tags")
      .eq("status", "published")
      .limit(500)
      .then(({ data }) => {
        const counts: Record<string, number> = {};

        ((data ?? []) as TrendingRow[]).forEach((post) => {
          (post.tags ?? []).forEach((tag) => {
            counts[tag] = (counts[tag] ?? 0) + 1;
          });
        });

        const sortedTopics = Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .map(([tag, count]) => ({ tag, count }));

        setAllTopics(sortedTopics);
        setTrending(sortedTopics.slice(0, 10).map((topic) => topic.tag));
      });
  }, []);

  const showResults = query.trim().length >= 2 && !loading;
  const totalResults = people.length + posts.length + topics.length;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Search</h1>

      <div className="relative mb-3">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-gray-400">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search posts, people, universities..."
          autoFocus
          className="w-full rounded-2xl border border-gray-200 bg-white py-3.5 pl-12 pr-10 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute inset-y-0 right-0 pr-4 text-gray-400 transition-colors hover:text-gray-600"
            aria-label="Clear search"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        ) : null}
      </div>

      {query.trim().length >= 2 && !loading ? (
        <p className="mb-4 text-sm text-gray-500">
          {totalResults} results for &ldquo;{query.trim()}&rdquo;
        </p>
      ) : null}

      {query.trim().length < 2 && trending.length > 0 ? (
        <div className="mb-8">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Trending topics
          </p>
          <TrendingButtons tags={trending} onSelect={setQuery} />
        </div>
      ) : null}

      {loading ? <ResultSkeleton /> : null}

      {showResults ? (
        <div className="space-y-6">
          {totalResults === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-canvas px-6 py-12 text-center">
              <p className="text-base font-medium text-gray-700">
                No results for &ldquo;{query.trim()}&rdquo;
              </p>
              <p className="mt-2 text-sm text-gray-400">
                Try a different keyword or browse trending topics.
              </p>
              {trending.length > 0 ? (
                <div className="mt-5">
                  <TrendingButtons tags={trending.slice(0, 6)} onSelect={setQuery} />
                </div>
              ) : null}
            </div>
          ) : null}

          {people.length > 0 ? (
            <section>
              <h2 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-gray-400">
                People
              </h2>
              <div className="space-y-3">
                {people.map((person) => {
                  return (
                    <Link
                      key={person.id}
                      href={`/${person.username}`}
                      className="flex items-center gap-4 rounded-2xl border border-gray-100 bg-white p-4 transition-shadow hover:shadow-md"
                    >
                      <UserAvatar
                        name={person.full_name ?? person.username ?? "Anonymous"}
                        src={person.avatar_url}
                        size={44}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-gray-900">
                          {person.full_name ?? person.username}
                        </p>
                        <p className="truncate text-xs text-gray-400">
                          @{person.username}
                          {person.university ? ` - ${person.university}` : ""}
                        </p>
                      </div>
                      <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                        {person.points} pts
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
          ) : null}

          {posts.length > 0 ? (
            <section>
              <h2 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-gray-400">
                Posts
              </h2>
              <div className="space-y-3">
                {posts.map((post) => (
                  <Link
                    key={post.id}
                    href={`/post/${post.slug}`}
                    className="rounded-xl border border-gray-200/70 bg-white p-5 transition-shadow hover:shadow-md"
                  >
                    <Badge type={post.type} />
                    <div className="min-w-0">
                      <p className="font-display mt-3 line-clamp-2 text-xl font-semibold leading-snug text-ink">
                        {post.title}
                      </p>
                      <p className="mt-3 text-xs text-gray-500">
                        {post.profiles
                          ? `${post.profiles.full_name ?? post.profiles.username}${
                              post.profiles.university
                                ? ` · ${post.profiles.university}`
                                : ""
                            }`
                          : "ThinkAfrica"}
                      </p>
                      {post.excerpt ? (
                        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-gray-500">
                          {post.excerpt}
                        </p>
                      ) : null}
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          {topics.length > 0 ? (
            <section>
              <h2 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-gray-400">
                Topics
              </h2>
              <div className="flex flex-wrap gap-2">
                {topics.map((topic) => (
                  <Link
                    key={topic.tag}
                    href={`/topics/${encodeURIComponent(topic.tag)}`}
                    className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 shadow-sm transition-colors hover:border-emerald-400 hover:text-emerald-700"
                  >
                    <span>#{topic.tag}</span>
                    <span className="text-xs text-gray-400">{topic.count}</span>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
