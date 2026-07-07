"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Badge from "@/components/ui/Badge";
import UserAvatar from "@/components/ui/UserAvatar";
import { trackActivationEvent } from "@/lib/activationEvents";

interface PostResult {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  type: string;
  citation_id?: string | null;
  published_version_id?: string | null;
  published_at: string | null;
  profiles: {
    username: string;
    full_name: string | null;
    university: string | null;
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
  university: string | null;
  points: number;
  avatar_url: string | null;
}

interface TopicResult {
  tag: string;
  count: number;
}

interface DebateResult {
  id: string;
  title: string;
  description: string | null;
  status: string;
}

interface OpportunityResult {
  id: string;
  title: string;
  sponsor_name: string | null;
  deadline: string | null;
}

export interface DiscoverSearchGroup {
  key: "people" | "posts" | "topics" | "debates" | "opportunities";
  label: string;
  count: number;
}

type RawPostResult = Omit<PostResult, "profiles"> & {
  profiles: PostResult["profiles"] | PostResult["profiles"][];
};

type TrendingRow = {
  tags: string[] | null;
};

function isReviewedWork(post: { type?: string | null; citation_id?: string | null }) {
  return Boolean(post.citation_id) || post.type === "research" || post.type === "policy_brief";
}

function getPersonSignal(person: PersonResult) {
  if (person.university) return person.university;
  if (person.points > 0) return `${person.points.toLocaleString()} points`;
  return "Indegenius writer";
}

function SearchSignalBadge({
  children,
  variant = "emerald",
}: {
  children: ReactNode;
  variant?: "emerald" | "sky";
}) {
  const styles = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    sky: "border-sky-200 bg-sky-50 text-sky-700",
  };

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${styles[variant]}`}
    >
      {children}
    </span>
  );
}

function ResultSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(3)].map((_, index) => (
        <div
          key={index}
          className="animate-pulse rounded-xl border border-gray-200 bg-white p-4"
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
  const [debates, setDebates] = useState<DebateResult[]>([]);
  const [opportunities, setOpportunities] = useState<OpportunityResult[]>([]);
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
        setDebates([]);
        setOpportunities([]);
        setLoading(false);
        return;
      }

      const requestId = ++requestIdRef.current;
      setLoading(true);
      const supabase = createClient();

      const [
        { data: postResults },
        { data: peopleResults },
        { data: debateResults },
        { data: opportunityResults },
      ] = await Promise.all([
        supabase
          .from("posts")
          .select(
            "id, title, slug, excerpt, type, citation_id, published_version_id, published_at, profiles!posts_author_id_fkey(username, full_name, university)"
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
        supabase
          .from("debates")
          .select("id, title, description, status")
          .or(`title.ilike.%${trimmed}%,description.ilike.%${trimmed}%`)
          .order("created_at", { ascending: false })
          .limit(6),
        supabase
          .from("fellowships")
          .select("id, title, sponsor_name, deadline")
          .eq("status", "open")
          .or(`title.ilike.%${trimmed}%,sponsor_name.ilike.%${trimmed}%`)
          .order("deadline", { ascending: true, nullsFirst: false })
          .limit(6),
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
      setDebates((debateResults ?? []) as DebateResult[]);
      setOpportunities((opportunityResults ?? []) as OpportunityResult[]);
      setLoading(false);
      trackActivationEvent({
        event: "search_performed",
        metadata: {
          surface: "search",
          queryLength: trimmed.length,
          postResults: normalizedPosts.length,
          peopleResults: peopleResults?.length ?? 0,
          topicResults: normalizedTopics.length,
          debateResults: debateResults?.length ?? 0,
          opportunityResults: opportunityResults?.length ?? 0,
          resultCount:
            normalizedPosts.length +
            (peopleResults?.length ?? 0) +
            normalizedTopics.length +
            (debateResults?.length ?? 0) +
            (opportunityResults?.length ?? 0),
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
  const totalResults =
    people.length + posts.length + topics.length + debates.length + opportunities.length;
  const groups: DiscoverSearchGroup[] = [
    { key: "posts", label: "Posts", count: posts.length },
    { key: "people", label: "Writers", count: people.length },
    { key: "topics", label: "Topics", count: topics.length },
    { key: "debates", label: "Debates", count: debates.length },
    { key: "opportunities", label: "Opportunities", count: opportunities.length },
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
          Find posts, writers, topics, debates, and opportunities from one place.
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
                        {person.university ? ` - ${person.university}` : ""}
                      </p>
                      <p className="mt-1 inline-flex rounded-full bg-canvas px-2 py-0.5 text-[11px] font-medium text-gray-500">
                        {getPersonSignal(person)}
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
                      <Badge type={post.type} />
                      {isReviewedWork(post) ? (
                        <SearchSignalBadge>Reviewed</SearchSignalBadge>
                      ) : null}
                      {post.citation_id ? (
                        <Link href={`/publication/${post.citation_id}`}>
                          <SearchSignalBadge variant="sky">
                            Citable
                          </SearchSignalBadge>
                        </Link>
                      ) : null}
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
                              postType: post.type,
                              surface: "search",
                            },
                          });
                        }}
                      >
                        <p className="font-display mt-3 line-clamp-2 text-xl font-semibold leading-snug text-ink transition-colors hover:text-emerald-brand">
                          {post.title}
                        </p>
                      </Link>
                      <p className="mt-3 text-xs text-gray-500">
                        {post.profiles
                          ? `${post.profiles.full_name ?? post.profiles.username}${
                              post.profiles.university
                                ? ` / ${post.profiles.university}`
                                : ""
                            }`
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

          {debates.length > 0 ? (
            <section>
              <h2
                id="debates"
                className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-gray-500"
              >
                Debates
              </h2>
              <div className="space-y-3">
                {debates.map((debate) => (
                  <Link
                    key={debate.id}
                    href={`/debates/${debate.id}`}
                    onClick={() => {
                      trackActivationEvent({
                        event: "discover_item_clicked",
                        metadata: {
                          item: "search_debate",
                          debateId: debate.id,
                          surface: "search",
                        },
                      });
                    }}
                    className="block rounded-xl border border-gray-200 bg-white p-4 transition-shadow hover:shadow-md"
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                        {debate.status}
                      </span>
                      <span className="text-xs text-gray-500">Debate</span>
                    </div>
                    <p className="line-clamp-2 text-sm font-semibold text-gray-900">
                      {debate.title}
                    </p>
                    {debate.description ? (
                      <p className="mt-2 line-clamp-2 text-sm text-gray-500">
                        {debate.description}
                      </p>
                    ) : null}
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          {opportunities.length > 0 ? (
            <section>
              <h2
                id="opportunities"
                className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-gray-500"
              >
                Opportunities
              </h2>
              <div className="space-y-3">
                {opportunities.map((opportunity) => (
                  <Link
                    key={opportunity.id}
                    href={`/fellowships/${opportunity.id}`}
                    onClick={() => {
                      trackActivationEvent({
                        event: "discover_item_clicked",
                        metadata: {
                          item: "search_opportunity",
                          fellowshipId: opportunity.id,
                          surface: "search",
                        },
                      });
                    }}
                    className="block rounded-xl border border-gray-200 bg-white p-4 transition-shadow hover:shadow-md"
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                        Open
                      </span>
                      <span className="text-xs text-gray-500">
                        {opportunity.sponsor_name ?? "Indegenius"}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-sm font-semibold text-gray-900">
                      {opportunity.title}
                    </p>
                    {opportunity.deadline ? (
                      <p className="mt-2 text-xs text-gray-500">
                        Deadline {new Date(opportunity.deadline).toLocaleDateString()}
                      </p>
                    ) : null}
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
