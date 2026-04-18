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
};

export default async function TopicsPage() {
  const supabase = await createClient();
  const [
    { data: postsRaw },
    {
      data: { user },
    },
  ] = await Promise.all([
    supabase.from("posts").select("tags").eq("status", "published").limit(500),
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
  ((postsRaw ?? []) as TagRow[]).forEach((post) =>
    (post.tags ?? []).forEach((tag) => {
      counts[tag] = (counts[tag] ?? 0) + 1;
    })
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
      <h1 className="mb-2 text-2xl font-bold text-gray-900">Explore Topics</h1>
      <p className="mb-8 text-gray-500">
        Browse {allTags.length} topics from the community.
      </p>

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
