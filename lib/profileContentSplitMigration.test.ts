import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const migration = read(
  "supabase/migrations/20260907000001_profile_content_split.sql"
);
/**
 * Comments are stripped before these assertions run. The question is what the
 * page *does*, and prose explaining why it no longer queries a table would
 * otherwise read as the query itself.
 */
function code(source: string) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

const profilePage = code(read("app/(main)/[username]/page.tsx"));
const viewData = code(read("lib/profileViewData.ts"));

/**
 * There is no local migration runner, so these assert the contracts that
 * would otherwise only fail in production. Same reason as
 * emailBroadcastsMigration.test.ts.
 */
describe("profile content split migration", () => {
  it("runs in one transaction", () => {
    expect(migration.trimStart().startsWith("BEGIN;")).toBe(true);
    expect(migration).toContain("COMMIT;");
  });

  it("classifies through the shared resolver rather than branching on posts.type", () => {
    expect(migration).toContain("public.effective_content_kind(");
    // A second copy of "essay and policy_brief are articles" written into SQL
    // is exactly how the database and the application would drift apart.
    expect(migration).not.toMatch(/WHEN\s+authorship\.type\s*=\s*'essay'/i);
    expect(migration).not.toMatch(/type\s+IN\s*\(\s*'essay'\s*,\s*'policy_brief'\s*\)/i);
  });

  it("adds content_kind to the record index without disturbing its columns", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE VIEW public.profile_record_entries"
    );
    // Appending is the only edit CREATE OR REPLACE accepts, and it is what
    // keeps every existing consumer's column positions intact.
    const select = migration.slice(migration.indexOf("  authorship.profile_id,"));
    const contentKindAt = select.indexOf("AS content_kind");
    const citableAt = select.indexOf("AS citable");
    expect(citableAt).toBeGreaterThan(-1);
    expect(contentKindAt).toBeGreaterThan(citableAt);
  });

  it("keeps the record index RLS-aware and unpushable", () => {
    expect(migration).toContain("security_invoker = true");
    expect(migration).toContain("security_barrier = true");
    expect(migration).toContain("post.status = 'published'");
    expect(migration).toContain("author.accepted_at IS NOT NULL");
    expect(migration).toContain("author.user_id <> post.author_id");
  });

  it("restates the view's grants, because CREATE OR REPLACE is not trusted to keep them", () => {
    expect(migration).toContain(
      "REVOKE ALL ON TABLE public.profile_record_entries"
    );
    expect(migration).toContain(
      "GRANT SELECT ON TABLE public.profile_record_entries"
    );
  });

  it("adds a second summary function rather than changing the deployed one", () => {
    expect(migration).toContain(
      "CREATE FUNCTION public.get_public_profile_record_summary_v2"
    );
    // v1 has to survive: clients deployed before this migration still call it.
    expect(migration).not.toContain(
      "DROP FUNCTION IF EXISTS public.get_public_profile_record_summary(uuid, boolean)"
    );
    expect(migration).toContain(
      "DROP FUNCTION IF EXISTS public.get_public_profile_record_summary_v2(uuid, boolean)"
    );
  });

  it("returns the existing summary fields alongside the split", () => {
    for (const field of [
      "publication_count bigint",
      "source_backed_count bigint",
      "citable_count bigint",
      "response_count bigint",
      "research_count bigint",
      "article_count bigint",
      "post_count bigint",
    ]) {
      expect(migration).toContain(field);
    }
  });

  /**
   * The invariant the counts are worth having: with research excluded, every
   * publication is either an Article or a Post, and a response is neither.
   */
  it("counts the split over publications only", () => {
    expect(migration).toContain(
      "WHERE entry_kind = 'publication' AND content_kind = 'article'"
    );
    expect(migration).toContain(
      "WHERE entry_kind = 'publication' AND content_kind = 'post'"
    );
  });

  it("keeps the summary function invoker-rights with a pinned search path", () => {
    expect(migration).toContain("SECURITY INVOKER");
    expect(migration).toContain("SET search_path = ''");
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.get_public_profile_record_summary_v2(uuid, boolean)"
    );
  });

  it("creates no table and adds no column to posts", () => {
    expect(migration).not.toMatch(/CREATE TABLE/i);
    expect(migration).not.toMatch(/ALTER TABLE public\.posts/i);
  });

  it("needs no backfill", () => {
    expect(migration).not.toMatch(/^\s*UPDATE\s+public\./im);
    expect(migration).not.toMatch(/^\s*INSERT INTO\s+public\./im);
  });
});

describe("what the public profile path no longer costs", () => {
  it("does not load the credibility graph", () => {
    expect(profilePage).not.toContain("loadProfileCredibilityGraph");
    expect(profilePage).not.toContain("credibilityGraphData");
    expect(viewData).not.toContain("credibilityGraph");
    // Production does not have the credibility schema, and the redesigned
    // profile does not surface Demonstrated Expertise or Recognition, so
    // there is nothing to pay for.
    expect(profilePage).not.toContain("DemonstratedExpertise");
    expect(profilePage).not.toContain("ProfileRecognition");
  });

  it("does not query researcher_profiles or thread Research through the page", () => {
    expect(profilePage).not.toContain("researcher_profiles");
    expect(viewData).not.toContain("researcher_profiles");
    // The Background rail still accepts a `research` prop for the surfaces
    // that have one. The public profile no longer passes it.
    expect(profilePage).not.toMatch(/research=\{/);
    expect(profilePage).not.toContain("RESEARCH_TYPE_QUERY_EXCLUSION");
  });

  it("keeps the shared research exclusion for the routes that still use it", async () => {
    // Removing the constant outright would have taken the feed, search,
    // topics, the dashboard and the sitemap with it. This is a profile-path
    // cleanup, not a global deletion.
    const flags = await vi.importActual<typeof import("./featureFlags")>(
      "./featureFlags"
    );
    expect(flags.RESEARCH_TYPE_QUERY_EXCLUSION).toBeDefined();
  });
});
