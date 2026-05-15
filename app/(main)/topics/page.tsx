import { createClient } from "@/lib/supabase/server";
import TopicsClient from "./TopicsClient";

export const revalidate = 3600;

const TOPIC_CATEGORIES: Record<string, string[]> = {
  "Science & Technology": [
    "tech",
    "ai",
    "science",
    "engineering",
    "data",
    "programming",
    "innovation",
    "research",
  ],
  "Law & Policy": [
    "law",
    "policy",
    "governance",
    "rights",
    "justice",
    "legislation",
    "constitution",
  ],
  "Economics & Business": [
    "economics",
    "business",
    "finance",
    "entrepreneurship",
    "trade",
    "investment",
  ],
  "Health & Medicine": [
    "health",
    "medicine",
    "public health",
    "mental health",
    "nutrition",
    "wellbeing",
  ],
  "Society & Culture": [
    "culture",
    "society",
    "gender",
    "religion",
    "art",
    "philosophy",
    "education",
  ],
  Politics: [
    "politics",
    "democracy",
    "elections",
    "government",
    "diplomacy",
    "international",
  ],
  Environment: ["environment", "climate", "sustainability", "energy", "ecology"],
};

type TagRow = {
  tags: string[] | null;
  type?: string | null;
  citation_id?: string | null;
  published_version_id?: string | null;
};

export default async function TopicsPage() {
  const supabase = await createClient();
  const [
    { data: postsRaw },
    {
      data: { user },
    },
  ] = await Promise.all([
    supabase
      .from("posts")
      .select("tags, type, citation_id, published_version_id")
      .eq("status", "published")
      .limit(500),
    supabase.auth.getUser(),
  ]);

  let initialInterests: string[] = [];
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("interests")
      .eq("id", user.id)
      .single();

    initialInterests = (profile?.interests as string[] | null) ?? [];
  }

  const counts: Record<string, number> = {};
  let citablePostCount = 0;
  let reviewedPostCount = 0;
  ((postsRaw ?? []) as TagRow[]).forEach((post) =>
    {
      if (post.citation_id || post.published_version_id) citablePostCount++;
      if (post.type === "research" || post.type === "policy_brief") reviewedPostCount++;
      (post.tags ?? []).forEach((tag) => {
        counts[tag] = (counts[tag] ?? 0) + 1;
      });
    }
  );

  const allTags = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([tag, count]) => ({ tag, count }));

  const grouped: Record<string, { tag: string; count: number }[]> = {};
  const uncategorized: { tag: string; count: number }[] = [];

  allTags.forEach((entry) => {
    const lowerTag = entry.tag.toLowerCase();
    const matchedCategory = Object.entries(TOPIC_CATEGORIES).find(([, keywords]) =>
      keywords.some((keyword) => lowerTag.includes(keyword.toLowerCase()))
    )?.[0];

    if (matchedCategory) {
      grouped[matchedCategory] = [...(grouped[matchedCategory] ?? []), entry];
      return;
    }

    uncategorized.push(entry);
  });

  if (uncategorized.length > 0) {
    grouped.Other = uncategorized;
  }

  const sections = [
    ...Object.keys(TOPIC_CATEGORIES),
    ...(grouped.Other ? ["Other"] : []),
  ]
    .filter((category) => (grouped[category] ?? []).length > 0)
    .map((category) => ({
      category,
      entries: grouped[category] ?? [],
    }));

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-brand">
          Topics
        </p>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">Explore Topics</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
          Browse {allTags.length} topics from the community and follow the ones
          that should shape your feed.
        </p>
      </div>

      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">Published topics</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{allTags.length}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">Your interests</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {initialInterests.length}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">Citable or reviewed</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {(citablePostCount + reviewedPostCount).toLocaleString()}
          </p>
        </div>
      </div>

      {sections.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-canvas px-6 py-12 text-center text-sm text-gray-500">
          No topics yet. Published posts with tags will appear here.
        </div>
      ) : (
        <TopicsClient
          sections={sections}
          initialInterests={initialInterests}
          userId={user?.id ?? null}
        />
      )}
    </div>
  );
}
