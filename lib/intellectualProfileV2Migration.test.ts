import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260824000002_intellectual_profile_v2.sql"
  ),
  "utf8"
);
const onboarding = readFileSync(
  resolve(process.cwd(), "app/(onboarding)/onboarding/OnboardingClient.tsx"),
  "utf8"
);

describe("Intellectual Profile V2 migration", () => {
  it("exposes only a neutral RLS-aware record index", () => {
    expect(migration).toContain("CREATE OR REPLACE VIEW public.profile_record_entries");
    expect(migration).toContain("security_invoker = true");
    expect(migration).toContain("post.status = 'published'");
    expect(migration).toContain("author.accepted_at IS NOT NULL");
    expect(migration).toContain("author.user_id <> post.author_id");
    expect(migration).toContain("'publication'");
    expect(migration).toContain("'response'");
    expect(migration).toContain("'debate'");
    expect(migration).toContain("'research'");
    expect(migration).not.toContain("work_category");
  });

  it("counts only original work as publications and scopes evidence to it", () => {
    expect(migration).toMatch(
      /count\(\*\) FILTER \(\s*WHERE entry_kind IN \('publication', 'research'\)\s*\) AS publication_count/
    );
    expect(migration).toMatch(
      /entry_kind IN \('publication', 'research'\) AND source_backed/
    );
    expect(migration).toMatch(
      /entry_kind IN \('publication', 'research'\) AND citable/
    );
    expect(onboarding).toContain('rpc("get_public_profile_record_summary"');
  });

  it("replaces Featured atomically with strict ownership and limits", () => {
    expect(migration).toContain("FUNCTION public.replace_my_featured_posts");
    expect(migration).toContain("IF v_selected_count > 3");
    expect(migration).toContain("v_distinct_count <> v_selected_count");
    expect(migration).toContain("post.status = 'published'");
    expect(migration).toContain("author.accepted_at IS NOT NULL");
    expect(migration).toMatch(
      /DELETE FROM public\.profile_featured_posts[\s\S]*INSERT INTO public\.profile_featured_posts/
    );
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.replace_my_featured_posts(uuid[])"
    );
    expect(migration).toContain("TO authenticated;");
  });
});
