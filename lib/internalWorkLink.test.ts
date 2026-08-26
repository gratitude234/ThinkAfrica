import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  collectInternalWorkRefs,
  parseInternalWorkRef,
} from "./internalWorkLink";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260827000001_credibility_graph.sql"),
  "utf8"
);

describe("internal work link resolution", () => {
  it("resolves a post URL to its slug", () => {
    expect(parseInternalWorkRef("https://indegenius.org/post/vaccine-access")).toEqual({
      kind: "slug",
      value: "vaccine-access",
    });
    expect(parseInternalWorkRef("/post/vaccine-access")).toEqual({
      kind: "slug",
      value: "vaccine-access",
    });
  });

  it("resolves a publication URL to its citation id, uppercased", () => {
    expect(parseInternalWorkRef("https://indegenius.org/publication/ing-2026-014")).toEqual({
      kind: "citation_id",
      value: "ING-2026-014",
    });
  });

  it("ignores query strings and fragments, which are not identity", () => {
    expect(
      parseInternalWorkRef("https://indegenius.org/post/vaccine-access?utm=x#ref-3")
    ).toEqual({ kind: "slug", value: "vaccine-access" });
  });

  it("refuses every external URL", () => {
    for (const url of [
      "https://example.org/post/vaccine-access",
      "https://notindegenius.com/post/x",
      "https://medium.com/@someone/post/x",
      "https://doi.org/10.1000/xyz",
    ]) {
      expect(parseInternalWorkRef(url)).toBeNull();
    }
  });

  it("refuses internal URLs that are not works", () => {
    // A profile, a topic page and the record are not citable works, and
    // matching them would attribute a citation to something that cannot
    // receive one.
    for (const url of [
      "https://indegenius.org/ada",
      "https://indegenius.org/topics/law",
      "https://indegenius.org/ada/record",
      "https://indegenius.org/post/",
      "https://indegenius.org/post/a/b",
    ]) {
      expect(parseInternalWorkRef(url)).toBeNull();
    }
  });

  it("refuses non-http schemes and malformed input", () => {
    expect(parseInternalWorkRef("javascript:alert(1)")).toBeNull();
    expect(parseInternalWorkRef("not a url")).toBeNull();
    expect(parseInternalWorkRef("")).toBeNull();
    expect(parseInternalWorkRef(null)).toBeNull();
  });

  it("accepts the configured deployment host", () => {
    expect(
      parseInternalWorkRef("https://preview.example.dev/post/x", "https://preview.example.dev")
    ).toEqual({ kind: "slug", value: "x" });
    expect(parseInternalWorkRef("https://preview.example.dev/post/x")).toBeNull();
  });
});

describe("collecting citation targets", () => {
  it("produces one target per cited work, however often it is listed", () => {
    const refs = collectInternalWorkRefs([
      { url: "https://indegenius.org/post/a" },
      { url: "https://indegenius.org/post/a?page=2" },
      { url: "/post/a" },
    ]);
    expect(refs).toEqual([{ kind: "slug", value: "a" }]);
  });

  it("keeps distinct works apart", () => {
    expect(
      collectInternalWorkRefs([
        { url: "/post/a" },
        { url: "/post/b" },
        { url: "https://example.org/x" },
      ])
    ).toHaveLength(2);
  });

  it("returns nothing for a bibliography of external sources", () => {
    expect(
      collectInternalWorkRefs([
        { url: "https://who.int/report", doi: "10.1000/xyz" },
        { url: null },
      ])
    ).toEqual([]);
  });
});

describe("citation edge migration", () => {
  it("stores the relation without discarding the original reference", () => {
    expect(migration).toContain(
      "ADD COLUMN IF NOT EXISTS referenced_post_id uuid"
    );
    expect(migration).toContain("ON DELETE SET NULL");
    // The url column is never dropped or overwritten.
    expect(migration).not.toMatch(/ALTER TABLE public\.post_references[\s\S]{0,200}DROP COLUMN/);
  });

  it("permits one edge per citing and cited pair", () => {
    expect(migration).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS post_references_unique_internal_edge_idx"
    );
    expect(migration).toContain("ON public.post_references(post_id, referenced_post_id)");
  });

  it("indexes the inbound lookup the profile actually runs", () => {
    expect(migration).toContain("post_references_referenced_post_idx");
  });

  it("backfills idempotently and only from unambiguous internal URLs", () => {
    expect(migration).toContain("WHERE reference.referenced_post_id IS NULL");
    expect(migration).toContain("AND resolved.occurrence = 1");
    expect(migration).toContain("/(post|publication)/");
  });

  it("requires both ends published and flags self-citation", () => {
    expect(migration).toContain("WHERE citing.status = 'published'");
    expect(migration).toContain("AND cited.status = 'published'");
    expect(migration).toContain("AS is_self_citation");
    expect(migration).toContain("citing.id <> cited.id");
  });

  it("credits accepted co-authors of the cited work", () => {
    expect(migration).toContain("author.accepted_at IS NOT NULL");
    expect(migration).toMatch(/SELECT cited\.author_id AS profile_id\s*\n\s*UNION/);
  });

  it("excludes self-citations from the headline count", () => {
    expect(migration).toContain(
      "(SELECT count(*) FROM citations WHERE NOT is_self_citation)::integer"
    );
  });

  it("keeps the public views invoker-scoped", () => {
    expect(migration).toMatch(
      /CREATE OR REPLACE VIEW public\.public_citation_edges\s*\nWITH \(security_invoker = true/
    );
    expect(migration).toMatch(
      /CREATE OR REPLACE VIEW public\.public_review_signals\s*\nWITH \(security_invoker = true/
    );
  });
});

describe("review privacy in the public projection", () => {
  it("exposes only that a review happened, never its content", () => {
    const view = migration.slice(
      migration.indexOf("CREATE OR REPLACE VIEW public.public_review_signals"),
      migration.indexOf("REVOKE ALL ON TABLE public.public_review_signals")
    );
    // The projection is an explicit alias list. reviewer_id and
    // recommendation legitimately appear in WHERE, where they enforce the
    // self-review exclusion and require a completed review; what matters is
    // that neither is ever selected.
    expect(view).toContain("'peer_reviewed'::text AS review_kind");
    expect(view).toContain("'editorially_reviewed'::text AS review_kind");
    for (const selectForm of [
      "review.reviewer_id,",
      "review.reviewer_id AS",
      "review.notes",
      "decision.notes",
      "review.recommendation,",
      "review.recommendation AS",
      "decision.decision AS",
    ]) {
      expect(view).not.toContain(selectForm);
    }
  });

  it("refuses to count a self-review", () => {
    expect(migration).toContain("AND review.reviewer_id <> post.author_id");
    expect(migration).toContain("AND decision.editor_id <> post.author_id");
  });

  it("excludes an accepted co-author from reviewing their own work", () => {
    expect(migration).toContain("AND author.user_id = review.reviewer_id");
  });

  it("counts a review only for published work", () => {
    const view = migration.slice(
      migration.indexOf("CREATE OR REPLACE VIEW public.public_review_signals")
    );
    expect(view.match(/post\.status = 'published'/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("deduplicates repeated status transitions with an aggregate", () => {
    expect(migration).toContain("min(review.submitted_at)");
    expect(migration).toContain("min(decision.created_at)");
  });
});

describe("collaboration and debate semantics", () => {
  it("counts only accepted co-authorship", () => {
    expect(migration).toContain("collaborator.accepted_at IS NOT NULL");
  });

  it("respects blocks in the collaborator count", () => {
    expect(migration).toContain(
      "NOT public.is_blocked_pair(p_profile_id, collaborator.user_id)"
    );
  });

  it("counts distinct collaborators and distinct works separately", () => {
    expect(migration).toContain("count(DISTINCT post_id) FROM collaborations");
    expect(migration).toContain("count(DISTINCT user_id) FROM collaborations");
  });

  it("counts debate participation and completion, and derives no winner", () => {
    expect(migration).toContain("debate_contribution_count");
    expect(migration).toContain("completed_debate_count");
    // No column or alias names a winner. The word appears once, in the
    // function's COMMENT, explaining why no such signal exists; that is
    // documentation, not a claim, so the check runs against the returned
    // column list.
    const returnsTable = migration.slice(
      migration.indexOf("RETURNS TABLE ("),
      migration.indexOf(")\nLANGUAGE sql")
    );
    expect(returnsTable).not.toMatch(/winner|verdict|won/i);
    expect(returnsTable).toContain("debate_contribution_count");
    expect(returnsTable).toContain("completed_debate_count");

    const sql = migration
      .split(/\r?\n/)
      .filter((line) => !line.trim().startsWith("--"))
      .join(" ");
    // Completion is read from the debate's own status, never from votes,
    // ballots or engagement.
    expect(sql).toContain("WHERE status = 'closed'");
    expect(sql).not.toMatch(/debate_votes|debate_ballots|like_count|vote_count/);
  });
});
