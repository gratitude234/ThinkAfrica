"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Badge from "@/components/ui/Badge";
import UserAvatar from "@/components/ui/UserAvatar";
import { trackActivationEvent } from "@/lib/activationEvents";
import { getPostMetadataTitle } from "@/lib/postDisplay";

interface PostResult {
  id: string;
  title: string | null;
  slug: string;
  excerpt: string | null;
  content_kind?: string | null;
  published_at: string | null;
  profiles: {
    username: string;
    full_name: string | null;
  } | null;
}

export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchPageContent />
    </Suspense>
  );
}

interface PersonResult {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
}

interface TopicResult {
  tag: string;
  count: number;
}


interface DiscoverSearchGroup {
  key: "people" | "posts" | "topics";
  label: string;
  count: number;
}

function ResultSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(3)].map((_, index) => (
        <div
          key={index}
          className="animate-pulse motion-reduce:animate-none rounded-xl border border-gray-200 bg-white p-4"
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

function SearchPageContent() {
  const searchParams = useSearchParams();
  const queryParam = searchParams.get("q") ?? "";
  const [query, setQuery] = useState(queryParam);
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

      /**
       * One request to the application, which runs the queries. They used
       * to run from here against the anon key, and the user's text was
       * interpolated straight into a PostgREST `or=` filter: a search
       * containing a comma or a bracket sent a malformed filter and returned
       * nothing at all, which looks exactly like a search that found nothing.
       * See lib/searchData.ts.
       */
      let postResults: PostResult[] = [];
      let peopleResults: PersonResult[] = [];
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`);
        if (response.ok) {
          const payload = (await response.json()) as {
            posts?: PostResult[];
            people?: PersonResult[];
          };
          postResults = payload.posts ?? [];
          peopleResults = payload.people ?? [];
        }
      } catch {
        // Nothing found, and the next keystroke tries again.
      }

      if (requestId !== requestIdRef.current) {
        return;
      }

      const normalizedPosts = postResults;
      const normalizedTopics = allTopics
        .filter((topic) => topic.tag.toLowerCase().includes(trimmed.toLowerCase()))
        .slice(0, 12);

      setPosts(normalizedPosts);
      setPeople(peopleResults);
      setTopics(normalizedTopics);
      setLoading(false);
      trackActivationEvent({
        event: "search_performed",
        metadata: {
          surface: "search",
          queryLength: trimmed.length,
          postResults: normalizedPosts.length,
          peopleResults: peopleResults.length,
          topicResults: normalizedTopics.length,
          resultCount:
            normalizedPosts.length + peopleResults.length + normalizedTopics.length,
        },
      });
    },
    [allTopics]
  );

  useEffect(() => {
    setQuery(queryParam);
  }, [queryParam]);

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
    // The same list the tag field's suggestions come from, counted once on the
    // server. Two copies of this aggregation keyed on different things, which
    // is how "#africa" and "africa" became two topics. See /api/topics.
    fetch("/api/topics")
      .then((response) => (response.ok ? response.json() : { topics: [] }))
      .then((payload: { topics?: TopicResult[] }) => {
        const topics = payload.topics ?? [];
        setAllTopics(topics);
        // Already ordered most-used-first by the route.
        setTrending(topics.slice(0, 10).map((topic) => topic.tag));
      })
      .catch(() => {
        // No trending row and no suggestions is a usable search page.
        setAllTopics([]);
        setTrending([]);
      });
  }, []);

  const showResults = query.trim().length >= 2 && !loading;
  const totalResults = people.length + posts.length + topics.length;
  const groups: DiscoverSearchGroup[] = [
    { key: "posts", label: "Posts", count: posts.length },
    { key: "people", label: "Writers", count: people.length },
    { key: "topics", label: "Topics", count: topics.length },
  ].filter((group) => group.count > 0) as DiscoverSearchGroup[];

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-brand">
          Search
        </p>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">
          Search across Indegenius
        </h1>
        <p className="mt-2 text-sm leading-6 text-gray-500">
          Find posts, writers, and topics from one place.
        </p>
      </div>

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
          placeholder="Search posts, people, topics, universities..."
          autoFocus
          className="w-full rounded-xl border border-gray-200 bg-white py-3.5 pl-12 pr-10 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
        <div className="mb-4">
          <p className="text-sm text-gray-500">
            {totalResults} results for &ldquo;{query.trim()}&rdquo;
          </p>
          {groups.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {groups.map((group) => (
                <a
                  key={group.key}
                  href={`#${group.key}`}
                  className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-600 hover:border-emerald-300 hover:text-emerald-700"
                >
                  {group.label} {group.count}
                </a>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {query.trim().length < 2 && trending.length > 0 ? (
        <div className="mb-8">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Trending topics
          </p>
          <TrendingButtons tags={trending} onSelect={setQuery} />
        </div>
      ) : null}

      {loading ? <ResultSkeleton /> : null}

      {showResults ? (
        <div className="space-y-6">
          {totalResults === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 bg-canvas px-6 py-12 text-center">
              <p className="text-base font-medium text-gray-700">
                No results for &ldquo;{query.trim()}&rdquo;
              </p>
              <p className="mt-2 text-sm text-gray-500">
                Try a topic like policy, history, education, or browse what is
                trending now.
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
              <h2
                id="people"
                className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-gray-500"
              >
                Writers
              </h2>
              <div className="space-y-3">
                {people.map((person) => {
                  return (
                    <Link
                      key={person.id}
                      href={`/${person.username}`}
                      onClick={() => {
                        trackActivationEvent({
                          event: "discover_item_clicked",
                          metadata: {
                            item: "search_person",
                            personId: person.id,
                            surface: "search",
                          },
                        });
                      }}
                      className="flex items-center gap-4 rounded-xl border border-gray-100 bg-white p-4 transition-shadow hover:shadow-md"
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
                      <p className="truncate text-xs text-gray-500">
                        @{person.username}
                      </p>
                    </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          ) : null}

          {posts.length > 0 ? (
            <section>
              <h2
                id="posts"
                className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-gray-500"
              >
                Posts
              </h2>
              <div className="space-y-3">
                {posts.map((post) => (
                  <article
                    key={post.id}
                    className="rounded-xl border border-gray-200/70 bg-white p-5 transition-shadow hover:shadow-md"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge content_kind={post.content_kind} />
                    </div>
                    <div className="min-w-0">
                      <Link
                        href={`/post/${post.slug}`}
                        onClick={() => {
                          trackActivationEvent({
                            event: "discover_item_clicked",
                            metadata: {
                              item: "search_post",
                              postId: post.id,
                              contentKind: post.content_kind ?? null,
                              surface: "search",
                            },
                          });
                        }}
                      >
                        <p className="font-display mt-3 line-clamp-2 text-xl font-semibold leading-snug text-ink transition-colors hover:text-emerald-brand">
                          {getPostMetadataTitle(post, post.profiles)}
                        </p>
                      </Link>
                      <p className="mt-3 text-xs text-gray-500">
                        {post.profiles
                          ? `${post.profiles.full_name ?? post.profiles.username}`
                          : "Indegenius"}
                      </p>
                      {post.excerpt ? (
                        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-gray-500">
                          {post.excerpt}
                        </p>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {topics.length > 0 ? (
            <section>
              <h2
                id="topics"
                className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-gray-500"
              >
                Topics
              </h2>
              <div className="flex flex-wrap gap-2">
                {topics.map((topic) => (
                  <Link
                    key={topic.tag}
                    href={`/topics/${encodeURIComponent(topic.tag)}`}
                    onClick={() => {
                      trackActivationEvent({
                        event: "discover_item_clicked",
                        metadata: {
                          item: "search_topic",
                          tag: topic.tag,
                          surface: "search",
                        },
                      });
                    }}
                    className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 shadow-sm transition-colors hover:border-emerald-400 hover:text-emerald-700"
                  >
                    <span>#{topic.tag}</span>
                    <span className="text-xs text-gray-500">{topic.count}</span>
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
