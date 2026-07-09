#!/usr/bin/env node
// One-off audit script — reports possible duplicate posts, does not modify anything.
//
// Usage:
//   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/find-duplicate-posts.mjs
//
// Or, if you keep those in .env.local:
//   node --env-file=.env.local scripts/find-duplicate-posts.mjs
//
// Flags:
//   --close-minutes=60   window used to flag exact-title duplicates as "close in time" (default 60)
//   --similarity=0.6     Jaccard word-overlap threshold for near-duplicate title variants (default 0.6)

import { createClient } from "@supabase/supabase-js";

function parseArgs() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const [key, value] = arg.replace(/^--/, "").split("=");
      return [key, value ?? true];
    })
  );
  return {
    closeMinutes: Number(args["close-minutes"] ?? 60),
    similarity: Number(args["similarity"] ?? 0.6),
  };
}

function normalizeTitle(title) {
  return (title ?? "")
    .toLowerCase()
    .replace(/['"“”‘’]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wordSet(normalized) {
  return new Set(normalized.split(" ").filter(Boolean));
}

function jaccardSimilarity(a, b) {
  const setA = wordSet(a);
  const setB = wordSet(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) intersection += 1;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

async function main() {
  const { closeMinutes, similarity } = parseArgs();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in the environment."
    );
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: posts, error } = await supabase
    .from("posts")
    .select("id, slug, title, author_id, status, created_at, published_at")
    .eq("status", "published")
    .not("title", "is", null)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Failed to fetch posts:", error.message);
    process.exit(1);
  }

  const rows = (posts ?? []).map((post) => ({
    ...post,
    normalizedTitle: normalizeTitle(post.title),
  }));

  // Pass 1: exact-normalized-title matches.
  const exactGroups = new Map();
  for (const row of rows) {
    if (!row.normalizedTitle) continue;
    const bucket = exactGroups.get(row.normalizedTitle) ?? [];
    bucket.push(row);
    exactGroups.set(row.normalizedTitle, bucket);
  }

  const exactDuplicateGroups = [...exactGroups.values()].filter((group) => group.length > 1);

  // Pass 2: near-duplicate title variants (different normalized titles, high word overlap).
  const distinctTitles = [...exactGroups.entries()].map(([normalizedTitle, group]) => ({
    normalizedTitle,
    representative: group[0],
  }));

  const nearDuplicateGroups = [];
  const seen = new Set();
  for (let i = 0; i < distinctTitles.length; i += 1) {
    for (let j = i + 1; j < distinctTitles.length; j += 1) {
      const a = distinctTitles[i];
      const b = distinctTitles[j];
      const score = jaccardSimilarity(a.normalizedTitle, b.normalizedTitle);
      if (score >= similarity) {
        const key = [a.normalizedTitle, b.normalizedTitle].sort().join("|||");
        if (seen.has(key)) continue;
        seen.add(key);
        nearDuplicateGroups.push({
          score,
          posts: [
            ...exactGroups.get(a.normalizedTitle),
            ...exactGroups.get(b.normalizedTitle),
          ],
        });
      }
    }
  }

  console.log("\n=== Exact-title duplicate groups ===");
  if (exactDuplicateGroups.length === 0) {
    console.log("(none found)");
  }
  for (const group of exactDuplicateGroups) {
    const sorted = [...group].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    const spanMinutes =
      (new Date(sorted[sorted.length - 1].created_at).getTime() -
        new Date(sorted[0].created_at).getTime()) /
      60000;
    const closeInTime = spanMinutes <= closeMinutes;

    console.log(
      `\n"${sorted[0].title}" — ${sorted.length} posts${closeInTime ? ` (within ${Math.round(spanMinutes)}m — likely accidental dupe/double-submit)` : ` (span ${Math.round(spanMinutes)}m)`}`
    );
    for (const post of sorted) {
      console.log(
        `  - slug=${post.slug}  author_id=${post.author_id}  created_at=${post.created_at}  published_at=${post.published_at ?? "—"}`
      );
    }
  }

  console.log("\n=== Near-duplicate title variants (possible intentional/edited re-runs) ===");
  if (nearDuplicateGroups.length === 0) {
    console.log("(none found)");
  }
  for (const group of nearDuplicateGroups.sort((a, b) => b.score - a.score)) {
    const sorted = [...group.posts].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    console.log(`\nsimilarity=${group.score.toFixed(2)}`);
    for (const post of sorted) {
      console.log(
        `  - "${post.title}"  slug=${post.slug}  author_id=${post.author_id}  created_at=${post.created_at}`
      );
    }
  }

  console.log(
    `\nScanned ${rows.length} published posts. ${exactDuplicateGroups.length} exact-title group(s), ${nearDuplicateGroups.length} near-duplicate group(s). Nothing was modified.`
  );
}

main();
