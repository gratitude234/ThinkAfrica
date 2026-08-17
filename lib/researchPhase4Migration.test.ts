import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260816000002_phase4_research_expansion.sql"
  ),
  "utf8"
);

describe("Phase 4 research expansion migration", () => {
  it("creates the structured research lifecycle", () => {
    for (const table of [
      "researcher_profiles",
      "research_projects",
      "research_project_members",
      "research_collaboration_requests",
      "research_project_updates",
      "research_project_events",
      "research_project_assets",
      "research_expansion_targets",
    ]) {
      expect(migration).toMatch(
        new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}`, "i")
      );
    }
  });

  it("enforces project lifecycle transitions in the database", () => {
    expect(migration).toMatch(/guard_research_project_write/i);
    expect(migration).toMatch(/Invalid research project lifecycle transition/i);
    expect(migration).toMatch(/research_projects_record_change/i);
    expect(migration).toMatch(
      /citation_id IS NOT NULL OR post\.published_version_id IS NOT NULL/i
    );
    expect(migration).toMatch(/must begin as a proposal or in recruiting/i);
    expect(migration).toMatch(/Research project URLs are permanent/i);
  });

  it("handles collaboration acceptance transactionally", () => {
    expect(migration).toMatch(/respond_research_collaboration_request/i);
    expect(migration).toMatch(/FOR UPDATE/i);
    expect(migration).toMatch(/research_project_members/i);
    expect(migration).toMatch(/research_collaboration_accepted/i);
    expect(migration).toMatch(/Too many collaboration requests/i);
    expect(migration).toMatch(/project\.visibility = 'members'/i);
  });

  it("keeps impact targets explicit and analytics service-role-only", () => {
    expect(migration).toMatch(/proposals_created_target integer/i);
    expect(migration).toMatch(/proposals_created_target integer CHECK \(proposals_created_target > 0\)/i);
    expect(migration).toMatch(/get_research_expansion_metrics/i);
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.get_research_expansion_metrics\(\) FROM anon, authenticated/i
    );
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.get_research_expansion_metrics\(\) TO service_role/i
    );
  });

  it("provisions private multimedia storage", () => {
    expect(migration).toMatch(/research-project-assets/i);
    expect(migration).toMatch(/file_size_limit/i);
    expect(migration).toMatch(/false,\s*52428800/i);
    expect(migration).toMatch(/upload_status IN \('pending', 'ready'\)/i);
    expect(migration).toMatch(/char_length\(external_url\) <= 2000/i);
    expect(migration).toMatch(
      /split_part\(storage_path, '\/', 2\) = project_id::text/i
    );
    expect(migration).toMatch(/research_project_assets_guard_write/i);
  });

  it("preserves existing notification types and records project views", () => {
    expect(migration).toMatch(/author_published/i);
    expect(migration).toMatch(/author_subscribed/i);
    expect(migration).toMatch(/topic_published/i);
    expect(migration).toMatch(/research_project_viewed/i);
    expect(migration).toMatch(/'projectViews', view_facts\.project_views/i);
  });
});
