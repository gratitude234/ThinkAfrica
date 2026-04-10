import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Badge from "@/components/ui/Badge";
import SearchBar from "./SearchBar";

interface PageProps {
  searchParams: Promise<{ q?: string }>;
}

export default async function SearchPage({ searchParams }: PageProps) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  let posts: {
    id: string;
    title: string;
    slug: string;
    excerpt: string | null;
    type: string;
    profiles: { username: string; full_name: string | null } | null;
  }[] = [];

  let people: {
    id: string;
    username: string;
    full_name: string | null;
    university: string | null;
    points: number;
  }[] = [];

  if (query.length >= 2) {
    const supabase = await createClient();

    const [{ data: postResults }, { data: profileResults }] = await Promise.all(
      [
        supabase
          .from("posts")
          .select(
            "id, title, slug, excerpt, type, profiles!posts_author_id_fkey(username, full_name)"
          )
          .eq("status", "published")
          .or(`title.ilike.%${query}%,excerpt.ilike.%${query}%,content.ilike.%${query}%`)
          .limit(20),

        supabase
          .from("profiles")
          .select("id, username, full_name, university, points")
          .or(
            `username.ilike.%${query}%,full_name.ilike.%${query}%,university.ilike.%${query}%`
          )
          .limit(10),
      ]
    );

    posts = (postResults ?? []).map((p) => ({
      ...p,
      profiles: Array.isArray(p.profiles) ? p.profiles[0] : p.profiles,
    }));
    people = profileResults ?? [];
  }

  const hasResults = posts.length > 0 || people.length > 0;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Search</h1>
      </div>

      <SearchBar initialQuery={query} />

      {query.length >= 2 ? (
        <div className="mt-8 space-y-8">
          {!hasResults && (
            <div className="text-center py-12 text-gray-400">
              <p className="text-base font-medium mb-1">
                No results for &ldquo;{query}&rdquo;
              </p>
              <p className="text-sm">Try a different keyword.</p>
            </div>
          )}

          {/* Articles */}
          {posts.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Articles ({posts.length})
              </h2>
              <div className="space-y-3">
                {posts.map((post) => (
                  <Link
                    key={post.id}
                    href={`/post/${post.slug}`}
                    className="block bg-white border border-gray-200 rounded-xl p-4 hover:shadow-sm transition-shadow"
                  >
                    <div className="flex items-start gap-3">
                      <Badge type={post.type} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 hover:text-emerald-brand transition-colors line-clamp-2">
                          {post.title}
                        </p>
                        {post.excerpt && (
                          <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                            {post.excerpt}
                          </p>
                        )}
                        {post.profiles && (
                          <p className="text-xs text-gray-400 mt-1">
                            by{" "}
                            <span className="text-gray-600">
                              {post.profiles.full_name ?? post.profiles.username}
                            </span>
                          </p>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* People */}
          {people.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                People ({people.length})
              </h2>
              <div className="space-y-2">
                {people.map((person) => (
                  <Link
                    key={person.id}
                    href={`/${person.username}`}
                    className="flex items-center gap-4 bg-white border border-gray-200 rounded-xl p-4 hover:shadow-sm transition-shadow"
                  >
                    <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold flex-shrink-0">
                      {person.full_name?.charAt(0)?.toUpperCase() ??
                        person.username?.charAt(0)?.toUpperCase() ??
                        "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900">
                        {person.full_name ?? person.username}
                      </p>
                      <p className="text-xs text-gray-400">
                        @{person.username}
                        {person.university && ` · ${person.university}`}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-emerald-brand">
                        {person.points}
                      </p>
                      <p className="text-xs text-gray-400">pts</p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      ) : query.length > 0 ? (
        <p className="mt-6 text-sm text-gray-400">
          Type at least 2 characters to search.
        </p>
      ) : (
        <div className="mt-12 text-center text-gray-400">
          <svg
            className="w-12 h-12 mx-auto mb-3 text-gray-200"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <p className="text-sm">Search articles and people on ThinkAfrica</p>
        </div>
      )}
    </div>
  );
}
